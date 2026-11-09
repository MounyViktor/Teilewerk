import { useState, type FormEvent } from "react";
import { adText, adTitle } from "../lib/adtext";
import {
  addPhotos, createPart, deletePart, deletePhoto, loadSettings, sortStock, updatePart, type NewPhoto, type PartInput,
} from "../lib/business";
import { all, byIndex, get } from "../lib/db";
import { saveFile } from "../lib/device";
import { date, dateTime, euro } from "../lib/format";
import { gewaehrleistungChatNachricht } from "../lib/legal";
import { CONDITION_LABEL, STATUS_LABEL, type Condition, type Part, type PartStatus, type Photo, type Sale, type Vehicle } from "../lib/types";
import { CopyButton, JpegImage, Link, Notice, PhotoPicker, useAction, useApp, useData } from "../ui";
import { Documents } from "./Documents";

export function PartsList({ initialStatus }: { initialStatus: string }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [art, setArt] = useState("alle");
  const { data } = useData(async () => {
    const [parts, photos] = await Promise.all([all<Part>("parts"), all<Photo>("photos")]);
    const firstPhoto = new Map<number, Photo>();
    for (const ph of [...photos].sort((a, b) => a.sort_order - b.sort_order)) {
      if (!firstPhoto.has(ph.part_id)) firstPhoto.set(ph.part_id, ph);
    }
    return { parts, firstPhoto };
  });
  const needle = q.trim().toLowerCase();
  const list = sortStock(data?.parts ?? [])
    .filter((p) => status === "alle" || p.status === status)
    .filter((p) => art === "alle" || (p.kind ?? "teil") === art)
    .filter((p) => !needle || [p.title, p.fits_brand, p.fits_model, p.part_number, p.storage_location, p.vehicle?.fin ?? "", p.vehicle?.plate ?? ""]
      .some((v) => v.toLowerCase().includes(needle)));
  return (
    <>
      <div className="spread">
        <h1>Lager</h1>
        <div className="row">
          <Link className="btn secondary" to="/teile/neu?art=roller">+ Roller</Link>
          <Link className="btn" to="/teile/neu">+ Teil</Link>
        </div>
      </div>
      <Notice />
      <div className="filters">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nummer, Bezeichnung, Marke, FIN, Lagerplatz" aria-label="Suche" />
        <select value={art} onChange={(e) => setArt(e.target.value)} aria-label="Art">
          <option value="alle">Alle Arten</option>
          <option value="roller">Roller</option>
          <option value="teil">Teile</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="alle">Jeder Status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {data && list.length === 0 && (
        <p className="muted">{data.parts.length ? "Nichts gefunden." : "Noch nichts erfasst. Tippe auf „+ Roller“ oder „+ Teil“."}</p>
      )}
      <div className="partgrid">
        {list.map((p) => {
          const ph = data!.firstPhoto.get(p.id);
          return (
            <Link key={p.id} to={`/teile/${p.id}`} className="card plain partcard">
              {ph ? <JpegImage data={ph.thumb} alt="" /> : <div className="noimg">kein Foto</div>}
              <strong>{p.title}</strong>
              <div>{euro(p.price_cents)}</div>
              <div className="muted small">{[
                p.part_number && `#${p.part_number}`,
                p.kind === "roller" ? p.vehicle?.km && `${p.vehicle.km} km` : p.fits_brand && `passend für ${p.fits_brand}`,
              ].filter(Boolean).join(" · ")}</div>
              <div className="muted small">{p.storage_location || (p.kind === "roller" ? "kein Standort" : "kein Lagerplatz")}</div>
              {p.kind === "roller" && <span className="badge" style={{ marginRight: 4 }}>Roller</span>}
              <span className={`badge ${p.status}`}>{STATUS_LABEL[p.status]}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}

function readPartForm(e: FormEvent<HTMLFormElement>): PartInput {
  const fd = new FormData(e.currentTarget);
  const s = (k: string) => String(fd.get(k) ?? "");
  return {
    title: s("title"), fits_brand: s("fits_brand"), fits_model: s("fits_model"), part_number: s("part_number"), material: s("material"),
    color: s("color"), condition: s("condition") as Condition, defects: s("defects"), description: s("description"), price: s("price"),
    storage_location: s("storage_location"), status: (s("status") || undefined) as PartStatus | undefined,
    kind: s("kind") === "roller" ? "roller" : "teil",
    vehicle: {
      fin: s("fin"), plate: s("plate"), first_registration: s("first_registration"), km: s("km"), ccm: s("ccm"), power: s("power"),
      keys: s("keys"), papers: s("papers"), purchase_date: s("purchase_date"), purchase_price: s("purchase_price"),
    },
  };
}

function VehicleFields({ vehicle: v }: { vehicle?: Vehicle }) {
  const purchase = v?.purchase_cents != null ? (v.purchase_cents / 100).toFixed(2).replace(".", ",") : "";
  return (
    <fieldset>
      <legend>Fahrzeugdaten</legend>
      <div className="field"><label htmlFor="fin">Fahrzeug-Ident-Nr. (FIN)</label>
        <input id="fin" name="fin" type="text" autoCapitalize="characters" autoComplete="off" defaultValue={v?.fin} /></div>
      <div className="grid">
        <div className="field"><label htmlFor="plate">Kennzeichen</label>
          <input id="plate" name="plate" type="text" autoCapitalize="characters" autoComplete="off" defaultValue={v?.plate} /></div>
        <div className="field"><label htmlFor="first_registration">Erstzulassung</label>
          <input id="first_registration" name="first_registration" type="text" defaultValue={v?.first_registration} placeholder="08.2003" /></div>
        <div className="field"><label htmlFor="km">Kilometerstand</label>
          <input id="km" name="km" type="text" inputMode="numeric" defaultValue={v?.km} /></div>
        <div className="field"><label htmlFor="ccm">Hubraum (ccm)</label>
          <input id="ccm" name="ccm" type="text" inputMode="numeric" defaultValue={v?.ccm} placeholder="49" /></div>
        <div className="field"><label htmlFor="power">Leistung</label>
          <input id="power" name="power" type="text" defaultValue={v?.power} placeholder="3 PS" /></div>
        <div className="field"><label htmlFor="keys">Schlüssel</label>
          <input id="keys" name="keys" type="text" inputMode="numeric" defaultValue={v?.keys} /></div>
      </div>
      <div className="field"><label htmlFor="papers">Papiere</label>
        <input id="papers" name="papers" type="text" defaultValue={v?.papers} placeholder="z. B. Betriebserlaubnis, Fahrzeugbrief" /></div>
      <div className="grid">
        <div className="field"><label htmlFor="purchase_date">Ankauf am <span className="hint">– intern</span></label>
          <input id="purchase_date" name="purchase_date" type="date" defaultValue={v?.purchase_date} /></div>
        <div className="field"><label htmlFor="purchase_price">Ankaufspreis (€) <span className="hint">– intern</span></label>
          <input id="purchase_price" name="purchase_price" type="text" inputMode="decimal" defaultValue={purchase} /></div>
      </div>
    </fieldset>
  );
}

function PartFields({ part: p, kind }: { part?: Part; kind: "teil" | "roller" }) {
  const price = p ? (p.price_cents / 100).toFixed(2).replace(".", ",") : "";
  const roller = kind === "roller";
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <div className="field"><label htmlFor="title">{roller ? "Marke und Modell *" : "Bezeichnung *"}</label>
        <input id="title" name="title" type="text" required defaultValue={p?.title} placeholder={roller ? "z. B. Kymco KB 50" : "z. B. Frontabdeckung"} /></div>
      {roller && <VehicleFields vehicle={p?.vehicle} />}
      <div className="grid">
        <div className="field"><label htmlFor="price">Preis (€) *</label>
          <input id="price" name="price" type="text" inputMode="decimal" required defaultValue={price} placeholder="35,00" /></div>
        <div className="field"><label htmlFor="condition">Zustand *</label>
          <select id="condition" name="condition" defaultValue={p?.condition ?? "gebraucht"}>
            {Object.entries(CONDITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        {roller && <input type="hidden" name="part_number" value={p?.part_number ?? ""} />}
        {!roller && (
          <>
            <div className="field"><label htmlFor="part_number">Teilenummer</label>
              <input id="part_number" name="part_number" type="text" autoComplete="off" defaultValue={p?.part_number} /></div>
            <div className="field"><label htmlFor="fits_brand">Passend für (Marke)</label>
              <input id="fits_brand" name="fits_brand" type="text" defaultValue={p?.fits_brand} placeholder="z. B. Yuanjia" /></div>
            <div className="field"><label htmlFor="fits_model">Modell</label>
              <input id="fits_model" name="fits_model" type="text" defaultValue={p?.fits_model} /></div>
            <div className="field"><label htmlFor="material">Material</label>
              <input id="material" name="material" type="text" list="materials" defaultValue={p?.material} placeholder="ABS, PP …" />
              <datalist id="materials">
                {["ABS", "PP", "PA", "PC", "Gummi", "Stahl", "Aluminium"].map((m) => <option key={m} value={m} />)}
              </datalist></div>
          </>
        )}
        <div className="field"><label htmlFor="storage_location">{roller ? "Standort" : "Lagerplatz"}</label>
          <input id="storage_location" name="storage_location" type="text" defaultValue={p?.storage_location} placeholder={roller ? "z. B. Halle, Stellplatz 3" : "Regal A, Fach 2"} /></div>
        <div className="field"><label htmlFor="color">Farbe</label>
          <input id="color" name="color" type="text" defaultValue={p?.color} /></div>
        {p && (
          <div className="field"><label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={p.status}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
        )}
      </div>
      <div className="field"><label htmlFor="defects">Bekannte Mängel <span className="hint">– ehrlich und konkret (Ort, Größe, Art). Leer = keine bekannt.</span></label>
        <textarea id="defects" name="defects" defaultValue={p?.defects} placeholder="z. B. Kratzer rechts ca. 3 cm, Halteöse unten links gebrochen" /></div>
      <div className="field"><label htmlFor="description">Beschreibung</label>
        <textarea id="description" name="description" defaultValue={p?.description} /></div>
    </>
  );
}

export function NewPart({ kind }: { kind: "teil" | "roller" }) {
  const { go } = useApp();
  const { busy, run } = useAction();
  const [photos, setPhotos] = useState<NewPhoto[]>([]);
  const [processing, setProcessing] = useState(false);
  return (
    <>
      <h1>{kind === "roller" ? "Roller erfassen" : "Teil erfassen"}</h1>
      <Notice />
      <form className="card" onSubmit={(e) => {
        e.preventDefault();
        if (processing) return; // Sonst würde das Teil ohne die gerade verarbeiteten Fotos gespeichert.
        const input = readPartForm(e);
        void run(async () => {
          const id = await createPart(input, photos);
          const what = kind === "roller" ? "Roller" : "Teil";
          go(`/teile/${id}`, { ok: photos.length ? `${what} angelegt, ${photos.length} Foto(s) ohne Standort-/EXIF-Daten gespeichert.` : `${what} angelegt.` });
        });
      }}>
        <div className="field">
          <label>Fotos <span className="hint">– Standort (GPS) und alle EXIF-Daten werden vor dem Speichern entfernt.</span></label>
          <PhotoPicker onWorking={setProcessing} onPhotos={(p) => setPhotos((old) => [...old, ...p])} />
          {photos.length > 0 && (
            <div className="thumbs" style={{ marginTop: 8 }}>
              {photos.map((p, i) => (
                <div key={i}>
                  <JpegImage data={p.thumb} />
                  <button type="button" className="danger small" onClick={() => setPhotos(photos.filter((_, n) => n !== i))} aria-label="Foto entfernen">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <PartFields kind={kind} />
        <button type="submit" className="wide" disabled={busy || processing}>{processing ? "Fotos werden verarbeitet …" : "Speichern"}</button>
      </form>
    </>
  );
}

export function PartDetail({ id }: { id: number }) {
  const { go, show } = useApp();
  const { busy, run } = useAction();
  const { data, reload } = useData(async () => {
    const [part, photos, settings, sales] = await Promise.all([
      get<Part>("parts", id), byIndex<Photo>("photos", "part_id", id), loadSettings(), all<Sale>("sales"),
    ]);
    return {
      part, settings,
      photos: photos.sort((a, b) => a.sort_order - b.sort_order),
      sales: sales.filter((s) => s.items.some((i) => i.part_id === id)).sort((a, b) => b.id - a.id),
    };
  }, [id]);
  if (!data) return null;
  const { part, photos, settings, sales } = data;
  if (!part) return <><h1>Teil nicht gefunden</h1><Link to="/teile">Zurück zur Liste</Link></>;

  const title = adTitle(part);
  const text = adText(part, { versand: true, abholungOrt: settings.zip && settings.city ? `${settings.zip} ${settings.city}` : undefined });
  const chat = gewaehrleistungChatNachricht([`${part.title}${part.fits_brand ? ` (passend für ${part.fits_brand})` : ""}, ${euro(part.price_cents)}`]);

  const sharePhoto = async (ph: Photo) => {
    const d = await get<{ id: number; data: ArrayBuffer }>("photo_data", ph.id);
    if (!d) return;
    try {
      await saveFile(new File([d.data], `teil-${part.id}-${ph.id}.jpg`, { type: "image/jpeg" }));
    } catch (e) {
      show({ fehler: (e as Error).message });
    }
  };

  return (
    <>
      <p className="back"><Link to="/teile">‹ Lager</Link></p>
      <h1>{part.part_number && `#${part.part_number} `}{part.title}</h1>
      <Notice />
      <div className="row" style={{ marginBottom: 12 }}>
        <span className={`badge ${part.status}`}>{STATUS_LABEL[part.status]}</span>
        {part.status !== "verkauft" && <Link className="btn" to={`/verkaeufe/neu?teil=${part.id}`}>Verkauf erfassen</Link>}
      </div>

      <div className="card">
        <div className="stat">{euro(part.price_cents)}</div>
        <div className="muted">{CONDITION_LABEL[part.condition]}{part.material && ` · ${part.material}`}{part.color && ` · ${part.color}`}</div>
        <div>{part.kind === "roller" ? "Standort" : "Lagerplatz"}: <strong>{part.storage_location || "–"}</strong></div>
        {part.kind === "roller" && part.vehicle && (
          <>
            {part.vehicle.fin && <div>FIN: <strong>{part.vehicle.fin}</strong></div>}
            {part.vehicle.plate && <div>Kennzeichen: <strong>{part.vehicle.plate}</strong></div>}
            {part.vehicle.first_registration && <div>Erstzulassung: <strong>{part.vehicle.first_registration}</strong></div>}
            {part.vehicle.km && <div>Kilometerstand: <strong>{part.vehicle.km}</strong></div>}
            {part.vehicle.purchase_cents != null && (
              <div className="muted small">
                Ankauf{part.vehicle.purchase_date ? ` am ${date(part.vehicle.purchase_date)}` : ""}: {euro(part.vehicle.purchase_cents)} (intern)
              </div>
            )}
          </>
        )}
        <div className="muted small">Erfasst {dateTime(part.created_at)}</div>
        {part.defects && <p><strong>Mängel:</strong> {part.defects}</p>}
        {sales.length > 0 && <p>Verkäufe: {sales.map((s) => <span key={s.id} style={{ marginRight: 8 }}><Link to={`/verkaeufe/${s.id}`}>#{s.id} {s.buyer_name}</Link></span>)}</p>}
      </div>

      <h2>Fotos</h2>
      <div className="card">
        {photos.length === 0 && <p className="muted">Noch keine Fotos.</p>}
        <div className="thumbs">
          {photos.map((ph) => (
            <div key={ph.id}>
              <JpegImage data={ph.thumb} />
              <div className="row photobar">
                <button type="button" className="secondary small" onClick={() => void sharePhoto(ph)}>Sichern</button>
                <button type="button" className="danger small" aria-label="Foto löschen" onClick={() => {
                  if (!window.confirm("Foto löschen?")) return;
                  void run(async () => { await deletePhoto(part.id, ph.id); reload(); });
                }}>✕</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <PhotoPicker busy={busy} onPhotos={(p) => run(async () => {
            await addPhotos(part.id, p);
            show({ ok: `${p.length} Foto(s) gespeichert (Standort-/EXIF-Daten entfernt).` });
            reload();
          })} />
        </div>
      </div>

      <h2>Dokumente</h2>
      <Documents owner={`part:${part.id}`} hint={part.kind === "roller" ? "Zum Beispiel Papiere, Gutachten oder Ankaufbeleg." : undefined} />

      <h2>Anzeigentext für Kleinanzeigen</h2>
      <div className="card">
        <div className="field">
          <div className="spread"><label>Titel</label><CopyButton text={title} label="Titel kopieren" /></div>
          <pre className="box">{title}</pre>
        </div>
        <div className="field">
          <div className="spread"><label>Beschreibung</label><CopyButton text={text} label="Text kopieren" /></div>
          <pre className="box">{text}</pre>
        </div>
        <p className="hint">Marke nur als „passend für …“, keine Logos verwenden. Die Fotos oben sind bereits ohne Standortdaten und können direkt hochgeladen werden.</p>
      </div>

      <h2>Chat-Nachricht: 1 Jahr Gewährleistung vereinbaren</h2>
      <div className="card">
        <div className="notice warn">
          Diese Nachricht <strong>vor</strong> der verbindlichen Kaufzusage als eigene Nachricht schicken. Erst wenn der Käufer
          ausdrücklich zustimmt, gilt die Verkürzung. Ohne Zustimmung: gesetzliche 2 Jahre. Zustimmung als Screenshot sichern.
        </div>
        <div className="spread"><span /><CopyButton text={chat} label="Nachricht kopieren" /></div>
        <pre className="box">{chat}</pre>
      </div>

      <h2>Bearbeiten</h2>
      <form className="card" key={part.updated_at} onSubmit={(e) => {
        e.preventDefault();
        const input = readPartForm(e);
        void run(async () => { await updatePart(part.id, input); show({ ok: "Gespeichert." }); reload(); });
      }}>
        <PartFields part={part} kind={part.kind ?? "teil"} />
        <button type="submit" className="wide" disabled={busy}>Speichern</button>
      </form>

      {sales.length === 0 && (
        <button type="button" className="danger wide" disabled={busy} onClick={() => {
          const what = part.kind === "roller" ? "Roller" : "Teil";
          if (!window.confirm(`${what} samt Fotos und Dokumenten endgültig löschen?`)) return;
          void run(async () => { await deletePart(part.id); go("/teile", { ok: `${what} gelöscht.` }); });
        }}>{part.kind === "roller" ? "Roller löschen" : "Teil löschen"}</button>
      )}
    </>
  );
}
