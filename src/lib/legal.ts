// Rechtstexte an einer Stelle. Bei Änderungen bitte nur hier anpassen.
// Hinweis: Das ist keine Rechtsberatung. Texte orientieren sich an den gesetzlichen Mustern.

import type { Settings } from "./types";

/** Pflichthinweis Kleinunternehmer. Niemals "USt 0 %" ausweisen (§ 14c UStG). */
export const KLEINUNTERNEHMER_HINWEIS = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.";

/** Ausnahmen, für die die gesetzlichen Fristen trotz Verkürzung gelten. */
const AUSNAHMEN =
  "Dies gilt nicht für Ansprüche auf Schadensersatz wegen Verletzung von Leben, Körper oder Gesundheit, " +
  "für Schäden aus vorsätzlicher oder grob fahrlässiger Pflichtverletzung, für arglistig verschwiegene Mängel " +
  "und für Ansprüche aus einer Garantie; insoweit gelten die gesetzlichen Fristen.";

/**
 * Nachricht für den Kleinanzeigen-Chat. Muss VOR der verbindlichen Kaufzusage des Käufers
 * als eigene Nachricht geschickt und vom Käufer ausdrücklich bestätigt werden (§ 476 Abs. 2 BGB).
 * Ein Satz nur in der Anzeige oder nur auf der Rechnung reicht NICHT.
 */
export function gewaehrleistungChatNachricht(teile: string[]): string {
  const liste = teile.length ? teile.map((t) => `– ${t}`).join("\n") : "– (Artikel)";
  return [
    "Wichtiger Hinweis vor dem Kauf – bitte lesen und bestätigen:",
    "",
    "Ich verkaufe gewerblich. Bei den folgenden gebrauchten Artikeln verjähren Ihre Mängelansprüche (Gewährleistung) " +
      "nicht wie gesetzlich vorgesehen nach 2 Jahren, sondern bereits 1 Jahr nach Übergabe bzw. Lieferung:",
    liste,
    "",
    AUSNAHMEN,
    "",
    "Wenn Sie damit einverstanden sind, antworten Sie bitte mit:",
    "„Einverstanden: 1 Jahr Gewährleistung“",
    "",
    "Erst danach kommt der Kauf zustande. Ohne Ihre Zustimmung gilt die gesetzliche Frist von 2 Jahren – " +
      "dann teilen Sie mir das bitte kurz mit.",
  ].join("\n");
}

/**
 * Eigenes Dokument für die Vereinbarung, getrennt von Kaufvertrag und Rechnung.
 * Muss VOR der verbindlichen Kaufzusage vorliegen, sonst ist die Verkürzung unwirksam.
 */
export function gewaehrleistungVereinbarung(): { title: string; intro: string[]; agreement: string; decline: string } {
  return {
    title: "Vereinbarung über die Verjährung von Mängelansprüchen",
    intro: [
      "Wichtiger Hinweis vor dem Kauf: Bitte lesen Sie diesen Hinweis, bevor Sie sich zum Kauf entscheiden.",
      "Ich verkaufe gewerblich. Für die oben genannte gebrauchte Ware verjähren Ihre Mängelansprüche (§ 437 BGB, Gewährleistung) gesetzlich nach 2 Jahren. " +
        "Ich biete Ihnen an, diese Frist für diese gebrauchte Ware auf 1 Jahr ab Übergabe bzw. Lieferung zu verkürzen (§ 476 Abs. 2 BGB).",
      AUSNAHMEN,
    ],
    agreement: "Ich wurde vor meiner Kaufentscheidung eigens auf die Verkürzung hingewiesen und vereinbare ausdrücklich und gesondert, " +
      "dass meine Mängelansprüche für die oben genannte gebrauchte Ware 1 Jahr ab Übergabe bzw. Lieferung verjähren.",
    decline: "Wenn Sie nicht einverstanden sind, unterschreiben Sie bitte nicht. Dann gelten die gesetzlichen 2 Jahre.",
  };
}

/** Satz für die Rechnung. */
export function gewaehrleistungRechnung(verkuerzt: boolean, vereinbartAm?: string): string {
  if (!verkuerzt) {
    return "Gewährleistung: Es gelten die gesetzlichen Mängelrechte (Verjährung 2 Jahre ab Ablieferung).";
  }
  return (
    "Gewährleistung: Für diese gebrauchte Ware wurde vor Vertragsschluss " +
    (vereinbartAm ? `(am ${vereinbartAm}) ` : "") +
    "ausdrücklich und gesondert vereinbart, dass Mängelansprüche (§ 437 BGB) in einem Jahr ab Ablieferung verjähren " +
    "(§ 476 Abs. 2 BGB). " +
    AUSNAHMEN
  );
}

/** Kurzer Hinweis für den Anzeigentext (informiert vorab, ersetzt aber NICHT die gesonderte Vereinbarung). */
export const ANZEIGE_GEWAEHRLEISTUNG_HINWEIS =
  "Gewerblicher Verkauf. Gebrauchtware: Gewährleistung 1 Jahr – wird vor dem Kauf im Chat gesondert vereinbart, " +
  "ohne Zustimmung gelten die gesetzlichen 2 Jahre.";

export function absenderZeile(s: Settings): string {
  return [s.business_name || s.owner_name, s.street, `${s.zip} ${s.city}`.trim()].filter(Boolean).join(" · ");
}

/** Muster-Widerrufsbelehrung nach Anlage 1 zu Art. 246a § 1 Abs. 2 S. 2 EGBGB (Warenlieferung, eine Sendung). */
export function widerrufsbelehrung(s: Settings): string[] {
  const anschrift = [
    s.business_name && s.business_name !== s.owner_name ? `${s.business_name}, Inh. ${s.owner_name}` : s.owner_name || s.business_name,
    s.street,
    `${s.zip} ${s.city}`.trim(),
    s.phone ? `Telefon: ${s.phone}` : "",
    s.email ? `E-Mail: ${s.email}` : "",
  ].filter(Boolean).join(", ");
  return [
    "Widerrufsrecht",
    "Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.",
    "Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw. hat.",
    `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${anschrift}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.`,
    "Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.",
    "Folgen des Widerrufs",
    "Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.",
    "Wir können die Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben, je nachdem, welches der frühere Zeitpunkt ist.",
    `Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an uns (${[s.business_name || s.owner_name, s.street, `${s.zip} ${s.city}`.trim()].filter(Boolean).join(", ")}) zurückzusenden oder zu übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen absenden.`,
    "Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.",
    "Sie müssen für einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist.",
  ];
}

/** Muster-Widerrufsformular nach Anlage 2 zu Art. 246a § 1 Abs. 2 S. 1 Nr. 1 EGBGB. */
export function widerrufsformular(s: Settings): string[] {
  return [
    "Muster-Widerrufsformular",
    "(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)",
    `– An ${[s.business_name || s.owner_name, s.street, `${s.zip} ${s.city}`.trim(), s.email].filter(Boolean).join(", ")}:`,
    "– Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)",
    "– Bestellt am (*)/erhalten am (*)",
    "– Name des/der Verbraucher(s)",
    "– Anschrift des/der Verbraucher(s)",
    "– Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)",
    "– Datum",
    "(*) Unzutreffendes streichen.",
  ];
}

/** Gilt für diesen Verkauf ein Widerrufsrecht? Maßgeblich ist, wo der Vertrag geschlossen wurde. */
export function hatWiderrufsrecht(contractChannel: "chat" | "vor_ort"): boolean {
  return contractChannel === "chat";
}
