import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  crc32Hex,
  crc32Range,
  entropyVerdict,
  hexOffset,
  type AnalysisResult,
} from "@/lib/binary-analysis";
import {
  Activity,
  Cpu,
  Gauge,
  Hash,
  Microchip,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono-tight text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          className="font-mono-tight text-[11px] text-gold/80 hover:text-gold"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            } catch {
              toast.error("Clipboard unavailable");
            }
          }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="mt-1 break-all font-mono-tight text-sm text-foreground">{value}</div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4 text-gold" />
        <span className="font-mono-tight text-[11px] uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div className="mt-2 truncate font-display text-xl font-semibold text-foreground">
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function parseHexInput(s: string): number {
  const clean = s.trim().replace(/^0x/i, "");
  if (!/^[0-9a-f]+$/i.test(clean)) return NaN;
  return parseInt(clean, 16);
}

export function OverviewTab({ result }: { result: AnalysisResult }) {
  const entropyBars = useMemo(
    () => result.chunkEntropy.map((c) => ({ ...c, pct: Math.round((c.entropy / 8) * 100) })),
    [result],
  );

  const [crcStart, setCrcStart] = useState("0x0");
  const [crcEnd, setCrcEnd] = useState("0x1000");
  const [customCrc, setCustomCrc] = useState<string | null>(null);

  const verdict = entropyVerdict(result.entropy);
  const arch = result.elf.valid
    ? result.elf.machine
    : result.pe.valid
      ? result.pe.machine
      : "—";

  const computeCustomCrc = () => {
    const start = parseHexInput(crcStart);
    const end = parseHexInput(crcEnd);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
      toast.error("Enter valid hex offsets with start < end");
      return;
    }
    const lo = Math.max(0, start);
    const hi = Math.min(result.size, end);
    if (hi - lo > 16 * 1024 * 1024) {
      toast.error("Range too large (16 MB max in-browser)");
      return;
    }
    setCustomCrc(crc32Hex(crc32Range(result.view, lo, hi)));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={Microchip} label="Format" value={result.format} sub={result.magic} />
        <StatCard icon={Cpu} label="Architecture" value={arch} sub={archSub(result)} />
        <StatCard icon={Hash} label="CRC32" value={result.crc32} sub="whole file" />
        <StatCard
          icon={Gauge}
          label="Entropy"
          value={result.entropy.toFixed(3)}
          sub={verdict.label}
        />
      </div>

      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-gold" />
            Entropy map
          </CardTitle>
          <CardDescription>
            Shannon entropy across the file. Flat 7.9+ regions usually mean compressed or encrypted
            content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-24 items-end gap-1">
            {entropyBars.map((b) => (
              <div
                key={b.offset}
                title={`${hexOffset(b.offset)} — ${b.entropy.toFixed(2)} bits/byte`}
                className="min-w-[6px] flex-1 rounded-sm transition-opacity hover:opacity-80"
                style={{
                  height: `${Math.max(4, b.pct)}%`,
                  background:
                    b.entropy > 7.2 ? "var(--danger)" : b.entropy > 4.5 ? "var(--warn)" : "var(--ok)",
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono-tight text-[11px] text-muted-foreground">
            <span>{hexOffset(0)}</span>
            <span>{hexOffset(result.size)}</span>
          </div>
        </CardContent>
      </Card>

      {result.elf.valid && <ElfSummary result={result} />}
      {result.pe.valid && <PeSummary result={result} />}
      {!result.elf.valid && !result.pe.valid && (
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Header summary</CardTitle>
            <CardDescription>
              Not a recognized ELF or PE image — raw byte inspection only.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Use the Hex view to explore raw bytes, or the Strings tab to scan for readable text.
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-gold" />
            Integrity
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <CopyableField label="SHA-256" value={result.sha256} />
          <CopyableField label="CRC32 (whole file)" value={result.crc32} />
          <CopyableField label="Quick checksum" value={result.md5StyleSum} />
        </CardContent>
      </Card>

      <Card className="border-border/70 shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hash className="size-4 text-gold" />
            Custom range CRC32
          </CardTitle>
          <CardDescription>
            Hexadecimal offsets, e.g. <code className="text-gold">0x1000</code> to{" "}
            <code className="text-gold">0x2000</code>. Clamped to the file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <span className="font-mono-tight text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Start
              </span>
              <Input
                value={crcStart}
                onChange={(e) => setCrcStart(e.target.value)}
                className="h-9 w-32 font-mono-tight text-sm"
                placeholder="0x0"
              />
            </div>
            <div className="space-y-1.5">
              <span className="font-mono-tight text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                End
              </span>
              <Input
                value={crcEnd}
                onChange={(e) => setCrcEnd(e.target.value)}
                className="h-9 w-32 font-mono-tight text-sm"
                placeholder="0x1000"
              />
            </div>
            <Button onClick={computeCustomCrc}>Compute CRC32</Button>
            {customCrc !== null && (
              <Badge variant="outline" className="h-9 border-gold/40 font-mono-tight text-gold">
                {customCrc}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function archSub(result: AnalysisResult): string {
  if (result.elf.valid) return `${result.elf.bitness}-bit · ${result.elf.endian}-endian`;
  if (result.pe.valid) return result.pe.subsystem;
  return "not ELF / PE";
}

function ElfSummary({ result }: { result: AnalysisResult }) {
  const e = result.elf;
  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Microchip className="size-4 text-gold" />
          ELF header
        </CardTitle>
        <CardDescription>
          {e.bitness}-bit · {e.endian}-endian · {e.type} · entry {hexOffset(e.entry)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <CopyableField label="Entry point" value={hexOffset(e.entry)} />
        <CopyableField label="Type" value={e.type} />
        <CopyableField label="Machine" value={e.machine} />
      </CardContent>
    </Card>
  );
}

function PeSummary({ result }: { result: AnalysisResult }) {
  const p = result.pe;
  const ts = p.timestamp ? new Date(p.timestamp * 1000).toLocaleString() : "—";
  return (
    <Card className="border-border/70 shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Microchip className="size-4 text-gold" />
          PE header
        </CardTitle>
        <CardDescription>
          {p.machine} · {p.subsystem} · linked {ts}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <CopyableField label="Machine" value={p.machine} />
        <CopyableField label="Subsystem" value={p.subsystem} />
        <CopyableField label="Link time" value={ts} />
      </CardContent>
    </Card>
  );
}
