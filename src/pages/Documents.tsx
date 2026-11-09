import { useState } from "react";
import { addAttachment, deleteAttachment, loadSettings, UserError, type AttachmentOwner } from "../lib/business";
import { byIndex } from "../lib/db";
import { processDocument, saveFile } from "../lib/device";
import { loadLogo, renderWarrantyPdf } from "../lib/invoice-pdf";
import { dateTime } from "../lib/format";
import { missingSettings } from "../lib/business";
import type { Attachment } from "../lib/types";
import { useAction, useApp, useData } from "../ui";

/** Dokumentenliste für einen Roller oder Verkauf: Papiere, Gutachten, Screenshots, unterschriebene Vereinbarungen. */
export function Documents({ owner, locked, hint }: { owner: AttachmentOwner; locked?: boolean; hint?: string }) {
  const { show } = useApp();
  const { busy, run } = useAction();
  const { data, reload } = useData(() => byIndex<Attachment>("attachments", "owner", owner), [owner]);
  return (
    <div className="card">
      {hint && <p className="hint" style={{ marginTop: 0 }}>{hint}</p>}
      {data?.length === 0 && <p className="muted">Noch keine Dokumente.</p>}
      {data?.map((a) => (
        <div key={a.id} className="listrow invrow">
          <span>
            <strong>{a.name}</strong>
            <span className="muted small block">{dateTime(a.created_at)}</span>
          </span>
          <span className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
            <button type="button" className="secondary small" onClick={() => void run(async () => {
              await saveFile(new File([a.data], a.name, { type: a.type }));
            })}>Öffnen</button>
            {!locked && (
              <button type="button" className="danger small" aria-label={`${a.name} löschen`} onClick={() => {
                if (!window.confirm(`„${a.name}“ löschen?`)) return;
                void run(async () => { await deleteAttachment(a.id); reload(); });
              }}>✕</button>
            )}
          </span>
        </div>
      ))}
      <label className={`btn secondary${busy ? " disabled" : ""}`} style={{ marginTop: 8 }}>
        Dokument hinzufügen
        <input type="file" accept="application/pdf,.pdf,image/*" multiple hidden disabled={busy} onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          void run(async () => {
            for (const f of files) await addAttachment(owner, await processDocument(f));
            show({ ok: `${files.length} Dokument(e) gespeichert.` });
            reload();
          });
        }} />
      </label>
    </div>
  );
}

export type PickedDoc = { name: string; type: string; data: ArrayBuffer };

/** Belege schon beim Anlegen auswählen: Foto vom Kassenbon oder Datei, zum Beispiel aus Dropbox. */
export function DocPicker({ docs, onChange, onWorking, cameraLabel }: {
  docs: PickedDoc[];
  onChange: (d: PickedDoc[]) => void;
  onWorking: (w: boolean) => void;
  cameraLabel: string;
}) {
  const { show } = useApp();
  const [working, setWorking] = useState(false);
  const pick = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setWorking(true);
    onWorking(true);
    try {
      const out: PickedDoc[] = [];
      for (const f of files) out.push(await processDocument(f));
      onChange([...docs, ...out]);
    } catch (e) {
      show({ fehler: (e as Error).message });
    } finally {
      setWorking(false);
      onWorking(false);
    }
  };
  return (
    <div className="field">
      <div className="row">
        <label className={`btn secondary${working ? " disabled" : ""}`}>
          📷 {cameraLabel}
          <input type="file" accept="image/*" capture="environment" hidden disabled={working}
            onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        </label>
        <label className={`btn secondary${working ? " disabled" : ""}`}>
          Datei auswählen
          <input type="file" accept="application/pdf,.pdf,image/*" multiple hidden disabled={working}
            onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
        </label>
      </div>
      {working && <p className="hint">Wird verarbeitet …</p>}
      {docs.map((d, i) => (
        <div key={i} className="listrow invrow">
          <span>{d.name}</span>
          <button type="button" className="danger small" aria-label={`${d.name} entfernen`}
            onClick={() => onChange(docs.filter((_, n) => n !== i))}>✕</button>
        </div>
      ))}
    </div>
  );
}

/** Zwei Schritte, weil iOS das Teilen nur direkt nach einem Fingertipp erlaubt. */
export function WarrantyDocument({ getItems, getBuyer }: { getItems: () => string[]; getBuyer: () => string }) {
  const { busy, run } = useAction();
  const [file, setFile] = useState<File | null>(null);
  return !file ? (
    <button type="button" className="secondary wide" disabled={busy} onClick={() => void run(async () => {
      const items = getItems();
      if (!items.length) throw new UserError("Bitte zuerst mindestens ein Teil oder einen Roller auswählen.");
      const seller = await loadSettings();
      const miss = missingSettings(seller);
      if (miss.length) throw new UserError(`Bitte zuerst in den Einstellungen ergänzen: ${miss.join(", ")}.`);
      const pdf = await renderWarrantyPdf({ seller, buyer: getBuyer(), items, logo: await loadLogo() });
      setFile(new File([pdf as BlobPart], "Vereinbarung_Gewaehrleistung.pdf", { type: "application/pdf" }));
    })}>Vereinbarung als PDF erstellen</button>
  ) : (
    <button type="button" className="wide" disabled={busy} onClick={() => void run(async () => {
      await saveFile(file);
      setFile(null);
    })}>Vereinbarung senden oder drucken</button>
  );
}
