import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { copyText, processPhoto } from "./lib/device";
import type { NewPhoto } from "./lib/business";

// --- Navigation über den Teil der Adresse hinter "#": funktioniert offline und in jedem Unterordner ---

export function useRoute() {
  const read = () => window.location.hash.slice(1) || "/";
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

// --- Hinweise, die den Seitenwechsel überstehen ---

export interface Flash { ok?: string; fehler?: string }
const FlashContext = createContext<{ flash: Flash; go: (path: string, f?: Flash) => void; show: (f: Flash) => void }>({
  flash: {}, go: () => undefined, show: () => undefined,
});
export const useApp = () => useContext(FlashContext);

export function AppProvider({ route, children }: { route: string; children: ReactNode }) {
  const [state, setState] = useState<{ route: string; flash: Flash }>({ route, flash: {} });
  const flash = state.route === route ? state.flash : {};
  const go = useCallback((path: string, f: Flash = {}) => {
    setState({ route: path, flash: f });
    window.location.hash = path;
  }, []);
  const show = useCallback((f: Flash) => {
    setState({ route: window.location.hash.slice(1) || "/", flash: f });
    window.scrollTo(0, 0);
  }, []);
  return <FlashContext.Provider value={{ flash, go, show }}>{children}</FlashContext.Provider>;
}

export function Notice() {
  const { flash } = useApp();
  return (
    <>
      {flash.fehler && <div className="notice err" role="alert">{flash.fehler}</div>}
      {flash.ok && <div className="notice ok" role="status">{flash.ok}</div>}
    </>
  );
}

// --- Daten laden ---

export function useData<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | undefined; reload: () => void } {
  const [data, setData] = useState<T>();
  const [tick, setTick] = useState(0);
  const { show } = useApp();
  useEffect(() => {
    let alive = true;
    load().then((d) => { if (alive) setData(d); }).catch((e) => { if (alive) show({ fehler: (e as Error).message }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** Führt eine Aktion aus und zeigt Fehler als Hinweis an, statt sie zu verschlucken. */
export function useAction() {
  const { show } = useApp();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      show({ fehler: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [show]);
  return { busy, run };
}

// --- Bausteine ---

export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return <a href={`#${to}`} className={className}>{children}</a>;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  return (
    <button type="button" className="secondary small" onClick={async () => {
      setState((await copyText(text)) ? "ok" : "fail");
      setTimeout(() => setState("idle"), 2000);
    }}>
      {state === "ok" ? "Kopiert ✓" : state === "fail" ? "Nicht möglich" : label}
    </button>
  );
}

export function JpegImage({ data, alt = "", onClick }: { data: ArrayBuffer; alt?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(new Blob([data], { type: "image/jpeg" }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [data]);
  return url ? <img src={url} alt={alt} onClick={onClick} /> : null;
}

/** Fotos werden direkt beim Auswählen verarbeitet: Das Original bleibt nirgends liegen. */
export function PhotoPicker({ onPhotos, busy, onWorking }: {
  onPhotos: (p: NewPhoto[]) => void | Promise<void>;
  busy?: boolean;
  onWorking?: (working: boolean) => void;
}) {
  const { show } = useApp();
  const [working, setWorkingState] = useState(false);
  const setWorking = (w: boolean) => { setWorkingState(w); onWorking?.(w); };
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setWorking(true);
    try {
      const out: NewPhoto[] = [];
      for (const f of Array.from(files)) out.push(await processPhoto(f));
      await onPhotos(out);
    } catch (e) {
      show({ fehler: (e as Error).message });
    } finally {
      setWorking(false);
    }
  };
  const disabled = busy || working;
  return (
    <div className="row">
      <label className={`btn secondary${disabled ? " disabled" : ""}`}>
        📷 Foto aufnehmen
        <input type="file" accept="image/*" capture="environment" hidden disabled={disabled}
          onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
      </label>
      <label className={`btn secondary${disabled ? " disabled" : ""}`}>
        Fotos auswählen
        <input type="file" accept="image/*" multiple hidden disabled={disabled}
          onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
      </label>
      {working && <span className="muted">Fotos werden verarbeitet …</span>}
      <p className="hint" style={{ margin: 0, width: "100%" }}>Aus Dropbox: „Fotos auswählen“ → „Datei auswählen“ → Dropbox.</p>
    </div>
  );
}
