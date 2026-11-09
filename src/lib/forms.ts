// Leere Vordrucke zum Herunterladen, nach den bisherigen Vorlagen des Betriebs.
// Die Angaben des Verkäufers kommen aus den Einstellungen. Keine Rechtsberatung.
import { renderWarrantyPdf } from "./invoice-pdf";
import { KLEINUNTERNEHMER_HINWEIS } from "./legal";
import type { Settings } from "./types";

export type FormKind = "belehrung" | "rechnung" | "kaufvertrag" | "ankauf" | "verkuerzung";

export const FORMS: { kind: FormKind; title: string; file: string; hint: string }[] = [
  { kind: "belehrung", title: "Gewährleistungsbelehrung", file: "Gewaehrleistungsbelehrung.pdf", hint: "Information für den Kunden. Ersetzt nicht die Vereinbarung zur Verkürzung." },
  { kind: "verkuerzung", title: "Gewährleistungsverkürzung", file: "Vereinbarung_Gewaehrleistung.pdf", hint: "Eigenes Blatt, vor dem Kauf unterschreiben lassen." },
  { kind: "kaufvertrag", title: "Kaufvertrag Roller", file: "Kaufvertrag_Roller.pdf", hint: "Für den Verkauf eines gebrauchten Rollers." },
  { kind: "ankauf", title: "Ankaufbeleg Roller", file: "Ankaufbeleg_Roller.pdf", hint: "Für den Kauf von einer Privatperson." },
  { kind: "rechnung", title: "Rechnung", file: "Rechnung.pdf", hint: "Zum Ausfüllen von Hand. Danach unter Rechnungen importieren, damit die Nummer nicht doppelt vergeben wird." },
];

const M = 50;
const FOOT = 30;
type Doc = any; // eslint-disable-line @typescript-eslint/no-explicit-any

function sellerName(s: Settings) { return s.business_name || s.owner_name; }
function cityLine(s: Settings) { return `${s.zip} ${s.city}`.trim(); }
function contactLine(s: Settings) { return [s.phone, s.email].filter(Boolean).join(", "); }
const LEGAL_FORM = "Einzelunternehmen (Kleinunternehmer gem. § 19 UStG)";

/** Kleine Zeichenhilfen, damit die Vordrucke einheitlich aussehen. */
class Sheet {
  W: number;
  /** Schriftgröße für Fließtext. */
  size = 9.5;
  constructor(public doc: Doc) { this.W = doc.page.width - 2 * M; }

  newPage() { this.doc.addPage(); this.doc.y = M; }

  /** Bricht um, falls der nächste Block nicht mehr auf die Seite passt. */
  need(h: number) {
    if (this.doc.y + h > this.doc.page.height - M - FOOT) { this.doc.addPage(); this.doc.y = M; }
  }
  header(title: string, sub: string, logo?: ArrayBuffer) {
    const { doc } = this;
    if (logo) doc.image(logo, M + this.W - 150, M - 12, { width: 150 });
    doc.font("Helvetica-Bold").fontSize(20).fillColor("#000").text(title, M, M, { width: this.W - 165 });
    doc.font("Helvetica").fontSize(9.5).fillColor("#555").text(sub, M, doc.y + 2, { width: this.W - 165 });
    doc.y = Math.max(doc.y, M + 72);
  }
  bar(label: string) {
    const { doc } = this;
    this.need(70);
    doc.moveDown(0.5);
    const y = doc.y;
    doc.rect(M, y, this.W, 20).fill("#3a3a3a");
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#fff").text(label, M + 8, y + 5.5, { width: this.W - 16, lineBreak: false });
    doc.x = M;
    doc.y = y + 27;
  }
  field(label: string, value = "") { this.fields([[label, value]]); }
  /** Eine Zeile mit einem oder zwei Feldern, jeweils mit Unterlinie. */
  fields(cols: [string, string?][]) {
    const { doc } = this;
    this.need(24);
    const y = doc.y + 3;
    const gap = 14;
    const w = (this.W - gap * (cols.length - 1)) / cols.length;
    cols.forEach(([label, value], i) => {
      const x = M + i * (w + gap);
      const lw = Math.min(cols.length > 1 ? 88 : 125, doc.font("Helvetica").fontSize(9).widthOfString(label) + 6);
      doc.fillColor("#333").text(label, x, y + 3, { width: lw + 40, lineBreak: false });
      if (value) doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000").text(value, x + lw, y + 2, { width: w - lw, lineBreak: false, ellipsis: true });
      doc.moveTo(x + lw, y + 15).lineTo(x + w, y + 15).strokeColor("#999").lineWidth(0.5).stroke();
    });
    doc.x = M;
    doc.y = y + 21;
  }
  blank(label: string) {
    const { doc } = this;
    this.need(28);
    const y = doc.y + 18;
    doc.moveTo(M, y).lineTo(M + this.W, y).strokeColor("#999").lineWidth(0.5).stroke();
    if (label) doc.font("Helvetica").fontSize(8).fillColor("#555").text(label, M, y + 2, { width: this.W });
    doc.x = M;
    doc.y = y + (label ? 13 : 4);
  }
  text(t: string, size = this.size, color = "#000") {
    const { doc } = this;
    doc.font("Helvetica").fontSize(size);
    this.need(doc.heightOfString(t, { width: this.W }) + 6);
    doc.fillColor(color).text(t, M, doc.y, { width: this.W }).moveDown(0.45);
  }
  label(t: string) {
    const { doc } = this;
    this.need(30);
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000").text(t, M, doc.y, { width: this.W }).moveDown(0.25);
  }
  check(t: string, indent = 0) {
    const { doc } = this;
    doc.font("Helvetica").fontSize(9.5);
    const x = M + indent;
    const tw = this.W - indent - 17;
    this.need(doc.heightOfString(t, { width: tw }) + 5);
    const y = doc.y;
    doc.rect(x, y + 0.5, 9.5, 9.5).strokeColor("#000").lineWidth(0.6).stroke();
    doc.fillColor("#000").text(t, x + 17, y, { width: tw }).moveDown(0.3);
    doc.x = M;
  }
  /** Mehrere kurze Kästchen in einer Zeile. */
  checks(items: string[]) {
    const { doc } = this;
    this.need(18);
    const y = doc.y;
    const w = this.W / items.length;
    items.forEach((t, i) => {
      const x = M + i * w;
      doc.rect(x, y + 0.5, 9.5, 9.5).strokeColor("#000").lineWidth(0.6).stroke();
      doc.font("Helvetica").fontSize(9.5).fillColor("#000").text(t, x + 15, y, { width: w - 18, lineBreak: false });
    });
    doc.x = M;
    doc.y = y + 16;
  }
  signatures(left: string, right: string) {
    const { doc } = this;
    this.need(60);
    const y = doc.y + 34;
    const w = (this.W - 24) / 2;
    for (const [x, t] of [[M, left], [M + w + 24, right]] as [number, string][]) {
      doc.moveTo(x, y).lineTo(x + w, y).strokeColor("#000").lineWidth(0.6).stroke();
      doc.font("Helvetica").fontSize(8.5).fillColor("#333").text(t, x, y + 3, { width: w, lineBreak: false });
    }
    doc.x = M;
    doc.y = y + 18;
  }
  /** Fußzeile mit Seitenzahl auf jede Seite, erst wenn die Seitenzahl feststeht. */
  footer(name: string) {
    const { doc } = this;
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(7.5).fillColor("#777")
        .text(`${name} – Seite ${i + 1}/${range.count}`, M, doc.page.height - M + 4, { width: this.W, align: "center", lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
  }
}

function sellerBlock(sh: Sheet, s: Settings, role: string) {
  sh.label(role);
  sh.field("Name / Geschäftsbez.:", sellerName(s));
  sh.field("Inhaber:", s.owner_name);
  sh.field("Rechtsform:", LEGAL_FORM);
  sh.field("Anschrift:", [s.street, cityLine(s)].filter(Boolean).join(", "));
  sh.field("Telefon / E-Mail:", contactLine(s));
}

function vehicleBlock(sh: Sheet) {
  sh.fields([["Marke:"], ["Modell / Typ:"]]);
  sh.field("Fahrzeug-Ident-Nr. (FIN):");
  sh.fields([["Kennzeichen:"], ["Erstzulassung:"]]);
  sh.fields([["Hubraum (ccm):"], ["Leistung (kW/PS):"]]);
  sh.fields([["Kilometerstand:"], ["Anzahl Schlüssel:"]]);
  sh.fields([["Farbe:"], ["HU/AU gültig bis:"]]);
  sh.field("Zubehör / Sonderausstattung:");
}

function paymentBlock(sh: Sheet, s: Settings) {
  sh.check("Barzahlung bei Übergabe");
  sh.check("Überweisung auf folgendes Konto:");
  sh.field("Kontoinhaber:", s.owner_name);
  sh.fields([["IBAN:", s.iban], ["BIC:", s.bic]]);
  sh.check("PayPal an folgendes Konto:");
  sh.field("PayPal-Adresse:", s.paypal);
}

function renderBelehrung(sh: Sheet, s: Settings, logo?: ArrayBuffer) {
  const name = sellerName(s);
  sh.size = 8.8;
  sh.header("Gewährleistungsbelehrung", "Kundeninformation über gesetzliche Mängelhaftung, Gewährleistungsfristen und ihre Grenzen", logo);
  sh.text([name, s.business_name && s.owner_name && s.business_name !== s.owner_name ? `Inhaber: ${s.owner_name}` : "", [s.street, cityLine(s)].filter(Boolean).join(", "), contactLine(s)].filter(Boolean).join(" | "), 9, "#333");

  sh.bar("1. Gesetzliche Mängelhaftung (Grundsatz)");
  sh.text("Es gilt die gesetzliche Mängelhaftung (Gewährleistung). Die Gewährleistung deckt Sach- und Rechtsmängel ab, die bereits zum Zeitpunkt der Übergabe (Gefahrübergang) der Ware an den Käufer vorhanden waren.");
  sh.text("Zeigt sich bei einem Verbraucher innerhalb eines Jahres ab Übergabe ein Mangel, wird vermutet, dass er schon bei Übergabe vorhanden war, sofern das nicht mit der Art der Ware oder des Mangels unvereinbar ist (§ 477 BGB).");

  sh.bar("2. Gewährleistungsfristen");
  sh.text("Gebrauchte Fahrzeuge und Gebrauchtteile, Verkauf an Verbraucher: Die gesetzliche Frist beträgt 24 Monate (2 Jahre) ab Übergabe. Sie beträgt nur dann 12 Monate (1 Jahr), wenn der Käufer vor seiner Kaufentscheidung eigens darauf hingewiesen wurde und dies ausdrücklich und gesondert vereinbart wurde (§ 476 Abs. 2 BGB).");
  sh.text("Auch dann gelten die gesetzlichen Fristen für Schadensersatz wegen Verletzung von Leben, Körper oder Gesundheit, für Schäden aus vorsätzlicher oder grob fahrlässiger Pflichtverletzung, für arglistig verschwiegene Mängel und für Ansprüche aus einer Garantie.");
  sh.text("Verkauf an Unternehmer (B2B): Die Sachmängelhaftung kann im Vertrag ausgeschlossen werden, soweit gesetzlich zulässig.");
  sh.text("Neue Fahrzeuge und Neuteile: Die gesetzliche Frist beträgt 24 Monate (2 Jahre) ab Übergabe.");

  sh.bar("3. Was umfasst die Gewährleistung? (Rechte des Käufers)");
  sh.text("Liegt bei Übergabe ein Mangel vor, stehen dem Käufer im Rahmen der gesetzlichen Bestimmungen folgende Rechte zu:");
  sh.text("– Vorrangig (Nacherfüllung): Der Käufer kann nach seiner Wahl kostenfreie Nachbesserung (Reparatur) oder, soweit bei gebrauchter Ware möglich, die Lieferung einer mangelfreien Sache verlangen. Der Verkäufer kann eine unmögliche oder unverhältnismäßige Art der Nacherfüllung verweigern (§ 439 BGB).");
  sh.text("– Nachrangig: Ist die Nacherfüllung unmöglich, wird sie verweigert oder schlägt sie nach angemessener Frist fehl, kann der Käufer den Kaufpreis mindern oder, außer bei einem unerheblichen Mangel, vom Vertrag zurücktreten.");
  sh.text("– Schadens- und Aufwendungsersatz richten sich nach den gesetzlichen Vorschriften.");

  sh.bar("4. Wann liegt kein Gewährleistungsfall vor?");
  sh.text("Die Gewährleistung ist keine Haltbarkeitsgarantie. Kein Gewährleistungsfall sind insbesondere Schäden, die erst nach der Übergabe entstanden sind, zum Beispiel:");
  sh.text("– Normaler Verschleiß und Abnutzung: Übliche, alters- und nutzungsbedingte Abnutzung ist kein Mangel (z. B. Reifen, Bremsbeläge, Bremsscheiben, Zündkerzen, Leuchtmittel, Keilriemen, Antriebsketten, Batterie, Kupplungsbeläge).");
  sh.text("– Unsachgemäße Bedienung und Überlastung: Schäden, die durch Überdrehen, ungeeignete Betriebsstoffe (z. B. falsches Zweitakt-/Motoröl, falscher Kraftstoff), fehlende Betriebsflüssigkeiten oder Überladung verursacht wurden.");
  sh.text("– Mangelnde Wartung und Pflege: Schäden, die durch versäumte Inspektions- und Wartungsintervalle verursacht wurden.");
  sh.text("– Tuning und eigene Veränderungen: Schäden, die durch technische Veränderungen, Tuning, Manipulationen oder unsachgemäße eigene Reparaturversuche verursacht wurden.");
  sh.text("– Äußere Einflüsse: Schäden durch Stürze, Unfälle, Umfaller, Vandalismus, Witterung oder unsachgemäße Lagerung nach der Übergabe.");
  sh.text("Nach Ablauf der Frist sind Mängelansprüche verjährt, soweit nicht die in Punkt 2 genannten Ausnahmen gelten. Die gesetzlichen Rechte des Käufers bleiben von dieser Information unberührt.");

  sh.bar("5. Vorgehen im Reklamationsfall");
  sh.text(`Bitte wenden Sie sich bei einem Mangel möglichst vor eigenen Arbeiten oder dem Besuch einer anderen Werkstatt direkt an uns${contactLine(s) ? ` (${contactLine(s)})` : ""}, damit wir das weitere Vorgehen abstimmen können.`);
}

function renderRechnung(sh: Sheet, s: Settings, logo?: ArrayBuffer) {
  const { doc } = sh;
  sh.header("RECHNUNG", `${s.owner_name || "Rechnungssteller"} - Einzelunternehmen`, logo);
  sh.bar("Rechnungssteller (Verkäufer)");
  sh.field("Name:", sellerName(s));
  sh.field("Rechtsform:", LEGAL_FORM);
  sh.field("Anschrift:", [s.street, cityLine(s)].filter(Boolean).join(", "));
  sh.fields([["Steuer-Nr.:", s.tax_number], ["Telefon / E-Mail:", contactLine(s)]]);
  sh.bar("Rechnungsempfänger (Käufer)");
  sh.field("Name:");
  sh.field("Anschrift:");
  sh.field("PLZ / Ort:");
  sh.bar("Rechnungsdaten");
  sh.field("Rechnungs-Nr.:");
  sh.fields([["Rechnungsdatum:"], ["Liefer-/Leistungsdatum:"]]);
  sh.bar("Rechnungspositionen");

  const col = { pos: M, name: M + 30, qty: M + sh.W - 140, sum: M + sh.W - 80 };
  const top = doc.y;
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
  doc.text("Pos.", col.pos + 3, top, { lineBreak: false });
  doc.text("Bezeichnung (bei Rollern: Modell, FIN, km-Stand)", col.name + 4, top, { lineBreak: false });
  doc.text("Menge", col.qty + 4, top, { lineBreak: false });
  doc.text("Betrag (EUR)", col.sum + 4, top, { lineBreak: false });
  const rows = 5;
  const rh = 22;
  const y0 = top + 14;
  doc.strokeColor("#999").lineWidth(0.5);
  for (let i = 0; i <= rows; i++) doc.moveTo(M, y0 + i * rh).lineTo(M + sh.W, y0 + i * rh).stroke();
  for (const x of [M, col.name, col.qty, col.sum, M + sh.W]) doc.moveTo(x, y0).lineTo(x, y0 + rows * rh).stroke();
  const yTotal = y0 + rows * rh + 8;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text("Gesamtbetrag (Rechnungsbetrag)", col.name, yTotal, { width: col.sum - col.name - 8, align: "right", lineBreak: false });
  doc.moveTo(col.sum, yTotal + 13).lineTo(M + sh.W, yTotal + 13).strokeColor("#000").lineWidth(0.7).stroke();
  doc.x = M;
  doc.y = yTotal + 22;
  sh.text(KLEINUNTERNEHMER_HINWEIS, 9.5);

  sh.bar("Gewährleistung");
  sh.check("Es gelten die gesetzlichen Mängelrechte (Verjährung 2 Jahre ab Ablieferung).");
  sh.check("Verjährung 1 Jahr ab Ablieferung gemäß gesonderter Vereinbarung vom ________________ vor Vertragsschluss (§ 476 Abs. 2 BGB).");

  sh.bar("Zahlung");
  paymentBlock(sh, s);
  sh.field("Zahlungsziel bis:");
  sh.text("Vielen Dank für Ihren Einkauf!");
  sh.blank("Ort, Datum, Unterschrift Rechnungssteller");
}

function renderKaufvertrag(sh: Sheet, s: Settings, logo?: ArrayBuffer) {
  sh.header("GEWERBLICHER KAUFVERTRAG", "über ein gebrauchtes Kraftrad (Roller)", logo);
  sh.bar("1. Vertragsparteien");
  sellerBlock(sh, s, "Verkäufer (gewerblich):");
  sh.label("Käufer:");
  sh.field("Name:");
  sh.field("Anschrift:");
  sh.field("PLZ / Ort:");
  sh.fields([["Geb.-Datum:"], ["Ausweis-Nr. (freiwillig):"]]);
  sh.field("Telefon / E-Mail:");
  sh.bar("2. Kaufgegenstand (Fahrzeugdaten)");
  vehicleBlock(sh);
  sh.label("Mitgelieferte Papiere:");
  for (const p of ["Zulassungsbescheinigung Teil I (Fahrzeugschein)", "Zulassungsbescheinigung Teil II (Fahrzeugbrief)", "EG-Übereinstimmungsbescheinigung (COC)", "Betriebserlaubnis / ABE", "HU-Bericht / Prüfbericht", "Serviceheft / Bedienungsanleitung"]) sh.check(p);

  sh.bar("3. Kaufpreis und Zahlung");
  sh.fields([["Kaufpreis (EUR):"], ["in Worten:"]]);
  sh.text("Der Verkäufer ist Kleinunternehmer im Sinne des § 19 UStG. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet und daher nicht gesondert ausgewiesen.");
  sh.label("Zahlungsweise:");
  paymentBlock(sh, s);
  sh.text("Das Eigentum am Fahrzeug geht erst mit vollständiger Bezahlung des Kaufpreises auf den Käufer über (Eigentumsvorbehalt).");

  sh.bar("4. Übergabe und Vertragsschluss");
  sh.fields([["Datum:"], ["Ort:"]]);
  sh.text("Der Käufer verpflichtet sich, das Fahrzeug unverzüglich umzumelden bzw. abzumelden. Mit der Übergabe geht die Gefahr auf den Käufer über.");
  sh.label("Der Vertrag wurde geschlossen:");
  sh.check("vor Ort nach Besichtigung");
  sh.check("per Chat, Telefon oder E-Mail (Fernabsatz): Einem Verbraucher steht ein Widerrufsrecht zu, Widerrufsbelehrung und Muster-Formular liegen bei.");

  sh.bar("5. Gewährleistung");
  sh.label("Zutreffendes bitte ankreuzen:");
  sh.check("Verkauf an einen Verbraucher: Es gilt die gesetzliche Gewährleistung, Verjährung 2 Jahre ab Übergabe.");
  sh.check("Verkauf an einen Verbraucher mit Verkürzung: Die Verjährung beträgt 1 Jahr ab Übergabe gemäß der gesonderten Vereinbarung vom ________________, die vor diesem Vertrag getroffen wurde (§ 476 Abs. 2 BGB). Ohne diese Vereinbarung gelten 2 Jahre.");
  sh.check("Verkauf an einen Unternehmer (B2B): Das gebrauchte Fahrzeug wird unter Ausschluss der Sachmängelhaftung verkauft. Ausgenommen sind Vorsatz, grobe Fahrlässigkeit, Schäden aus der Verletzung von Leben, Körper oder Gesundheit, arglistig verschwiegene Mängel und Garantien.");
  sh.label("Bekannte Mängel / Vorschäden (bitte konkret eintragen):");
  sh.blank("");
  sh.blank("");
  sh.label("Unfallfrei:");
  sh.checks(["ja", "nein", "nicht bekannt"]);

  sh.newPage(); // Vertragstext und Unterschriften gehören auf dieselbe Seite.
  sh.bar("6. Sonstiges");
  sh.text("Der Verkäufer sichert zu, dass das Fahrzeug sein Eigentum und frei von Rechten Dritter ist. Mündliche Nebenabreden bestehen nicht; Änderungen sollen schriftlich festgehalten werden. Individuell getroffene Abreden haben Vorrang. Ist eine Bestimmung unwirksam, bleibt der übrige Vertrag wirksam, an ihre Stelle tritt die gesetzliche Regelung. Es gilt das Recht der Bundesrepublik Deutschland; zwingende Verbraucherschutzvorschriften bleiben unberührt.");

  sh.bar("7. Unterschriften");
  sh.field("Ort, Datum:");
  sh.signatures("Verkäufer (Stempel / Unterschrift)", "Käufer (Unterschrift)");
}

function renderAnkauf(sh: Sheet, s: Settings, logo?: ArrayBuffer) {
  sh.header("ANKAUFBELEG", "über ein gebrauchtes Kraftrad (Roller), Ankauf von einer Privatperson", logo);
  sh.fields([["Beleg-Nr.:"], ["Datum:"]]);
  sh.bar("1. Vertragsparteien");
  sellerBlock(sh, s, "Ankäufer (gewerblich):");
  sh.label("Verkäufer (privat):");
  sh.field("Name:");
  sh.field("Anschrift:");
  sh.field("PLZ / Ort:");
  sh.fields([["Geb.-Datum:"], ["Telefon / E-Mail:"]]);
  sh.fields([["Ausweisart:"], ["Ausweis-Nr.:"]]);
  sh.check("Identität anhand des Ausweises geprüft");

  sh.bar("2. Kaufgegenstand (Fahrzeugdaten)");
  vehicleBlock(sh);
  sh.label("Zustand:");
  sh.checks(["fahrbereit", "nicht fahrbereit", "als Ersatzteilträger"]);
  sh.label("Bekannte Mängel / Unfallschäden (laut Verkäufer):");
  sh.blank("");
  sh.blank("");

  sh.bar("3. Kaufpreis und Zahlung");
  sh.fields([["Kaufpreis (EUR):"], ["in Worten:"]]);
  sh.checks(["Barzahlung", "Überweisung", "PayPal"]);
  sh.text("Der Verkäufer bestätigt mit seiner Unterschrift den vollständigen Erhalt des Kaufpreises, sofern Barzahlung angekreuzt ist. Sonst ist der Kaufpreis auf das angegebene Konto zu zahlen:");
  sh.field("IBAN / PayPal des Verkäufers:");

  sh.bar("4. Erklärungen des Verkäufers");
  sh.text("Der Verkäufer versichert, dass");
  for (const t of [
    "er das Fahrzeug als Privatperson und nicht gewerblich verkauft,",
    "das Fahrzeug sein alleiniges Eigentum und frei von Rechten Dritter ist (insbesondere frei von Pfandrechten und Eigentumsvorbehalten),",
    "das Fahrzeug nicht gestohlen ist und die Papiere und die FIN nach seiner Kenntnis zum Fahrzeug gehören,",
    "die Angaben zu Kilometerstand, Mängeln und Unfallschäden nach seiner Kenntnis richtig sind.",
  ]) sh.text(`– ${t}`);

  sh.bar("5. Haftung");
  sh.text("Das Fahrzeug wird wie besichtigt und ggf. probegefahren gekauft. Die Sachmängelhaftung des privaten Verkäufers ist ausgeschlossen. Das gilt nicht für arglistig verschwiegene Mängel, Garantien, die Zusicherungen unter Punkt 4, Vorsatz und grobe Fahrlässigkeit sowie Schäden aus der Verletzung von Leben, Körper oder Gesundheit.");

  sh.bar("6. Übergabe und mitgelieferte Papiere");
  sh.fields([["Übergabe am:"], ["Ort:"]]);
  for (const p of ["Zulassungsbescheinigung Teil I (Fahrzeugschein)", "Zulassungsbescheinigung Teil II (Fahrzeugbrief)", "Betriebserlaubnis / ABE", "EG-Übereinstimmungsbescheinigung (COC)", "HU-Bericht / Prüfbericht", "Serviceheft / Bedienungsanleitung"]) sh.check(p);
  sh.text("Der Verkäufer kümmert sich selbst um die Kündigung seiner Versicherung, soweit nichts anderes vereinbart ist.");

  sh.bar("7. Datenschutz");
  sh.text("Die Angaben des Verkäufers werden zur Abwicklung des Ankaufs und wegen gesetzlicher Aufbewahrungspflichten gespeichert (Art. 6 Abs. 1 Buchst. b und c DSGVO).", 8.5, "#333");

  sh.bar("8. Unterschriften");
  sh.field("Ort, Datum:");
  sh.signatures("Verkäufer (Unterschrift)", "Ankäufer (Stempel / Unterschrift)");
}

export async function renderForm(kind: FormKind, seller: Settings, logo?: ArrayBuffer): Promise<Uint8Array> {
  if (kind === "verkuerzung") return renderWarrantyPdf({ seller, buyer: "", items: [], logo });
  const mod = await import("pdfkit/js/pdfkit.standalone.js");
  const PDFDocument = mod.default ?? mod;
  const form = FORMS.find((f) => f.kind === kind)!;
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4", bufferPages: true, margins: { top: M, bottom: M, left: M, right: M },
      info: { Title: form.title, Author: sellerName(seller), Creator: "Teilewerk" },
    });
    const chunks: Uint8Array[] = [];
    doc.on("data", (c: Uint8Array) => chunks.push(c));
    doc.on("end", () => {
      const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) { out.set(c, at); at += c.length; }
      resolve(out);
    });
    doc.on("error", reject);
    const sh = new Sheet(doc);
    if (kind === "belehrung") renderBelehrung(sh, seller, logo);
    if (kind === "rechnung") renderRechnung(sh, seller, logo);
    if (kind === "kaufvertrag") renderKaufvertrag(sh, seller, logo);
    if (kind === "ankauf") renderAnkauf(sh, seller, logo);
    sh.footer(form.title);
    doc.end();
  });
}
