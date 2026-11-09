// Layout 1:1 aus Teilewerk übernommen, damit die Rechnungen gleich aussehen.
import { euro } from "./format";
import { gewaehrleistungVereinbarung, KLEINUNTERNEHMER_HINWEIS, widerrufsbelehrung, widerrufsformular } from "./legal";
import type { Settings } from "./types";

/** Alles, was auf der Rechnung steht. Wird zusätzlich als JSON archiviert. */
export interface InvoiceSnapshot {
  kind: "rechnung" | "storno";
  number: string;
  issuedAt: string;          // TT.MM.JJJJ
  deliveryDate: string;      // TT.MM.JJJJ
  cancelsNumber?: string;
  cancelsDate?: string;
  seller: Settings;
  buyer: { name: string; street: string; zip: string; city: string };
  items: { description: string; quantity: number; unitCents: number; totalCents: number }[];
  shippingCents: number;
  totalCents: number;
  deliveryText: string;
  warrantyText: string;
  withWithdrawalInfo: boolean;
  saleId: number;
}

const M = 56; // Rand in pt (~2 cm)

/** Das Logo liegt im Offline-Speicher der App. Fehlt es, entstehen die PDFs einfach ohne Logo. */
export async function loadLogo(): Promise<ArrayBuffer | undefined> {
  try {
    const r = await fetch(new URL("./form-logo.png", document.baseURI));
    return r.ok ? await r.arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
}

/** Eigenes Dokument zum Unterschreiben oder Senden, vor dem Kaufvertrag. */
export async function renderWarrantyPdf(a: { seller: Settings; buyer: string; items: string[]; logo?: ArrayBuffer }): Promise<Uint8Array> {
  const mod = await import("pdfkit/js/pdfkit.standalone.js");
  const PDFDocument = mod.default ?? mod;
  const text = gewaehrleistungVereinbarung();
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M }, info: { Title: text.title, Creator: "Teilewerk" } });
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => {
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) { out.set(c, at); at += c.length; }
      resolve(out);
    });
    doc.on("error", reject);
    const W = doc.page.width - 2 * M;
    const s = a.seller;
    const sellerName = s.business_name || s.owner_name;
    const heading = (t: string) => doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#000").text(t, { width: W }).moveDown(0.3);
    const body = (t: string) => doc.font("Helvetica").fontSize(10).fillColor("#000").text(t, { width: W }).moveDown(0.6);
    const line = (label: string) => {
      doc.moveDown(1.6);
      const y = doc.y;
      doc.moveTo(M, y).lineTo(M + W, y).strokeColor("#000").lineWidth(0.6).stroke();
      doc.font("Helvetica").fontSize(8.5).fillColor("#333").text(label, M, y + 4, { width: W });
      doc.moveDown(0.4);
    };

    if (a.logo) doc.image(a.logo, M + W - 130, M - 14, { width: 130 });
    const titleWidth = a.logo ? W - 145 : W;
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#000").text(text.title, M, M, { width: titleWidth });
    doc.font("Helvetica").fontSize(9).fillColor("#333").text("(§ 476 Abs. 2 BGB, nur bei Einverständnis)", { width: titleWidth });
    if (a.logo) doc.y = Math.max(doc.y, M + 72);
    doc.moveDown(1);

    heading("Verkäufer");
    body([sellerName, s.business_name && s.owner_name && s.business_name !== s.owner_name ? `Inh. ${s.owner_name}` : "", s.street, `${s.zip} ${s.city}`.trim()].filter(Boolean).join(", "));
    heading("Käufer");
    if (a.buyer.trim()) body(a.buyer.trim());
    else line("Name und Anschrift");
    heading("Gebrauchte Ware");
    for (const i of a.items) doc.font("Helvetica").fontSize(10).fillColor("#000").text(`– ${i}`, { width: W }).moveDown(0.2);
    if (!a.items.length) line("Bezeichnung, bei Rollern mit Marke, Modell und FIN");
    doc.moveDown(0.6);
    heading("Hinweis");
    for (const p of text.intro) body(p);
    heading("Vereinbarung");
    body(text.agreement);
    line("Ort, Datum und Uhrzeit");
    line("Unterschrift Käufer");
    line("Unterschrift Verkäufer");
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000").text(text.decline, M, doc.y, { width: W });
    doc.end();
  });
}

export async function renderInvoicePdf(s: InvoiceSnapshot, logo?: ArrayBuffer): Promise<Uint8Array> {
  // Erst bei Bedarf laden: Die PDF-Bibliothek ist der mit Abstand größte Teil der App.
  const mod = await import("pdfkit/js/pdfkit.standalone.js");
  const PDFDocument = mod.default ?? mod;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: M, bottom: M, left: M, right: M },
      info: {
        Title: `${s.kind === "storno" ? "Stornorechnung" : "Rechnung"} ${s.number}`,
        Author: s.seller.business_name || s.seller.owner_name,
        Creator: "Teilewerk",
        // Fixes Datum → identisches PDF bei identischen Daten
        CreationDate: new Date(0),
        ModDate: new Date(0),
      },
    });
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => {
      const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let at = 0;
      for (const c of chunks) { out.set(c, at); at += c.length; }
      resolve(out);
    });
    doc.on("error", reject);

    const W = doc.page.width - 2 * M;
    const seller = s.seller;
    const sellerName = seller.business_name || seller.owner_name;

    // Kopf: Logo links, Absender rechts. Ein Problem mit dem Bild darf nie eine Rechnung verhindern.
    let headX = M;
    let headW = W;
    if (logo) {
      try {
        doc.image(logo, M, M - 6, { width: 200 });
        headX = M + 210;
        headW = W - 210;
      } catch { /* Rechnung ohne Logo */ }
    }
    doc.font("Helvetica-Bold").fontSize(16).text(sellerName, headX, M, { width: headW, align: "right" });
    doc.font("Helvetica").fontSize(9).fillColor("#333");
    const head = [
      seller.business_name && seller.owner_name && seller.business_name !== seller.owner_name ? `Inh. ${seller.owner_name}` : "",
      seller.street,
      `${seller.zip} ${seller.city}`.trim(),
      seller.phone ? `Tel. ${seller.phone}` : "",
      seller.email,
      seller.tax_number ? `Steuernummer: ${seller.tax_number}` : "",
    ].filter(Boolean);
    doc.text(head.join("\n"), headX, doc.y, { width: headW, align: "right" });

    // Anschriftfeld
    const addrY = 150;
    doc.fontSize(7).fillColor("#666").text(
      [sellerName, seller.street, `${seller.zip} ${seller.city}`.trim()].filter(Boolean).join(" · "),
      M, addrY, { width: 250 }
    );
    doc.moveTo(M, addrY + 11).lineTo(M + 250, addrY + 11).strokeColor("#999").lineWidth(0.5).stroke();
    doc.fontSize(10).fillColor("#000").text(
      [s.buyer.name, s.buyer.street, `${s.buyer.zip} ${s.buyer.city}`.trim()].filter(Boolean).join("\n"),
      M, addrY + 16, { width: 250 }
    );

    // Rechnungsdaten rechts
    const metaX = M + W - 200;
    const meta: [string, string][] = [
      [s.kind === "storno" ? "Storno-Nr.:" : "Rechnungs-Nr.:", s.number],
      ["Rechnungsdatum:", s.issuedAt],
      ["Liefer-/Leistungsdatum:", s.deliveryDate],
    ];
    if (s.cancelsNumber) meta.push(["Storniert Rechnung:", `${s.cancelsNumber} vom ${s.cancelsDate}`]);
    let my = addrY;
    doc.fontSize(9);
    for (const [k, v] of meta) {
      doc.font("Helvetica").text(k, metaX, my, { width: 100 });
      doc.font("Helvetica-Bold").text(v, metaX + 100, my, { width: 100, align: "right" });
      my += 14;
    }

    // Titel
    let y = 270;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#000")
      .text(s.kind === "storno" ? `Stornorechnung ${s.number}` : `Rechnung ${s.number}`, M, y);
    y += 26;
    if (s.kind === "storno") {
      doc.font("Helvetica").fontSize(10).text(
        `Hiermit wird die Rechnung ${s.cancelsNumber} vom ${s.cancelsDate} vollständig storniert.`, M, y, { width: W }
      );
      y = doc.y + 10;
    }

    // Tabelle
    const col = { pos: M, desc: M + 30, qty: M + W - 190, unit: M + W - 130, total: M + W - 65 };
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Pos.", col.pos, y);
    doc.text("Bezeichnung", col.desc, y);
    doc.text("Menge", col.qty, y, { width: 45, align: "right" });
    doc.text("Einzelpreis", col.unit, y, { width: 60, align: "right" });
    doc.text("Gesamt", col.total, y, { width: 65, align: "right" });
    y += 14;
    doc.moveTo(M, y).lineTo(M + W, y).strokeColor("#000").lineWidth(0.7).stroke();
    y += 6;

    doc.font("Helvetica").fontSize(9);
    const rows = [...s.items];
    if (s.shippingCents !== 0) {
      rows.push({ description: "Versandkosten", quantity: 1, unitCents: s.shippingCents, totalCents: s.shippingCents });
    }
    rows.forEach((r, i) => {
      const h = doc.heightOfString(r.description, { width: col.qty - col.desc - 10 });
      if (y + h > doc.page.height - M - 120) { doc.addPage(); y = M; }
      doc.text(String(i + 1), col.pos, y);
      doc.text(r.description, col.desc, y, { width: col.qty - col.desc - 10 });
      doc.text(String(r.quantity), col.qty, y, { width: 45, align: "right" });
      doc.text(euro(r.unitCents), col.unit, y, { width: 60, align: "right" });
      doc.text(euro(r.totalCents), col.total, y, { width: 65, align: "right" });
      y += Math.max(h, 12) + 6;
    });
    doc.moveTo(M, y).lineTo(M + W, y).lineWidth(0.7).stroke();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(11);
    doc.text("Gesamtbetrag", col.unit - 80, y, { width: 140 });
    doc.text(euro(s.totalCents), col.total - 20, y, { width: 85, align: "right" });
    y += 24;

    // Pflichthinweis § 19 UStG – kein Steuerausweis, kein "0 %"
    doc.font("Helvetica").fontSize(9.5).fillColor("#000");
    doc.text(KLEINUNTERNEHMER_HINWEIS, M, y, { width: W });
    y = doc.y + 8;
    if (s.kind === "rechnung") {
      doc.text(s.deliveryText, M, y, { width: W });
      y = doc.y + 8;
      doc.fontSize(8.5).fillColor("#222").text(s.warrantyText, M, y, { width: W });
      y = doc.y + 8;
      if (s.withWithdrawalInfo) {
        doc.text("Als Verbraucher steht Ihnen ein gesetzliches Widerrufsrecht zu – Belehrung und Muster-Formular auf der folgenden Seite.", M, y, { width: W });
        y = doc.y + 8;
      }
      if (seller.iban) {
        doc.fontSize(8.5).text(`Bankverbindung: ${seller.bank_name ? seller.bank_name + ", " : ""}IBAN ${seller.iban}`, M, y, { width: W });
      }
    }

    // Fußzeile
    const footer = [sellerName, seller.street, `${seller.zip} ${seller.city}`.trim(), seller.email, seller.tax_number ? `St.-Nr. ${seller.tax_number}` : ""]
      .filter(Boolean).join(" · ");
    const drawFooter = () => {
      doc.font("Helvetica").fontSize(7).fillColor("#666")
        .text(footer, M, doc.page.height - M + 14, { width: W, align: "center", lineBreak: false, height: 20 });
    };
    drawFooter();

    // Seite 2: Widerrufsbelehrung + Formular (Textform-Bestätigung, § 312f Abs. 2 BGB)
    if (s.kind === "rechnung" && s.withWithdrawalInfo) {
      doc.addPage();
      doc.fillColor("#000");
      const bel = widerrufsbelehrung(seller);
      const headings = new Set(["Widerrufsrecht", "Folgen des Widerrufs"]);
      doc.font("Helvetica-Bold").fontSize(13).text("Widerrufsbelehrung", M, M, { width: W });
      doc.moveDown(0.5);
      for (const p of bel) {
        if (headings.has(p)) doc.font("Helvetica-Bold").fontSize(10).text(p, { width: W }).moveDown(0.2);
        else doc.font("Helvetica").fontSize(8.5).text(p, { width: W, align: "justify" }).moveDown(0.5);
      }
      doc.moveDown(0.8);
      const form = widerrufsformular(seller);
      doc.font("Helvetica-Bold").fontSize(11).text(form[0], { width: W }).moveDown(0.3);
      for (const p of form.slice(1)) doc.font("Helvetica").fontSize(8.5).text(p, { width: W }).moveDown(0.6);
      drawFooter();
    }

    doc.end();
  });
}
