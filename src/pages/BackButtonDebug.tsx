import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getBackButtonDebug } from "../hooks/useAndroidBackButton";
import { isNative } from "../lib/platform";

const fmt = (v: unknown) =>
  v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);

export default function BackButtonDebug() {
  const location = useLocation();
  const [snap, setSnap] = useState(() => getBackButtonDebug());
  const [hintCount, setHintCount] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setSnap(getBackButtonDebug()), 250);
    const onHint = () => setHintCount((c) => c + 1);
    window.addEventListener("nb:back-exit-hint", onHint);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("nb:back-exit-hint", onHint);
    };
  }, []);

  const pushOverlay = () =>
    window.history.pushState({ overlay: true, debug: true }, "");

  return (
    <main className="min-h-dvh bg-background text-foreground p-4 pb-24">
      <h1 className="text-xl font-semibold mb-1">Back Button Debug</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Live snapshot of <code>useAndroidBackButton</code> state. Use this on a
        device with <code>adb logcat | grep back</code> to verify the exit flow.
      </p>

      <section className="grid grid-cols-2 gap-2 text-sm">
        <Row k="Platform" v={isNative() ? "native (Capacitor)" : "web"} />
        <Row k="Current route" v={location.pathname + location.search} />
        <Row k="Listener registered" v={fmt(snap.listenerRegistered)} />
        <Row k="Active hook count" v={fmt(snap.activeHookCount)} />
        <Row k="Path (latest)" v={snap.path} />
        <Row k="Is authenticated" v={fmt(snap.isAuthenticated)} />
        <Row k="Is admin" v={fmt(snap.isAdmin)} />
        <Row k="lastBackAt" v={snap.lastBackAt ? new Date(snap.lastBackAt).toLocaleTimeString() : "0"} />
        <Row k="ms since last back" v={fmt(snap.msSinceLastBack)} />
        <Row k="In 2s exit window" v={fmt(snap.msSinceLastBack !== null && snap.msSinceLastBack < 2000)} />
        <Row k="Last exit attempt" v={snap.lastExitAttemptAt ? new Date(snap.lastExitAttemptAt).toLocaleTimeString() : "—"} />
        <Row k="Last exit outcome" v={snap.lastExitOutcome} />
        <Row k="Exit hint events" v={String(hintCount)} />
      </section>

      <h2 className="text-base font-semibold mt-6 mb-2">History sentinel state</h2>
      <pre className="text-xs bg-muted p-3 rounded overflow-auto">{fmt(snap.historyState)}</pre>

      <h2 className="text-base font-semibold mt-6 mb-2">Recent back-button decisions (newest first)</h2>
      {snap.decisions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No back presses recorded yet.</p>
      ) : (
        <ol className="text-xs font-mono space-y-1 bg-muted p-3 rounded max-h-72 overflow-auto">
          {snap.decisions.map((d, i) => (
            <li key={`${d.at}-${i}`} className="break-all">
              <span className="text-muted-foreground">{new Date(d.at).toLocaleTimeString()}</span>
              {" · "}
              <span className="text-amber-600">{d.dtMs == null ? "+0ms" : `+${d.dtMs}ms`}</span>
              {" · "}
              <span className="text-primary">{d.step}</span>
              {" · "}
              <span>{d.path}</span>
              {d.detail ? <span className="text-muted-foreground"> — {d.detail}</span> : null}
            </li>
          ))}
        </ol>
      )}

      <h2 className="text-base font-semibold mt-6 mb-2">Test actions</h2>
      <div className="flex flex-col gap-2">
        <button
          onClick={pushOverlay}
          className="bg-primary text-primary-foreground rounded px-3 py-2 text-sm"
        >
          Push overlay sentinel (then press back)
        </button>
        <button
          onClick={() => window.history.back()}
          className="bg-secondary text-secondary-foreground rounded px-3 py-2 text-sm"
        >
          window.history.back()
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("nb:back-exit-hint"))}
          className="bg-secondary text-secondary-foreground rounded px-3 py-2 text-sm"
        >
          Fire exit-hint event
        </button>
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        Tip: navigate to <code>/dashboard</code>, press back once (expect hint
        toast), then press back again within 2s. Outcome should flip to
        “minimized”.
      </p>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <div className="text-muted-foreground">{k}</div>
      <div className="font-mono break-all">{v}</div>
    </>
  );
}
