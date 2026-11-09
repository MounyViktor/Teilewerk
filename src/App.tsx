import { useEffect, useState } from "react";
import { isInstalled, isIos, requestPersistence } from "./lib/device";
import { AppProvider, useRoute } from "./ui";
import { ContractDetail, ContractsList, NewContract } from "./pages/Contracts";
import { ExpenseDetail, ExpensesList, NewExpense } from "./pages/Expenses";
import { FormsPage } from "./pages/Forms";
import { Home } from "./pages/Home";
import { More, SettingsPage } from "./pages/More";
import { InvoicesPage } from "./pages/Invoices";
import { NewPart, PartDetail, PartsList } from "./pages/Parts";
import { NewSale, SaleDetail, SalesList } from "./pages/Sales";

const TABS = [
  { to: "/", label: "Übersicht", icon: "⌂", match: (r: string) => r === "/" },
  { to: "/teile", label: "Lager", icon: "▦", match: (r: string) => r.startsWith("/teile") },
  { to: "/verkaeufe", label: "Verkäufe", icon: "⇄", match: (r: string) => r.startsWith("/verkaeufe") },
  { to: "/rechnungen", label: "Rechnungen", icon: "≣", match: (r: string) => r.startsWith("/rechnungen") },
  { to: "/ausgaben", label: "Ausgaben", icon: "€", match: (r: string) => r.startsWith("/ausgaben") },
  { to: "/mehr", label: "Mehr", icon: "⋯", match: (r: string) => ["/mehr", "/einstellungen", "/vorlagen", "/vertraege"].some((p) => r.startsWith(p)) },
];

function Page({ route }: { route: string }) {
  const [path, query = ""] = route.split("?");
  const params = new URLSearchParams(query);
  const seg = path.split("/").filter(Boolean);
  const id = Number(seg[1]);
  if (path === "/") return <Home />;
  if (seg[0] === "teile") {
    if (!seg[1]) return <PartsList initialStatus={params.get("status") ?? "lager"} />;
    if (seg[1] === "neu") {
      const kind = params.get("art") === "roller" ? "roller" : "teil";
      return <NewPart key={kind} kind={kind} />;
    }
    if (Number.isInteger(id)) return <PartDetail key={id} id={id} />;
  }
  if (seg[0] === "verkaeufe") {
    if (!seg[1]) return <SalesList />;
    if (seg[1] === "neu") return <NewSale preselect={Number(params.get("teil")) || null} />;
    if (Number.isInteger(id)) return <SaleDetail key={id} id={id} />;
  }
  if (seg[0] === "rechnungen") return <InvoicesPage />;
  if (seg[0] === "ausgaben") {
    if (!seg[1]) return <ExpensesList />;
    if (seg[1] === "neu") {
      return <NewExpense prefill={params.get("vertrag") === "1" ? {
        category: "vertrag", supplier: params.get("bei") ?? "", description: params.get("was") ?? "",
      } : undefined} />;
    }
    if (Number.isInteger(id)) return <ExpenseDetail key={id} id={id} />;
  }
  if (seg[0] === "vertraege") {
    if (!seg[1]) return <ContractsList />;
    if (seg[1] === "neu") return <NewContract />;
    if (Number.isInteger(id)) return <ContractDetail key={id} id={id} />;
  }
  if (seg[0] === "einstellungen") return <SettingsPage />;
  if (seg[0] === "vorlagen") return <FormsPage />;
  if (seg[0] === "mehr") return <More />;
  return <p className="muted">Seite nicht gefunden.</p>;
}

/** Auf dem iPhone trennt iOS die Daten von Safari und Home-Bildschirm-App. Deshalb gleich zu Beginn darauf hinweisen. */
function InstallHint() {
  const [show] = useState(() => isIos() && !isInstalled());
  if (!show) return null;
  return (
    <div className="notice err">
      <strong>Noch nicht installiert.</strong> Tippe in Safari auf das Teilen-Symbol und dann auf „Zum Home-Bildschirm“.
      Öffne Teilewerk danach nur noch über das neue Icon: Was du hier in Safari erfasst, erscheint dort nicht.
    </div>
  );
}

export function App() {
  const route = useRoute();
  useEffect(() => { void requestPersistence(); }, []);
  return (
    <AppProvider route={route}>
      <main>
        <InstallHint />
        <Page route={route} />
      </main>
      <nav className="tabs" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <a key={t.to} href={`#${t.to}`} className={t.match(route) ? "active" : ""} aria-current={t.match(route) ? "page" : undefined}>
            <span className="ico" aria-hidden="true">{t.icon}</span>
            {t.label}
          </a>
        ))}
      </nav>
    </AppProvider>
  );
}
