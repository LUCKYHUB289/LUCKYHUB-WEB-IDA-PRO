import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVirtualWindow } from "@/hooks/use-virtual-window";
import { downloadText, hexOffset, type AnalysisResult, type StringHit } from "@/lib/binary-analysis";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";

const ROW_HEIGHT = 30;

export function StringsTab({ result }: { result: AnalysisResult }) {
  const [query, setQuery] = useState("");
  const [minLen, setMinLen] = useState("5");
  const [category, setCategory] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set(result.indicators.map((h) => h.category));
    return ["all", ...[...set].sort()];
  }, [result]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Math.max(2, parseInt(minLen || "5", 10) || 5);
    let list: StringHit[] = result.strings;
    if (min > 5) {
      list = list.filter((s) => s.text.length >= min);
    }
    if (category !== "all") {
      const hits = new Set(
        result.indicators.filter((h) => h.category === category).map((h) => h.offset),
      );
      list = list.filter((s) => hits.has(s.offset));
    }
    if (q) {
      list = list.filter((s) => s.text.toLowerCase().includes(q));
    }
    return list.slice(0, 20000);
  }, [result, query, minLen, category]);

  const { ref, onScroll, range, padTop, padBottom } = useVirtualWindow(
    filtered.length,
    ROW_HEIGHT,
  );
  const containerRef = ref as React.RefObject<HTMLDivElement>;

  const exportCsv = () => {
    const lines = ["offset,string"];
    for (const s of filtered.slice(0, 5000)) {
      const safe = s.text.replace(/"/g, '""');
      lines.push(`${s.offset.toString(16)}, "${safe}"`);
    }
    downloadText(
      `${result.name}-strings.csv`,
      lines.join("\n"),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter strings…"
            className="h-9 w-64 pl-9 font-mono-tight text-sm"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-9 rounded-lg border border-input bg-background/60 px-3 text-sm text-foreground"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === "all" ? "All categories" : c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          min length
          <Input
            value={minLen}
            onChange={(e) => setMinLen(e.target.value)}
            className="h-9 w-16 font-mono-tight text-sm"
            inputMode="numeric"
          />
        </label>
        <span className="font-mono-tight text-xs text-muted-foreground">
          {filtered.length.toLocaleString()} hits
        </span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv}>
          <Download className="size-4" />
          Export CSV
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
        <div className="grid grid-cols-[110px_1fr] border-b border-border/70 bg-card/80 px-3 py-2 font-mono-tight text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Offset</span>
          <span>String</span>
        </div>
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="scrollbar-gold h-[440px] overflow-auto"
        >
          <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {filtered.slice(range.start, range.end).map((s) => (
              <div
                key={s.offset}
                className="grid grid-cols-[110px_1fr] items-center gap-2 px-3 font-mono-tight text-[12.5px] leading-[30px] hover:bg-gold/5"
              >
                <span className="text-gold/80">{hexOffset(s.offset, 6)}</span>
                <span className="truncate text-foreground/90" title={s.text}>
                  {s.text}
                </span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">No strings match.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
