import { ANZEIGE_GEWAEHRLEISTUNG_HINWEIS } from "./legal";
import { CONDITION_LABEL, type Part } from "./types";
import { euro } from "./format";

/**
 * Titel und Text für Kleinanzeigen.
 * Marken nur beschreibend ("passend für Yuanjia", § 23 MarkenG) – keine Logos, nicht "Original Yuanjia".
 */
export function adTitle(p: Part): string {
  if (p.kind === "roller") {
    const t = [p.title, p.vehicle?.ccm && `${p.vehicle.ccm} ccm`].filter(Boolean).join(" ");
    return t.length > 65 ? t.slice(0, 64) + "…" : t;
  }
  const fit = [p.fits_brand, p.fits_model].filter(Boolean).join(" ");
  const t = fit ? `${p.title} passend für ${fit}` : p.title;
  return t.length > 65 ? t.slice(0, 64) + "…" : t;
}

/** FIN, Kennzeichen und Ankaufspreis bleiben bewusst aus der öffentlichen Anzeige heraus. */
function rollerAdText(p: Part, opts: { abholungOrt?: string }): string {
  const v = p.vehicle;
  const lines: string[] = [p.title, ""];
  if (p.description) lines.push(p.description, "");
  const facts = [
    `Zustand: ${CONDITION_LABEL[p.condition]}`,
    v?.first_registration && `Erstzulassung: ${v.first_registration}`,
    v?.km && `Kilometerstand: ${v.km}`,
    v?.ccm && `Hubraum: ${v.ccm} ccm`,
    v?.power && `Leistung: ${v.power}`,
    p.color && `Farbe: ${p.color}`,
    v?.keys && `Schlüssel: ${v.keys}`,
    v?.papers && `Papiere: ${v.papers}`,
  ].filter(Boolean) as string[];
  lines.push(...facts.map((f) => `• ${f}`), "");
  lines.push(p.defects.trim() ? `Bekannte Mängel: ${p.defects.trim()}` : "Bekannte Mängel: keine bekannt.");
  lines.push("Bitte Fotos genau ansehen – sie zeigen das tatsächliche Fahrzeug.", "");
  lines.push(`Preis: ${euro(p.price_cents)}`);
  lines.push(opts.abholungOrt ? `Abholung in ${opts.abholungOrt}` : "Abholung möglich");
  lines.push("Mit Rechnung. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
  lines.push(ANZEIGE_GEWAEHRLEISTUNG_HINWEIS);
  lines.push("Bei Kauf per Chat gilt für Verbraucher das gesetzliche Widerrufsrecht (Belehrung im Profil).");
  return lines.join("\n");
}

export function adText(p: Part, opts: { versand: boolean; abholungOrt?: string }): string {
  if (p.kind === "roller") return rollerAdText(p, opts);
  const fit = [p.fits_brand, p.fits_model].filter(Boolean).join(" ");
  const lines: string[] = [];
  lines.push(fit ? `${p.title} – passend für ${fit}` : p.title);
  lines.push("");
  if (p.description) lines.push(p.description, "");
  const facts: string[] = [];
  facts.push(`Zustand: ${CONDITION_LABEL[p.condition]}`);
  if (p.material) facts.push(`Material: ${p.material}`);
  if (p.color) facts.push(`Farbe: ${p.color}`);
  if (p.part_number) facts.push(`Teilenummer: ${p.part_number}`);
  lines.push(...facts.map((f) => `• ${f}`));
  lines.push("");
  lines.push(p.defects.trim() ? `Bekannte Mängel: ${p.defects.trim()}` : "Bekannte Mängel: keine bekannt.");
  lines.push("Bitte Fotos genau ansehen – sie zeigen den tatsächlichen Artikel.");
  lines.push("");
  if (fit) {
    lines.push(
      "Hinweis: Die Markenangabe beschreibt nur, wofür das Teil passt. Kein Angebot des Markeninhabers."
    );
    lines.push("Bitte vor dem Kauf prüfen, ob das Teil zu Ihrem Modell passt.");
    lines.push("");
  }
  lines.push(`Preis: ${euro(p.price_cents)}`);
  const wege: string[] = [];
  if (opts.versand) wege.push("Versand möglich (Kosten nach Absprache)");
  wege.push(opts.abholungOrt ? `Abholung in ${opts.abholungOrt}` : "Abholung möglich");
  lines.push(wege.join(" · "));
  lines.push("Mit Rechnung. Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.");
  lines.push(ANZEIGE_GEWAEHRLEISTUNG_HINWEIS);
  lines.push("Bei Kauf per Chat/Versand gilt für Verbraucher das gesetzliche Widerrufsrecht (Belehrung im Profil).");
  return lines.join("\n");
}
