import { useState, type FormEvent } from "react";
import { all, get } from "../lib/db";
import { date, euro, todayBerlin } from "../lib/format";
import { createContract, deleteContract, updateContract, type ContractInput } from "../lib/records";
import { CONTRACT_TYPE_LABEL, type Contract, type ContractType } from "../lib/types";
import { Link, Notice, useAction, useApp, useData } from "../ui";
import { DocPicker, Documents, type PickedDoc } from "./Documents";

const TYPES = Object.entries(CONTRACT_TYPE_LABEL) as [ContractType, string][];

export function ContractsList() {
  const [type, setType] = useState("alle");
  const [q, setQ] = useState("");
  const { data } = useData(() => all<Contract>("contracts"));
  const needle = q.trim().toLowerCase();
  const list = (data ?? [])
    .filter((c) => type === "alle" || c.type === type)
    .filter((c) => !needle || [c.title, c.partner].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return (
    <>
      <p className="back"><Link to="/mehr">‹ Mehr</Link></p>
      <div className="spread">
        <h1>Verträge</h1>
        <Link className="btn" to="/vertraege/neu">+ Vertrag</Link>
      </div>
      <Notice />
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bezeichnung oder Vertragspartner" aria-label="Suche" />
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Vertragsart">
          <option value="alle">Alle Vertragsarten</option>
          {TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {data && list.length === 0 && <p className="onred">Keine Verträge gefunden. Tippe auf „+ Vertrag“.</p>}
      {list.length > 0 && (
        <div className="card list">
          {list.map((c) => (
            <Link key={c.id} to={`/vertraege/${c.id}`} className="listrow">
              <span>
                <strong>{c.title}</strong>
                <span className="muted small block">{CONTRACT_TYPE_LABEL[c.type]} · {date(c.date)}{c.partner && ` · ${c.partner}`}{c.monthly_cents ? ` · ${euro(c.monthly_cents)} / Monat` : ""}</span>
              </span>
              <span aria-hidden="true">›</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function readForm(e: FormEvent<HTMLFormElement>): ContractInput {
  const fd = new FormData(e.currentTarget);
  const s = (k: string) => String(fd.get(k) ?? "");
  return { type: s("type") as ContractType, title: s("title"), partner: s("partner"), date: s("date"), ends_on: s("ends_on"), monthly: s("monthly"), note: s("note") };
}

function ContractFields({ contract: c }: { contract?: Contract }) {
  const monthly = c?.monthly_cents != null ? (c.monthly_cents / 100).toFixed(2).replace(".", ",") : "";
  return (
    <>
      <div className="field"><label htmlFor="type">Vertragsart *</label>
        <select id="type" name="type" defaultValue={c?.type ?? "verkauf"}>
          {TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select></div>
      <div className="field"><label htmlFor="title">Bezeichnung *</label>
        <input id="title" name="title" type="text" required defaultValue={c?.title} placeholder="z. B. Verkauf Kymco KB 50" /></div>
      <div className="field"><label htmlFor="partner">Vertragspartner</label>
        <input id="partner" name="partner" type="text" autoComplete="off" defaultValue={c?.partner} /></div>
      <div className="grid">
        <div className="field"><label htmlFor="date">Datum *</label>
          <input id="date" name="date" type="date" required defaultValue={c?.date ?? todayBerlin()} /></div>
        <div className="field"><label htmlFor="ends_on">Läuft bis <span className="hint">– falls befristet</span></label>
          <input id="ends_on" name="ends_on" type="date" defaultValue={c?.ends_on} /></div>
      </div>
      <div className="field"><label htmlFor="monthly">Ausgaben (€ pro Monat) <span className="hint">– leer, wenn keine laufenden Kosten</span></label>
        <input id="monthly" name="monthly" type="text" inputMode="decimal" defaultValue={monthly} placeholder="z. B. 49,90" /></div>
      <div className="field"><label htmlFor="note">Notiz</label>
        <textarea id="note" name="note" defaultValue={c?.note} /></div>
    </>
  );
}

export function NewContract() {
  const { go } = useApp();
  const { busy, run } = useAction();
  const [docs, setDocs] = useState<PickedDoc[]>([]);
  const [processing, setProcessing] = useState(false);
  return (
    <>
      <p className="back"><Link to="/vertraege">‹ Verträge</Link></p>
      <h1>Neuer Vertrag</h1>
      <Notice />
      <form className="card" onSubmit={(e) => {
        e.preventDefault();
        if (processing) return;
        const input = readForm(e);
        void run(async () => {
          const id = await createContract(input, docs);
          go(`/vertraege/${id}`, { ok: docs.length ? `Vertrag mit ${docs.length} Dokument(en) gespeichert.` : "Vertrag gespeichert." });
        });
      }}>
        <label>Dokument</label>
        <DocPicker docs={docs} onChange={setDocs} onWorking={setProcessing} cameraLabel="Vertrag fotografieren" />
        <ContractFields />
        <button type="submit" className="wide" disabled={busy || processing}>{processing ? "Dokument wird verarbeitet …" : "Speichern"}</button>
      </form>
    </>
  );
}

export function ContractDetail({ id }: { id: number }) {
  const { go, show } = useApp();
  const { busy, run } = useAction();
  const { data, reload } = useData(async () => ({ contract: await get<Contract>("contracts", id) }), [id]);
  if (!data) return null;
  const c = data.contract;
  if (!c) return <><h1>Nicht gefunden</h1><Link className="onred" to="/vertraege">Zurück zur Liste</Link></>;
  return (
    <>
      <p className="back"><Link to="/vertraege">‹ Verträge</Link></p>
      <h1>{c.title}</h1>
      <Notice />
      <div className="card">
        <div><strong>{CONTRACT_TYPE_LABEL[c.type]}</strong></div>
        <div className="muted">Vom {date(c.date)}{c.ends_on && `, läuft bis ${date(c.ends_on)}`}</div>
        {c.partner && <div>Vertragspartner: <strong>{c.partner}</strong></div>}
        {c.monthly_cents ? <div>Ausgaben: <strong>{euro(c.monthly_cents)} pro Monat</strong></div> : null}
        {c.note && <p>{c.note}</p>}
        <Link className="btn" to={`/ausgaben/neu?vertrag=1&bei=${encodeURIComponent(c.partner)}&was=${encodeURIComponent(c.title)}`}>Zahlung als Ausgabe eintragen</Link>
        <p className="hint">Der Monatsbetrag zählt nur zu den monatlichen Kosten auf der Übersicht. In die Jahres-Ausgaben und den Export kommt eine Zahlung erst, wenn du sie hier einträgst.</p>
      </div>
      <h2>Dokumente</h2>
      <Documents owner={`contract:${c.id}`} hint="Enthält oft personenbezogene Daten. Bewahre nur auf, was du brauchst." />
      <h2>Bearbeiten</h2>
      <form className="card" key={c.updated_at} onSubmit={(e) => {
        e.preventDefault();
        const input = readForm(e);
        void run(async () => { await updateContract(c.id, input); show({ ok: "Gespeichert." }); reload(); });
      }}>
        <ContractFields contract={c} />
        <button type="submit" className="wide" disabled={busy}>Speichern</button>
      </form>
      <button type="button" className="danger onred-danger wide" disabled={busy} onClick={() => {
        if (!window.confirm("Vertrag samt Dokumenten löschen?")) return;
        void run(async () => { await deleteContract(c.id); go("/vertraege", { ok: "Vertrag gelöscht." }); });
      }}>Vertrag löschen</button>
    </>
  );
}
