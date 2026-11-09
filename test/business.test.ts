import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { FORMS, renderForm } from "../src/lib/forms";
import { beforeEach, describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { backupStatus, buildBackup, buildInvoiceExport, markBackupDone, parseInvoiceImport, restoreBackup } from "../src/lib/backup";
import {
  addAttachment, cancelInvoice, createInvoice, createPart, createSale, deleteAttachment, deletePart, deleteSale, importInvoices, invoicesCsv, itemDescription, loadSettings, saveSettings, sha256Hex, sortStock,
  type ImportInvoice, type PartInput, type SaleInput,
} from "../src/lib/business";
import { adText } from "../src/lib/adtext";
import { all, get, resetForTests, tx } from "../src/lib/db";
import { renderInvoicePdf, renderWarrantyPdf } from "../src/lib/invoice-pdf";
import { gewaehrleistungVereinbarung } from "../src/lib/legal";
import { todayBerlin } from "../src/lib/format";
import {
  buildExpenseExport, createContract, createExpense, deleteContract, deleteExpense, expensesCsv, importExpenses, monthlyCosts, parseExpenseImport, updateContract, updateExpense,
  type ContractInput, type ExpenseInput,
} from "../src/lib/records";
import { EMPTY_SETTINGS, type Attachment, type AuditEntry, type Contract, type Expense, type ExpenseCategory, type Invoice, type Part } from "../src/lib/types";

const YEAR = todayBerlin().slice(0, 4);
const no = (n: number) => `VS${todayBerlin().slice(0, 7).replace("-", "")}${String(n).padStart(5, "0")}`;

const part = (over: Partial<PartInput> = {}): PartInput => ({
  title: "Frontabdeckung", fits_brand: "Yuanjia", fits_model: "", part_number: "", material: "ABS", color: "",
  condition: "gut", defects: "", description: "", price: "35,00", storage_location: "Regal A", ...over,
});

const sale = (partId: number, over: Partial<SaleInput> = {}): SaleInput => ({
  partPrices: [{ partId, price: "35,00" }],
  buyer_name: "Erika Muster", buyer_street: "Teststr. 1", buyer_zip: "33602", buyer_city: "Bielefeld",
  buyer_email: "", buyer_platform_name: "", delivery: "versand", contract_channel: "chat", shipping: "5,50",
  sale_date: todayBerlin(), warranty_shortened: false, warranty_informed_at: "", warranty_agreed_at: "", warranty_evidence: "",
  notes: "", ...over,
});

async function setupSeller() {
  await saveSettings({ ...EMPTY_SETTINGS, owner_name: "Max Test", street: "Hauptstr. 2", zip: "33602", city: "Bielefeld" });
}

async function invoicedSale() {
  const partId = await createPart(part(), []);
  const saleId = await createSale(sale(partId));
  const invoiceId = await createInvoice(saleId);
  return { partId, saleId, invoiceId };
}

beforeEach(async () => {
  await resetForTests();
  await setupSeller();
});

describe("Rechnungen", () => {
  it("nummeriert fortlaufend und lückenlos und markiert Teile als verkauft", async () => {
    const a = await invoicedSale();
    const b = await invoicedSale();
    const [ia, ib] = await Promise.all([get<Invoice>("invoices", a.invoiceId), get<Invoice>("invoices", b.invoiceId)]);
    expect(ia!.number).toBe(no(8));
    expect(ib!.number).toBe(no(9));
    expect(ia!.total_cents).toBe(4050);
    expect((await get<Part>("parts", a.partId))!.status).toBe("verkauft");
  });

  it("vergibt auch bei gleichzeitigen Rechnungen keine Nummer doppelt und keine Lücke", async () => {
    const ids = await Promise.all([1, 2, 3].map(async () => createSale(sale(await createPart(part(), [])))));
    await Promise.all(ids.map((id) => createInvoice(id)));
    const numbers = (await all<Invoice>("invoices")).map((i) => i.number).sort();
    expect(numbers).toEqual([no(8), no(9), no(10)]);
  });

  it("macht aus der früher gespeicherten 7 die 8, ohne das Speichern zu sperren", async () => {
    const stored = { ...(await loadSettings()), first_number: "7" };
    await tx(["settings"], "readwrite", async (t) => { await t.put("settings", stored, 1); });
    expect((await loadSettings()).first_number).toBe("8");
    const { invoiceId } = await invoicedSale();
    expect((await get<Invoice>("invoices", invoiceId))!.number).toBe(no(8));
    await saveSettings({ ...(await loadSettings()), owner_name: "Neu" });
    expect((await loadSettings()).owner_name).toBe("Neu");
  });

  it("startet bei der eingestellten Nummer und sperrt sie nach der ersten Rechnung", async () => {
    await saveSettings({ ...(await loadSettings()), first_number: "42" });
    const { invoiceId } = await invoicedSale();
    expect((await get<Invoice>("invoices", invoiceId))!.number).toBe(no(42));
    await expect(saveSettings({ ...(await loadSettings()), first_number: "1" })).rejects.toThrow(/gesperrt/);
    await expect(saveSettings({ ...(await loadSettings()), first_number: "0" })).rejects.toThrow(/1 bis 99999/);
    await saveSettings({ ...(await loadSettings()), owner_name: "Neu" });
    expect((await loadSettings()).owner_name).toBe("Neu");
  });

  it("verweigert eine zweite Rechnung und fehlende Verkäuferdaten", async () => {
    const { saleId } = await invoicedSale();
    await expect(createInvoice(saleId)).rejects.toThrow(/schon die Rechnung/);
    await saveSettings({ ...EMPTY_SETTINGS });
    const other = await createSale(sale(await createPart(part(), [])));
    await expect(createInvoice(other)).rejects.toThrow(/Einstellungen/);
    expect(await all("invoices")).toHaveLength(1);
  });

  it("speichert ein echtes PDF mit Prüfsumme und nutzt die Daten von damals", async () => {
    const { invoiceId } = await invoicedSale();
    const inv = (await get<Invoice>("invoices", invoiceId))!;
    expect(new TextDecoder().decode(inv.pdf.slice(0, 5))).toBe("%PDF-");
    expect(inv.pdf_sha256).toMatch(/^[0-9a-f]{64}$/);
    await saveSettings({ ...(await loadSettings()), owner_name: "Neuer Name" });
    expect((await get<Invoice>("invoices", invoiceId))!.snapshot.seller.owner_name).toBe("Max Test");
  });

  it("erlaubt kein Ändern oder Löschen von Rechnungen und Protokoll", async () => {
    const { invoiceId, saleId } = await invoicedSale();
    await expect(tx(["invoices"], "readwrite", (t) => t.delete("invoices", invoiceId))).rejects.toThrow(/GoBD/);
    await expect(tx(["invoices"], "readwrite", async (t) => {
      const inv = await t.get<Invoice>("invoices", invoiceId);
      await t.put("invoices", { ...inv!, total_cents: 1 });
    })).rejects.toThrow(/GoBD/);
    await expect(tx(["audit"], "readwrite", (t) => t.delete("audit", 1))).rejects.toThrow(/GoBD/);
    await expect(deleteSale(saleId)).rejects.toThrow(/GoBD/);
    expect((await get<Invoice>("invoices", invoiceId))!.total_cents).toBe(4050);
  });
});

describe("Storno", () => {
  it("legt eine neue Nummer mit negativen Beträgen an und lässt das Original unverändert", async () => {
    const { invoiceId, partId } = await invoicedSale();
    const before = await get<Invoice>("invoices", invoiceId);
    const stornoId = await cancelInvoice(invoiceId, "Widerruf", true);
    const storno = (await get<Invoice>("invoices", stornoId))!;
    expect(storno.number).toBe(no(9));
    expect(storno.kind).toBe("storno");
    expect(storno.total_cents).toBe(-4050);
    expect(storno.snapshot.cancelsNumber).toBe(before!.number);
    expect(await get<Invoice>("invoices", invoiceId)).toEqual(before);
    expect((await get<Part>("parts", partId))!.status).toBe("lager");
  });

  it("verweigert doppeltes Storno, Storno eines Stornos und fehlenden Grund", async () => {
    const { invoiceId } = await invoicedSale();
    await expect(cancelInvoice(invoiceId, "  ", true)).rejects.toThrow(/Grund/);
    const stornoId = await cancelInvoice(invoiceId, "Fehler", false);
    await expect(cancelInvoice(invoiceId, "nochmal", false)).rejects.toThrow(/Bereits storniert/);
    await expect(cancelInvoice(stornoId, "nochmal", false)).rejects.toThrow(/nicht storniert werden/);
  });
});

describe("Verkäufe", () => {
  it("prüft die Pflichtangaben für die verkürzte Gewährleistung", async () => {
    const id = await createPart(part(), []);
    await expect(createSale(sale(id, { warranty_shortened: true }))).rejects.toThrow(/Pflicht/);
    await expect(createSale(sale(id, {
      warranty_shortened: true, warranty_informed_at: "2026-11-05T15:00", warranty_agreed_at: "2026-11-05T14:00", warranty_evidence: "Chat",
    }))).rejects.toThrow(/VOR/);
    const saleId = await createSale(sale(id, {
      warranty_shortened: true, warranty_informed_at: "2026-11-05T14:00", warranty_agreed_at: "2026-11-05T15:00", warranty_evidence: "Chat",
    }));
    const inv = (await get<Invoice>("invoices", await createInvoice(saleId)))!;
    expect(inv.snapshot.warrantyText).toContain("§ 476 Abs. 2 BGB");
  });

  it("hängt nur bei Chat-Vertrag die Widerrufsbelehrung an, und Versand ist nie vor Ort", async () => {
    const id = await createPart(part(), []);
    await expect(createSale(sale(id, { contract_channel: "vor_ort" }))).rejects.toThrow(/Versand/);
    const saleId = await createSale(sale(id, { delivery: "abholung", contract_channel: "vor_ort" }));
    const inv = (await get<Invoice>("invoices", await createInvoice(saleId)))!;
    expect(inv.snapshot.withWithdrawalInfo).toBe(false);
    expect(inv.total_cents).toBe(3500);
  });

  it("gibt beim Löschen reservierte Teile frei, blockiert aber das Löschen verkaufter Teile", async () => {
    const id = await createPart(part(), []);
    const saleId = await createSale(sale(id));
    expect((await get<Part>("parts", id))!.status).toBe("reserviert");
    await expect(deletePart(id)).rejects.toThrow(/Verkauf/);
    await deleteSale(saleId);
    expect((await get<Part>("parts", id))!.status).toBe("lager");
    await deletePart(id);
    expect(await all("parts")).toHaveLength(0);
  });
});

describe("Sicherung", () => {
  const photo = () => ({
    data: new Uint8Array([1, 2, 3]).buffer, thumb: new Uint8Array([4]).buffer, width: 10, height: 10,
  });

  it("spielt eine Sicherung vollständig wieder ein, und die Nummerierung läuft weiter", async () => {
    await createPart(part({ title: "Mit Foto" }), [photo()]);
    await invoicedSale();
    const built = await buildBackup();
    await resetForTests();
    const res = await restoreBackup(await built.file.arrayBuffer());
    expect(res).toEqual({ parts: 2, invoices: 1 });
    expect((await loadSettings()).owner_name).toBe("Max Test");
    expect(await all("photo_data")).toHaveLength(1);
    const { invoiceId } = await invoicedSale();
    expect((await get<Invoice>("invoices", invoiceId))!.number).toBe(no(9));
  });

  it("exportiert alle PDFs eines Jahres samt CSV und lässt andere Jahre leer", async () => {
    const { invoiceId } = await invoicedSale();
    const inv = (await get<Invoice>("invoices", invoiceId))!;
    const { file, count } = await buildInvoiceExport(Number(YEAR));
    expect(count).toBe(1);
    expect(file.name).toBe(`Rechnungen_${YEAR}.zip`);
    const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([`${no(8)}.pdf`, `rechnungen_${YEAR}.csv`]);
    expect(await sha256Hex(files[`${no(8)}.pdf`])).toBe(inv.pdf_sha256);
    expect((await buildInvoiceExport(1999)).count).toBe(0);
  });

  it("überschreibt nie eine App mit vorhandenen Daten", async () => {
    await invoicedSale();
    const built = await buildBackup();
    await expect(restoreBackup(await built.file.arrayBuffer())).rejects.toThrow(/leere App/);
    expect(await all("invoices")).toHaveLength(1);
  });

  it("weist fremde Dateien ab", async () => {
    await resetForTests();
    await expect(restoreBackup(new TextEncoder().encode("kein zip").buffer)).rejects.toThrow(/keine gültige/);
  });

  it("erinnert nach einer neuen Rechnung und nicht direkt nach der Sicherung", async () => {
    await invoicedSale();
    expect((await backupStatus()).overdue).toBe(true);
    const built = await buildBackup();
    await markBackupDone(built.auditId);
    const s = await backupStatus();
    expect(s.overdue).toBe(false);
    expect(s.changes).toBe(0);
  });
});

describe("Roller", () => {
  const roller = (over: Partial<PartInput> = {}): PartInput => part({
    kind: "roller", title: "Kymco KB 50", fits_brand: "", material: "",
    vehicle: {
      fin: "rfbsc10ar37603428", plate: "", first_registration: "08.2003", km: "22137", ccm: "49", power: "3 PS", keys: "1",
      papers: "Betriebserlaubnis", purchase_date: "2026-07-14", purchase_price: "99,00",
    },
    ...over,
  });

  it("speichert Fahrzeugdaten und nennt FIN und km auf der Rechnung", async () => {
    const id = await createPart(roller(), []);
    const p = (await get<Part>("parts", id))!;
    expect(p.kind).toBe("roller");
    expect(p.vehicle!.fin).toBe("RFBSC10AR37603428");
    expect(p.vehicle!.purchase_cents).toBe(9900);
    const saleId = await createSale(sale(id));
    const inv = (await get<Invoice>("invoices", await createInvoice(saleId)))!;
    const desc = inv.snapshot.items[0].description;
    expect(desc).toContain("Gebrauchtes Kraftrad (Roller): Kymco KB 50");
    expect(desc).toContain("FIN RFBSC10AR37603428");
    expect(desc).toContain("km-Stand 22137");
    expect(JSON.stringify(inv.snapshot)).not.toContain("purchase");
  });

  it("zeigt Fahrzeugdaten in der Anzeige, aber weder FIN noch Ankaufspreis", async () => {
    const p = (await get<Part>("parts", await createPart(roller(), [])))!;
    const text = adText(p, { versand: false });
    expect(text).toContain("Erstzulassung: 08.2003");
    expect(text).toContain("Kilometerstand: 22137");
    expect(text).not.toContain("RFBSC");
    expect(text).not.toContain("99,00");
    expect(text).not.toContain("passend für");
  });

  it("verweigert einen ungültigen Ankaufspreis und lässt alte Teile unverändert", async () => {
    await expect(createPart(roller({ vehicle: { ...roller().vehicle!, purchase_price: "abc" } }), [])).rejects.toThrow(/Ankaufspreis/);
    const id = await createPart(part(), []);
    const p = (await get<Part>("parts", id))!;
    expect(p.kind).toBe("teil");
    expect(p.vehicle).toBeUndefined();
  });
});

describe("Dokumente", () => {
  const doc = { name: "Papiere.pdf", type: "application/pdf", data: new TextEncoder().encode("%PDF-1.4 x").buffer as ArrayBuffer };

  it("lassen sich bis zur Rechnung löschen und sind danach gesperrt", async () => {
    const partId = await createPart(part(), []);
    const saleId = await createSale(sale(partId));
    const first = await addAttachment(`sale:${saleId}`, doc);
    await deleteAttachment(first);
    expect(await all("attachments")).toHaveLength(0);
    const kept = await addAttachment(`sale:${saleId}`, doc);
    await createInvoice(saleId);
    await expect(deleteAttachment(kept)).rejects.toThrow(/Rechnung/);
    await addAttachment(`sale:${saleId}`, { ...doc, name: "Nachtrag.pdf" });
    expect(await all("attachments")).toHaveLength(2);
  });

  it("werden mit Teil oder Verkauf entfernt und nicht verwaist", async () => {
    const partId = await createPart(part(), []);
    await addAttachment(`part:${partId}`, doc);
    await deletePart(partId);
    const otherId = await createPart(part(), []);
    const saleId = await createSale(sale(otherId));
    await addAttachment(`sale:${saleId}`, doc);
    await deleteSale(saleId);
    expect(await all("attachments")).toHaveLength(0);
  });

  it("bleiben über die Sicherung erhalten, auch alte Sicherungen ohne Dokumente gehen", async () => {
    const partId = await createPart(part(), []);
    await addAttachment(`part:${partId}`, { ...doc, name: "Gutachten (Kopie).pdf" });
    const built = await buildBackup();
    const zipped = unzipSync(new Uint8Array(await built.file.arrayBuffer()));
    const meta = JSON.parse(new TextDecoder().decode(zipped["data.json"]));
    expect(meta.version).toBe(3);
    await resetForTests();
    await restoreBackup(await built.file.arrayBuffer());
    const [restored] = await all<Attachment>("attachments");
    expect(restored.name).toBe("Gutachten (Kopie).pdf");
    expect(new TextDecoder().decode(restored.data)).toBe("%PDF-1.4 x");

    const old = { ...meta, version: 1 };
    delete old.attachments;
    const v1 = zipSync({ ...zipped, "data.json": strToU8(JSON.stringify(old)) });
    await resetForTests();
    await restoreBackup(v1.buffer as ArrayBuffer);
    expect(await all("attachments")).toHaveLength(0);
    expect(await all("parts")).toHaveLength(1);
  });

  it("erhält beim Update auf die neue Datenbank alle vorhandenen Daten", async () => {
    await resetForTests();
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("teilewerk", 1);
      r.onupgradeneeded = () => {
        for (const s of ["settings", "meta"]) r.result.createObjectStore(s);
        r.result.createObjectStore("parts", { keyPath: "id", autoIncrement: true });
        r.result.createObjectStore("photos", { keyPath: "id", autoIncrement: true }).createIndex("part_id", "part_id");
        r.result.createObjectStore("photo_data", { keyPath: "id" });
        r.result.createObjectStore("sales", { keyPath: "id", autoIncrement: true });
        const inv = r.result.createObjectStore("invoices", { keyPath: "id", autoIncrement: true });
        inv.createIndex("number", "number", { unique: true });
        inv.createIndex("sale_id", "sale_id");
        r.result.createObjectStore("invoice_counter", { keyPath: "year" });
        r.result.createObjectStore("audit", { keyPath: "id", autoIncrement: true });
      };
      r.onsuccess = () => {
        const t = r.result.transaction("parts", "readwrite");
        t.objectStore("parts").add({ title: "Altes Teil", status: "lager" });
        t.oncomplete = () => { r.result.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
      r.onerror = () => reject(r.error);
    });
    expect((await all<Part>("parts"))[0].title).toBe("Altes Teil");
    expect(await all("attachments")).toHaveLength(0);
  });
});

describe("Vereinbarung zur Gewährleistung", () => {
  it("erzeugt ein eigenes PDF und nennt alle Pflichtteile", async () => {
    const text = gewaehrleistungVereinbarung();
    expect(text.intro.join(" ")).toContain("1 Jahr");
    expect(text.intro.join(" ")).toContain("vorsätzlicher");
    expect(text.agreement).toContain("ausdrücklich und gesondert");
    expect(text.decline).toContain("2 Jahre");
    const out = process.env.PDF_OUT;
    const pdf = await renderWarrantyPdf({
      seller: { ...EMPTY_SETTINGS, owner_name: "Max Test", street: "Hauptstr. 2", zip: "33602", city: "Bielefeld" },
      buyer: "", items: ["Gebrauchtes Kraftrad (Roller): Kymco KB 50, FIN RFBSC10AR37603428, km-Stand 22137"],
    });
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    if (out) { mkdirSync(out, { recursive: true }); writeFileSync(`${out}/vereinbarung.pdf`, pdf); }
  });
});

describe("Vorlagen zum Herunterladen", () => {
  const seller = {
    ...EMPTY_SETTINGS, owner_name: "Max Test", business_name: "Test Zwei-Rad Service", street: "Hauptstr. 2", zip: "33602", city: "Bielefeld",
    phone: "0521 123", email: "info@example.test", tax_number: "123/456/789", iban: "DE00 0000", bic: "TESTDEXX", paypal: "pay@example.test",
  };
  const logo = () => { const b = readFileSync("public/form-logo.png"); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

  it.each(FORMS.map((f) => f.kind))("erzeugt %s als PDF, auch ohne Logo und ohne Verkäuferdaten", async (kind) => {
    const pdf = await renderForm(kind, seller, logo());
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect((await renderForm(kind, EMPTY_SETTINGS)).length).toBeGreaterThan(500);
    const out = process.env.PDF_OUT;
    if (out) { mkdirSync(out, { recursive: true }); writeFileSync(`${out}/form-${kind}.pdf`, pdf); }
  });
});

describe("Ausgaben", () => {
  const input = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
    date: "2026-09-02", category: "teile_neu", supplier: "roller.com", description: "Vergaser", amount: "69,53", note: "", ...over,
  });
  const beleg = { name: "bon;1.pdf", type: "application/pdf", data: new TextEncoder().encode("%PDF-1.4 bon").buffer as ArrayBuffer };

  it("speichert mit Beleg, prüft Pflichtangaben und erscheint in der CSV", async () => {
    await expect(createExpense(input({ amount: "abc" }), [])).rejects.toThrow(/Betrag/);
    await expect(createExpense(input({ supplier: " " }), [])).rejects.toThrow(/gekauft/);
    await expect(createExpense(input({ date: "" }), [])).rejects.toThrow(/Datum/);
    await expect(createExpense(input({ category: "x" as ExpenseCategory }), [])).rejects.toThrow(/Kategorie/);
    expect(await all("expenses")).toHaveLength(0);
    const id = await createExpense(input(), [beleg]);
    expect((await get<Expense>("expenses", id))!.total_cents).toBe(6953);
    const csv = await expensesCsv(2026);
    expect(csv).toContain('02.09.2026;Rollerteile neu;"roller.com";"Vergaser";69,53;1');
    expect(await expensesCsv(2025)).not.toContain("roller.com");
  });

  it("exportiert CSV und Belege nach Kategorie und lässt fremde Jahre weg", async () => {
    await createExpense(input(), [beleg]);
    await createExpense(input({ date: "2025-12-31", category: "werkzeug", supplier: "OBI" }), [beleg]);
    const { file, count, receipts } = await buildExpenseExport(2026);
    expect([count, receipts]).toEqual([1, 1]);
    const names = Object.keys(unzipSync(new Uint8Array(await file.arrayBuffer())));
    expect(names).toContain("ausgaben_2026.csv");
    expect(names.some((n) => n.startsWith("Rollerteile neu/2026-09-02_roller.com_69,53_") && n.endsWith(".pdf"))).toBe(true);
    expect(names.some((n) => n.includes("OBI"))).toBe(false);
  });

  it("zählt Versicherungen und Verträge als eigene Kategorie mit", async () => {
    await createContract({ type: "versicherung", title: "Autoversicherung", partner: "Versicherer", date: "2026-01-01", ends_on: "", note: "" }, []);
    expect(await all("expenses")).toHaveLength(0);
    await createExpense(input({ category: "vertrag", supplier: "Versicherer", description: "Autoversicherung", amount: "45,00" }), []);
    expect(await expensesCsv(2026)).toContain('Verträge und Versicherungen;"Versicherer";"Autoversicherung";45,00;0');
  });

  it("protokolliert Änderungen und löscht Belege mit, ohne Rechnungsdaten zu berühren", async () => {
    const { invoiceId } = await invoicedSale();
    const id = await createExpense(input(), [beleg]);
    await updateExpense(id, input({ amount: "70" }));
    expect((await get<Expense>("expenses", id))!.total_cents).toBe(7000);
    await deleteExpense(id);
    expect(await all("expenses")).toHaveLength(0);
    expect(await all("attachments")).toHaveLength(0);
    expect(await get<Invoice>("invoices", invoiceId)).toBeDefined();
    const actions = (await all<AuditEntry>("audit")).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["ausgabe_angelegt", "ausgabe_geaendert", "ausgabe_geloescht"]));
  });
});

describe("Import bestehender Ausgaben", () => {
  const pdfBytes = () => new TextEncoder().encode("%PDF-1.4 bon");
  const entry = (over: object = {}) => ({
    date: "2026-07-04", category: "verbrauch", supplier: "OBI", description: "Band", total_cents: 1027, note: "Hinweis", file: "a.pdf", receipt_name: "OBI.pdf", ...over,
  });
  const zipOf = (expenses: object[], withFile = true) => zipSync({
    "ausgaben.json": strToU8(JSON.stringify({ format: "teilewerk-ausgaben-import", version: 1, expenses })),
    ...(withFile ? { "a.pdf": pdfBytes() } : {}),
  }).buffer as ArrayBuffer;

  it("übernimmt Ausgabe und Beleg unverändert und überspringt beim zweiten Mal", async () => {
    const zip = zipOf([entry()]);
    expect(await importExpenses(parseExpenseImport(zip))).toEqual({ imported: 1, skipped: 0 });
    const [e] = await all<Expense>("expenses");
    expect([e.date, e.category, e.supplier, e.total_cents, e.note]).toEqual(["2026-07-04", "verbrauch", "OBI", 1027, "Hinweis"]);
    const [a] = await all<Attachment>("attachments");
    expect(a.owner).toBe(`expense:${e.id}`);
    expect(new TextDecoder().decode(a.data)).toBe("%PDF-1.4 bon");
    expect(await importExpenses(parseExpenseImport(zip))).toEqual({ imported: 0, skipped: 1 });
    expect(await all("expenses")).toHaveLength(1);
    expect(await all("attachments")).toHaveLength(1);
  });

  it("trennt gleiche Läden mit anderem Betrag und importiert bei Fehlern gar nichts", async () => {
    const ok = await importExpenses(parseExpenseImport(zipOf([entry(), entry({ total_cents: 999 })])));
    expect(ok.imported).toBe(2);
    await resetForTests();
    await expect(importExpenses(parseExpenseImport(zipOf([entry(), entry({ category: "x", total_cents: 1 })])))).rejects.toThrow(/Kategorie/);
    await expect(importExpenses(parseExpenseImport(zipOf([entry(), entry({ date: "2099-01-01", total_cents: 1 })])))).rejects.toThrow(/Zukunft/);
    expect(await all("expenses")).toHaveLength(0);
  });

  it("weist fremde und unvollständige Dateien ab", () => {
    expect(() => parseExpenseImport(zipOf([entry()], false))).toThrow(/fehlt der Beleg/);
    expect(() => parseExpenseImport(new TextEncoder().encode("x").buffer as ArrayBuffer)).toThrow(/keine gültige/);
    expect(() => parseExpenseImport(zipSync({ "rechnungen.json": strToU8("{}") }).buffer as ArrayBuffer)).toThrow(/keine gültige/);
  });
});

describe("Verträge", () => {
  const input = (over: Partial<ContractInput> = {}): ContractInput => ({
    type: "miete", title: "Halle", partner: "Vermieter", date: "2026-06-13", ends_on: "", note: "", ...over,
  });
  const doc = { name: "Vertrag.pdf", type: "application/pdf", data: new TextEncoder().encode("%PDF-1.4 v").buffer as ArrayBuffer };

  it("speichert mit Dokument, prüft die Angaben und löscht das Dokument mit", async () => {
    await expect(createContract(input({ title: "" }), [])).rejects.toThrow(/Bezeichnung/);
    await expect(createContract(input({ ends_on: "2020-01-01" }), [])).rejects.toThrow(/vor dem Vertragsdatum/);
    const id = await createContract(input(), [doc]);
    await updateContract(id, input({ title: "Halle Mitte" }));
    expect((await get<Contract>("contracts", id))!.title).toBe("Halle Mitte");
    expect(await all("attachments")).toHaveLength(1);
    await deleteContract(id);
    expect(await all("contracts")).toHaveLength(0);
    expect(await all("attachments")).toHaveLength(0);
  });

  it("bleibt mit Ausgaben über die Sicherung erhalten und blockiert das Einspielen in nicht leere Apps", async () => {
    await createContract(input(), [doc]);
    await createExpense({ date: "2026-01-02", category: "werkzeug", supplier: "OBI", description: "", amount: "5", note: "" }, []);
    const built = await buildBackup();
    await expect(restoreBackup(await built.file.arrayBuffer())).rejects.toThrow(/leere App/);
    const zipped = unzipSync(new Uint8Array(await built.file.arrayBuffer()));
    expect(zipped["ausgaben_2026.csv"]).toBeDefined();
    await resetForTests();
    await restoreBackup(await built.file.arrayBuffer());
    expect(await all("contracts")).toHaveLength(1);
    expect(await all("expenses")).toHaveLength(1);
    expect(await all("attachments")).toHaveLength(1);
  });
});

describe("Import bestehender Rechnungen", () => {
  const pdf = (text = "alt") => new TextEncoder().encode(`%PDF-1.4 ${text}`).buffer as ArrayBuffer;
  const old = (number: string, over: Partial<ImportInvoice> = {}): ImportInvoice => ({
    number, issued_on: "2026-08-24", buyer_name: "Alt Kunde", total_cents: 3000, pdf: pdf(number), ...over,
  });
  const importZip = (invoices: object[], extra: Record<string, Uint8Array> = {}) => zipSync({
    "rechnungen.json": strToU8(JSON.stringify({ format: "teilewerk-rechnungen-import", version: 1, invoices })), ...extra,
  }).buffer as ArrayBuffer;

  it("übernimmt das PDF unverändert, zählt zur Summe und erscheint in CSV und Export", async () => {
    const r = await importInvoices([old("VS20260800002")]);
    expect(r).toEqual({ imported: ["VS20260800002"], skipped: [] });
    const [inv] = await all<Invoice>("invoices");
    expect(inv.imported).toBe(true);
    expect(inv.sale_id).toBe(0);
    expect(inv.pdf_sha256).toBe(await sha256Hex(pdf("VS20260800002")));
    expect(await invoicesCsv(2026)).toContain('VS20260800002;rechnung;24.08.2026;"Alt Kunde";30,00;;');
    expect((await buildInvoiceExport(2026)).count).toBe(1);
  });

  it("überspringt vorhandene Nummern und gleiche laufende Nummern, ohne etwas zu ändern", async () => {
    await importInvoices([old("VS20260800002")]);
    const r = await importInvoices([old("VS20260800002", { total_cents: 1 }), old("VS20260900002"), old("VS20260800003")]);
    expect(r.imported).toEqual(["VS20260800003"]);
    expect(r.skipped).toEqual([
      { number: "VS20260800002", reason: "ist schon vorhanden" },
      { number: "VS20260900002", reason: "hat dieselbe laufende Nummer wie VS20260800002" },
    ]);
    expect((await all<Invoice>("invoices")).find((i) => i.number === "VS20260800002")!.total_cents).toBe(3000);
  });

  it("verhindert, dass neue Rechnungen eine importierte Nummer noch einmal vergeben", async () => {
    await importInvoices([old("VS20260800007")]);
    const { invoiceId } = await invoicedSale();
    expect((await get<Invoice>("invoices", invoiceId))!.number).toBe(no(8));
    // Eine ältere Nummer darf den Zähler nicht zurücksetzen
    await importInvoices([old("VS20260800005")]);
    const next = await invoicedSale();
    expect((await get<Invoice>("invoices", next.invoiceId))!.number).toBe(no(9));
  });

  it("meldet einen Konflikt mit einer schon in der App erstellten Nummer", async () => {
    await invoicedSale();
    const r = await importInvoices([old("VS20260800008")]);
    expect(r.imported).toEqual([]);
    expect(r.skipped[0].reason).toContain(no(8));
  });

  it("importiert bei ungültigen Angaben gar nichts", async () => {
    const good = old("VS20260800002");
    await expect(importInvoices([good, old("VS20260800003", { pdf: new TextEncoder().encode("kein pdf").buffer as ArrayBuffer })])).rejects.toThrow(/kein PDF/);
    await expect(importInvoices([good, old("VS20260800003", { buyer_name: " " })])).rejects.toThrow(/Käufers/);
    await expect(importInvoices([good, old("VS20260800003", { issued_on: "2099-01-01" })])).rejects.toThrow(/Zukunft/);
    await expect(importInvoices([good, old("VS20260800003", { total_cents: 1.5 })])).rejects.toThrow(/Betrag/);
    expect(await all("invoices")).toHaveLength(0);
  });

  it("liest die Import-Datei und weist fremde oder unvollständige Dateien ab", async () => {
    const entry = { number: "VS20260800002", issued_on: "2026-08-24", buyer_name: "Alt", total_cents: 3000, file: "a.pdf" };
    const parsed = parseInvoiceImport(importZip([entry], { "a.pdf": new Uint8Array(pdf()) }));
    expect(parsed[0].number).toBe("VS20260800002");
    expect(new TextDecoder().decode(parsed[0].pdf)).toBe("%PDF-1.4 alt");
    expect(() => parseInvoiceImport(importZip([entry]))).toThrow(/fehlt das PDF/);
    expect(() => parseInvoiceImport(new TextEncoder().encode("x").buffer as ArrayBuffer)).toThrow(/keine gültige/);
    expect(() => parseInvoiceImport(zipSync({ "data.json": strToU8("{}") }).buffer as ArrayBuffer)).toThrow(/keine gültige/);
  });

  it("bleibt über Sicherung und Wiederherstellung erhalten", async () => {
    await importInvoices([old("VS20260800002")]);
    const built = await buildBackup();
    await resetForTests();
    await restoreBackup(await built.file.arrayBuffer());
    const [inv] = await all<Invoice>("invoices");
    expect(inv.imported).toBe(true);
    expect(inv.snapshot.buyer.name).toBe("Alt Kunde");
    const { invoiceId } = await invoicedSale();
    expect((await get<Invoice>("invoices", invoiceId))!.number).toBe(no(8));
  });
});

describe("Monatliche Kosten und eigene Nummern", () => {
  const contract = (over: Partial<ContractInput> = {}): ContractInput => ({
    type: "versicherung", title: "Autoversicherung", partner: "Versicherer", date: "2026-01-15", ends_on: "", note: "", monthly: "49,90", ...over,
  });
  const expense = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
    date: "2026-11-03", category: "werkzeug", supplier: "Baumarkt", description: "Zange", amount: "10,00", note: "", ...over,
  });
  const costs = async (day: string) => monthlyCosts(await all<Contract>("contracts"), await all<Expense>("expenses"), day);

  it("addiert laufende Verträge und Ausgaben des Monats, nur innerhalb der Laufzeit", async () => {
    await createContract(contract(), []);
    await createContract(contract({ title: "Halle", date: "2026-03-01", ends_on: "2026-10-31", monthly: "100" }), []);
    await createContract(contract({ title: "Ohne Betrag", monthly: "" }), []);
    await createExpense(expense(), []);
    await createExpense(expense({ date: "2026-10-03" }), []);
    expect(await costs("2026-11-09")).toEqual({ contractCents: 4990, expenseCents: 1000, totalCents: 5990 });
    expect(await costs("2026-10-09")).toEqual({ contractCents: 14990, expenseCents: 1000, totalCents: 15990 });
    expect((await costs("2025-12-09")).totalCents).toBe(0);
  });

  it("zählt die eingetragene Rate desselben Vertrags nicht doppelt", async () => {
    await createContract(contract(), []);
    await createExpense(expense({ category: "vertrag", supplier: "Versicherer", description: "Autoversicherung", amount: "49,90" }), []);
    expect((await costs("2026-11-09")).totalCents).toBe(4990);
    await createExpense(expense({ category: "vertrag", supplier: "Anwalt", description: "Vertragsprüfung", amount: "20" }), []);
    expect((await costs("2026-11-09")).totalCents).toBe(6990);
  });

  it("speichert den Monatsbetrag, weist Unsinn ab und übersteht die Sicherung", async () => {
    await expect(createContract(contract({ monthly: "viel" }), [])).rejects.toThrow(/gültigen Betrag/);
    const id = await createContract(contract(), []);
    expect((await get<Contract>("contracts", id))!.monthly_cents).toBe(4990);
    const built = await buildBackup();
    await resetForTests();
    await restoreBackup(await built.file.arrayBuffer());
    expect((await get<Contract>("contracts", id))!.monthly_cents).toBe(4990);
  });

  it("sortiert Teile nach Nummer, Zahlen richtig, Roller als Block oben, Teile ohne Nummer zuletzt", async () => {
    await createPart(part({ title: "ohne" }), []);
    await createPart(part({ title: "t10", part_number: "10" }), []);
    await createPart(part({ title: "r1", kind: "roller" }), []);
    await createPart(part({ title: "t9", part_number: "9" }), []);
    await createPart(part({ title: "tA", part_number: "A-2" }), []);
    await createPart(part({ title: "r2", kind: "roller" }), []);
    await createPart(part({ title: "t100", part_number: "100" }), []);
    expect(sortStock(await all<Part>("parts")).map((p) => p.title)).toEqual(["r2", "r1", "t9", "t10", "t100", "tA", "ohne"]);
  });

  it("nutzt auf der Rechnung die eingetragene Nummer statt der internen", async () => {
    const withNo = (await get<Part>("parts", await createPart(part({ part_number: "R-77" }), [])))!;
    expect(itemDescription(withNo)).toContain("Teilenr. R-77");
    expect(itemDescription(withNo)).not.toContain("Art.-Nr.");
    const roller = (await get<Part>("parts", await createPart(part({ kind: "roller", part_number: "12", title: "Kymco" }), [])))!;
    expect(roller.part_number).toBe("12");
    expect(itemDescription(roller)).toContain("Art.-Nr. 12");
    const none = (await get<Part>("parts", await createPart(part({ kind: "roller", title: "Keeway" }), [])))!;
    expect(itemDescription(none)).not.toContain("Art.-Nr.");
  });
});

describe("CSV und PDF-Ausgabe", () => {
  it("exportiert im Format des bisherigen Teilewerk", async () => {
    await invoicedSale();
    const csv = await invoicesCsv(Number(YEAR));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Rechnungsnummer;Art;Datum;Käufer;Betrag EUR;Storniert Rechnung;SHA-256 PDF");
    expect(csv).toContain(`${no(8)};rechnung;`);
    expect(csv).toContain('"Erika Muster";40,50;;');
    expect(await invoicesCsv(1999)).not.toContain("VS");
  });

  it("schreibt Beispiel-PDFs zum Ansehen, falls PDF_OUT gesetzt ist", async () => {
    const out = process.env.PDF_OUT;
    if (!out) return;
    mkdirSync(out, { recursive: true });
    const { invoiceId } = await invoicedSale();
    const inv = (await get<Invoice>("invoices", invoiceId))!;
    writeFileSync(`${out}/rechnung.pdf`, new Uint8Array(inv.pdf));
    const storno = (await get<Invoice>("invoices", await cancelInvoice(invoiceId, "Test", true)))!;
    writeFileSync(`${out}/storno.pdf`, new Uint8Array(storno.pdf));
    expect((await renderInvoicePdf(inv.snapshot)).length).toBeGreaterThan(1000);
    const file = readFileSync("public/form-logo.png");
    const logo = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    writeFileSync(`${out}/rechnung-logo.pdf`, await renderInvoicePdf(inv.snapshot, logo));
    writeFileSync(`${out}/vorlage-rechnung.pdf`, await renderForm("rechnung", inv.snapshot.seller, logo));
  });

  it("baut das Logo in die Rechnung ein, ein defektes Bild verhindert die Rechnung aber nicht", async () => {
    const { invoiceId } = await invoicedSale();
    const inv = (await get<Invoice>("invoices", invoiceId))!;
    const file = readFileSync("public/form-logo.png");
    const logo = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const without = await renderInvoicePdf(inv.snapshot);
    const withLogo = await renderInvoicePdf(inv.snapshot, logo);
    expect(new TextDecoder("latin1").decode(withLogo)).toContain("/Subtype /Image");
    expect(new TextDecoder("latin1").decode(without)).not.toContain("/Subtype /Image");
    const broken = await renderInvoicePdf(inv.snapshot, new Uint8Array([1, 2, 3]).buffer);
    expect(new TextDecoder("latin1").decode(broken)).not.toContain("/Subtype /Image");
    expect(broken.length).toBeGreaterThan(1000);
  });
});
