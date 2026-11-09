// Geschäftsregeln aus Teilewerk (dort teils als Datenbank-Regeln und Trigger umgesetzt).
import { all, byIndex, get, tx, type Tx } from "./db";
import { date, dateTime, parseEuro, todayBerlin } from "./format";
import { loadLogo, renderInvoicePdf, type InvoiceSnapshot } from "./invoice-pdf";
import { gewaehrleistungRechnung, hatWiderrufsrecht } from "./legal";
import {
  EMPTY_SETTINGS,
  type Attachment, type Condition, type ContractChannel, type Delivery, type Invoice, type Part, type PartStatus, type Photo, type Sale, type SaleItem, type Settings, type Vehicle,
} from "./types";

export class UserError extends Error {}

const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/** Die 7 war nur der frühere Standard und ist schon vergeben. Ältere Einstellungen kennen das Feld teils noch gar nicht. */
const firstNumber = (v?: string) => (!v || v === "7" ? EMPTY_SETTINGS.first_number : v);

export async function loadSettings(): Promise<Settings> {
  const s = { ...EMPTY_SETTINGS, ...(await get<Settings>("settings", 1)) };
  // "RE" war nur der frühere Standard. Der Nummernkreis des Betriebs läuft unter "VS".
  if (s.invoice_prefix === "RE") s.invoice_prefix = EMPTY_SETTINGS.invoice_prefix;
  s.first_number = firstNumber(s.first_number);
  return s;
}

export function missingSettings(s: Settings): string[] {
  const miss: string[] = [];
  if (!s.owner_name.trim()) miss.push("Name Inhaber");
  if (!s.street.trim()) miss.push("Straße");
  if (!s.zip.trim()) miss.push("PLZ");
  if (!s.city.trim()) miss.push("Ort");
  return miss;
}

export async function saveSettings(s: Settings) {
  if (!/^[A-Za-z0-9]{1,10}$/.test(s.invoice_prefix)) throw new UserError("Präfix: 1–10 Buchstaben/Ziffern.");
  if (!/^[1-9]\d{0,4}$/.test(s.first_number)) throw new UserError("Nächste Rechnungsnummer: bitte eine Zahl von 1 bis 99999 angeben.");
  await tx(["settings", "invoices", "audit"], "readwrite", async (t) => {
    const hasInvoices = (await t.all("invoices")).length > 0;
    const old = await t.get<Settings>("settings", 1);
    if (hasInvoices && firstNumber(old?.first_number) !== s.first_number) {
      throw new UserError("Die nächste Rechnungsnummer ist gesperrt, weil es schon Rechnungen gibt.");
    }
    await t.put("settings", s, 1);
    await t.audit("einstellungen_geaendert", "settings", 1);
  });
}

// ---------------------------------------------------------------------------
// Teile
// ---------------------------------------------------------------------------

export interface PartInput {
  title: string; fits_brand: string; fits_model: string; part_number: string; material: string; color: string;
  condition: Condition; defects: string; description: string; price: string; storage_location: string; status?: PartStatus;
  kind?: "teil" | "roller";
  vehicle?: VehicleInput;
}

export interface VehicleInput {
  fin: string; plate: string; first_registration: string; km: string; ccm: string; power: string; keys: string; papers: string;
  purchase_date: string; purchase_price: string;
}

function readVehicle(v: VehicleInput | undefined): Vehicle {
  const s = (x: string | undefined) => (x ?? "").trim();
  const price = s(v?.purchase_price);
  const purchase_cents = price ? parseEuro(price) : null;
  if (price && purchase_cents === null) throw new UserError("Bitte einen gültigen Ankaufspreis angeben, z. B. 200 oder 99,50.");
  return {
    fin: s(v?.fin).toUpperCase(), plate: s(v?.plate).toUpperCase(), first_registration: s(v?.first_registration), km: s(v?.km),
    ccm: s(v?.ccm), power: s(v?.power), keys: s(v?.keys), papers: s(v?.papers), purchase_date: s(v?.purchase_date), purchase_cents,
  };
}

export interface NewPhoto { data: ArrayBuffer; thumb: ArrayBuffer; width: number; height: number }

function readPart(i: PartInput) {
  const title = i.title.trim();
  const price_cents = parseEuro(i.price);
  if (!title) throw new UserError("Bitte eine Bezeichnung angeben.");
  if (price_cents === null) throw new UserError("Bitte einen gültigen Preis angeben, z. B. 35 oder 12,50.");
  return {
    title,
    fits_brand: i.fits_brand.trim(), fits_model: i.fits_model.trim(), part_number: i.part_number.trim(),
    material: i.material.trim(), color: i.color.trim(), condition: i.condition,
    defects: i.defects.trim(), description: i.description.trim(), price_cents, storage_location: i.storage_location.trim(),
    kind: i.kind ?? "teil",
    ...(i.kind === "roller" ? { vehicle: readVehicle(i.vehicle) } : {}),
  };
}

async function addPhotosIn(t: Tx, partId: number, photos: NewPhoto[], startOrder: number) {
  let order = startOrder;
  for (const p of photos) {
    const id = await t.add("photos", {
      part_id: partId, width: p.width, height: p.height, sort_order: order++, created_at: now(), thumb: p.thumb,
    }) as number;
    await t.add("photo_data", { id, data: p.data });
  }
}

export async function createPart(i: PartInput, photos: NewPhoto[]): Promise<number> {
  const d = readPart(i);
  return tx(["parts", "photos", "photo_data", "audit"], "readwrite", async (t) => {
    const ts = now();
    const id = await t.add("parts", { ...d, status: "lager", created_at: ts, updated_at: ts }) as number;
    await addPhotosIn(t, id, photos, 0);
    await t.audit(d.kind === "roller" ? "roller_angelegt" : "teil_angelegt", "part", id, { title: d.title });
    return id;
  });
}

export async function updatePart(id: number, i: PartInput) {
  const d = readPart(i);
  await tx(["parts", "audit"], "readwrite", async (t) => {
    const p = await t.get<Part>("parts", id);
    if (!p) throw new UserError("Teil nicht gefunden.");
    await t.put("parts", { ...p, ...d, kind: p.kind ?? d.kind, status: i.status ?? p.status, updated_at: now() });
    await t.audit("teil_geaendert", "part", id);
  });
}

export async function addPhotos(partId: number, photos: NewPhoto[]) {
  await tx(["photos", "photo_data", "audit"], "readwrite", async (t) => {
    const existing = await t.byIndex<Photo>("photos", "part_id", partId);
    const start = existing.reduce((m, p) => Math.max(m, p.sort_order + 1), 0);
    await addPhotosIn(t, partId, photos, start);
    await t.audit("fotos_hinzugefuegt", "part", partId, { count: photos.length });
  });
}

export async function deletePhoto(partId: number, photoId: number) {
  await tx(["photos", "photo_data", "audit"], "readwrite", async (t) => {
    await t.delete("photos", photoId);
    await t.delete("photo_data", photoId);
    await t.audit("foto_geloescht", "part", partId, { photoId });
  });
}

export async function deletePart(id: number) {
  await tx(["parts", "photos", "photo_data", "sales", "attachments", "audit"], "readwrite", async (t) => {
    const sales = await t.all<Sale>("sales");
    if (sales.some((s) => s.items.some((x) => x.part_id === id))) {
      throw new UserError("Teil ist in einem Verkauf enthalten und kann nicht gelöscht werden.");
    }
    for (const ph of await t.byIndex<Photo>("photos", "part_id", id)) {
      await t.delete("photos", ph.id);
      await t.delete("photo_data", ph.id);
    }
    for (const a of await t.byIndex<Attachment>("attachments", "owner", `part:${id}`)) await t.delete("attachments", a.id);
    await t.delete("parts", id);
    await t.audit("teil_geloescht", "part", id);
  });
}

// ---------------------------------------------------------------------------
// Verkäufe
// ---------------------------------------------------------------------------

export interface SaleInput {
  partPrices: { partId: number; price: string }[];
  buyer_name: string; buyer_street: string; buyer_zip: string; buyer_city: string; buyer_email: string; buyer_platform_name: string;
  delivery: Delivery; contract_channel: ContractChannel; shipping: string; sale_date: string;
  warranty_shortened: boolean; warranty_informed_at: string; warranty_agreed_at: string; warranty_evidence: string;
  notes: string;
}

const byNumber = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

/** Lager-Reihenfolge: Roller als Block oben (neueste zuerst), dann Teile nach Nummer. Teile ohne Nummer stehen hinter den nummerierten. */
export function sortStock(parts: Part[]): Part[] {
  const isRoller = (p: Part) => p.kind === "roller";
  return [...parts].sort((a, b) => {
    if (isRoller(a) !== isRoller(b)) return isRoller(a) ? -1 : 1;
    if (isRoller(a)) return b.id - a.id;
    if (!a.part_number !== !b.part_number) return a.part_number ? -1 : 1;
    return byNumber.compare(a.part_number, b.part_number) || b.id - a.id;
  });
}

export function itemDescription(p: Part): string {
  if (p.kind === "roller") {
    const v = p.vehicle;
    return [
      `Gebrauchtes Kraftrad (Roller): ${p.title}`,
      v?.fin && `FIN ${v.fin}`,
      v?.plate && `Kennzeichen ${v.plate}`,
      v?.first_registration && `Erstzulassung ${v.first_registration}`,
      v?.km && `km-Stand ${v.km}`,
      p.part_number && `Art.-Nr. ${p.part_number}`,
    ].filter(Boolean).join(", ");
  }
  const fit = [p.fits_brand, p.fits_model].filter(Boolean).join(" ");
  return [
    `${p.title}${fit ? `, passend für ${fit}` : ""}`,
    [p.material && `Material ${p.material}`, "gebraucht", p.part_number && `Teilenr. ${p.part_number}`]
      .filter(Boolean).join(", "),
  ].join(" – ");
}

export async function createSale(i: SaleInput): Promise<number> {
  if (!i.partPrices.length) throw new UserError("Bitte mindestens ein Teil auswählen.");
  const buyer_name = i.buyer_name.trim();
  if (!buyer_name) throw new UserError("Bitte den Namen des Käufers angeben.");
  if (i.delivery === "versand" && i.contract_channel === "vor_ort") {
    throw new UserError("Bei Versand kommt der Vertrag immer per Chat/Fernkommunikation zustande.");
  }
  if (i.delivery === "versand" && !(i.buyer_street.trim() && i.buyer_zip.trim() && i.buyer_city.trim())) {
    throw new UserError("Für den Versand bitte die vollständige Anschrift angeben.");
  }
  const shipping_cents = i.delivery === "versand" ? parseEuro(i.shipping.trim() || "0") : 0;
  if (shipping_cents === null) throw new UserError("Versandkosten ungültig.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.sale_date)) throw new UserError("Datum ungültig.");

  // § 476 Abs. 2 BGB: Verkürzung nur mit vollständigem Nachweis und Information VOR der Zustimmung.
  let informed: string | null = null;
  let agreed: string | null = null;
  const evidence = i.warranty_evidence.trim();
  if (i.warranty_shortened) {
    if (!i.warranty_informed_at || !i.warranty_agreed_at || !evidence) {
      throw new UserError("Verkürzte Gewährleistung: Zeitpunkt der Information, Zeitpunkt der Zustimmung und Nachweis sind Pflicht.");
    }
    informed = new Date(i.warranty_informed_at).toISOString();
    agreed = new Date(i.warranty_agreed_at).toISOString();
    if (informed > agreed) throw new UserError("Der Käufer muss VOR seiner Zustimmung informiert worden sein.");
  }

  const prices = new Map<number, number>();
  for (const { partId, price } of i.partPrices) {
    const c = parseEuro(price);
    if (c === null) throw new UserError(`Preis „${price}“ ist ungültig, bitte z. B. 35 oder 12,50 angeben.`);
    prices.set(partId, c);
  }

  return tx(["parts", "sales", "audit"], "readwrite", async (t) => {
    const items: SaleItem[] = [];
    const parts: Part[] = [];
    for (const [partId, price_cents] of prices) {
      const p = await t.get<Part>("parts", partId);
      if (!p) throw new UserError("Ein ausgewähltes Teil existiert nicht mehr.");
      if (p.status === "verkauft") throw new UserError(`„${p.title}“ ist bereits verkauft.`);
      parts.push(p);
      items.push({ part_id: p.id, description: itemDescription(p), quantity: 1, price_cents });
    }
    const id = await t.add("sales", {
      buyer_name, buyer_street: i.buyer_street.trim(), buyer_zip: i.buyer_zip.trim(), buyer_city: i.buyer_city.trim(),
      buyer_email: i.buyer_email.trim(), buyer_platform_name: i.buyer_platform_name.trim(),
      delivery: i.delivery, contract_channel: i.contract_channel, shipping_cents, sale_date: i.sale_date,
      warranty_shortened: i.warranty_shortened, warranty_informed_at: informed, warranty_agreed_at: agreed,
      warranty_evidence: i.warranty_shortened ? evidence : "", notes: i.notes.trim(), items, created_at: now(),
    }) as number;
    for (const p of parts) await t.put("parts", { ...p, status: "reserviert", updated_at: now() });
    await t.audit("verkauf_angelegt", "sale", id);
    return id;
  });
}

export async function deleteSale(id: number) {
  await tx(["parts", "sales", "invoices", "attachments", "audit"], "readwrite", async (t) => {
    const invoices = await t.byIndex<Invoice>("invoices", "sale_id", id);
    if (invoices.length) throw new UserError(`GoBD: Verkauf ${id} hat bereits eine Rechnung und kann nicht geändert werden`);
    const sale = await t.get<Sale>("sales", id);
    if (!sale) return;
    for (const item of sale.items) {
      if (item.part_id == null) continue;
      const p = await t.get<Part>("parts", item.part_id);
      if (p?.status === "reserviert") await t.put("parts", { ...p, status: "lager", updated_at: now() });
    }
    for (const a of await t.byIndex<Attachment>("attachments", "owner", `sale:${id}`)) await t.delete("attachments", a.id);
    await t.delete("sales", id);
    await t.audit("verkauf_geloescht", "sale", id);
  });
}

// ---------------------------------------------------------------------------
// Dokumente zu Rollern und Verkäufen
// ---------------------------------------------------------------------------

export type AttachmentOwner = `part:${number}` | `sale:${number}` | `expense:${number}` | `contract:${number}`;

export async function addAttachment(owner: AttachmentOwner, doc: { name: string; type: string; data: ArrayBuffer }): Promise<number> {
  return tx(["attachments", "audit"], "readwrite", async (t) => {
    const id = await t.add("attachments", { owner, name: doc.name, type: doc.type, data: doc.data, created_at: now() }) as number;
    await t.audit("dokument_hinzugefuegt", "attachment", id, { owner, name: doc.name });
    return id;
  });
}

/** Nachweise eines Verkaufs bleiben ab der ersten Rechnung erhalten. Ergänzen ist weiter möglich. */
export async function deleteAttachment(id: number) {
  await tx(["attachments", "invoices", "audit"], "readwrite", async (t) => {
    const a = await t.get<Attachment>("attachments", id);
    if (!a) return;
    const saleId = /^sale:(\d+)$/.exec(a.owner)?.[1];
    if (saleId && (await t.byIndex<Invoice>("invoices", "sale_id", Number(saleId))).length) {
      throw new UserError("Dieser Verkauf hat eine Rechnung. Seine Dokumente lassen sich nicht mehr löschen.");
    }
    await t.delete("attachments", id);
    await t.audit("dokument_geloescht", "attachment", id, { owner: a.owner, name: a.name });
  });
}

// ---------------------------------------------------------------------------
// Rechnungen: fortlaufend, lückenlos, unveränderbar. Korrektur nur per Storno.
// ---------------------------------------------------------------------------

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Das PDF entsteht außerhalb der Transaktion, weil IndexedDB-Transaktionen beim Warten auf andere Arbeit
 * von selbst enden. Deshalb: Nummer lesen, PDF erzeugen, und beim Schreiben prüfen, dass die Nummer noch frei ist.
 * Falls nicht (z. B. zweites offenes Fenster), beginnt der Vorgang neu. So entsteht weder eine Lücke noch ein Doppel.
 */
async function issue(
  build: (nextNumber: string) => InvoiceSnapshot | Promise<InvoiceSnapshot>,
  settings: Settings,
  write: (t: Tx, snap: InvoiceSnapshot, pdf: Uint8Array, sha: string) => Promise<number>,
): Promise<number> {
  // Format wie bisher: VS + JJJJ + MM + laufende Nummer, die auch über Monate und Jahre weiterzählt.
  const yearMonth = todayBerlin().slice(0, 7).replace("-", "");
  const initialLastNo = Number(settings.first_number) - 1;
  const year = COUNTER_KEY;
  for (let attempt = 0; attempt < 5; attempt++) {
    const counter = await get<{ year: number; last_no: number }>("invoice_counter", year);
    const lastNo = counter?.last_no ?? initialLastNo;
    const no = String(lastNo + 1).padStart(5, "0");
    const snap = await build(`${settings.invoice_prefix || "VS"}${yearMonth}${no}`);
    const pdf = await renderInvoicePdf(snap, await loadLogo());
    const sha = await sha256Hex(pdf);
    const id = await tx(["invoices", "invoice_counter", "parts", "audit"], "readwrite", async (t) => {
      const current = await t.get<{ year: number; last_no: number }>("invoice_counter", year);
      if ((current?.last_no ?? initialLastNo) !== lastNo) return null;
      await t.put("invoice_counter", { year, last_no: lastNo + 1 });
      return write(t, snap, pdf, sha);
    });
    if (id !== null) return id;
  }
  throw new UserError("Die Rechnungsnummer konnte nicht vergeben werden. Bitte erneut versuchen.");
}

/** Ein einziger Zähler statt einem pro Jahr: Der Nummernkreis läuft durchgehend weiter. */
const COUNTER_KEY = 0;

function toBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

const isCancelled = (inv: Invoice, list: Invoice[]) => list.some((x) => x.cancels_invoice_id === inv.id);

export async function createInvoice(saleId: number): Promise<number> {
  const sale = await get<Sale>("sales", saleId);
  if (!sale) throw new UserError("Verkauf nicht gefunden.");
  const existing = await byIndex<Invoice>("invoices", "sale_id", saleId);
  const active = existing.find((i) => i.kind === "rechnung" && !isCancelled(i, existing));
  if (active) throw new UserError(`Für diesen Verkauf gibt es schon die Rechnung ${active.number}.`);

  const settings = await loadSettings();
  const miss = missingSettings(settings);
  if (miss.length) throw new UserError(`Bitte zuerst in den Einstellungen ergänzen: ${miss.join(", ")}.`);
  if (!sale.buyer_name.trim()) throw new UserError("Name des Käufers fehlt.");
  if (!sale.items.length) throw new UserError("Der Verkauf enthält keine Artikel.");

  const lines = sale.items.map((i) => ({
    description: i.description, quantity: i.quantity, unitCents: i.price_cents, totalCents: i.price_cents * i.quantity,
  }));
  const total = lines.reduce((a, l) => a + l.totalCents, 0) + sale.shipping_cents;

  return issue((number) => ({
    kind: "rechnung",
    number,
    issuedAt: date(new Date()),
    deliveryDate: date(sale.sale_date),
    seller: settings,
    buyer: { name: sale.buyer_name, street: sale.buyer_street, zip: sale.buyer_zip, city: sale.buyer_city },
    items: lines,
    shippingCents: sale.shipping_cents,
    totalCents: total,
    deliveryText: sale.delivery === "versand" ? "Lieferung per Versand." : "Übergabe bei Abholung.",
    warrantyText: gewaehrleistungRechnung(sale.warranty_shortened, sale.warranty_agreed_at ? dateTime(sale.warranty_agreed_at) : undefined),
    withWithdrawalInfo: hatWiderrufsrecht(sale.contract_channel),
    saleId,
  }), settings, async (t, snap, pdf, sha) => {
    const invoiceId = await t.add("invoices", {
      number: snap.number, kind: "rechnung", sale_id: saleId, cancels_invoice_id: null, issued_at: now(),
      total_cents: snap.totalCents, snapshot: snap, pdf: toBuffer(pdf), pdf_sha256: sha,
    }) as number;
    for (const item of sale.items) {
      if (item.part_id == null) continue;
      const p = await t.get<Part>("parts", item.part_id);
      if (p) await t.put("parts", { ...p, status: "verkauft", updated_at: now() });
    }
    await t.audit("rechnung_erstellt", "invoice", invoiceId, { number: snap.number, total: snap.totalCents });
    return invoiceId;
  });
}

/** Storno: neue Rechnung mit eigener Nummer und negativen Beträgen. Das Original bleibt unverändert. */
export async function cancelInvoice(invoiceId: number, reason: string, partsBackToStock: boolean): Promise<number> {
  if (!reason.trim()) throw new UserError("Bitte einen Grund für das Storno angeben.");
  const orig = await get<Invoice>("invoices", invoiceId);
  if (!orig) throw new UserError("Rechnung nicht gefunden.");
  if (orig.kind !== "rechnung") throw new UserError("Eine Stornorechnung kann nicht storniert werden.");
  const siblings = await byIndex<Invoice>("invoices", "sale_id", orig.sale_id);
  const already = siblings.find((x) => x.cancels_invoice_id === invoiceId);
  if (already) throw new UserError(`Bereits storniert durch ${already.number}.`);

  const sale = await get<Sale>("sales", orig.sale_id);
  const settings = await loadSettings();
  const o = orig.snapshot;

  return issue((number) => ({
    ...o,
    kind: "storno",
    number,
    issuedAt: date(new Date()),
    cancelsNumber: o.number,
    cancelsDate: o.issuedAt,
    seller: settings,
    items: o.items.map((i) => ({ ...i, unitCents: -i.unitCents, totalCents: -i.totalCents })),
    shippingCents: -o.shippingCents,
    totalCents: -o.totalCents,
    withWithdrawalInfo: false,
  }), settings, async (t, snap, pdf, sha) => {
    const id = await t.add("invoices", {
      number: snap.number, kind: "storno", sale_id: orig.sale_id, cancels_invoice_id: invoiceId, issued_at: now(),
      total_cents: snap.totalCents, snapshot: snap, pdf: toBuffer(pdf), pdf_sha256: sha,
    }) as number;
    if (partsBackToStock && sale) {
      for (const item of sale.items) {
        if (item.part_id == null) continue;
        const p = await t.get<Part>("parts", item.part_id);
        if (p) await t.put("parts", { ...p, status: "lager", updated_at: now() });
      }
    }
    await t.audit("rechnung_storniert", "invoice", id, { number: snap.number, cancels: o.number, reason: reason.trim(), partsBackToStock });
    return id;
  });
}

// ---------------------------------------------------------------------------
// Import bestehender Rechnungen: Das PDF bleibt unverändert, eine neue Nummer gibt es nicht.
// ---------------------------------------------------------------------------

export interface ImportInvoice { number: string; issued_on: string; buyer_name: string; total_cents: number; pdf: ArrayBuffer }
export interface ImportResult { imported: string[]; skipped: { number: string; reason: string }[] }

/** Laufende Nummer aus dem Format VS + JJJJ + MM + 5 Stellen, sonst null. */
const runningNumber = (number: string): number | null => {
  const m = /^[A-Za-z]+\d{6}(\d{5})$/.exec(number);
  return m ? Number(m[1]) : null;
};

export async function importInvoices(items: ImportInvoice[]): Promise<ImportResult> {
  if (!items.length) throw new UserError("Die Datei enthält keine Rechnungen.");
  const prepared: { number: string; buyer: string; issued_on: string; total_cents: number; pdf: ArrayBuffer; sha: string }[] = [];
  for (const i of items) {
    const number = i.number.trim();
    const buyer = i.buyer_name.trim();
    if (!/^[A-Za-z0-9-]{3,30}$/.test(number)) throw new UserError(`Rechnungsnummer ungültig: „${number}“.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.issued_on) || Number.isNaN(Date.parse(i.issued_on))) throw new UserError(`Rechnung ${number}: Datum ungültig.`);
    if (i.issued_on > todayBerlin()) throw new UserError(`Rechnung ${number}: Das Datum liegt in der Zukunft.`);
    if (!buyer) throw new UserError(`Rechnung ${number}: Der Name des Käufers fehlt.`);
    if (!Number.isInteger(i.total_cents) || i.total_cents < 0) throw new UserError(`Rechnung ${number}: Betrag ungültig.`);
    if (new TextDecoder().decode(i.pdf.slice(0, 5)) !== "%PDF-") throw new UserError(`Rechnung ${number}: Die Datei ist kein PDF.`);
    prepared.push({ number, buyer, issued_on: i.issued_on, total_cents: i.total_cents, pdf: i.pdf, sha: await sha256Hex(i.pdf) });
  }
  const settings = await loadSettings();

  return tx(["invoices", "invoice_counter", "audit"], "readwrite", async (t) => {
    const existing = await t.all<Invoice>("invoices");
    const numbers = new Set(existing.map((i) => i.number));
    const running = new Map(existing.flatMap((i) => {
      const r = runningNumber(i.number);
      return r === null ? [] : [[r, i.number] as const];
    }));
    const result: ImportResult = { imported: [], skipped: [] };
    let highest = 0;

    for (const p of prepared) {
      const r = runningNumber(p.number);
      if (numbers.has(p.number)) {
        result.skipped.push({ number: p.number, reason: "ist schon vorhanden" });
        continue;
      }
      if (r !== null && running.has(r)) {
        result.skipped.push({ number: p.number, reason: `hat dieselbe laufende Nummer wie ${running.get(r)}` });
        continue;
      }
      const issuedAt = date(p.issued_on);
      const snapshot: InvoiceSnapshot = {
        kind: "rechnung", number: p.number, issuedAt, deliveryDate: issuedAt, seller: settings,
        buyer: { name: p.buyer, street: "", zip: "", city: "" }, items: [], shippingCents: 0, totalCents: p.total_cents,
        deliveryText: "", warrantyText: "", withWithdrawalInfo: false, saleId: 0,
      };
      const id = await t.add("invoices", {
        number: p.number, kind: "rechnung", sale_id: 0, cancels_invoice_id: null, issued_at: `${p.issued_on}T12:00:00.000Z`,
        total_cents: p.total_cents, snapshot, pdf: p.pdf, pdf_sha256: p.sha, imported: true,
      }) as number;
      await t.audit("rechnung_importiert", "invoice", id, { number: p.number, total: p.total_cents });
      numbers.add(p.number);
      if (r !== null) { running.set(r, p.number); highest = Math.max(highest, r); }
      result.imported.push(p.number);
    }

    // Neue Rechnungen dürfen keine importierte Nummer noch einmal vergeben.
    const counter = await t.get<{ year: number; last_no: number }>("invoice_counter", COUNTER_KEY);
    const current = counter?.last_no ?? Number(settings.first_number) - 1;
    if (highest > current) await t.put("invoice_counter", { year: COUNTER_KEY, last_no: highest });
    return result;
  });
}

/** CSV für Steuerberater / EÜR (Semikolon, deutsche Zahlen, UTF-8 mit BOM für Excel). */
export async function invoicesCsv(year?: number): Promise<string> {
  const [invoices, sales] = await Promise.all([all<Invoice>("invoices"), all<Sale>("sales")]);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const berlinYear = (iso: string) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date(iso)));
  const rows = invoices.filter((i) => !year || berlinYear(i.issued_at) === year).sort((a, b) => a.id - b.id);
  const lines = [
    ["Rechnungsnummer", "Art", "Datum", "Käufer", "Betrag EUR", "Storniert Rechnung", "SHA-256 PDF"].join(";"),
    ...rows.map((r) => [
      r.number, r.kind, date(r.issued_at), esc(sales.find((s) => s.id === r.sale_id)?.buyer_name ?? r.snapshot.buyer.name),
      (r.total_cents / 100).toFixed(2).replace(".", ","),
      invoices.find((x) => x.id === r.cancels_invoice_id)?.number ?? "", r.pdf_sha256,
    ].join(";")),
  ];
  return "﻿" + lines.join("\r\n");
}
