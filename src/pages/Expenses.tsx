import { useState, type FormEvent } from "react";
import { all, get } from "../lib/db";
import { saveFile } from "../lib/device";
import { date, euro, todayBerlin } from "../lib/format";
import { buildExpenseExport, createExpense, deleteExpense, importExpenses, parseExpenseImport, updateExpense, type ExpenseInput } from "../lib/records";
import { EXPENSE_CATEGORY_LABEL, type Expense, type ExpenseCategory } from "../lib/types";
import { Link, Notice, useAction, useApp, useData } from "../ui";
import { DocPicker, Documents, type PickedDoc } from "./Documents";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABEL) as [ExpenseCategory, string][];

export function ExpensesList() {
  const { show } = useApp();
  const { busy, run } = useAction();
  const [year, setYear] = useState(todayBerlin().slice(0, 4));
  const [category, setCategory] = useState("alle");
  const [exported, setExported] = useState<{ file: File; count: number; receipts: number } | null>(null);
  const { data, reload } = useData(() => all<Expense>("expenses"));
  const expenses = data ?? [];
  const years = [...new Set([todayBerlin().slice(0, 4), ...expenses.map((e) => e.date.slice(0, 4))])].sort().reverse();
  const ofYear = expenses.filter((e) => e.date.startsWith(year));
  const list = ofYear.filter((e) => category === "alle" || e.category === category)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const sum = ofYear.reduce((a, e) => a + e.total_cents, 0);
  const perCategory = CATEGORIES
    .map(([k, label]) => ({ k, label, cents: ofYear.filter((e) => e.category === k).reduce((a, e) => a + e.total_cents, 0) }))
    .filter((c) => c.cents > 0);

  return (
    <>
      <div className="spread">
        <h1>Ausgaben</h1>
        <Link className="btn" to="/ausgaben/neu">+ Ausgabe</Link>
      </div>
      <Notice />
      <div className="filters">
        <select value={year} onChange={(e) => { setYear(e.target.value); setExported(null); }} aria-label="Jahr">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Kategorie">
          <option value="alle">Alle Kategorien</option>
          {CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="muted">Ausgaben {year}</div>
        <div className="stat">{euro(sum)}</div>
        {perCategory.map((c) => (
          <div key={c.k} className="spread small"><span>{c.label}</span><strong>{euro(c.cents)}</strong></div>
        ))}
      </div>
      {data && list.length === 0 && <p className="onred">Keine Ausgaben gefunden. Tippe auf „+ Ausgabe“.</p>}
      {list.length > 0 && (
        <div className="card list">
          {list.map((e) => (
            <Link key={e.id} to={`/ausgaben/${e.id}`} className="listrow">
              <span>
                <strong>{e.supplier}</strong>
                <span className="muted small block">{date(e.date)} · {EXPENSE_CATEGORY_LABEL[e.category]}{e.description && ` · ${e.description}`}</span>
              </span>
              <strong style={{ whiteSpace: "nowrap" }}>{euro(e.total_cents)}</strong>
            </Link>
          ))}
        </div>
      )}
      <div className="card">
        <strong>Ausgaben {year} exportieren</strong>
        {!exported ? (
          <>
            <p className="hint">ZIP-Datei mit CSV-Liste für die EÜR und allen Belegen, zum Beispiel für Dropbox oder den Steuerberater.</p>
            <button type="button" className="secondary wide" disabled={busy || ofYear.length === 0}
              onClick={() => void run(async () => setExported(await buildExpenseExport(Number(year))))}>Export erstellen</button>
          </>
        ) : (
          <>
            <p className="hint">Bereit: {exported.count} Ausgabe(n), {exported.receipts} Beleg(e).</p>
            <button type="button" className="wide" disabled={busy} onClick={() => void run(async () => {
              const r = await saveFile(exported.file);
              if (r === "downloaded") show({ ok: `${exported.file.name} wurde heruntergeladen.` });
            })}>Jetzt speichern</button>
          </>
        )}
      </div>
      <div className="card">
        <strong>Bestehende Ausgaben importieren</strong>
        <p className="hint">Übernimmt Ausgaben samt Belegen aus einer Import-Datei. Schon vorhandene Einträge werden übersprungen.</p>
        <label className={`btn secondary${busy ? " disabled" : ""}`}>
          Import-ZIP auswählen
          <input type="file" accept=".zip,application/zip" hidden disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            void run(async () => {
              const r = await importExpenses(parseExpenseImport(await f.arrayBuffer()));
              setExported(null);
              const text = `${r.imported} Ausgabe(n) importiert${r.skipped ? `, ${r.skipped} schon vorhanden und übersprungen` : ""}.`;
              if (r.imported) show({ ok: text }); else show({ fehler: text });
              reload();
            });
          }} />
        </label>
      </div>
    </>
  );
}

function readForm(e: FormEvent<HTMLFormElement>): ExpenseInput {
  const fd = new FormData(e.currentTarget);
  const s = (k: string) => String(fd.get(k) ?? "");
  return { date: s("date"), category: s("category") as ExpenseCategory, supplier: s("supplier"), description: s("description"), amount: s("amount"), note: s("note") };
}

export interface ExpensePrefill { category?: ExpenseCategory; supplier?: string; description?: string }

function ExpenseFields({ expense: x, prefill: p }: { expense?: Expense; prefill?: ExpensePrefill }) {
  const amount = x ? (x.total_cents / 100).toFixed(2).replace(".", ",") : "";
  return (
    <>
      <div className="field"><label htmlFor="category">Kategorie *</label>
        <select id="category" name="category" defaultValue={x?.category ?? p?.category ?? "teile_gebraucht"}>
          {CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div className="grid">
        <div className="field"><label htmlFor="amount">Betrag brutto (€) *</label>
          <input id="amount" name="amount" type="text" inputMode="decimal" required defaultValue={amount} placeholder="24,80" /></div>
        <div className="field"><label htmlFor="date">Datum *</label>
          <input id="date" name="date" type="date" required defaultValue={x?.date ?? todayBerlin()} /></div>
      </div>
      <div className="field"><label htmlFor="supplier">Gekauft bei *</label>
        <input id="supplier" name="supplier" type="text" required defaultValue={x?.supplier ?? p?.supplier} placeholder="z. B. OBI, Kleinanzeigen, roller.com" /></div>
      <div className="field"><label htmlFor="description">Was wurde gekauft?</label>
        <input id="description" name="description" type="text" defaultValue={x?.description ?? p?.description} placeholder="z. B. Vergaser Kymco Agility" /></div>
      <div className="field"><label htmlFor="note">Notiz</label>
        <textarea id="note" name="note" defaultValue={x?.note} /></div>
    </>
  );
}

export function NewExpense({ prefill }: { prefill?: ExpensePrefill }) {
  const { go } = useApp();
  const { busy, run } = useAction();
  const [docs, setDocs] = useState<PickedDoc[]>([]);
  const [processing, setProcessing] = useState(false);
  return (
    <>
      <p className="back"><Link to="/ausgaben">‹ Ausgaben</Link></p>
      <h1>Neue Ausgabe</h1>
      <Notice />
      <form className="card" onSubmit={(e) => {
        e.preventDefault();
        if (processing) return;
        const input = readForm(e);
        void run(async () => {
          const id = await createExpense(input, docs);
          go(`/ausgaben/${id}`, { ok: docs.length ? `Ausgabe mit ${docs.length} Beleg(en) gespeichert.` : "Ausgabe gespeichert. Der Beleg fehlt noch." });
        });
      }}>
        <label>Beleg</label>
        <DocPicker docs={docs} onChange={setDocs} onWorking={setProcessing} cameraLabel="Beleg fotografieren" />
        <ExpenseFields prefill={prefill} />
        <button type="submit" className="wide" disabled={busy || processing}>{processing ? "Beleg wird verarbeitet …" : "Speichern"}</button>
      </form>
    </>
  );
}

export function ExpenseDetail({ id }: { id: number }) {
  const { go, show } = useApp();
  const { busy, run } = useAction();
  const { data, reload } = useData(async () => ({ expense: await get<Expense>("expenses", id) }), [id]);
  if (!data) return null;
  const x = data.expense;
  if (!x) return <><h1>Nicht gefunden</h1><Link className="onred" to="/ausgaben">Zurück zur Liste</Link></>;
  return (
    <>
      <p className="back"><Link to="/ausgaben">‹ Ausgaben</Link></p>
      <h1>{x.supplier}</h1>
      <Notice />
      <div className="card">
        <div className="stat">{euro(x.total_cents)}</div>
        <div className="muted">{EXPENSE_CATEGORY_LABEL[x.category]} · {date(x.date)}</div>
        {x.description && <p>{x.description}</p>}
      </div>
      <h2>Belege</h2>
      <Documents owner={`expense:${x.id}`} hint="Foto vom Kassenbon oder Rechnung als PDF. Belege müssen aufbewahrt werden." />
      <h2>Bearbeiten</h2>
      <form className="card" key={x.updated_at} onSubmit={(e) => {
        e.preventDefault();
        const input = readForm(e);
        void run(async () => { await updateExpense(x.id, input); show({ ok: "Gespeichert." }); reload(); });
      }}>
        <ExpenseFields expense={x} />
        <button type="submit" className="wide" disabled={busy}>Speichern</button>
      </form>
      <button type="button" className="danger onred-danger wide" disabled={busy} onClick={() => {
        if (!window.confirm("Ausgabe samt Belegen löschen?")) return;
        void run(async () => { await deleteExpense(x.id); go("/ausgaben", { ok: "Ausgabe gelöscht." }); });
      }}>Ausgabe löschen</button>
    </>
  );
}
