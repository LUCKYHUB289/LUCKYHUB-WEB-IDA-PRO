import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatBytes, type AnalysisResult } from "@/lib/binary-analysis";
import {
  cSourceFileName,
  cSourceIdentifier,
  exportFileAsCSource,
  previewCSource,
  sanitizeCSourceOptions,
  type CSourceOptions,
} from "@/lib/c-export";
import { toCIdentifier } from "@/lib/export-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileCode2, Loader2 } from "lucide-react";

const BYTES_PER_LINE = [8, 12, 16, 24, 32];

function ToggleRow({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <div>
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function CSourceDialog({
  open,
  onOpenChange,
  file,
  result,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  result: AnalysisResult | null;
}) {
  const base = file ? cSourceIdentifier(file.name) : "lib_file";
  const [identifier, setIdentifier] = useState(base);
  const [bytesPerLine, setBytesPerLine] = useState(16);
  const [hexPrefix, setHexPrefix] = useState(true);
  const [includeReport, setIncludeReport] = useState(true);
  const [includeTables, setIncludeTables] = useState(true);
  const [includeBytes, setIncludeBytes] = useState(true);

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setIdentifier(base);
      setDone(0);
      setBusy(false);
    }
  }, [open, base]);

  const opts: Partial<CSourceOptions> = {
    identifier,
    bytesPerLine,
    hexPrefix,
    includeReport,
    includeTables,
    includeBytes,
  };

  const preview = useMemo(() => {
    if (!file || !result) return "";
    return previewCSource(file, result, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, result, identifier, bytesPerLine, hexPrefix, includeReport, includeTables, includeBytes]);

  const handleExport = useCallback(async () => {
    if (!file || !result) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setDone(0);
    try {
      const exported = await exportFileAsCSource(file, result, opts, {
        signal: controller.signal,
        onProgress: (bytesDone) => setDone(bytesDone),
      });
      toast.success(`Saved ${exported.filename}`, {
        description:
          exported.method === "stream"
            ? `${formatBytes(file.size)} written directly to disk`
            : `${formatBytes(file.size)} · browser download`,
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.message("Export cancelled");
      } else {
        console.error(error);
        toast.error("Could not generate the .c file");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, result, opts, onOpenChange]);

  const pct = file && file.size > 0 ? Math.min(100, Math.round((done / file.size) * 100)) : 0;
  const sectionCount = result?.elf.valid
    ? result.elf.sections.length
    : result?.pe.valid
      ? result.pe.sections.length
      : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? undefined : onOpenChange(v))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="size-5 text-gold" />
            Download .c File
          </DialogTitle>
          <DialogDescription>
            Converts{" "}
            <span className="font-mono-tight text-foreground">{file ? file.name : "the library"}</span>{" "}
            into a single C source file: the complete byte image plus every parsed library detail
            (report, sections, symbols, imports, exports, function candidates). Saved as{" "}
            <span className="font-mono-tight text-gold">
              {file ? cSourceFileName(file.name) : "lib.c"}
            </span>
            . Nothing is uploaded and the file size is not capped.
          </DialogDescription>
        </DialogHeader>

        {!file || !result ? (
          <p className="py-6 text-sm text-muted-foreground">
            Load a library or binary in the inspector first.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-identifier" className="text-xs text-muted-foreground">
                  Identifier prefix
                </Label>
                <Input
                  id="c-identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="font-mono-tight text-sm"
                />
                <p className="font-mono-tight text-[11px] text-muted-foreground">
                  → {toCIdentifier(identifier)}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Bytes per line</Label>
                <Select value={String(bytesPerLine)} onValueChange={(v) => setBytesPerLine(Number(v))}>
                  <SelectTrigger className="h-9 w-full font-mono-tight text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BYTES_PER_LINE.map((n) => (
                      <SelectItem key={n} value={String(n)} className="font-mono-tight text-sm">
                        {n} bytes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <ToggleRow
                label="Full byte image"
                hint={`static const unsigned char ${toCIdentifier(identifier)}[]`}
                checked={includeBytes}
                onCheckedChange={setIncludeBytes}
              />
              <ToggleRow
                label="Analysis report"
                hint={`${toCIdentifier(identifier)}_report[] string`}
                checked={includeReport}
                onCheckedChange={setIncludeReport}
              />
              <ToggleRow
                label="Library tables"
                hint={`${sectionCount} sections · ${result.symbols.length} symbols · ${result.imports.length} imports · ${result.exports.length} exports`}
                checked={includeTables}
                onCheckedChange={setIncludeTables}
              />
              <ToggleRow
                label="0x prefix"
                hint="Emit 0x… instead of bare hex pairs"
                checked={hexPrefix}
                onCheckedChange={setHexPrefix}
              />
            </div>

            <div className="rounded-xl border border-border/60 bg-card/60">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 font-mono-tight text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>Preview · header + first bytes</span>
                <span>{formatBytes(file.size)} total</span>
              </div>
              <pre className="scrollbar-gold max-h-56 overflow-auto p-3 font-mono-tight text-[11.5px] leading-5 text-foreground/90">
                {preview || "…"}
              </pre>
            </div>

            {busy && (
              <div className="space-y-2">
                <Progress value={pct} className="h-1.5" />
                <p className="font-mono-tight text-xs text-muted-foreground">
                  {pct}% · {formatBytes(done)} of {formatBytes(file.size)} streamed
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {busy ? (
            <Button variant="outline" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          <Button onClick={handleExport} disabled={!file || !result || busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {busy ? "Generating…" : "Download .c"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
