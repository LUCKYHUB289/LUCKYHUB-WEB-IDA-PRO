import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useVirtualWindow } from "@/hooks/use-virtual-window";
import {
  downloadText,
  hexOffset,
  rvaToOffset,
  vaddrToOffset,
  type AnalysisResult,
  type ElfSymbol,
  type FunctionCandidate,
  type PeExport,
  type PeImport,
} from "@/lib/binary-analysis";
import { Braces, Download, FunctionSquare, Import, Package, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const ROW_HEIGHT = 30;

function VirtualList({
  count,
  template,
  headers,
  renderRow,
  empty,
}: {
  count: number;
  template: string;
  headers: string[];
  renderRow: (index: number) => React.ReactNode;
  empty: string;
}) {
  const { ref, onScroll, range, padTop, padBottom } = useVirtualWindow(count, ROW_HEIGHT);
  const containerRef = ref as React.RefObject<HTMLDivElement>;
  const rows: number[] = [];
  for (let i = range.start; i < range.end; i++) rows.push(i);

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
      <div
        className="grid gap-2 border-b border-border/70 bg-card/80 px-3 py-2 font-mono-tight text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
        style={{ gridTemplateColumns: template }}
      >
        {headers.map((h) => (
          <span key={h} className="truncate">
            {h}
          </span>
        ))}
      </div>
      <div
        ref={containerRef}
        onScroll={onScroll}
        className="scrollbar-gold h-[440px] overflow-auto"
      >
        <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          {count === 0 && <div className="p-6 text-sm text-muted-foreground">{empty}</div>}
          {rows.map((i) => renderRow(i))}
        </div>
      </div>
    </div>
  );
}

function FilterBar({
  value,
  onChange,
  count,
  label,
  onExport,
}: {
  value: string;
  onChange: (v: string) => void;
  count: number;
  label: string;
  onExport?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Filter…"
          className="h-9 w-64 pl-9 font-mono-tight text-sm"
        />
      </div>
      <span className="font-mono-tight text-xs text-muted-foreground">
        {count.toLocaleString()} {label}
      </span>
      {onExport && (
        <Button variant="outline" size="sm" className="ml-auto" onClick={onExport}>
          <Download className="size-4" />
          Export
        </Button>
      )}
    </div>
  );
}

function jump(target: number | null, onJump: (offset: number) => void): boolean {
  if (target === null || target < 0) {
    toast.message("No file offset for this address");
    return false;
  }
  onJump(target);
  return true;
}

export function SymbolsTab({
  result,
  onJump,
}: {
  result: AnalysisResult;
  onJump: (offset: number) => void;
}) {
  const initialTab =
    result.symbols.length > 0
      ? "symbols"
      : result.functions.length > 0
        ? "functions"
        : result.imports.length > 0
          ? "imports"
          : "exports";

  return (
    <Tabs defaultValue={initialTab} className="gap-4">
      <TabsList className="h-auto flex-wrap justify-start gap-1 bg-card/60 p-1">
        <TabsTrigger value="symbols" className="gap-1.5 px-3 py-1.5 font-mono-tight text-xs">
          <Braces className="size-3.5" />
          Symbols ({result.symbols.length})
        </TabsTrigger>
        <TabsTrigger value="functions" className="gap-1.5 px-3 py-1.5 font-mono-tight text-xs">
          <FunctionSquare className="size-3.5" />
          Functions ({result.functions.length})
        </TabsTrigger>
        <TabsTrigger value="imports" className="gap-1.5 px-3 py-1.5 font-mono-tight text-xs">
          <Import className="size-3.5" />
          Imports ({result.imports.length})
        </TabsTrigger>
        <TabsTrigger value="exports" className="gap-1.5 px-3 py-1.5 font-mono-tight text-xs">
          <Package className="size-3.5" />
          Exports ({result.exports.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="symbols">
        <SymbolsSection result={result} onJump={onJump} />
      </TabsContent>
      <TabsContent value="functions">
        <FunctionsSection result={result} onJump={onJump} />
      </TabsContent>
      <TabsContent value="imports">
        <ImportsSection result={result} />
      </TabsContent>
      <TabsContent value="exports">
        <ExportsSection result={result} onJump={onJump} />
      </TabsContent>
    </Tabs>
  );
}

function SymbolsSection({
  result,
  onJump,
}: {
  result: AnalysisResult;
  onJump: (offset: number) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return result.symbols;
    return result.symbols.filter(
      (s) => s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q),
    );
  }, [result.symbols, query]);

  const exportTxt = () => {
    const lines = ["kind,type,bind,value,size,name"];
    for (const s of filtered) {
      lines.push(
        `${s.kind},${s.type},${s.bind},0x${s.value.toString(16)},${s.size},"${s.name.replace(/"/g, '""')}"`,
      );
    }
    downloadText(`${result.name}-symbols.csv`, lines.join("\n"));
    toast.success("Symbols exported");
  };

  const open = (sym: ElfSymbol) => {
    if (sym.value === 0) {
      toast.message("This symbol has no address");
      return;
    }
    jump(vaddrToOffset(result, sym.value), onJump);
  };

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        value={query}
        onChange={setQuery}
        count={filtered.length}
        label="symbols"
        onExport={result.symbols.length > 0 ? exportTxt : undefined}
      />
      <VirtualList
        count={filtered.length}
        template="minmax(160px,2fr) 90px 90px 120px 80px"
        headers={["Name", "Bind", "Type", "Value", "Size"]}
        empty={
          result.elf.valid
            ? "No symbol tables in this file (it may be stripped)."
            : "No symbols — the symbol browser reads ELF .symtab / .dynsym tables."
        }
        renderRow={(i) => {
          const s = filtered[i];
          return (
            <button
              key={`${s.name}-${i}`}
              type="button"
              onClick={() => open(s)}
              className="grid w-full grid-cols-[minmax(160px,2fr)_90px_90px_120px_80px] items-center gap-2 px-3 text-left font-mono-tight text-[12.5px] leading-[30px] hover:bg-gold/5"
            >
              <span className="truncate text-gold/90" title={s.name}>
                {s.name}
              </span>
              <span className="truncate text-foreground/80">{s.bind}</span>
              <span className="truncate text-foreground/80">{s.type}</span>
              <span className="truncate text-foreground/90">{hexOffset(s.value, 8)}</span>
              <span className="truncate text-muted-foreground">{s.size || "—"}</span>
            </button>
          );
        }}
      />
    </div>
  );
}

function FunctionsSection({
  result,
  onJump,
}: {
  result: AnalysisResult;
  onJump: (offset: number) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return result.functions;
    return result.functions.filter(
      (f) => f.pattern.toLowerCase().includes(q) || f.arch.toLowerCase().includes(q),
    );
  }, [result.functions, query]);

  const exportTxt = () => {
    const lines = ["offset,entry,arch,pattern"];
    for (const f of filtered) {
      lines.push(`${hexOffset(f.offset, 8)},${f.entry},${f.arch},"${f.pattern}"`);
    }
    downloadText(`${result.name}-functions.csv`, lines.join("\n"));
    toast.success("Function list exported");
  };

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        value={query}
        onChange={setQuery}
        count={filtered.length}
        label="candidates"
        onExport={result.functions.length > 0 ? exportTxt : undefined}
      />
      <VirtualList
        count={filtered.length}
        template="130px minmax(180px,2fr) 120px 80px"
        headers={["Offset", "Pattern", "Arch", "Entry"]}
        empty="No function prologues found in the executable sections."
        renderRow={(i) => {
          const f = filtered[i];
          return (
            <button
              key={`${f.offset}-${i}`}
              type="button"
              onClick={() => onJump(f.offset)}
              className="grid w-full grid-cols-[130px_minmax(180px,2fr)_120px_80px] items-center gap-2 px-3 text-left font-mono-tight text-[12.5px] leading-[30px] hover:bg-gold/5"
            >
              <span className="truncate text-gold/90">{hexOffset(f.offset, 8)}</span>
              <span className="truncate text-foreground/90" title={f.pattern}>
                {f.pattern}
              </span>
              <span className="truncate text-muted-foreground">{f.arch}</span>
              <span>
                {f.entry ? (
                  <Badge variant="outline" className="border-gold/40 font-mono-tight text-gold">
                    entry
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>
            </button>
          );
        }}
      />
    </div>
  );
}

function ImportsSection({ result }: { result: AnalysisResult }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return result.imports;
    return result.imports.filter(
      (m) => m.dll.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
    );
  }, [result.imports, query]);

  const exportTxt = () => {
    const lines = ["dll,function,ordinal"];
    for (const m of filtered) {
      lines.push(`"${m.dll}","${m.name}",${m.ordinal ?? ""}`);
    }
    downloadText(`${result.name}-imports.csv`, lines.join("\n"));
    toast.success("Imports exported");
  };

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        value={query}
        onChange={setQuery}
        count={filtered.length}
        label="imports"
        onExport={result.imports.length > 0 ? exportTxt : undefined}
      />
      <VirtualList
        count={filtered.length}
        template="minmax(160px,1.4fr) minmax(180px,2fr) 90px"
        headers={["DLL", "Function", "Ordinal"]}
        empty={
          result.pe.valid
            ? "No import table found in this PE image."
            : "Import tables are parsed from Windows PE images."
        }
        renderRow={(i) => {
          const m: PeImport = filtered[i];
          return (
            <div
              key={`${m.dll}-${m.name}-${i}`}
              className="grid grid-cols-[minmax(160px,1.4fr)_minmax(180px,2fr)_90px] items-center gap-2 px-3 font-mono-tight text-[12.5px] leading-[30px] hover:bg-gold/5"
            >
              <span className="truncate text-gold/90" title={m.dll}>
                {m.dll}
              </span>
              <span className="truncate text-foreground/90" title={m.name}>
                {m.name || <span className="text-muted-foreground">(by ordinal)</span>}
              </span>
              <span className="truncate text-muted-foreground">{m.ordinal ?? "—"}</span>
            </div>
          );
        }}
      />
    </div>
  );
}

function ExportsSection({
  result,
  onJump,
}: {
  result: AnalysisResult;
  onJump: (offset: number) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return result.exports;
    return result.exports.filter((e) => e.name.toLowerCase().includes(q));
  }, [result.exports, query]);

  const exportTxt = () => {
    const lines = ["ordinal,rva,name"];
    for (const e of filtered) {
      lines.push(`${e.ordinal},0x${e.rva.toString(16)},"${e.name.replace(/"/g, '""')}"`);
    }
    downloadText(`${result.name}-exports.csv`, lines.join("\n"));
    toast.success("Exports exported");
  };

  const open = (exp: PeExport) => {
    if (exp.rva === 0) {
      toast.message("This export forwards to another module");
      return;
    }
    jump(rvaToOffset(result.pe, result.view, exp.rva), onJump);
  };

  return (
    <div className="flex flex-col gap-3">
      <FilterBar
        value={query}
        onChange={setQuery}
        count={filtered.length}
        label="exports"
        onExport={result.exports.length > 0 ? exportTxt : undefined}
      />
      <VirtualList
        count={filtered.length}
        template="minmax(180px,2fr) 90px 130px"
        headers={["Name", "Ordinal", "RVA"]}
        empty={
          result.pe.valid
            ? "No export table found in this PE image."
            : "Export tables are parsed from Windows PE images."
        }
        renderRow={(i) => {
          const e = filtered[i];
          return (
            <button
              key={`${e.name}-${i}`}
              type="button"
              onClick={() => open(e)}
              className="grid w-full grid-cols-[minmax(180px,2fr)_90px_130px] items-center gap-2 px-3 text-left font-mono-tight text-[12.5px] leading-[30px] hover:bg-gold/5"
            >
              <span className="truncate text-gold/90" title={e.name}>
                {e.name}
              </span>
              <span className="truncate text-foreground/80">{e.ordinal}</span>
              <span className="truncate text-foreground/90">{hexOffset(e.rva, 8)}</span>
            </button>
          );
        }}
      />
    </div>
  );
}
