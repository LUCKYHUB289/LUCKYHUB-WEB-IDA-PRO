import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVirtualWindow } from "@/hooks/use-virtual-window";
import {
  hexOffset,
  hexRow,
  HEX_ROW_BYTES,
  type HexRow as HexRowType,
} from "@/lib/binary-analysis";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const ROW_HEIGHT = 21;
const PAGE_BYTES = HEX_ROW_BYTES * 24;

export function HexView({ data }: { data: Uint8Array }) {
  const { ref, onScroll, range, padTop, padBottom } = useVirtualWindow(
    Math.ceil(data.length / HEX_ROW_BYTES),
    ROW_HEIGHT,
  );
  const [goto, setGoto] = useState("");
  const containerRef = ref as React.RefObject<HTMLDivElement>;

  const rows: HexRowType[] = [];
  for (let i = range.start; i < range.end; i++) {
    rows.push(hexRow(data, i * HEX_ROW_BYTES));
  }

  const scrollToOffset = (offset: number) => {
    const row = Math.floor(offset / HEX_ROW_BYTES);
    if (containerRef.current) {
      containerRef.current.scrollTop = Math.max(0, row * ROW_HEIGHT - 100);
    }
  };

  const handleGoto = () => {
    const m = goto.trim().replace(/^0x/i, "");
    if (!/^[0-9a-f]+$/i.test(m)) return;
    const off = parseInt(m, 16);
    if (off < data.length) {
      scrollToOffset(off);
      setGoto("");
    }
  };

  const copyRow = async (offset: number) => {
    const row = hexRow(data, offset);
    const text = `${hexOffset(row.offset, 6)}  ${row.hex.join(" ")}  |${row.ascii}|`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-card/80 px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => page(containerRef, -PAGE_BYTES)}
            title="Back one page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => page(containerRef, PAGE_BYTES)}
            title="Forward one page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="mx-1 h-5 w-px bg-border/70" />
        <Input
          value={goto}
          onChange={(e) => setGoto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleGoto()}
          placeholder="Go to offset (0x…)"
          className="h-8 w-52 font-mono-tight text-xs"
        />
        <span className="font-mono-tight text-xs text-muted-foreground">
          size {hexOffset(data.length)}
        </span>
        <span className="ml-auto hidden font-mono-tight text-xs text-muted-foreground sm:inline">
          click an offset to copy its row
        </span>
      </div>

      <div
        ref={containerRef}
        onScroll={onScroll}
        className="scrollbar-gold h-[460px] overflow-auto font-mono-tight text-[12.5px] leading-[21px]"
      >
        <div style={{ paddingTop: padTop, paddingBottom: padBottom }}>
          {rows.map((row) => (
            <div key={row.offset} className="flex items-center gap-3 px-3 hover:bg-gold/5">
              <button
                type="button"
                onClick={() => copyRow(row.offset)}
                title="Copy row"
                className="w-20 shrink-0 text-left text-gold/80 hover:text-gold"
              >
                {hexOffset(row.offset, 6)}
              </button>
              <div className="flex gap-[7px] whitespace-pre">
                {row.hex.map((byte, idx) => (
                  <span
                    key={idx}
                    className={cn(
                      idx === 7 && "border-l border-border/40 pl-[7px]",
                      row.ascii[idx] === "·" ? "text-muted-foreground/60" : "text-gold/90",
                    )}
                  >
                    {byte}
                  </span>
                ))}
              </div>
              <div className="ml-2 border-l border-border/40 pl-3 text-foreground/85">
                {row.ascii}
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground">Empty file.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function page(
  containerRef: React.RefObject<HTMLDivElement | null>,
  delta: number,
) {
  if (containerRef.current) {
    containerRef.current.scrollTop += delta;
  }
}
