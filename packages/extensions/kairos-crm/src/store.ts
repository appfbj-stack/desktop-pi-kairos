/**
 * Store do CRM embutido.
 *
 * Tabelas:
 *   crm_contacts (id, name, type, email, phone, company, role, notes, tags, last_contact_at, created_at, updated_at)
 *   crm_interactions (id, contact_id, channel, summary, next_step, created_at)
 *
 * Types: cliente, fornecedor, lead, parceiro, outro.
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type ContactType = "cliente" | "fornecedor" | "lead" | "parceiro" | "outro";

export interface Contact {
  id: string;
  name: string;
  type: ContactType;
  email: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  notes: string | null;
  tags: string | null; // JSON array
  lastContactAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Interaction {
  id: string;
  contactId: string;
  channel: "whatsapp" | "email" | "telefone" | "presencial" | "outro";
  summary: string;
  nextStep: string | null;
  createdAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cliente',
  email TEXT,
  phone TEXT,
  company TEXT,
  role TEXT,
  notes TEXT,
  tags TEXT,
  last_contact_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS crm_name_idx ON crm_contacts(name);
CREATE INDEX IF NOT EXISTS crm_type_idx ON crm_contacts(type);
CREATE INDEX IF NOT EXISTS crm_company_idx ON crm_contacts(company);
CREATE INDEX IF NOT EXISTS crm_last_contact_idx ON crm_contacts(last_contact_at DESC);

CREATE TABLE IF NOT EXISTS crm_interactions (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'outro',
  summary TEXT NOT NULL,
  next_step TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS crm_int_contact_idx ON crm_interactions(contact_id, created_at DESC);
`;

let schemaReady = false;
function ensureSchema(db: Database.Database): void {
  if (schemaReady) return;
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  schemaReady = true;
}

function getDb(): Database.Database {
  const db = (globalThis as any).__kairosDb;
  if (!db) throw new Error("DB não disponível. Kairos-core precisa estar inicializado.");
  return db as Database.Database;
}

export function addContact(input: Omit<Contact, "id" | "createdAt" | "updatedAt" | "lastContactAt"> & { lastContactAt?: number }): Contact {
  const db = getDb();
  ensureSchema(db);
  const id = randomUUID();
  const now = Date.now();
  const last = input.lastContactAt ?? null;
  db.prepare(
    `INSERT INTO crm_contacts (id, name, type, email, phone, company, role, notes, tags, last_contact_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.type,
    input.email ?? null,
    input.phone ?? null,
    input.company ?? null,
    input.role ?? null,
    input.notes ?? null,
    input.tags ?? null,
    last,
    now,
    now,
  );
  return { id, ...input, lastContactAt: last, createdAt: now, updatedAt: now };
}

export function getContact(id: string): Contact | null {
  const db = getDb();
  ensureSchema(db);
  const row = db
    .prepare(
      `SELECT id, name, type, email, phone, company, role, notes, tags,
              last_contact_at as lastContactAt, created_at as createdAt, updated_at as updatedAt
       FROM crm_contacts WHERE id = ?`,
    )
    .get(id);
  return (row as Contact) ?? null;
}

export function listContacts(options: { type?: ContactType; query?: string; limit?: number } = {}): Contact[] {
  const db = getDb();
  ensureSchema(db);
  const limit = options.limit ?? 200;
  const term = `%${(options.query ?? "").toLowerCase()}%`;
  if (options.query && options.type) {
    return db
      .prepare(
        `SELECT id, name, type, email, phone, company, role, notes, tags,
                last_contact_at as lastContactAt, created_at as createdAt, updated_at as updatedAt
         FROM crm_contacts
         WHERE type = ? AND (LOWER(name) LIKE ? OR LOWER(COALESCE(company,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?)
         ORDER BY name ASC
         LIMIT ?`,
      )
      .all(options.type, term, term, term, limit) as Contact[];
  }
  if (options.query) {
    return db
      .prepare(
        `SELECT id, name, type, email, phone, company, role, notes, tags,
                last_contact_at as lastContactAt, created_at as createdAt, updated_at as updatedAt
         FROM crm_contacts
         WHERE LOWER(name) LIKE ? OR LOWER(COALESCE(company,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?
         ORDER BY name ASC
         LIMIT ?`,
      )
      .all(term, term, term, limit) as Contact[];
  }
  if (options.type) {
    return db
      .prepare(
        `SELECT id, name, type, email, phone, company, role, notes, tags,
                last_contact_at as lastContactAt, created_at as createdAt, updated_at as updatedAt
         FROM crm_contacts
         WHERE type = ?
         ORDER BY name ASC
         LIMIT ?`,
      )
      .all(options.type, limit) as Contact[];
  }
  return db
    .prepare(
      `SELECT id, name, type, email, phone, company, role, notes, tags,
              last_contact_at as lastContactAt, created_at as createdAt, updated_at as updatedAt
       FROM crm_contacts
       ORDER BY name ASC
       LIMIT ?`,
    )
    .all(limit) as Contact[];
}

export function updateContact(id: string, patch: Partial<Omit<Contact, "id" | "createdAt">>): Contact | null {
  const db = getDb();
  ensureSchema(db);
  const existing = getContact(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: Date.now() };
  db.prepare(
    `UPDATE crm_contacts
     SET name = ?, type = ?, email = ?, phone = ?, company = ?, role = ?, notes = ?, tags = ?, last_contact_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    merged.name,
    merged.type,
    merged.email,
    merged.phone,
    merged.company,
    merged.role,
    merged.notes,
    merged.tags,
    merged.lastContactAt,
    merged.updatedAt,
    id,
  );
  return merged;
}

export function deleteContact(id: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const res = db.prepare("DELETE FROM crm_contacts WHERE id = ?").run(id);
  return res.changes > 0;
}

export function logInteraction(contactId: string, input: { channel: Interaction["channel"]; summary: string; nextStep?: string }): Interaction {
  const db = getDb();
  ensureSchema(db);
  // Verifica que o contato existe
  const exists = db.prepare("SELECT 1 FROM crm_contacts WHERE id = ?").get(contactId);
  if (!exists) throw new Error(`Contato não encontrado: ${contactId}`);
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO crm_interactions (id, contact_id, channel, summary, next_step, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, contactId, input.channel, input.summary, input.nextStep ?? null, now);
  // Atualiza last_contact_at
  db.prepare("UPDATE crm_contacts SET last_contact_at = ?, updated_at = ? WHERE id = ?")
    .run(now, now, contactId);
  return { id, contactId, ...input, nextStep: input.nextStep ?? null, createdAt: now };
}

export function listInteractions(contactId: string, limit = 50): Interaction[] {
  const db = getDb();
  ensureSchema(db);
  return db
    .prepare(
      `SELECT id, contact_id as contactId, channel, summary, next_step as nextStep, created_at as createdAt
       FROM crm_interactions
       WHERE contact_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(contactId, limit) as Interaction[];
}

export function countContacts(): number {
  const db = getDb();
  ensureSchema(db);
  const row = db.prepare("SELECT COUNT(*) as c FROM crm_contacts").get() as { c: number };
  return row.c;
}
