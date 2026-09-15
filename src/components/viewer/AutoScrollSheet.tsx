import type { RefObject } from "react";
import type { ShufflePrefs } from "../../lib/reader/shufflePrefs";
import { ArrowUpToLine, Timer, Repeat, FileText, Shuffle, RotateCcw } from "lucide-react";
import { Chip, ChipGrid } from "./ChipGrid";
import {
  parsePageList,
  parseRouteList,
  type DwellParity,
  type DwellSettings,
} from "../../hooks/useAutoScroll";
import { DWELL_SLIDER_STEPS, dwellStepIndex } from "../../lib/reader/dwellEngine";
import type { DeckStats } from "../../lib/reader/fsrsScheduler";


/** Ceiling shared by the slider and `setSpeed`'s clamp in `useAutoScroll`. */
export { MAX_SPEED } from "./autoScrollLimits";
import { MAX_SPEED } from "./autoScrollLimits";
const PRESETS = [0.02, 0.05, 0.1, 0.2, 0.5, 0.75, 1, 1.5, 2, 3, 5, 7, 10, 20];
// 3600 = "1h" — long-dwell preset for students who park on a page while
// writing notes. The slider itself now spans the full 1s–1h ladder, and these
// chips stay as one-tap shortcuts to the common values.
const DWELL_PRESETS = [10, 20, 30, 60, 3600];

/** "45s" / "5m" / "1h" — keeps the chip + readout compact at every scale. */
const formatDwell = (s: number) =>
  s >= 3600 ? `${s / 3600}h` : s > 60 && s % 60 === 0 ? `${s / 60}m` : `${s}s`;
const PARITIES: { value: DwellParity; label: string }[] = [
  { value: "odd", label: "Odd" },
  { value: "even", label: "Even" },
  { value: "all", label: "Every page" },
  { value: "custom", label: "Custom" },
  { value: "route", label: "Route" },
  { value: "shuffle", label: "Shuffle" },
];


/** 0.75 must render as "0.75x", but 1 should stay "1x" — not "1.00x". */
export const fmtSpeed = (n: number) => String(Math.round(n * 100) / 100);

interface Props {
  onClose: () => void;
  speed: number;
  setSpeed: (n: number) => void;
  reverse: boolean;
  setReverse: (v: boolean) => void;
  dwell: DwellSettings;
  setDwell: (patch: Partial<DwellSettings>) => void;
  scrollToTop: () => void;
  /** Raw text is owned by the FAB so half-typed input survives sheet re-renders. */
  customText: string;
  setCustomText: (v: string) => void;
  routeText: string;
  setRouteText: (v: string) => void;
  /** Shuffle (FSRS) range inputs — raw text so half-typed values survive. */
  shuffleFromText: string;
  setShuffleFromText: (v: string) => void;
  shuffleToText: string;
  setShuffleToText: (v: string) => void;
  /** Rebuilds the revision order from the saved deck. */
  applyShuffle: (from?: string, to?: string, override?: Partial<ShufflePrefs>) => void;
  /** Wipes this document's revision memory and reshuffles. */
  resetShuffle: () => void;
  shuffleStats: DeckStats | null;
  /** Pages falling due on each of the next 7 days. */
  shuffleForecast: number[] | null;
  /** Anki-style deck options (retention, new mix, session cap). */
  shufflePrefs: ShufflePrefs;
  setShufflePrefs: (patch: Partial<ShufflePrefs>) => void;
  pageCount: number;
  sheetRef: RefObject<HTMLDivElement | null>;
}


/**
 * Settings sheet body for autoscroll. Presentation only — every piece of state
 * lives in `AutoScrollFab`/`useAutoScroll`, so this file can be read as pure UI.
 *
 * It is a hand-rolled modal (it must live in the fullscreen portal host, so
 * Radix Dialog isn't used); dialog semantics, Escape-to-close and focus restore
 * are wired by the parent.
 */
export default function AutoScrollSheet({
  onClose,
  speed,
  setSpeed,
  reverse,
  setReverse,
  dwell,
  setDwell,
  scrollToTop,
  customText,
  setCustomText,
  routeText,
  setRouteText,
  shuffleFromText,
  setShuffleFromText,
  shuffleToText,
  setShuffleToText,
  applyShuffle,
  resetShuffle,
  shuffleStats,
  shuffleForecast,
  shufflePrefs,
  setShufflePrefs,
  pageCount,
  sheetRef,

}: Props): JSX.Element {
  const routeStops = dwell?.route ?? [];
  const onSheetKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[69] flex items-end justify-center bg-black/40 sm:items-center [@media(max-height:520px)]:items-stretch [@media(max-height:520px)]:justify-end"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nb-autoscroll-sheet-title"
        data-testid="autoscroll-sheet"
        tabIndex={-1}
        onKeyDown={onSheetKeyDown}
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-t-2xl bg-card shadow-xl outline-none sm:rounded-2xl max-h-[85dvh] [@media(max-height:520px)]:h-full [@media(max-height:520px)]:max-h-none [@media(max-height:520px)]:max-w-xs [@media(max-height:520px)]:rounded-none [@media(max-height:520px)]:rounded-l-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-2">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-muted sm:hidden" aria-hidden="true" />
          <div className="mb-3 flex items-center justify-between">
            <h3 id="nb-autoscroll-sheet-title" className="text-sm font-semibold">Autoscroll speed</h3>
            <span className="text-xs tabular-nums text-muted-foreground">{fmtSpeed(speed)}x</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 [-webkit-overflow-scrolling:touch]">
          <input
            type="range"
            min={0.02}
            max={MAX_SPEED}
            step={0.01}
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />

          <ChipGrid cols={3} className="mt-4">
            {PRESETS.map((p) => (
              <Chip key={p} selected={Math.abs(speed - p) < 0.005} onClick={() => setSpeed(p)}>
                {fmtSpeed(p)}x
              </Chip>
            ))}
          </ChipGrid>

          <div className="mt-5 border-t border-border pt-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Settings
            </h4>

            <button
              type="button"
              onClick={() => {
                onClose();
                scrollToTop();
              }}
              className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm transition-colors [@media(hover:hover)]:hover:bg-accent active:bg-accent"
            >
              <span className="flex items-center gap-2 font-medium">
                <ArrowUpToLine className="h-4 w-4" aria-hidden="true" />
                Go to first page
              </span>
            </button>

            <button
              type="button"
              onClick={() => setReverse(!reverse)}
              aria-pressed={reverse}
              className="mt-2 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="font-medium">Reverse autoscroll</span>
              <span
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  reverse ? "bg-primary" : "bg-muted"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-all ${
                    reverse ? "left-4" : "left-0.5"
                  }`}
                />
              </span>
            </button>

            <div className="mt-2 rounded-xl border border-border bg-muted/30 p-3">
              <button
                type="button"
                onClick={() => setDwell({ enabled: !dwell.enabled })}
                aria-pressed={dwell.enabled}
                className="flex w-full items-center gap-3 text-left text-sm"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Timer className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Pause on pages</span>
                  <span className="block text-xs leading-snug text-muted-foreground">
                    Stops at every page for a set time, then keeps scrolling
                  </span>
                </span>
                <span
                  className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                    dwell.enabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-all duration-200 ${
                      dwell.enabled ? "left-4" : "left-0.5"
                    }`}
                  />
                </span>
              </button>

              {dwell.enabled && (
                <div className="mt-3 space-y-4 border-t border-border pt-3">
                  <div>
                    <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Pause at
                    </span>
                    {/* 6 labels never fit one row on a 360px phone — the grid keeps
                        each chip inside its own cell so nothing overlaps. */}
                    <ChipGrid cols={3} variant="segment">
                      {PARITIES.map((p) => (
                        <Chip
                          key={p.value}
                          variant="segment"
                          selected={dwell.parity === p.value}
                          ariaPressed={dwell.parity === p.value}
                          onClick={() => {
                            if (p.value === "custom") {
                              setDwell({ parity: "custom", pages: parsePageList(customText) });
                            } else if (p.value === "route") {
                              setDwell({ parity: "route", route: parseRouteList(routeText) });
                            } else if (p.value === "shuffle") {
                              applyShuffle();
                            } else {
                              setDwell({ parity: p.value });
                            }
                          }}
                        >
                          {p.label}
                        </Chip>
                      ))}
                    </ChipGrid>


                    {dwell.parity === "custom" && (
                      <div className="mt-2">
                        <label htmlFor="nb-dwell-pages" className="sr-only">
                          Pages to pause on
                        </label>
                        <input
                          id="nb-dwell-pages"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="e.g. 1, 5, 3, 2, 8"
                          value={customText}
                          onChange={(e) => {
                            setCustomText(e.target.value);
                            setDwell({ pages: parsePageList(e.target.value) });
                          }}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none transition-colors focus:border-primary"
                        />
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                          {dwell?.pages?.length
                            ? `Pausing at page ${(dwell?.pages ?? []).join(", ")} — works in normal and reverse autoscroll.`
                            : "Type any page numbers in any order — autoscroll will stop at each of them."}
                        </p>
                      </div>
                    )}

                    {dwell.parity === "route" && (
                      <div className="mt-2">
                        <label htmlFor="nb-dwell-route" className="sr-only">
                          Route page order
                        </label>
                        <input
                          id="nb-dwell-route"
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="e.g. 6, 3, 8, 2"
                          value={routeText}
                          onChange={(e) => {
                            setRouteText(e.target.value);
                            setDwell({ route: parseRouteList(e.target.value) });
                          }}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none transition-colors focus:border-primary"
                        />
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                          {routeStops.length > 1
                            ? `Order: ${routeStops.join(" → ")} — autoscroll flips direction on its own for each leg.`
                            : "Type pages in the order you want to read them — autoscroll goes down, then up, then down again."}
                        </p>
                        <button
                          type="button"
                          onClick={() => setDwell({ loopRoute: !dwell.loopRoute })}
                          aria-pressed={dwell.loopRoute}
                          className="mt-2 flex w-full items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-left"
                        >
                          <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                            <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
                            Loop route
                          </span>
                          <span
                            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                              dwell.loopRoute ? "bg-primary" : "bg-muted"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-all duration-200 ${
                                dwell.loopRoute ? "left-4" : "left-0.5"
                              }`}
                            />
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Shuffle: pages are visited in FSRS (Anki's scheduler)
                        order — most-forgotten first, then unseen, with
                        neighbours interleaved. Grades are inferred from how
                        long you actually stay on a page, so there are no
                        Again/Hard/Good/Easy buttons to tap while reading. */}
                    {dwell.parity === "shuffle" && (
                      <div className="mt-2 rounded-lg border border-border bg-background p-3">
                        <div className="flex items-center gap-2">
                          <Shuffle className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                          <span className="text-xs font-medium">Revision order (FSRS)</span>
                        </div>
                        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                          {shuffleStats
                            ? `${shuffleStats.total} pages — ${shuffleStats.due} due, ${shuffleStats.fresh} naye${
                                shuffleStats.avgRecall != null
                                  ? `, recall ${Math.round(shuffleStats.avgRecall * 100)}%`
                                  : ""
                              }. Jo page bhoolne wale ho, wo pehle aayega.`
                            : "Pages load hote hi order ban jaayega — bhoole hue pages pehle, naye baad me."}
                        </p>

                        <div className="mt-2 flex items-center gap-2">
                          <label htmlFor="nb-shuffle-from" className="sr-only">
                            First page of the shuffle range
                          </label>
                          <input
                            id="nb-shuffle-from"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="From"
                            value={shuffleFromText}
                            onChange={(e) => setShuffleFromText(e.target.value)}
                            className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base outline-none transition-colors focus:border-primary"
                          />
                          <span className="text-xs text-muted-foreground">–</span>
                          <label htmlFor="nb-shuffle-to" className="sr-only">
                            Last page of the shuffle range
                          </label>
                          <input
                            id="nb-shuffle-to"
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder={pageCount ? String(pageCount) : "To"}
                            value={shuffleToText}
                            onChange={(e) => setShuffleToText(e.target.value)}
                            className="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base outline-none transition-colors focus:border-primary"
                          />
                        </div>

                        {/* Anki deck options, shrunk: desired retention,
                            new/review mix and a per-session cap. Changing a
                            slider rebuilds the route immediately so the
                            preview below always matches what will play. */}
                        <div className="mt-3 space-y-3 border-t border-border pt-3">
                          <div>
                            <div className="flex items-center justify-between text-[11px]">
                              <label htmlFor="nb-shuffle-retention" className="font-medium">
                                Desired retention
                              </label>
                              <span className="tabular-nums text-muted-foreground">
                                {Math.round(shufflePrefs.retention * 100)}%
                              </span>
                            </div>
                            <input
                              id="nb-shuffle-retention"
                              type="range"
                              min={70}
                              max={97}
                              step={1}
                              value={Math.round(shufflePrefs.retention * 100)}
                              onChange={(e) => {
                                const retention = Number(e.target.value) / 100;
                                setShufflePrefs({ retention });
                                applyShuffle(undefined, undefined, { retention });
                              }}
                              className="mt-1.5 w-full accent-primary"
                            />
                            <p className="text-[11px] leading-snug text-muted-foreground">
                              Zyada % = pages jaldi-jaldi dobara aayenge.
                            </p>
                          </div>

                          <div>
                            <div className="flex items-center justify-between text-[11px]">
                              <label htmlFor="nb-shuffle-mix" className="font-medium">
                                Naye pages ka mix
                              </label>
                              <span className="tabular-nums text-muted-foreground">
                                {Math.round(shufflePrefs.newMix * 100)}%
                              </span>
                            </div>
                            <input
                              id="nb-shuffle-mix"
                              type="range"
                              min={0}
                              max={100}
                              step={5}
                              value={Math.round(shufflePrefs.newMix * 100)}
                              onChange={(e) => {
                                const newMix = Number(e.target.value) / 100;
                                setShufflePrefs({ newMix });
                                applyShuffle(undefined, undefined, { newMix });
                              }}
                              className="mt-1.5 w-full accent-primary"
                            />
                            <p className="text-[11px] leading-snug text-muted-foreground">
                              0% = pehle poora revision, phir naye pages. 50% = ek naya, ek revision.
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="nb-shuffle-limit" className="text-[11px] font-medium">
                              Session limit (pages)
                            </label>
                            <input
                              id="nb-shuffle-limit"
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="0 = no cap"
                              value={shufflePrefs.sessionLimit ? String(shufflePrefs.sessionLimit) : ""}
                              onChange={(e) => {
                                const n = parseInt(e.target.value, 10);
                                setShufflePrefs({ sessionLimit: Number.isFinite(n) && n > 0 ? n : 0 });
                              }}
                              onBlur={() => applyShuffle()}
                              className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-base outline-none transition-colors focus:border-primary"
                            />
                          </div>

                          {shuffleStats && shuffleStats.leeches > 0 && (
                            <p className="text-[11px] leading-snug text-muted-foreground">
                              {shuffleStats.leeches} leech page{shuffleStats.leeches > 1 ? "s" : ""} — baar-baar bhool
                              rahe ho, isliye sabse pehle aayenge.
                            </p>
                          )}

                          {shuffleForecast && shuffleForecast.some((n) => n > 0) && (
                            <div>
                              <p className="text-[11px] font-medium">Agle 7 din ka load</p>
                              <div className="mt-1.5 flex h-10 items-end gap-1">
                                {shuffleForecast.map((n, i) => {
                                  const max = Math.max(...shuffleForecast, 1);
                                  return (
                                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                                      <div
                                        className="w-full rounded-sm bg-primary/70"
                                        style={{ height: `${Math.max(2, (n / max) * 28)}px` }}
                                        aria-hidden
                                      />
                                      <span className="text-[9px] tabular-nums text-muted-foreground">{n}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => applyShuffle()}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                          >
                            <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                            Reshuffle
                          </button>
                          <button
                            type="button"
                            onClick={resetShuffle}
                            className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            Reset
                          </button>
                        </div>

                        {routeStops.length > 0 && (
                          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                            Aage ke pages: {routeStops.slice(0, 8).join(" → ")}
                            {routeStops.length > 8 ? " → …" : ""}
                          </p>
                        )}

                      </div>
                    )}
                  </div>


                  {/* A4 Sheet: tall pages (NCERT-style A4 scans) are read
                      screenful by screenful instead of only at the page top,
                      which is what landscape reading needs. Off by default so
                      lecture slides keep today's behaviour exactly. */}
                  <button
                    type="button"
                    onClick={() => setDwell({ a4: !dwell.a4 })}
                    aria-pressed={dwell.a4}
                    className="flex w-full items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left"
                  >
                    <span className="flex min-w-0 flex-1 items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">A4 Sheet (tall pages)</span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">
                          {dwell.a4
                            ? "Long pages screen-by-screen padhe jaate hain — poora page dikhne ke baad hi agla page."
                            : "Sirf page ke top par rukta hai — A4 PDF me neeche ka content chhoot sakta hai."}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                        dwell.a4 ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-all duration-200 ${
                          dwell.a4 ? "left-4" : "left-0.5"
                        }`}
                      />
                    </span>
                  </button>


                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Pause for
                      </span>
                      <span className="rounded-lg bg-background px-1.5 py-0.5 text-xs font-medium tabular-nums text-foreground">
                        {formatDwell(dwell.seconds)}
                      </span>
                    </div>
                    {/* Non-linear ladder: 1s → 1m → 1h in one drag, with
                        1-second granularity where it actually matters. */}
                    <input
                      type="range"
                      min={0}
                      max={DWELL_SLIDER_STEPS.length - 1}
                      step={1}
                      value={dwellStepIndex(dwell.seconds)}
                      aria-label="Pause duration"
                      aria-valuetext={formatDwell(dwell.seconds)}
                      onChange={(e) =>
                        setDwell({ seconds: DWELL_SLIDER_STEPS[parseInt(e.target.value, 10)] })
                      }
                      className="w-full accent-primary"
                    />
                    <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
                      <span>1s</span>
                      <span>1m</span>
                      <span>1h</span>
                    </div>

                    <ChipGrid cols={4} className="mt-2">
                      {DWELL_PRESETS.map((s) => (
                        <Chip key={s} selected={dwell.seconds === s} onClick={() => setDwell({ seconds: s })}>
                          {formatDwell(s)}
                        </Chip>
                      ))}
                    </ChipGrid>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="shrink-0 border-t border-border bg-card px-5 pt-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <button
            type="button"
            onClick={(e) => {
              // Never let the tap reach reader chrome underneath (tap-to-close,
              // chrome toggles) — Done only dismisses this sheet.
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
