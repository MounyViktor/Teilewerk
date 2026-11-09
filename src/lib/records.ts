// Ausgaben und Verträge. Belege und Dokumente liegen als Anhänge an "expense:<id>" bzw. "contract:<id>".
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { UserError } from "./business";
import { all, tx, type Tx } from "./db";
import { parseEuro, todayBerlin } from "./format";
import {
  CONTRACT_TYPE_LABEL, EXPENSE_CATEGORY_LABEL,
  type Attachment, type Contract, type ContractType, type Expense, type ExpenseCategory,
} from "./types";

const now = () => new Date().toISOString();
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface NewDocument { name: string; type: string; data: ArrayBuffer }

async function addDocs(t: Tx, owner: string, docs: NewDocument[]) {
  for (const d of docs) await t.add("attachments", { owner, name: d.name, type: d.type, data: d.data, created_at: now() });
}

async function dropDocs(t: Tx, owner: string) {
  for (const a of await t.byIndex<Attachment>("attachments", "owner", owner)) await t.delete("attachments", a.id);
}

// --- Ausgaben ---

export interface ExpenseInput {
  date: string; category: ExpenseCategory; supplier: string; description: string; amount: string; note: string;
}

function readExpense(i: ExpenseInput) {
  if (!DAY.test(i.date)) throw new UserError("Bitte ein Datum angeben.");
  if (!(i.category in EXPENSE_CATEGORY_LABEL)) throw new UserError("Bitte eine Kategorie wählen.");
  const supplier = i.supplier.trim();
  if (!supplier) throw new UserError("Bitte angeben, wo du gekauft hast.");
  const total_cents = parseEuro(i.amount);
  if (total_cents === null) throw new UserError("Bitte einen gültigen Betrag angeben, z. B. 35 oder 12,50.");
  return { date: i.date, category: i.category, supplier, description: i.description.trim(), total_cents, note: i.note.trim() };
}

export async function createExpense(i: ExpenseInput, docs: NewDocument[]): Promise<number> {
  const d = readExpense(i);
  return tx(["expenses", "attachments", "audit"], "readwrite", async (t) => {
    const ts = now();
    const id = await t.add("expenses", { ...d, created_at: ts, updated_at: ts }) as number;
    await addDocs(t, `expense:${id}`, docs);
    await t.audit("ausgabe_angelegt", "expense", id, { supplier: d.supplier, total: d.total_cents });
    return id;
  });
}

export async function updateExpense(id: number, i: ExpenseInput) {
  const d = readExpense(i);
  await tx(["expenses", "audit"], "readwrite", async (t) => {
    const old = await t.get<Expense>("expenses", id);
    if (!old) throw new UserError("Ausgabe nicht gefunden.");
    await t.put("expenses", { ...old, ...d, updated_at: now() });
    await t.audit("ausgabe_geaendert", "expense", id, { before: old.total_cents, total: d.total_cents });
  });
}

export async function deleteExpense(id: number) {
  await tx(["expenses", "attachments", "audit"], "readwrite", async (t) => {
    const old = await t.get<Expense>("expenses", id);
    if (!old) return;
    await dropDocs(t, `expense:${id}`);
    await t.delete("expenses", id);
    await t.audit("ausgabe_geloescht", "expense", id, { supplier: old.supplier, total: old.total_cents, date: old.date });
  });
}

const yearOf = (day: string) => Number(day.slice(0, 4));
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const safe = (s: string) => s.replace(/[^\wäöüÄÖÜß.-]+/g, "_");

/** CSV für EÜR / Steuerberater, im selben Format wie die Rechnungsliste. */
export async function expensesCsv(year: number, attachments?: Attachment[]): Promise<string> {
  const [expenses, docs] = await Promise.all([all<Expense>("expenses"), attachments ?? all<Attachment>("attachments")]);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ["Datum", "Kategorie", "Lieferant", "Beschreibung", "Betrag EUR (brutto)", "Belege"].join(";"),
    ...expenses.filter((e) => yearOf(e.date) === year).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).map((e) => [
      e.date.split("-").reverse().join("."), EXPENSE_CATEGORY_LABEL[e.category], esc(e.supplier), esc(e.description), money(e.total_cents),
      docs.filter((d) => d.owner === `expense:${e.id}`).length,
    ].join(";")),
  ];
  return "﻿" + lines.join("\r\n");
}

/** Alle Ausgaben eines Jahres als CSV plus Belege, nach Kategorie sortiert. */
export async function buildExpenseExport(year: number): Promise<{ file: File; count: number; receipts: number }> {
  const [expenses, docs] = await Promise.all([all<Expense>("expenses"), all<Attachment>("attachments")]);
  const selected = expenses.filter((e) => yearOf(e.date) === year);
  const files: Zippable = { [`ausgaben_${year}.csv`]: strToU8(await expensesCsv(year, docs)) };
  let receipts = 0;
  for (const e of selected) {
    for (const d of docs.filter((x) => x.owner === `expense:${e.id}`)) {
      const ext = d.name.includes(".") ? d.name.slice(d.name.lastIndexOf(".")) : "";
      const name = `${EXPENSE_CATEGORY_LABEL[e.category]}/${e.date}_${safe(e.supplier)}_${money(e.total_cents)}_${d.id}${ext}`;
      files[name] = [new Uint8Array(d.data), { level: 0 }];
      receipts++;
    }
  }
  return {
    file: new File([zipSync(files) as BlobPart], `Ausgaben_${year}.zip`, { type: "application/zip" }),
    count: selected.length, receipts,
  };
}

// --- Import bestehender Ausgaben samt Belegen ---

export interface ImportExpense {
  date: string; category: ExpenseCategory; supplier: string; description: string; total_cents: number; note: string;
  receipt: NewDocument;
}

/** Liest eine Import-Datei: ausgaben.json mit den Eckdaten, dazu je Ausgabe ein Beleg. */
export function parseExpenseImport(zipData: ArrayBuffer): ImportExpense[] {
  const invalid = () => new UserError("Diese Datei ist keine gültige Import-Datei für Ausgaben.");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(zipData));
  } catch {
    throw invalid();
  }
  if (!files["ausgaben.json"]) throw invalid();
  let m: { format?: string; version?: number; expenses?: (Omit<ImportExpense, "receipt"> & { file: string; receipt_name: string })[] };
  try {
    m = JSON.parse(strFromU8(files["ausgaben.json"]));
  } catch {
    throw invalid();
  }
  if (m.format !== "teilewerk-ausgaben-import" || m.version !== 1 || !Array.isArray(m.expenses)) throw invalid();
  return m.expenses.map(({ file, receipt_name, ...e }) => {
    const content = files[file];
    if (!content) throw new UserError(`In der Datei fehlt der Beleg zu ${e.supplier} vom ${e.date}.`);
    const data = content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer;
    return { ...e, note: e.note ?? "", receipt: { name: receipt_name, type: "application/pdf", data } };
  });
}

const expenseKey = (e: { date: string; supplier: string; total_cents: number }) => `${e.date}|${e.supplier.toLowerCase()}|${e.total_cents}`;

/** Alles oder nichts bei ungültigen Angaben. Schon vorhandene Ausgaben werden übersprungen, nie überschrieben. */
export async function importExpenses(items: ImportExpense[]): Promise<{ imported: number; skipped: number }> {
  if (!items.length) throw new UserError("Die Datei enthält keine Ausgaben.");
  const prepared = items.map((i) => {
    const supplier = i.supplier.trim();
    const label = `${supplier || "Ausgabe"} vom ${i.date}`;
    if (!DAY.test(i.date) || Number.isNaN(Date.parse(i.date))) throw new UserError(`${label}: Datum ungültig.`);
    if (i.date > todayBerlin()) throw new UserError(`${label}: Das Datum liegt in der Zukunft.`);
    if (!(i.category in EXPENSE_CATEGORY_LABEL)) throw new UserError(`${label}: Kategorie ungültig.`);
    if (!supplier) throw new UserError("Bei einer Ausgabe fehlt, wo gekauft wurde.");
    if (!Number.isInteger(i.total_cents) || i.total_cents < 0) throw new UserError(`${label}: Betrag ungültig.`);
    if (new TextDecoder().decode(i.receipt.data.slice(0, 5)) !== "%PDF-") throw new UserError(`${label}: Der Beleg ist kein PDF.`);
    return { ...i, supplier };
  });
  return tx(["expenses", "attachments", "audit"], "readwrite", async (t) => {
    const known = new Set((await t.all<Expense>("expenses")).map(expenseKey));
    let imported = 0;
    let skipped = 0;
    for (const p of prepared) {
      if (known.has(expenseKey(p))) { skipped++; continue; }
      known.add(expenseKey(p));
      const ts = now();
      const { receipt, ...e } = p;
      const id = await t.add("expenses", {
        date: e.date, category: e.category, supplier: e.supplier, description: (e.description ?? "").trim(), total_cents: e.total_cents,
        note: (e.note ?? "").trim(), created_at: ts, updated_at: ts,
      }) as number;
      await addDocs(t, `expense:${id}`, [receipt]);
      await t.audit("ausgabe_importiert", "expense", id, { supplier: e.supplier, total: e.total_cents, date: e.date });
      imported++;
    }
    return { imported, skipped };
  });
}

// --- Verträge ---

export interface ContractInput {
  type: ContractType; title: string; partner: string; date: string; ends_on: string; note: string;
  /** Betrag pro Monat, leer = keine laufenden Kosten. */
  monthly?: string;
}

function readContract(i: ContractInput) {
  if (!(i.type in CONTRACT_TYPE_LABEL)) throw new UserError("Bitte eine Vertragsart wählen.");
  const title = i.title.trim();
  if (!title) throw new UserError("Bitte eine Bezeichnung angeben.");
  if (!DAY.test(i.date)) throw new UserError("Bitte das Vertragsdatum angeben.");
  if (i.ends_on && !DAY.test(i.ends_on)) throw new UserError("Laufzeit-Ende ungültig.");
  if (i.ends_on && i.ends_on < i.date) throw new UserError("Das Laufzeit-Ende liegt vor dem Vertragsdatum.");
  const monthly_cents = i.monthly?.trim() ? parseEuro(i.monthly) : null;
  if (i.monthly?.trim() && monthly_cents === null) throw new UserError("Ausgaben pro Monat: bitte einen gültigen Betrag angeben, z. B. 35 oder 12,50.");
  return { type: i.type, title, partner: i.partner.trim(), date: i.date, ends_on: i.ends_on, monthly_cents, note: i.note.trim() };
}

/**
 * Kosten eines Monats: laufende Verträge plus die in diesem Monat eingetragenen Ausgaben.
 * Eine als Ausgabe eingetragene Rate desselben Vertrags zählt nicht doppelt.
 */
export function monthlyCosts(contracts: Contract[], expenses: Expense[], day: string = todayBerlin()) {
  const month = day.slice(0, 7);
  const running = contracts.filter((c) => c.monthly_cents && c.date.slice(0, 7) <= month && (!c.ends_on || c.ends_on.slice(0, 7) >= month));
  const titles = new Set(running.map((c) => c.title.toLowerCase()));
  const contractCents = running.reduce((a, c) => a + (c.monthly_cents ?? 0), 0);
  const expenseCents = expenses
    .filter((e) => e.date.slice(0, 7) === month && !(e.category === "vertrag" && titles.has(e.description.trim().toLowerCase())))
    .reduce((a, e) => a + e.total_cents, 0);
  return { contractCents, expenseCents, totalCents: contractCents + expenseCents };
}

export async function createContract(i: ContractInput, docs: NewDocument[]): Promise<number> {
  const d = readContract(i);
  return tx(["contracts", "attachments", "audit"], "readwrite", async (t) => {
    const ts = now();
    const id = await t.add("contracts", { ...d, created_at: ts, updated_at: ts }) as number;
    await addDocs(t, `contract:${id}`, docs);
    await t.audit("vertrag_angelegt", "contract", id, { title: d.title });
    return id;
  });
}

export async function updateContract(id: number, i: ContractInput) {
  const d = readContract(i);
  await tx(["contracts", "audit"], "readwrite", async (t) => {
    const old = await t.get<Contract>("contracts", id);
    if (!old) throw new UserError("Vertrag nicht gefunden.");
    await t.put("contracts", { ...old, ...d, updated_at: now() });
    await t.audit("vertrag_geaendert", "contract", id, { title: d.title });
  });
}

export async function deleteContract(id: number) {
  await tx(["contracts", "attachments", "audit"], "readwrite", async (t) => {
    const old = await t.get<Contract>("contracts", id);
    if (!old) return;
    await dropDocs(t, `contract:${id}`);
    await t.delete("contracts", id);
    await t.audit("vertrag_geloescht", "contract", id, { title: old.title, partner: old.partner });
  });
}
