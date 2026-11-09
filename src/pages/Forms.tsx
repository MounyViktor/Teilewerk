import { loadSettings, missingSettings } from "../lib/business";
import { saveFile } from "../lib/device";
import { FORMS, renderForm } from "../lib/forms";
import { loadLogo } from "../lib/invoice-pdf";
import { Link, Notice, useAction, useApp, useData } from "../ui";

/**
 * Die PDFs entstehen schon beim Öffnen der Seite: iOS erlaubt das Teilen nur direkt nach einem Fingertipp,
 * deshalb muss die Datei beim Antippen bereits fertig sein.
 */
export function FormsPage() {
  const { show } = useApp();
  const { busy, run } = useAction();
  const { data } = useData(async () => {
    const [settings, logo] = await Promise.all([loadSettings(), loadLogo()]);
    const files = await Promise.all(FORMS.map(async (f) => {
      const pdf = await renderForm(f.kind, settings, logo);
      return { ...f, file: new File([pdf as BlobPart], f.file, { type: "application/pdf" }) };
    }));
    return { files, missing: missingSettings(settings) };
  });
  return (
    <>
      <p className="back"><Link to="/mehr">‹ Mehr</Link></p>
      <h1>Vorlagen</h1>
      <Notice />
      {data && data.missing.length > 0 && (
        <div className="notice warn">In den Vorlagen fehlen noch: {data.missing.join(", ")}. <Link to="/einstellungen">Jetzt ergänzen</Link></div>
      )}
      <p className="hint">Leere Vordrucke mit deinen Daten aus den Einstellungen. Tippe auf einen Eintrag und wähle „Drucken“ oder „In Dateien sichern“.</p>
      {!data && <p className="muted">Vorlagen werden erstellt …</p>}
      {data && (
        <div className="card list">
          {data.files.map((f) => (
            <div key={f.kind} className="listrow invrow">
              <span>
                <strong>{f.title}</strong>
                <span className="muted small block">{f.hint}</span>
              </span>
              <button type="button" className="secondary small" disabled={busy} aria-label={`${f.title} herunterladen`} onClick={() => void run(async () => {
                const r = await saveFile(f.file);
                if (r === "downloaded") show({ ok: `${f.file.name} wurde heruntergeladen.` });
              })}>Download</button>
            </div>
          ))}
        </div>
      )}
      <p className="hint">Die Texte sind Vorschläge und ersetzen keine Rechtsberatung. Lass sie einmal anwaltlich prüfen, bevor du sie regelmäßig nutzt.</p>
    </>
  );
}
