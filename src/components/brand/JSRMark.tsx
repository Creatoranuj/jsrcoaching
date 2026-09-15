export function JSRMark({
  compact = false,
  inverse = false,
}: {
  compact?: boolean;
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center gap-3" aria-label="JSR COACHING">
      <span className="grid size-10 place-items-center rounded-md border border-gold/60 bg-ink font-display text-sm font-bold text-gold shadow-sm">
        JSR
      </span>
      {!compact && (
        <span className="leading-tight">
          <span
            className={`block font-display text-lg font-bold ${inverse ? "text-ink-foreground" : "text-ink"}`}
          >
            JSR COACHING
          </span>
          <span
            className={`block text-[10px] font-semibold uppercase tracking-wide ${inverse ? "text-ink-foreground/65" : "text-muted-foreground"}`}
          >
            Sapno se selection tak
          </span>
        </span>
      )}
    </div>
  );
}

export default JSRMark;
