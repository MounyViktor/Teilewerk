// Komplett-Sicherung als ZIP: lesbar auch ohne App (Rechnungs-PDFs, Fotos, CSV) und wieder einspielbar (data.json).
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { all, get, tx } from "./db";
import { invoicesCsv, sha256Hex, UserError, type ImportInvoice } from "./business";
import { todayBerlin } from "./format";
import { expensesCsv } from "./records";
import type { Attachment, AuditEntry, Contract, Expense, Invoice, Part, Photo, Sale, Settings } from "./types";

const FORMAT = "teilewerk-backup";
const VERSION = 3; // Ältere Sicherungen ohne Dokumente, Ausgaben oder Verträge lassen sich weiter einspielen.
const STALE_DAYS = 7;

interface BackupMeta { at: string; auditId: number }

export interface BackupStatus {
  lastAt: string | null;
  changes: number;
  invoicesPending: number;
  overdue: boolean;
}

export async function backupStatus(): Promise<BackupStatus> {
  const [meta, audit] = await Promise.all([get<BackupMeta>("meta", "last_backup"), all<AuditEntry>("audit")]);
  const pending = audit.filter((a) => a.id > (meta?.auditId ?? 0));
  const invoicesPending = pending.filter((a) => a.entity === "invoice").length;
  const ageDays = meta ? (Date.now() - new Date(meta.at).getTime()) / 86_400_000 : Infinity;
  return {
    lastAt: meta?.at ?? null,
    changes: pending.length,
    invoicesPending,
    overdue: pending.length > 0 && (invoicesPending > 0 || ageDays >= STALE_DAYS),
  };
}

export interface BuiltBackup { file: File; auditId: number; invoices: number; photos: number }

export async function buildBackup(): Promise<BuiltBackup> {
  const data = await tx(
    ["settings", "parts", "photos", "photo_data", "sales", "invoices", "invoice_counter", "audit", "attachments", "expenses", "contracts"], "readonly",
    async (t) => ({
      attachments: await t.all<Attachment>("attachments"),
      expenses: await t.all<Expense>("expenses"),
      contracts: await t.all<Contract>("contracts"),
      settings: await t.get<Settings>("settings", 1),
      parts: await t.all<Part>("parts"),
      photos: await t.all<Photo>("photos"),
      photoData: await t.all<{ id: number; data: ArrayBuffer }>("photo_data"),
      sales: await t.all<Sale>("sales"),
      invoices: await t.all<Invoice>("invoices"),
      counter: await t.all<{ year: number; last_no: number }>("invoice_counter"),
      audit: await t.all<AuditEntry>("audit"),
    }),
  );

  // Bilder und PDFs sind schon komprimiert: nur ablegen, das spart Zeit und Akku.
  const raw = { level: 0 as const };
  const files: Zippable = {};
  for (const p of data.photoData) files[`fotos/${p.id}.jpg`] = [new Uint8Array(p.data), raw];
  for (const p of data.photos) files[`vorschau/${p.id}.jpg`] = [new Uint8Array(p.thumb), raw];
  for (const i of data.invoices) files[`rechnungen/${i.number}.pdf`] = [new Uint8Array(i.pdf), raw];
  for (const a of data.attachments) files[`dokumente/${a.id}_${a.name.replace(/[^\w.-]+/g, "_")}`] = [new Uint8Array(a.data), raw];
  files["rechnungen.csv"] = strToU8(await invoicesCsv());
  for (const y of new Set(data.expenses.map((e) => Number(e.date.slice(0, 4))))) {
    files[`ausgaben_${y}.csv`] = strToU8(await expensesCsv(y, data.attachments));
  }
  files["data.json"] = strToU8(JSON.stringify({
    format: FORMAT,
    version: VERSION,
    created_at: new Date().toISOString(),
    settings: data.settings ?? null,
    parts: data.parts,
    photos: data.photos.map(({ thumb: _t, ...m }) => m),
    sales: data.sales,
    invoices: data.invoices.map(({ pdf: _p, ...m }) => m),
    attachments: data.attachments.map(({ data: _d, ...m }) => ({ ...m, file: `dokumente/${m.id}_${m.name.replace(/[^\w.-]+/g, "_")}` })),
    expenses: data.expenses,
    contracts: data.contracts,
    invoice_counter: data.counter,
    audit: data.audit,
  }));

  const zip = zipSync(files);
  const stamp = `${todayBerlin()}_${new Date().toTimeString().slice(0, 5).replace(":", "")}`;
  return {
    file: new File([zip as BlobPart], `teilewerk_${stamp}.zip`, { type: "application/zip" }),
    auditId: data.audit.reduce((m, a) => Math.max(m, a.id), 0),
    invoices: data.invoices.length,
    photos: data.photos.length,
  };
}

/** Alle Rechnungs-PDFs eines Jahres mit CSV-Liste, zum Ablegen in Dropbox oder für den Steuerberater. */
export async function buildInvoiceExport(year: number): Promise<{ file: File; count: number }> {
  const invoices = await all<Invoice>("invoices");
  const berlinYear = (iso: string) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date(iso)));
  const selected = invoices.filter((i) => berlinYear(i.issued_at) === year);
  const files: Zippable = { [`rechnungen_${year}.csv`]: strToU8(await invoicesCsv(year)) };
  for (const i of selected) files[`${i.number}.pdf`] = [new Uint8Array(i.pdf), { level: 0 }];
  return {
    file: new File([zipSync(files) as BlobPart], `Rechnungen_${year}.zip`, { type: "application/zip" }),
    count: selected.length,
  };
}

/** Liest eine Import-Datei: rechnungen.json mit den Eckdaten, dazu je Rechnung ein PDF. */
export function parseInvoiceImport(zipData: ArrayBuffer): ImportInvoice[] {
  const invalid = () => new UserError("Diese Datei ist keine gültige Import-Datei für Rechnungen.");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(zipData));
  } catch {
    throw invalid();
  }
  if (!files["rechnungen.json"]) throw invalid();
  let manifest: { format?: string; version?: number; invoices?: { number: string; issued_on: string; buyer_name: string; total_cents: number; file: string }[] };
  try {
    manifest = JSON.parse(strFromU8(files["rechnungen.json"]));
  } catch {
    throw invalid();
  }
  if (manifest.format !== "teilewerk-rechnungen-import" || manifest.version !== 1 || !Array.isArray(manifest.invoices)) throw invalid();
  return manifest.invoices.map((i) => {
    const pdf = files[i.file];
    if (!pdf) throw new UserError(`In der Datei fehlt das PDF zu Rechnung ${i.number}.`);
    return { number: String(i.number), issued_on: String(i.issued_on), buyer_name: String(i.buyer_name), total_cents: i.total_cents, pdf: toBuffer(pdf) };
  });
}

export async function markBackupDone(auditId: number) {
  await tx(["meta"], "readwrite", (t) => t.put("meta", { at: new Date().toISOString(), auditId }, "last_backup"));
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const lists = await Promise.all((["parts", "sales", "invoices", "audit", "expenses", "contracts"] as const).map((s) => all(s)));
  return lists.every((l) => !l.length);
}

const toBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/**
 * Einspielen nur in eine leere App: So kann eine Sicherung nie bestehende Rechnungen überschreiben.
 * Jedes PDF wird vorher gegen seine gespeicherte Prüfsumme geprüft. Bei einem Fehler wird nichts eingespielt.
 */
export async function restoreBackup(zipData: ArrayBuffer): Promise<{ parts: number; invoices: number }> {
  if (!(await isDatabaseEmpty())) {
    throw new UserError("Einspielen geht nur in eine leere App, damit keine bestehenden Rechnungen überschrieben werden.");
  }
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(zipData));
  } catch {
    throw new UserError("Diese Datei ist keine gültige Teilewerk-Sicherung.");
  }
  if (!files["data.json"]) throw new UserError("Diese Datei ist keine gültige Teilewerk-Sicherung.");
  const d = JSON.parse(strFromU8(files["data.json"]));
  if (d.format !== FORMAT || ![1, 2, VERSION].includes(d.version)) throw new UserError("Diese Datei ist keine gültige Teilewerk-Sicherung.");

  const attachments: Attachment[] = [];
  for (const { file, ...m } of (d.attachments ?? []) as (Omit<Attachment, "data"> & { file: string })[]) {
    const content = files[file];
    if (!content) throw new UserError(`In der Sicherung fehlt das Dokument „${m.name}“.`);
    attachments.push({ ...m, data: toBuffer(content) });
  }

  const invoices: Invoice[] = [];
  for (const m of d.invoices as Omit<Invoice, "pdf">[]) {
    const pdf = files[`rechnungen/${m.number}.pdf`];
    if (!pdf) throw new UserError(`In der Sicherung fehlt das PDF zu Rechnung ${m.number}.`);
    if ((await sha256Hex(pdf)) !== m.pdf_sha256) throw new UserError(`Das PDF zu Rechnung ${m.number} ist beschädigt (Prüfsumme stimmt nicht).`);
    invoices.push({ ...m, pdf: toBuffer(pdf) });
  }
  const photos: Photo[] = [];
  const photoData: { id: number; data: ArrayBuffer }[] = [];
  for (const m of d.photos as Omit<Photo, "thumb">[]) {
    const full = files[`fotos/${m.id}.jpg`];
    const thumb = files[`vorschau/${m.id}.jpg`];
    if (!full || !thumb) throw new UserError(`In der Sicherung fehlt das Foto ${m.id}.`);
    photos.push({ ...m, thumb: toBuffer(thumb) });
    photoData.push({ id: m.id, data: toBuffer(full) });
  }

  await tx(["settings", "parts", "photos", "photo_data", "sales", "invoices", "invoice_counter", "audit", "meta", "attachments", "expenses", "contracts"], "readwrite", async (t) => {
    if (d.settings) await t.put("settings", d.settings, 1);
    for (const a of attachments) await t.add("attachments", a);
    for (const e of d.expenses ?? []) await t.add("expenses", e);
    for (const c of d.contracts ?? []) await t.add("contracts", c);
    for (const p of d.parts) await t.add("parts", p);
    for (const p of photos) await t.add("photos", p);
    for (const p of photoData) await t.add("photo_data", p);
    for (const s of d.sales) await t.add("sales", s);
    for (const i of invoices) await t.add("invoices", i);
    for (const c of d.invoice_counter) await t.put("invoice_counter", c);
    for (const a of d.audit) await t.add("audit", a);
    const lastId = (d.audit as AuditEntry[]).reduce((m, a) => Math.max(m, a.id), 0);
    const auditId = (await t.add("audit", {
      at: new Date().toISOString(), action: "sicherung_eingespielt", entity: "backup", entity_id: null, details: { created_at: d.created_at },
    })) as number;
    await t.put("meta", { at: d.created_at, auditId: Math.max(lastId, auditId) }, "last_backup");
  });
  return { parts: d.parts.length, invoices: invoices.length };
}
