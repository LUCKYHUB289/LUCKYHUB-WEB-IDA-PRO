import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useVirtualWindow } from "@/hooks/use-virtual-window";
import { cn } from "@/lib/utils";
import {
  downloadText,
  formatBytes,
  hexOffset,
  type AnalysisResult,
  type IndicatorHit,
} from "@/lib/binary-analysis";
import { Download, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const ROW_HEIGHT = 30;

function sanitizeForExport(s: string): string {
  // Block formula-injection and control chars in exported text files.
  return s
    .replace(/^[=+\-@]/, "'")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

function CategoryCard({
  name,
  hits,
  onPick,
  active,
}: {
  name: string;
  hits: IndicatorHit[];
  onPick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "rounded-xl border p-4 text-left transition-colors",
        active
          ? "border-gold/60 bg-gold/10"
          : "border-border/60 bg-card/60 hover:border-gold/30 hover:bg-gold/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-tight text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {name}
        </span>
        <Badge variant="outline" className="border-gold/30 font-mono-tight text-gold">
          {hits.length}
        </Badge>
      </div>
      <div className="mt-1.5 truncate font-mono-tight text-xs text-foreground/80">
        {hits[0] ? hits[0].value : "—"}
      </div>
    </button>
  );
}

export function IndicatorsTab({ result }: { result: AnalysisResult }) {
  const grouped = useMemo(() => {
    const map = new Map<string, IndicatorHit[]>();
    for (const h of result.indicators) {
      const list = map.get(h.category) ?? [];
      list.push(h);
      map.set(h.category, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [result]);

  const [active, setActive] = useState<string | null>(null);
  const current = useMemo(
    () => (active ? (grouped.find(([name]) => name === active)?.[1] ?? []) : null),
    [grouped, active],
  );

  const rows = current ?? grouped.flatMap(([, hits]) => hits.slice(0, 25));
  const { ref, onScroll, range, padTop, padBottom } = useVirtualWindow(rows.length, ROW_HEIGHT);
  const containerRef = ref as React.RefObject<HTMLDivElement>;

  const exportTxt = () => {
    const lines: string[] = [];
    lines.push(`LUCKY HUB Binary Inspector — indicators`);
    lines.push(`File: ${result.name} (${formatBytes(result.size)})`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push("");
    for (const [name, hits] of grouped) {
      lines.push(`=== ${name.toUpperCase()} ===`);
      for (const h of hits) {
        lines.push(`${hexOffset(h.offset)}  ${sanitizeForExport(h.value)}`);
      }
      lines.push("");
    }
    downloadText(`${result.name}-indicators.txt`, lines.join("\n"));
    toast.success("Indicator report saved");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono-tight text-xs text-muted-foreground">
          {grouped.length} categories · {result.indicators.length} hits
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportTxt}>
          <Download className="size-4" />
          Export report
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {grouped.map(([name, hits]) => (
          <CategoryCard
            key={name}
            name={name}
            hits={hits}
            active={active === name}
            onPick={() => setActive(active === name ? null : name)}
          />
        ))}
      </div>

      {grouped.length === 0 && (
        <div className="rounded-xl border border-border/60 bg-card/60 p-8 text-center text-sm text-muted-foreground">
          <ShieldCheck className="mx-auto size-6 text-gold/60" />
          <p className="mt-2">No notable indicators found in this file.</p>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
          <div className="border-b border-border/70 bg-card/80 px-3 py-2 font-mono-tight text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {active ? `Category: ${active}` : "Highlights across all categories"}
          </div>
          <div ref={containerRef} onScroll={onScroll} className="scrollbar-gold h-[380px] overflow-auto">
            <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
              {rows.slice(range.start, range.end).map((h, idx) => (
                <div
                  key={`${h.offset}-${idx}`}
                  className="grid grid-cols-[110px_140px_1fr] items-center gap-2 px-3 font-mono-tight text-[12.5px] leading-[30px] hover:bg-gold/5"
                >
                  <span className="text-gold/80">{hexOffset(h.offset, 6)}</span>
                  <span className="truncate text-muted-foreground">{h.category}</span>
                  <span className="truncate text-foreground/90" title={h.value}>
                    {h.value}
                  </span>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground">Nothing to show.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
