import { useMemo, useState } from "react";
import { cancelInvoice, createInvoice, createSale, deleteSale, itemDescription, loadSettings, sortStock } from "../lib/business";
import { Documents, WarrantyDocument } from "./Documents";
import { all, byIndex, get } from "../lib/db";
import { pdfFile, saveFile } from "../lib/device";
import { addDays, date, dateTime, euro, todayBerlin } from "../lib/format";
import { gewaehrleistungChatNachricht, hatWiderrufsrecht } from "../lib/legal";
import type { Invoice, Part, Sale } from "../lib/types";
import { CopyButton, Link, Notice, useAction, useApp, useData } from "../ui";

export function SalesList() {
  const { data } = useData(async () => {
    const [sales, invoices] = await Promise.all([all<Sale>("sales"), all<Invoice>("invoices")]);
    return { sales: sales.sort((a, b) => b.id - a.id), invoices };
  });
  return (
    <>
      <div className="spread">
        <h1>Verkäufe</h1>
        <Link className="btn" to="/verkaeufe/neu">+ Verkauf</Link>
      </div>
      <Notice />
      {data?.sales.length === 0 && <p className="muted">Noch keine Verkäufe erfasst.</p>}
      <div className="card list">
        {data?.sales.map((s) => {
          const invs = data.invoices.filter((i) => i.sale_id === s.id);
          const rechnung = invs.find((i) => i.kind === "rechnung");
          const storniert = invs.some((i) => i.kind === "storno");
          const total = s.items.reduce((a, i) => a + i.price_cents * i.quantity, 0) + s.shipping_cents;
          return (
            <Link key={s.id} to={`/verkaeufe/${s.id}`} className="listrow">
              <span>
                <strong>#{s.id} {s.buyer_name}</strong>
                <span className="muted small block">{date(s.sale_date)} · {s.delivery === "versand" ? "Versand" : "Abholung"} · {euro(total)}</span>
              </span>
              <span className={`badge ${!rechnung ? "reserviert" : storniert ? "" : "lager"}`}>
                {!rechnung ? "ohne Rechnung" : storniert ? "storniert" : rechnung.number}
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export function NewSale({ preselect }: { preselect: number | null }) {
  const { go } = useApp();
  const { busy, run } = useAction();
  const [selected, setSelected] = useState<Set<number>>(new Set(preselect ? [preselect] : []));
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [delivery, setDelivery] = useState<"versand" | "abholung">("versand");
  const [channel, setChannel] = useState<"chat" | "vor_ort">("chat");
  const [shortened, setShortened] = useState(false);
  const { data } = useData(async () => {
    const [parts, settings] = await Promise.all([all<Part>("parts"), loadSettings()]);
    return { parts: sortStock(parts.filter((p) => p.status !== "verkauft")), settings };
  });
  const parts = data?.parts ?? [];
  const priceOf = (p: Part) => prices[p.id] ?? (p.price_cents / 100).toFixed(2).replace(".", ",");
  const chosen = parts.filter((p) => selected.has(p.id));
  const chat = useMemo(
    () => gewaehrleistungChatNachricht(chosen.map((p) => `${p.title}${p.fits_brand ? ` (passend für ${p.fits_brand})` : ""}, ${priceOf(p)} €`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chosen.map((p) => p.id).join(","), prices],
  );
  const widerruf = delivery === "versand" || channel === "chat";
  if (!data) return null;

  return (
    <>
      <h1>Verkauf erfassen</h1>
      <Notice />
      <form onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const s = (k: string) => String(fd.get(k) ?? "");
        void run(async () => {
          const id = await createSale({
            partPrices: chosen.map((p) => ({ partId: p.id, price: priceOf(p) })),
            buyer_name: s("buyer_name"), buyer_street: s("buyer_street"), buyer_zip: s("buyer_zip"), buyer_city: s("buyer_city"),
            buyer_email: s("buyer_email"), buyer_platform_name: s("buyer_platform_name"),
            delivery, contract_channel: delivery === "versand" ? "chat" : channel, shipping: s("shipping"), sale_date: s("sale_date"),
            warranty_shortened: shortened, warranty_informed_at: s("warranty_informed_at"), warranty_agreed_at: s("warranty_agreed_at"),
            warranty_evidence: s("warranty_evidence"), notes: s("notes"),
          });
          go(`/verkaeufe/${id}`, { ok: "Verkauf gespeichert." });
        });
      }}>
        <fieldset>
          <legend>Teile</legend>
          {parts.length === 0 && <p className="muted">Keine verfügbaren Teile im Lager.</p>}
          {parts.map((p) => (
            <div className="salepart" key={p.id}>
              <label className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={selected.has(p.id)} onChange={(e) => {
                  const n = new Set(selected);
                  if (e.target.checked) n.add(p.id); else n.delete(p.id);
                  setSelected(n);
                }} />
                <span>
                  {p.part_number && `#${p.part_number} `}{p.title}{p.fits_brand && ` (passend für ${p.fits_brand})`}
                  <span className="hint block">{p.storage_location || "kein Lagerplatz"}{p.status === "reserviert" && " · reserviert"}</span>
                </span>
              </label>
              <input type="text" inputMode="decimal" aria-label={`Preis für Teil ${p.id}`} value={priceOf(p)}
                onChange={(e) => setPrices({ ...prices, [p.id]: e.target.value })} />
            </div>
          ))}
        </fieldset>

        <fieldset>
          <legend>Übergabe und Vertragsschluss</legend>
          <div className="row" style={{ marginBottom: 8 }}>
            <label className="check"><input type="radio" name="delivery" checked={delivery === "versand"}
              onChange={() => { setDelivery("versand"); setChannel("chat"); }} /> Versand</label>
            <label className="check"><input type="radio" name="delivery" checked={delivery === "abholung"}
              onChange={() => setDelivery("abholung")} /> Abholung</label>
          </div>
          {delivery === "abholung" && (
            <div className="field">
              <label>Wann kam der Kauf verbindlich zustande?</label>
              <label className="check"><input type="radio" name="contract_channel" checked={channel === "chat"} onChange={() => setChannel("chat")} />
                <span>Vorher im Chat verbindlich geeinigt (z. B. „Ich nehme es, hole Samstag ab“) → Widerrufsrecht gilt</span></label>
              <label className="check"><input type="radio" name="contract_channel" checked={channel === "vor_ort"} onChange={() => setChannel("vor_ort")} />
                <span>Erst vor Ort nach Besichtigung gekauft (im Chat nur Termin vereinbart) → kein Widerrufsrecht</span></label>
            </div>
          )}
          <div className={`notice ${widerruf ? "warn" : "ok"}`}>
            {widerruf
              ? "Fernabsatzvertrag: Der Käufer hat 14 Tage Widerrufsrecht. Belehrung und Formular werden der Rechnung als Seite 2 beigefügt."
              : "Kauf vor Ort: kein Widerrufsrecht. Gewährleistung gilt trotzdem."}
          </div>
          {delivery === "versand" && !data.settings.lucid_number && (
            <div className="notice err">
              Verpackungsregister LUCID noch nicht geklärt. Prüfe vor dem Versand, ob du für deine Verpackungen als Hersteller giltst,
              und trage in den Einstellungen deine Nummer oder „nicht erforderlich“ ein.
            </div>
          )}
          <div className="grid">
            <div className="field"><label htmlFor="sale_date">Liefer-/Übergabedatum</label>
              <input id="sale_date" type="date" name="sale_date" defaultValue={todayBerlin()} required /></div>
            {delivery === "versand" && (
              <div className="field"><label htmlFor="shipping">Versandkosten (€)</label>
                <input id="shipping" type="text" inputMode="decimal" name="shipping" defaultValue="0" /></div>
            )}
          </div>
        </fieldset>

        <fieldset>
          <legend>Käufer</legend>
          <div className="grid">
            <div className="field"><label htmlFor="buyer_name">Name *</label><input id="buyer_name" type="text" name="buyer_name" required autoComplete="off" /></div>
            <div className="field"><label htmlFor="buyer_platform_name">Name bei Kleinanzeigen</label><input id="buyer_platform_name" type="text" name="buyer_platform_name" autoComplete="off" /></div>
            <div className="field"><label htmlFor="buyer_email">E-Mail</label><input id="buyer_email" type="email" name="buyer_email" autoComplete="off" /></div>
            <div className="field"><label htmlFor="buyer_street">Straße, Nr.{delivery === "versand" && " *"}</label><input id="buyer_street" type="text" name="buyer_street" required={delivery === "versand"} autoComplete="off" /></div>
            <div className="field"><label htmlFor="buyer_zip">PLZ{delivery === "versand" && " *"}</label><input id="buyer_zip" type="text" inputMode="numeric" name="buyer_zip" required={delivery === "versand"} autoComplete="off" /></div>
            <div className="field"><label htmlFor="buyer_city">Ort{delivery === "versand" && " *"}</label><input id="buyer_city" type="text" name="buyer_city" required={delivery === "versand"} autoComplete="off" /></div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Gewährleistung</legend>
          <label className="check">
            <input type="checkbox" checked={shortened} onChange={(e) => setShortened(e.target.checked)} />
            <span>Auf <strong>1 Jahr</strong> verkürzt – Käufer wurde vor seiner Kaufzusage eigens informiert und hat ausdrücklich, gesondert zugestimmt (§ 476 Abs. 2 BGB)</span>
          </label>
          {!shortened && <p className="hint">Ohne Haken gelten die gesetzlichen 2 Jahre. Das ist immer zulässig.</p>}
          {shortened && (
            <>
              <div className="notice warn" style={{ marginTop: 8 }}>
                Nur ankreuzen, wenn die Zustimmung schriftlich vorliegt (Chat-Screenshot sichern). Ein Satz in der Anzeige oder auf der Rechnung allein reicht nicht.
              </div>
              <div className="grid">
                <div className="field"><label htmlFor="wi">Hinweis gesendet am</label><input id="wi" type="datetime-local" name="warranty_informed_at" required /></div>
                <div className="field"><label htmlFor="wa">Zustimmung erhalten am</label><input id="wa" type="datetime-local" name="warranty_agreed_at" required /></div>
              </div>
              <div className="field"><label htmlFor="we">Nachweis</label>
                <input id="we" type="text" name="warranty_evidence" required placeholder="z. B. Kleinanzeigen-Chat, Käufer: „Einverstanden: 1 Jahr Gewährleistung“, Screenshot gespeichert" /></div>
            </>
          )}
          <div style={{ marginTop: 8 }}>
            <WarrantyDocument
              getItems={() => chosen.map(itemDescription)}
              getBuyer={() => (document.getElementById("buyer_name") as HTMLInputElement | null)?.value ?? ""}
            />
            <p className="hint">Eigenes Dokument für die Vereinbarung: Vor der Kaufzusage senden oder vor Ort unterschreiben lassen, nicht als Teil des Kaufvertrags.</p>
          </div>
          <details style={{ marginTop: 8 }}>
            <summary>Chat-Nachricht zum Vereinbaren anzeigen</summary>
            <div className="spread" style={{ marginTop: 8 }}><span className="hint">Vor der Kaufzusage als eigene Nachricht senden.</span><CopyButton text={chat} label="Nachricht kopieren" /></div>
            <pre className="box">{chat}</pre>
          </details>
        </fieldset>

        <div className="field"><label htmlFor="notes">Notizen (intern)</label><textarea id="notes" name="notes" /></div>
        <button type="submit" className="wide" disabled={busy}>Verkauf speichern</button>
      </form>
    </>
  );
}

export function SaleDetail({ id }: { id: number }) {
  const { go, show } = useApp();
  const { busy, run } = useAction();
  const [reason, setReason] = useState("");
  const [backToStock, setBackToStock] = useState(true);
  const [justIssued, setJustIssued] = useState<number | null>(null);
  const { data, reload } = useData(async () => {
    const [sale, invoices] = await Promise.all([get<Sale>("sales", id), byIndex<Invoice>("invoices", "sale_id", id)]);
    return { sale, invoices: invoices.sort((a, b) => a.id - b.id) };
  }, [id]);
  if (!data) return null;
  const { sale, invoices } = data;
  if (!sale) return <><h1>Verkauf nicht gefunden</h1><Link to="/verkaeufe">Zurück zur Liste</Link></>;

  const cancelled = new Set(invoices.filter((i) => i.cancels_invoice_id).map((i) => i.cancels_invoice_id));
  const active = invoices.find((i) => i.kind === "rechnung" && !cancelled.has(i.id));
  const total = sale.items.reduce((a, i) => a + i.price_cents * i.quantity, 0) + sale.shipping_cents;
  const widerruf = hatWiderrufsrecht(sale.contract_channel);
  const fresh = invoices.find((i) => i.id === justIssued);

  const savePdf = async (inv: Invoice) => {
    try {
      const r = await saveFile(pdfFile(inv.pdf, inv.number));
      if (r !== "cancelled" && inv.id === justIssued) setJustIssued(null);
    } catch (e) {
      show({ fehler: (e as Error).message });
    }
  };

  return (
    <>
      <p className="back"><Link to="/verkaeufe">‹ Verkäufe</Link></p>
      <h1>Verkauf #{sale.id}</h1>
      <Notice />

      {fresh && (
        <div className="notice warn">
          <strong>{fresh.kind === "storno" ? "Storno" : "Rechnung"} {fresh.number} erstellt.</strong> Sichere das PDF jetzt außerhalb der App,
          zum Beispiel über „In Dateien sichern“ in iCloud Drive.
          <button type="button" className="wide" style={{ marginTop: 8 }} onClick={() => void savePdf(fresh)}>PDF jetzt sichern</button>
        </div>
      )}

      {invoices.length === 0 && (
        <button type="button" className="wide" style={{ marginBottom: 12 }} disabled={busy} onClick={() => {
          if (!window.confirm("Rechnung jetzt erzeugen? Sie erhält eine fortlaufende Nummer und kann danach nicht mehr geändert, nur storniert werden.")) return;
          void run(async () => {
            setJustIssued(await createInvoice(sale.id));
            reload();
          });
        }}>{busy ? "Rechnung wird erzeugt …" : "Rechnung erzeugen"}</button>
      )}

      <div className="card">
        <strong>{sale.buyer_name}</strong>{sale.buyer_platform_name && <span className="muted"> ({sale.buyer_platform_name})</span>}
        {sale.buyer_street && <div>{sale.buyer_street}</div>}
        {(sale.buyer_zip || sale.buyer_city) && <div>{sale.buyer_zip} {sale.buyer_city}</div>}
        {sale.buyer_email && <div>{sale.buyer_email}</div>}
        <hr />
        <div>{sale.delivery === "versand" ? "Versand" : "Abholung"} am {date(sale.sale_date)}</div>
        <div>Vertrag: {sale.contract_channel === "chat" ? "per Chat (Fernabsatz)" : "vor Ort nach Besichtigung"}</div>
        <div>Gewährleistung: {sale.warranty_shortened ? "1 Jahr (gesondert vereinbart)" : "2 Jahre (gesetzlich)"}</div>
      </div>

      <div className={`notice ${widerruf ? "warn" : "ok"}`}>
        {widerruf ? (
          <>Widerrufsrecht 14 Tage ab Erhalt der Ware durch den Käufer
            {sale.delivery === "abholung"
              ? <> – bei Abholung am {date(sale.sale_date)} also bis einschließlich {date(addDays(sale.sale_date, 14))}.</>
              : <> (Zustelldatum laut Sendungsverfolgung; bei Versand am {date(sale.sale_date)} frühestens bis {date(addDays(sale.sale_date, 15))}).</>}
          </>
        ) : "Kein Widerrufsrecht (Kauf vor Ort nach Besichtigung)."}
      </div>

      {sale.warranty_shortened && (
        <div className="card">
          <strong>Nachweis Gewährleistungsverkürzung</strong>
          <div>Hinweis gesendet: {dateTime(sale.warranty_informed_at)} · Zustimmung: {dateTime(sale.warranty_agreed_at)}</div>
          <div className="muted">{sale.warranty_evidence}</div>
        </div>
      )}

      <div className="card">
        <table>
          <thead><tr><th>Artikel</th><th className="num">Menge</th><th className="num">Preis</th></tr></thead>
          <tbody>
            {sale.items.map((i, n) => (
              <tr key={n}>
                <td>{i.part_id ? <Link to={`/teile/${i.part_id}`}>{i.description}</Link> : i.description}</td>
                <td className="num">{i.quantity}</td>
                <td className="num">{euro(i.price_cents * i.quantity)}</td>
              </tr>
            ))}
            {sale.shipping_cents > 0 && <tr><td>Versandkosten</td><td className="num">1</td><td className="num">{euro(sale.shipping_cents)}</td></tr>}
            <tr><th>Gesamt</th><th /><th className="num">{euro(total)}</th></tr>
          </tbody>
        </table>
        {sale.notes && <p className="muted">{sale.notes}</p>}
      </div>

      <h2>Nachweise und Dokumente</h2>
      <Documents owner={`sale:${sale.id}`} locked={invoices.length > 0}
        hint={sale.warranty_shortened
          ? "Lege hier den Chat-Screenshot oder die unterschriebene Vereinbarung ab. Ab der ersten Rechnung lassen sich Dokumente nicht mehr löschen."
          : "Zum Beispiel Kaufvertrag oder Übergabeprotokoll. Ab der ersten Rechnung lassen sich Dokumente nicht mehr löschen."} />

      <h2>Rechnungen</h2>
      <div className="card">
        {invoices.length === 0 && <p className="muted">Noch keine Rechnung. Daten prüfen, dann „Rechnung erzeugen“.</p>}
        {invoices.map((inv) => (
          <div key={inv.id} className="listrow invrow">
            <span>
              <strong>{inv.kind === "storno" ? "Storno " : "Rechnung "}{inv.number}</strong>
              {cancelled.has(inv.id) && <span className="badge" style={{ marginLeft: 6 }}>storniert</span>}
              <span className="muted small block">{dateTime(inv.issued_at)} · {euro(inv.total_cents)}</span>
            </span>
            <button type="button" className="secondary small" onClick={() => void savePdf(inv)}>PDF</button>
          </div>
        ))}
        {active && (
          <details style={{ marginTop: 12 }}>
            <summary>Rechnung {active.number} stornieren (z. B. bei Widerruf oder Fehler)</summary>
            <div style={{ marginTop: 8 }}>
              <div className="field"><label htmlFor="reason">Grund</label>
                <input id="reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="z. B. Widerruf vom 12.11.2026, Ware zurück" /></div>
              <label className="check"><input type="checkbox" checked={backToStock} onChange={(e) => setBackToStock(e.target.checked)} /> Teile wieder ins Lager buchen</label>
              <button type="button" className="danger wide" disabled={busy} onClick={() => {
                if (!window.confirm("Stornorechnung erzeugen? Das kann nicht rückgängig gemacht werden.")) return;
                void run(async () => {
                  setJustIssued(await cancelInvoice(active.id, reason, backToStock));
                  setReason("");
                  reload();
                });
              }}>Stornorechnung erzeugen</button>
            </div>
            <p className="hint">Die Originalrechnung bleibt unverändert archiviert. Für eine korrigierte Rechnung danach einen neuen Verkauf erfassen.</p>
          </details>
        )}
      </div>

      {invoices.length === 0 && (
        <button type="button" className="danger wide" disabled={busy} onClick={() => {
          if (!window.confirm("Verkauf löschen? Reservierte Teile gehen zurück ins Lager.")) return;
          void run(async () => { await deleteSale(sale.id); go("/verkaeufe", { ok: "Verkauf gelöscht." }); });
        }}>Verkauf löschen</button>
      )}
    </>
  );
}
