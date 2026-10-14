/**
 * Store do CRM embutido.
 *
 * Tabelas (multi-tenant via client_id):
 *   crm_contacts     (id, client_id, name, type, email, phone, company, role, notes, tags, last_contact_at, created_at, updated_at)
 *   crm_interactions (id, client_id, contact_id, channel, summary, next_step, created_at)
 *
 * Types: cliente, fornecedor, lead, parceiro, outro.
 *
 * Tenant atual vem de globalThis.__kairosClientId (setado pelo agent-instance no login).
 */

import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type ContactType = "cliente" | "fornecedor" | "lead" | "parceiro" | "outro";

export interface Contact {
  id: string;
  clientId: string | null;
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
  clientId: string | null;
  contactId: string;
  channel: "whatsapp" | "email" | "telefone" | "presencial" | "outro";
  summary: string;
  nextStep: string | null;
  createdAt: number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS crm_contacts (
  id TEXT PRIMARY KEY,
  client_id TEXT,
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
CREATE INDEX IF NOT EXISTS crm_client_idx ON crm_contacts(client_id);

CREATE TABLE IF NOT EXISTS crm_interactions (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  contact_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'outro',
  summary TEXT NOT NULL,
  next_step TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS crm_int_contact_idx ON crm_interactions(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_int_client_idx ON crm_interactions(client_id);
`;

let schemaReady = false;
function ensureSchema(db: Database.Database): void {
  if (schemaReady) return;
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt);
  }
  // migrations idempotentes
  try { db.exec("ALTER TABLE crm_contacts ADD COLUMN client_id TEXT"); } catch { /* já existe */ }
  try { db.exec("ALTER TABLE crm_interactions ADD COLUMN client_id TEXT"); } catch { /* já existe */ }
  schemaReady = true;
}

function getDb(): Database.Database {
  const db = (globalThis as any).__kairosDb;
  if (!db) throw new Error("DB não disponível. Kairos-core precisa estar inicializado.");
  return db as Database.Database;
}

function currentClientId(): string | null {
  return ((globalThis as any).__kairosClientId as string | null) ?? null;
}

const CONTACT_SELECT = `SELECT id, client_id as clientId, name, type, email, phone, company, role, notes, tags,
  last_contact_at as lastContactAt, created_at as createdAt, updated_at as updatedAt
  FROM crm_contacts`;

export function addContact(input: Omit<Contact, "id" | "createdAt" | "updatedAt" | "lastContactAt" | "clientId"> & { lastContactAt?: number }): Contact {
  const db = getDb();
  ensureSchema(db);
  const id = randomUUID();
  const now = Date.now();
  const last = input.lastContactAt ?? null;
  const cid = currentClientId();
  db.prepare(
    `INSERT INTO crm_contacts (id, client_id, name, type, email, phone, company, role, notes, tags, last_contact_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    cid,
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
  return { id, clientId: cid, ...input, lastContactAt: last, createdAt: now, updatedAt: now };
}

export function getContact(id: string): Contact | null {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  // Sem tenant = sem visibilidade
  if (!cid) return null;
  const row = db
    .prepare(`${CONTACT_SELECT} WHERE id = ? AND client_id = ?`)
    .get(id, cid);
  return (row as Contact) ?? null;
}

export function listContacts(options: { type?: ContactType; query?: string; limit?: number } = {}): Contact[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return []; // sem tenant = lista vazia
  const limit = options.limit ?? 200;
  const term = `%${(options.query ?? "").toLowerCase()}%`;
  if (options.query && options.type) {
    return db
      .prepare(
        `${CONTACT_SELECT}
         WHERE client_id = ? AND type = ? AND (LOWER(name) LIKE ? OR LOWER(COALESCE(company,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?)
         ORDER BY name ASC
         LIMIT ?`,
      )
      .all(cid, options.type, term, term, term, limit) as Contact[];
  }
  if (options.query) {
    return db
      .prepare(
        `${CONTACT_SELECT}
         WHERE client_id = ? AND (LOWER(name) LIKE ? OR LOWER(COALESCE(company,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?)
         ORDER BY name ASC
         LIMIT ?`,
      )
      .all(cid, term, term, term, limit) as Contact[];
  }
  if (options.type) {
    return db
      .prepare(
        `${CONTACT_SELECT}
         WHERE client_id = ? AND type = ?
         ORDER BY name ASC
         LIMIT ?`,
      )
      .all(cid, options.type, limit) as Contact[];
  }
  return db
    .prepare(
      `${CONTACT_SELECT}
       WHERE client_id = ?
       ORDER BY name ASC
       LIMIT ?`,
    )
    .all(cid, limit) as Contact[];
}

export function updateContact(id: string, patch: Partial<Omit<Contact, "id" | "createdAt" | "clientId">>): Contact | null {
  const db = getDb();
  ensureSchema(db);
  const existing = getContact(id);
  if (!existing) return null;
  const merged = { ...existing, ...patch, updatedAt: Date.now() };
  db.prepare(
    `UPDATE crm_contacts
     SET name = ?, type = ?, email = ?, phone = ?, company = ?, role = ?, notes = ?, tags = ?, last_contact_at = ?, updated_at = ?
     WHERE id = ? AND client_id = ?`,
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
    currentClientId(),
  );
  return merged;
}

export function deleteContact(id: string): boolean {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return false;
  const res = db.prepare("DELETE FROM crm_contacts WHERE id = ? AND client_id = ?").run(id, cid);
  return res.changes > 0;
}

export function logInteraction(contactId: string, input: { channel: Interaction["channel"]; summary: string; nextStep?: string }): Interaction {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) throw new Error("Sem tenant ativo (não logado)");
  // Verifica que o contato existe E pertence ao tenant
  const exists = db.prepare("SELECT 1 FROM crm_contacts WHERE id = ? AND client_id = ?").get(contactId, cid);
  if (!exists) throw new Error(`Contato não encontrado: ${contactId}`);
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO crm_interactions (id, client_id, contact_id, channel, summary, next_step, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, cid, contactId, input.channel, input.summary, input.nextStep ?? null, now);
  // Atualiza last_contact_at (também com filtro tenant)
  db.prepare("UPDATE crm_contacts SET last_contact_at = ?, updated_at = ? WHERE id = ? AND client_id = ?")
    .run(now, now, contactId, cid);
  return { id, clientId: cid, contactId, ...input, nextStep: input.nextStep ?? null, createdAt: now };
}

export function listInteractions(contactId: string, limit = 50): Interaction[] {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return [];
  return db
    .prepare(
      `SELECT id, client_id as clientId, contact_id as contactId, channel, summary, next_step as nextStep, created_at as createdAt
       FROM crm_interactions
       WHERE contact_id = ? AND client_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(contactId, cid, limit) as Interaction[];
}

export function countContacts(): number {
  const db = getDb();
  ensureSchema(db);
  const cid = currentClientId();
  if (!cid) return 0;
  const row = db.prepare("SELECT COUNT(*) as c FROM crm_contacts WHERE client_id = ?").get(cid) as { c: number };
  return row.c;
}