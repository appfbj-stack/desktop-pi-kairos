/**
 * Travel tools — busca de voos e hotéis em tempo real via Amadeus Self-Service.
 *
 * 1. location_search  — Resolve cidade/aeroporto em código IATA (GRU, LIS, etc)
 * 2. flight_search    — Lista voos com preço real entre 2 cidades
 * 3. hotel_search     — Lista hotéis com preço real em uma cidade
 *
 * Cada tool retorna string formatada (markdown leve) que o LLM pode usar direto.
 *
 * Self-Service (test.api.amadeus.com) é grátis. Producao requer aprovação comercial.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import { logger } from "@kairos/core";
import { amadeus, amadeusFetch } from "./providers.js";

// =============================================================================
// 1. location_search — pega código IATA de cidade/aeroporto
// =============================================================================

const LocationInput = z.object({
  keyword: z.string().min(2).describe("Nome da cidade ou aeroporto (ex: 'Sao Paulo', 'Lisbon', 'GRU')"),
  subType: z
    .enum(["AIRPORT", "CITY", "AIRPORT,CITY"])
    .default("AIRPORT,CITY")
    .describe("Tipo: AIRPORT, CITY ou ambos"),
  max: z.number().int().min(1).max(20).default(5).describe("Máximo de resultados"),
});

export const locationSearch: Tool = {
  name: "location_search",
  description:
    "Resolve nome de cidade ou aeroporto em código IATA (formato Amadeus: GRU, LIS, JFK, etc). " +
    "Use SEMPRE antes de flight_search ou hotel_search quando o usuário não passar o código. " +
    "Ex: 'São Paulo' → ['SAO' (city), 'GRU' (airport)]. Provider: Amadeus.",
  inputSchema: LocationInput,
  execute: async (input) => {
    const { keyword, subType, max } = LocationInput.parse(input);
    logger.info({ keyword, subType }, "location_search iniciado");
    const data = await amadeusFetch<{ data: Array<{ type: string; subType: string; name: string; iataCode: string; address?: { cityName?: string; countryName?: string; countryCode?: string } }> }>(
      "/v1/reference-data/locations",
      { keyword, subType, "page[limit]": max },
    );
    if (!data.data?.length) return `Nenhum resultado para "${keyword}".`;
    return data.data
      .map(
        (l, i) =>
          `${i + 1}. **${l.name}** (${l.iataCode}) — ${l.subType}` +
          (l.address ? ` · ${l.address.cityName ?? ""}${l.address.countryName ? ", " + l.address.countryName : ""}` : ""),
      )
      .join("\n");
  },
};

// =============================================================================
// 2. flight_search — ofertas de voo com preço real
// =============================================================================

const FlightInput = z.object({
  origin: z
    .string()
    .min(3)
    .max(3)
    .describe("Código IATA de origem (3 letras). Use location_search antes se não souber. Ex: GRU, SDU, CGH"),
  destination: z
    .string()
    .min(3)
    .max(3)
    .describe("Código IATA de destino (3 letras). Ex: LIS, MAD, JFK"),
  departureDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Data de ida (YYYY-MM-DD). Ex: 2026-12-15"),
  returnDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("Data de volta (YYYY-MM-DD). Opcional, se omitido busca só ida."),
  adults: z.number().int().min(1).max(9).default(1).describe("Número de adultos (12+ anos)"),
  children: z.number().int().min(0).max(9).default(0).describe("Número de crianças (2-11 anos)"),
  infants: z.number().int().min(0).max(9).default(0).describe("Número de bebês (<2 anos)"),
  travelClass: z
    .enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"])
    .default("ECONOMY")
    .describe("Classe da cabine"),
  currency: z.string().min(3).max(3).default("BRL").describe("Moeda do preço (3 letras). Default BRL."),
  maxPrice: z.number().int().positive().optional().describe("Preço máximo total (na moeda escolhida)"),
  max: z.number().int().min(1).max(20).default(10).describe("Máximo de ofertas a retornar"),
});

interface FlightOffer {
  type: string;
  id: string;
  source: string;
  price: { currency: string; total: string; base: string };
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: { iataCode: string; at: string };
      arrival: { iataCode: string; at: string };
      carrierCode: string;
      number: string;
      duration: string;
    }>;
  }>;
  validatingAirlineCodes?: string[];
}

export const flightSearch: Tool = {
  name: "flight_search",
  description:
    "Busca voos reais (preço + disponibilidade) entre duas cidades. " +
    "Retorna lista ordenada por preço com: companhia, número do voo, horários, duração, escalas, preço total. " +
    "ATENÇÃO: precisa de códigos IATA. Se o usuário não passou, chame location_search antes. " +
    "Provider: Amadeus Flight Offers Search.",
  inputSchema: FlightInput,
  execute: async (input) => {
    const parsed = FlightInput.parse(input);
    logger.info({ ...parsed }, "flight_search iniciado");

    const data = await amadeusFetch<{ data: FlightOffer[] }>(
      "/v2/shopping/flight-offers",
      {
        originLocationCode: parsed.origin.toUpperCase(),
        destinationLocationCode: parsed.destination.toUpperCase(),
        departureDate: parsed.departureDate,
        returnDate: parsed.returnDate,
        adults: parsed.adults,
        children: parsed.children,
        infants: parsed.infants,
        travelClass: parsed.travelClass,
        currencyCode: parsed.currency.toUpperCase(),
        maxPrice: parsed.maxPrice,
        max: parsed.max,
      },
    );

    const offers = data.data ?? [];
    if (!offers.length) {
      return `Nenhuma oferta encontrada para ${parsed.origin}→${parsed.destination} em ${parsed.departureDate}.`;
    }

    // Ordena por preço (defensivo — Amadeus já vem ordenado, mas...)
    offers.sort((a, b) => parseFloat(a.price.total) - parseFloat(b.price.total));

    return offers
      .map((o, i) => {
        const itin = o.itineraries[0];
        const segments = itin.segments;
        const first = segments[0];
        const last = segments[segments.length - 1];
        const stops = segments.length - 1;
        const airlines = (o.validatingAirlineCodes ?? []).join(", ");
        const links = `https://www.google.com/search?q=${encodeURIComponent(`voo ${first.carrierCode}${first.number} ${parsed.origin} ${parsed.destination} ${parsed.departureDate}`)}`;
        return [
          `**${i + 1}. ${o.price.currency} ${parseFloat(o.price.total).toFixed(2)}** — ${airlines || first.carrierCode}`,
          `   ${first.departure.iataCode} ${first.departure.at.replace("T", " ").slice(0, 16)} → ${last.arrival.iataCode} ${last.arrival.at.replace("T", " ").slice(0, 16)}`,
          `   Duração total: ${itin.duration.replace("PT", "").toLowerCase()} · ${stops === 0 ? "Direto" : stops + " escala(s)"}`,
          `   Buscar: ${links}`,
        ].join("\n");
      })
      .join("\n\n");
  },
};

// =============================================================================
// 3. hotel_search — hotéis com preço real em uma cidade
// =============================================================================

const HotelInput = z.object({
  cityCode: z
    .string()
    .min(3)
    .max(3)
    .describe("Código IATA da cidade (3 letras). Use location_search antes se não souber. Ex: LIS, MAD, NYC"),
  checkInDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Data de check-in (YYYY-MM-DD)"),
  checkOutDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Data de check-out (YYYY-MM-DD)"),
  adults: z.number().int().min(1).max(9).default(1).describe("Adultos por quarto"),
  roomQuantity: z.number().int().min(1).max(9).default(1).describe("Quantidade de quartos"),
  currency: z.string().min(3).max(3).default("BRL").describe("Moeda (3 letras)"),
  maxPrice: z.number().int().positive().optional().describe("Preço máximo por noite"),
  stars: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])
    .optional()
    .describe("Estrelas mínimas (1-5)"),
  max: z.number().int().min(1).max(20).default(10).describe("Máximo de hotéis"),
});

interface HotelOffer {
  hotel: { hotelId: string; name: string; rating?: string; cityCode?: string };
  offers: Array<{
    id: string;
    checkInDate: string;
    checkOutDate: string;
    price: { currency: string; total: string; variations?: { average?: { base?: string } } };
    room?: { typeEstimated?: { category?: string } };
  }>;
}

export const hotelSearch: Tool = {
  name: "hotel_search",
  description:
    "Busca hotéis com preço real em uma cidade. Retorna nome, estrelas, preço total da estadia, link de busca. " +
    "ATENÇÃO: precisa do IATA code da cidade. Use location_search antes. " +
    "Provider: Amadeus Hotel Search v3.",
  inputSchema: HotelInput,
  execute: async (input) => {
    const parsed = HotelInput.parse(input);
    logger.info({ ...parsed }, "hotel_search iniciado");

    // 1) Listar hotéis na cidade
    const list = await amadeusFetch<{ data: Array<{ hotelId: string; name: string; rating?: string }> }>(
      "/v1/reference-data/locations/hotels/by-city",
      { cityCode: parsed.cityCode.toUpperCase() },
    );
    if (!list.data?.length) return `Nenhum hotel encontrado em ${parsed.cityCode}.`;

    // 2) Buscar ofertas — pega IDs dos primeiros N hotéis (Amadeus limita a 64 por chamada)
    const hotelIds = list.data.slice(0, parsed.max).map((h) => h.hotelId);
    const data = await amadeusFetch<{ data: HotelOffer[] }>(
      "/v3/shopping/hotel-offers",
      {
        hotelIds: hotelIds.join(","),
        checkInDate: parsed.checkInDate,
        checkOutDate: parsed.checkOutDate,
        adults: parsed.adults,
        roomQuantity: parsed.roomQuantity,
        currency: parsed.currency.toUpperCase(),
        ...(parsed.maxPrice ? { priceRange: `0-${parsed.maxPrice}` } : {}),
      },
    );

    const offers = (data.data ?? []).filter((h) => {
      if (parsed.stars && h.hotel.rating) {
        return parseInt(h.hotel.rating, 10) >= parsed.stars;
      }
      return true;
    });

    if (!offers.length) {
      return `Nenhuma oferta de hospedagem disponivel em ${parsed.cityCode} entre ${parsed.checkInDate} e ${parsed.checkOutDate}.`;
    }

    // Ordena por preço total
    offers.sort((a, b) => {
      const pa = parseFloat(a.offers[0]?.price.total ?? "999999");
      const pb = parseFloat(b.offers[0]?.price.total ?? "999999");
      return pa - pb;
    });

    return offers
      .slice(0, parsed.max)
      .map((h, i) => {
        const offer = h.offers[0];
        const total = parseFloat(offer.price.total);
        const nights = Math.max(
          1,
          Math.round(
            (new Date(parsed.checkOutDate).getTime() - new Date(parsed.checkInDate).getTime()) /
              86_400_000,
          ),
        );
        const perNight = total / nights;
        const stars = h.hotel.rating ? "⭐".repeat(parseInt(h.hotel.rating, 10)) : "";
        const searchLink = `https://www.booking.com/search.html?ss=${encodeURIComponent(h.hotel.name + " " + parsed.cityCode)}&checkin=${parsed.checkInDate}&checkout=${parsed.checkOutDate}&group_adults=${parsed.adults}&no_rooms=${parsed.roomQuantity}`;
        return [
          `**${i + 1}. ${h.hotel.name}** ${stars}`,
          `   ${offer.price.currency} ${total.toFixed(2)} total · ${perNight.toFixed(2)}/noite (${nights} noite${nights > 1 ? "s" : ""})`,
          `   Booking: ${searchLink}`,
        ].join("\n");
      })
      .join("\n\n");
  },
};

// =============================================================================
// Aggregate
// =============================================================================

export const allTools: Tool[] = [locationSearch, flightSearch, hotelSearch];
