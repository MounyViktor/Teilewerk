import { useState } from "react";
import { buildInvoiceExport, parseInvoiceImport } from "../lib/backup";
import { importInvoices, invoicesCsv, UserError, type ImportResult } from "../lib/business";
import { all } from "../lib/db";
import { pdfFile, saveFile } from "../lib/device";
import { date, dateTime, euro, parseEuro, todayBerlin } from "../lib/format";
import type { Invoice, Sale } from "../lib/types";
import { Link, Notice, useAction, useApp, useData } from "../ui";

const berlinYear = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date(iso));

function resultNotice(r: ImportResult) {
  const parts = [`${r.imported.length} Rechnung(en) importiert.`];
  for (const s of r.skipped) parts.push(`${s.number} übersprungen: ${s.reason}.`);
  return parts.join(" ");
}

export function InvoicesPage() {
  const { show } = useApp();
  const { busy, run } = useAction();
  const [year, setYear] = useState(todayBerlin().slice(0, 4));
  const [exported, setExported] = useState<{ file: File; count: number } | null>(null);
  const { data, reload } = useData(async () => {
    const [invoices, sales] = await Promise.all([all<Invoice>("invoices"), all<Sale>("sales")]);
    return { invoices: invoices.sort((a, b) => b.issued_at.localeCompare(a.issued_at) || b.id - a.id), sales };
  });
  const years = [...new Set([todayBerlin().slice(0, 4), ...(data?.invoices ?? []).map((i) => berlinYear(i.issued_at))])].sort().reverse();
  const list = (data?.invoices ?? []).filter((i) => berlinYear(i.issued_at) === year);
  const cancelled = new Set((data?.invoices ?? []).map((i) => i.cancels_invoice_id).filter(Boolean));
  const sum = list.reduce((a, i) => a + i.total_cents, 0);

  const share = (file: File) => run(async () => {
    const r = await saveFile(file);
    if (r === "downloaded") show({ ok: `${file.name} wurde heruntergeladen.` });
  });

  const afterImport = (r: ImportResult) => {
    setExported(null);
    if (r.imported.length) show({ ok: resultNotice(r) });
    else show({ fehler: resultNotice(r) });
    reload();
  };

  return (
    <>
      <h1>Rechnungen</h1>
      <Notice />
      <div className="filters">
        <select value={year} onChange={(e) => { setYear(e.target.value); setExported(null); }} aria-label="Jahr">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="muted">Rechnungssumme {year} (nach Stornos)</div>
        <div className="stat">{euro(sum)}</div>
        <p className="hint">Kleinunternehmergrenze im Blick behalten.</p>
        <button type="button" className="secondary wide" disabled={busy} onClick={async () => {
          const csv = await invoicesCsv(Number(year));
          void share(new File([csv], `rechnungen_${year}.csv`, { type: "text/csv" }));
        }}>CSV für EÜR / Steuerberater</button>
      </div>
      <div className="card">
        <strong>Alle PDFs aus {year} exportieren</strong>
        {!exported ? (
          <>
            <p className="hint">Erstellt eine ZIP-Datei mit allen Rechnungs-PDFs und der CSV-Liste, zum Beispiel für Dropbox.</p>
            <button type="button" className="secondary wide" disabled={busy || list.length === 0}
              onClick={() => void run(async () => setExported(await buildInvoiceExport(Number(year))))}>
              Export erstellen
            </button>
          </>
        ) : (
          <>
            <p className="hint">Bereit: {exported.count} Rechnung(en). Wähle im nächsten Schritt „In Dateien sichern“ und dann Dropbox.</p>
            <button type="button" className="wide" disabled={busy} onClick={() => void share(exported.file)}>Jetzt speichern</button>
          </>
        )}
      </div>
      <div className="card">
        <strong>Bestehende Rechnungen importieren</strong>
        <p className="hint">
          Für Rechnungen, die außerhalb der App entstanden sind. Sie zählen zur Rechnungssumme und erscheinen im Export.
          Importierte Rechnungen lassen sich nicht ändern oder löschen, prüfe die Angaben also vorher.
        </p>
        <label className={`btn secondary${busy ? " disabled" : ""}`}>
          Import-ZIP auswählen
          <input type="file" accept=".zip,application/zip" hidden disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void run(async () => afterImport(await importInvoices(parseInvoiceImport(await f.arrayBuffer()))));
          }} />
        </label>
        <details style={{ marginTop: 12 }}>
          <summary>Einzelne Rechnung als PDF hinzufügen</summary>
          <form style={{ marginTop: 8 }} onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const file = fd.get("pdf");
            void run(async () => {
              if (!(file instanceof File) || !file.size) throw new UserError("Bitte das PDF der Rechnung auswählen.");
              const total = parseEuro(String(fd.get("total") ?? ""));
              if (total === null) throw new UserError("Bitte einen gültigen Betrag angeben, z. B. 35 oder 12,50.");
              afterImport(await importInvoices([{
                number: String(fd.get("number") ?? ""), issued_on: String(fd.get("issued_on") ?? ""),
                buyer_name: String(fd.get("buyer_name") ?? ""), total_cents: total, pdf: await file.arrayBuffer(),
              }]));
              form.reset();
            });
          }}>
            <div className="field"><label htmlFor="imp_number">Rechnungsnummer</label>
              <input id="imp_number" name="number" type="text" required autoComplete="off" autoCapitalize="characters" placeholder="VS20260800005" /></div>
            <div className="grid">
              <div className="field"><label htmlFor="imp_date">Rechnungsdatum</label>
                <input id="imp_date" name="issued_on" type="date" required /></div>
              <div className="field"><label htmlFor="imp_total">Betrag (€)</label>
                <input id="imp_total" name="total" type="text" inputMode="decimal" required placeholder="35,00" /></div>
            </div>
            <div className="field"><label htmlFor="imp_buyer">Käufer</label>
              <input id="imp_buyer" name="buyer_name" type="text" required autoComplete="off" /></div>
            <div className="field"><label htmlFor="imp_pdf">PDF der Rechnung</label>
              <input id="imp_pdf" name="pdf" type="file" accept="application/pdf,.pdf" required /></div>
            <button type="submit" className="wide" disabled={busy}>Rechnung hinzufügen</button>
          </form>
        </details>
      </div>
      {data && list.length === 0 && <p className="muted">Keine Rechnungen in {year}.</p>}
      {list.length > 0 && (
        <div className="card list">
          {list.map((inv) => (
            <div key={inv.id} className="listrow invrow">
              <span>
                {inv.imported
                  ? <strong>{inv.number}</strong>
                  : <Link to={`/verkaeufe/${inv.sale_id}`}><strong>{inv.kind === "storno" ? "Storno " : ""}{inv.number}</strong></Link>}
                {inv.imported && <span className="badge" style={{ marginLeft: 6 }}>importiert</span>}
                {cancelled.has(inv.id) && <span className="badge" style={{ marginLeft: 6 }}>storniert</span>}
                <span className="muted small block">
                  {inv.imported ? date(inv.issued_at) : dateTime(inv.issued_at)} · {data!.sales.find((s) => s.id === inv.sale_id)?.buyer_name ?? inv.snapshot.buyer.name} · {euro(inv.total_cents)}
                </span>
              </span>
              <button type="button" className="secondary small" onClick={() => void share(pdfFile(inv.pdf, inv.number))}>PDF</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
