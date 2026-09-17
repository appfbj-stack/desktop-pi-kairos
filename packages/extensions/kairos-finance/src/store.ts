/**
 * Store singleton do kairos-finance — SQLite local em <workspace>/kairos-finance.db.
 *
 * Tabelas:
 *   expenses   data, valor, categoria, fornecedor, descrição, método de pagamento
 *   invoices   cliente, valor, vencimento, status (pending/paid/overdue), descrição
 *   mileage    data, km, propósito
 */

import path from "node:path";
import Database from "better-sqlite3";

export interface Expense {
  id: number;
  date: string;
  amount: number;
  category: string;
  vendor: string | null;
  notes: string | null;
  payment_method: string | null;
  created_at: string;
}

export interface Invoice {
  id: number;
  client: string;
  amount: number;
  description: string | null;
  issue_date: string;
  due_date: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  paid_date: string | null;
  created_at: string;
}

export interface Mileage {
  id: number;
  date: string;
  km: number;
  purpose: string | null;
  created_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL,
  vendor TEXT,
  notes TEXT,
  payment_method TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client TEXT NOT NULL,
  amount REAL NOT NULL,
  description TEXT,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_date TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS mileage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  km REAL NOT NULL,
  purpose TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mileage_date ON mileage(date);
`;

let _db: Database.Database | null = null;
let _path: string | null = null;

export function getStore(): Database.Database {
  if (_db) return _db;
  const workspace = process.env.KAIROS_WORKSPACE_DIR;
  if (!workspace) throw new Error("KAIROS_WORKSPACE_DIR não definido.");
  _path = path.join(workspace, "kairos-finance.db");
  _db = new Database(_path);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  _db.exec(SCHEMA);
  return _db;
}

export function closeStore(): void {
  if (_db) {
    _db.close();
    _db = null;
    _path = null;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Calcula aging bucket a partir de due_date. */
export function agingBucket(dueDate: string, status: string): string {
  if (status === "paid") return "pago";
  const now = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 30) return "a_vencer_30+";
  if (diffDays > 7) return "a_vencer_8_30";
  if (diffDays >= 0) return "a_vencer_0_7";
  if (diffDays > -30) return "vencido_1_30";
  if (diffDays > -60) return "vencido_31_60";
  return "vencido_60+";
}