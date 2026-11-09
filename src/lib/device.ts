// Alles, was vom Gerät abhängt: Fotos verarbeiten, Dateien sichern, Speicher, Installation.
import type { NewPhoto } from "./business";

const MAX_EDGE = 1600;
const THUMB_EDGE = 360;

function canvasJpeg(img: HTMLImageElement, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Foto konnte nicht verarbeitet werden.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<{ data: ArrayBuffer; width: number; height: number }>((resolve, reject) => {
    canvas.toBlob(async (b) => {
      if (!b) return reject(new Error("Foto konnte nicht verarbeitet werden."));
      resolve({ data: await b.arrayBuffer(), width: canvas.width, height: canvas.height });
    }, "image/jpeg", quality);
  });
}

/**
 * Das Bild wird neu gezeichnet und neu kodiert. Das Ergebnis enthält nur Bildpunkte:
 * GPS-, EXIF-, XMP- und IPTC-Daten des Originals gehen dabei verloren, das Original wird nie gespeichert.
 */
export async function processPhoto(file: File): Promise<NewPhoto> {
  const url = URL.createObjectURL(file);
  try {
    // Bewusst onload statt img.decode(): decode() kann hängen bleiben, wenn die Seite gerade nicht sichtbar ist,
    // zum Beispiel direkt nach der Rückkehr aus der Kamera.
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    const full = await canvasJpeg(img, MAX_EDGE, 0.85);
    const thumb = await canvasJpeg(img, THUMB_EDGE, 0.7);
    return { data: full.data, thumb: thumb.data, width: full.width, height: full.height };
  } catch {
    throw new Error(`Das Foto „${file.name}“ konnte nicht gelesen werden.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const MAX_DOCUMENT_MB = 25;

/** PDFs bleiben unverändert. Bilder werden wie Fotos neu kodiert, damit keine Standortdaten mitgespeichert werden. */
export async function processDocument(file: File): Promise<{ name: string; type: string; data: ArrayBuffer }> {
  if (file.size > MAX_DOCUMENT_MB * 1048576) throw new Error(`„${file.name}“ ist größer als ${MAX_DOCUMENT_MB} MB.`);
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) return { name: file.name, type: "application/pdf", data: await file.arrayBuffer() };
  if (!file.type.startsWith("image/")) throw new Error(`„${file.name}“: Bitte ein PDF oder Bild auswählen.`);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    const { data } = await canvasJpeg(img, 2400, 0.9);
    return { name: file.name.replace(/\.[^.]+$/, "") + ".jpg", type: "image/jpeg", data };
  } catch {
    throw new Error(`Das Bild „${file.name}“ konnte nicht gelesen werden.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type SaveResult = "shared" | "downloaded" | "cancelled";

/**
 * Öffnet auf dem iPhone das Teilen-Menü („In Dateien sichern“, iCloud Drive, Mail …).
 * Muss direkt aus einem Fingertipp aufgerufen werden, sonst lehnt iOS ab.
 */
export async function saveFile(file: File): Promise<SaveResult> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return "cancelled";
      if ((e as DOMException).name === "NotAllowedError") throw new Error("iOS hat das Teilen abgelehnt. Bitte noch einmal tippen.");
      throw e;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}

export function pdfFile(pdf: ArrayBuffer, number: string): File {
  return new File([pdf], `${number}.pdf`, { type: "application/pdf" });
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export async function storageInfo(): Promise<{ persisted: boolean | null; usedMb: number | null }> {
  const s = navigator.storage;
  const persisted = s?.persisted ? await s.persisted().catch(() => null) : null;
  const est = s?.estimate ? await s.estimate().catch(() => null) : null;
  return { persisted, usedMb: est?.usage != null ? Math.round(est.usage / 1048576) : null };
}

/** Bittet das System, die Daten nicht bei Speichermangel zu löschen. Eine Garantie ist das nicht. */
export async function requestPersistence(): Promise<void> {
  await navigator.storage?.persist?.().catch(() => false);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
