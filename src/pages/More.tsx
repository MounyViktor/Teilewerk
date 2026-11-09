import { useState, type FormEvent } from "react";
import {
  backupStatus, buildBackup, isDatabaseEmpty, markBackupDone, restoreBackup, type BackupStatus, type BuiltBackup,
} from "../lib/backup";
import { loadSettings, saveSettings } from "../lib/business";
import { all } from "../lib/db";
import { isInstalled, saveFile, storageInfo } from "../lib/device";
import { dateTime } from "../lib/format";
import type { Settings } from "../lib/types";
import { Link, Notice, useAction, useApp, useData } from "../ui";

export function BackupWarning({ status }: { status: BackupStatus }) {
  if (!status.overdue) return null;
  return (
    <div className="notice err">
      <strong>Sicherung fällig.</strong>{" "}
      {status.invoicesPending > 0
        ? `${status.invoicesPending} Rechnungsvorgang/-vorgänge sind noch nicht gesichert. `
        : `${status.changes} Änderung(en) sind noch nicht gesichert. `}
      Deine Daten liegen nur auf diesem iPhone. <Link to="/mehr">Jetzt sichern</Link>
    </div>
  );
}

export function More() {
  const { show } = useApp();
  const { busy, run } = useAction();
  const [built, setBuilt] = useState<BuiltBackup | null>(null);
  const { data, reload } = useData(async () => {
    const [status, storage, empty] = await Promise.all([backupStatus(), storageInfo(), isDatabaseEmpty()]);
    return { status, storage, empty };
  });

  return (
    <>
      <h1>Mehr</h1>
      <Notice />
      <h2>Sicherung</h2>
      <div className="card">
        <div className="notice warn">
          Deine Daten liegen nur auf diesem iPhone. Wird die App gelöscht, sind sie weg, und auch iOS kann ihren Speicher in Ausnahmefällen löschen.
          Rechnungen müssen 8 Jahre aufbewahrt werden. Sichere deshalb regelmäßig, am besten in iCloud Drive und zusätzlich auf einem anderen Gerät.
        </div>
        <p>
          Letzte Sicherung: <strong>{data?.status.lastAt ? dateTime(data.status.lastAt) : "noch keine"}</strong><br />
          Änderungen seitdem: <strong>{data?.status.changes ?? "–"}</strong>
        </p>
        {!built ? (
          <button type="button" className="wide" disabled={busy} onClick={() => void run(async () => setBuilt(await buildBackup()))}>
            {busy ? "Sicherung wird erstellt …" : "Sicherung erstellen"}
          </button>
        ) : (
          <>
            <p className="hint">
              Bereit: {built.invoices} Rechnung(en), {built.photos} Foto(s), {(built.file.size / 1048576).toFixed(1)} MB.
              Wähle im nächsten Schritt „In Dateien sichern“ und dann iCloud Drive.
            </p>
            <button type="button" className="wide" disabled={busy} onClick={() => void run(async () => {
              const r = await saveFile(built.file);
              if (r === "cancelled") return;
              await markBackupDone(built.auditId);
              setBuilt(null);
              show({ ok: `Sicherung ${built.file.name} weitergegeben. Prüfe in der Dateien-App, ob sie dort angekommen ist.` });
              reload();
            })}>Jetzt speichern</button>
          </>
        )}
        <p className="hint">Die ZIP-Datei enthält alle Rechnungs-PDFs, Fotos und die CSV-Liste, lesbar auch ohne diese App.</p>
      </div>

      {data?.empty && (
        <>
          <h2>Sicherung einspielen</h2>
          <div className="card">
            <p className="hint">Nur möglich, solange die App leer ist. So kann eine Sicherung nie vorhandene Rechnungen überschreiben.</p>
            <label className={`btn secondary${busy ? " disabled" : ""}`}>
              ZIP-Datei auswählen
              <input type="file" accept=".zip,application/zip" hidden disabled={busy} onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void run(async () => {
                  const r = await restoreBackup(await f.arrayBuffer());
                  show({ ok: `Eingespielt: ${r.parts} Teil(e), ${r.invoices} Rechnung(en).` });
                  reload();
                });
              }} />
            </label>
          </div>
        </>
      )}

      <h2>App</h2>
      <div className="card list">
        <Link to="/vertraege" className="listrow"><span>Verträge</span><span aria-hidden="true">›</span></Link>
        <Link to="/vorlagen" className="listrow"><span>Vorlagen zum Herunterladen</span><span aria-hidden="true">›</span></Link>
        <Link to="/einstellungen" className="listrow"><span>Einstellungen (Rechnungsdaten)</span><span aria-hidden="true">›</span></Link>
      </div>
      <div className="card">
        <div>Installiert: <strong>{isInstalled() ? "ja" : "nein, läuft im Browser"}</strong></div>
        <div>Dauerhafter Speicher: <strong>{data?.storage.persisted == null ? "unbekannt" : data.storage.persisted ? "vom System bestätigt" : "nicht bestätigt"}</strong></div>
        <div>Belegt: <strong>{data?.storage.usedMb == null ? "unbekannt" : `${data.storage.usedMb} MB`}</strong></div>
        <p className="hint">Die App ist ein Hilfsmittel und ersetzt keine Rechts- oder Steuerberatung. Der Schutz der Rechnungen gilt nur innerhalb der App. Kläre mit deinem Steuerberater, ob dir das für die Aufbewahrung reicht.</p>
      </div>
    </>
  );
}

const FIELDS: { key: keyof Settings; label: string; hint?: string; type?: string; mode?: "tel" | "numeric" | "email" }[] = [
  { key: "owner_name", label: "Name Inhaber *" },
  { key: "business_name", label: "Firmen-/Geschäftsbezeichnung", hint: "optional, z. B. „Teilewerk – Rollerteile“" },
  { key: "street", label: "Straße, Nr. *" },
  { key: "zip", label: "PLZ *", mode: "numeric" },
  { key: "city", label: "Ort *" },
  { key: "phone", label: "Telefon", mode: "tel" },
  { key: "email", label: "E-Mail", mode: "email" },
  { key: "tax_number", label: "Steuernummer", hint: "empfohlen auf der Rechnung" },
  { key: "bank_name", label: "Bank" },
  { key: "iban", label: "IBAN" },
  { key: "bic", label: "BIC" },
  { key: "paypal", label: "PayPal-Adresse", mode: "email" },
  { key: "lucid_number", label: "LUCID-Registrierungsnummer", hint: "falls du Hersteller im Sinne der PPWR bist. Geklärt und nicht nötig? Dann „nicht erforderlich“ eintragen." },
  { key: "invoice_prefix", label: "Präfix Rechnungsnummer", hint: "VS → VS + Jahr + Monat + laufende Nummer, z. B. VS20261100007" },
  { key: "first_number", label: "Nächste laufende Rechnungsnummer", hint: "nur änderbar, solange die App keine Rechnung enthält", mode: "numeric" },
];

export function SettingsPage() {
  const { go } = useApp();
  const { busy, run } = useAction();
  const { data: loaded } = useData(async () => {
    const [settings, invoices] = await Promise.all([loadSettings(), all("invoices")]);
    return { settings, locked: invoices.length > 0 };
  });
  if (!loaded) return null;
  const data = loaded.settings;
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = { ...data };
    for (const f of FIELDS) (next as Record<string, string>)[f.key] = String(fd.get(f.key) ?? "").trim();
    void run(async () => {
      await saveSettings(next);
      go("/mehr", { ok: "Einstellungen gespeichert. Gilt für alle künftigen Rechnungen; bestehende bleiben unverändert." });
    });
  };
  return (
    <>
      <p className="back"><Link to="/mehr">‹ Mehr</Link></p>
      <h1>Einstellungen</h1>
      <Notice />
      <form className="card" onSubmit={submit}>
        <p className="hint">Diese Angaben erscheinen auf jeder Rechnung und in der Widerrufsbelehrung.</p>
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label htmlFor={f.key}>{f.label}{f.hint && <> <span className="hint">– {f.hint}</span></>}</label>
            <input id={f.key} name={f.key} type="text" inputMode={f.mode} defaultValue={data[f.key]}
              readOnly={f.key === "first_number" && loaded.locked} />
          </div>
        ))}
        <button type="submit" className="wide" disabled={busy}>Speichern</button>
      </form>
    </>
  );
}
