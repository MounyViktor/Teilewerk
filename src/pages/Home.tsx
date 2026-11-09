import { backupStatus } from "../lib/backup";
import { loadSettings, missingSettings } from "../lib/business";
import { all } from "../lib/db";
import { euro, todayBerlin } from "../lib/format";
import { monthlyCosts } from "../lib/records";
import type { Contract, Expense, Invoice, Part, Sale } from "../lib/types";
import { Link, Notice, useData } from "../ui";
import { BackupWarning } from "./More";

export function Home() {
  const { data } = useData(async () => {
    const [settings, parts, sales, invoices, backup, expenses, contracts] = await Promise.all([
      loadSettings(), all<Part>("parts"), all<Sale>("sales"), all<Invoice>("invoices"), backupStatus(), all<Expense>("expenses"), all<Contract>("contracts"),
    ]);
    return { settings, parts, sales, invoices, backup, expenses, contracts };
  });
  if (!data) return null;
  const { settings: s, parts, sales, invoices, backup, expenses, contracts } = data;
  const year = todayBerlin().slice(0, 4);
  const costs = monthlyCosts(contracts, expenses);
  const monthName = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(new Date(`${todayBerlin()}T12:00:00Z`));
  const lager = parts.filter((p) => p.status === "lager");
  const berlinYear = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric" }).format(new Date(iso));
  const umsatz = invoices.filter((i) => berlinYear(i.issued_at) === year).reduce((a, i) => a + i.total_cents, 0);
  const open = sales.filter((x) => !invoices.some((i) => i.sale_id === x.id)).sort((a, b) => b.id - a.id);
  const miss = missingSettings(s);
  return (
    <>
      <div className="hero">
        <h1>Übersicht</h1>
        <img className="sticker" src="./logo-rund.png" alt="Logo Zwei-Rad Service Viktor Sergeev" />
      </div>
      <Notice />
      <BackupWarning status={backup} />
      {miss.length > 0 && (
        <div className="notice warn">Für Rechnungen fehlen noch Angaben: {miss.join(", ")}. <Link to="/einstellungen">Jetzt ergänzen</Link></div>
      )}
      {!s.lucid_number && (
        <div className="notice warn">Verpackungsregister LUCID noch nicht geklärt: Vor dem Versand prüfen, ob du für deine Verpackungen als Hersteller giltst. <Link to="/einstellungen">Eintragen</Link></div>
      )}
      <div className="stats">
        <Link to="/teile" className="card plain"><div className="muted">Im Lager</div><div className="stat">{lager.length}</div><div className="muted">Wert {euro(lager.reduce((a, p) => a + p.price_cents, 0))}</div></Link>
        <Link to="/teile?status=reserviert" className="card plain"><div className="muted">Reserviert</div><div className="stat">{parts.filter((p) => p.status === "reserviert").length}</div></Link>
        <Link to="/verkaeufe" className="card plain"><div className="muted">Verkäufe ohne Rechnung</div><div className="stat">{open.length}</div></Link>
        <Link to="/rechnungen" className="card plain"><div className="muted">Rechnungssumme {year}</div><div className="stat">{euro(umsatz)}</div><div className="muted">Kleinunternehmergrenze im Blick behalten</div></Link>
        <Link to="/ausgaben" className="card plain"><div className="muted">Ausgaben {year}</div><div className="stat">{euro(expenses.filter((e) => e.date.startsWith(year)).reduce((a, e) => a + e.total_cents, 0))}</div></Link>
        <Link to="/vertraege" className="card plain"><div className="muted">Monatliche Kosten {monthName}</div><div className="stat">{euro(costs.totalCents)}</div><div className="muted">Verträge {euro(costs.contractCents)} + Ausgaben {euro(costs.expenseCents)}</div></Link>
      </div>
      <div className="actions">
        <Link className="btn" to="/teile/neu">📷 Teil erfassen</Link>
        <Link className="btn" to="/teile/neu?art=roller">🛵 Roller erfassen</Link>
        <Link className="btn secondary" to="/verkaeufe/neu">Verkauf erfassen</Link>
      </div>
      {open.length > 0 && (
        <>
          <h2>Offene Verkäufe (noch keine Rechnung)</h2>
          <div className="card list">
            {open.slice(0, 10).map((o) => <Link key={o.id} to={`/verkaeufe/${o.id}`}>#{o.id} {o.buyer_name}</Link>)}
          </div>
        </>
      )}
    </>
  );
}
