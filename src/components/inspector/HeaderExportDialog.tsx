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
import { formatBytes } from "@/lib/binary-analysis";
import {
  exportFileAsHeader,
  guardName,
  headerFileName,
  previewHeader,
  sanitizeOptions,
  toCIdentifier,
  type HeaderExportOptions,
} from "@/lib/header-export";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, FileCode2, Loader2 } from "lucide-react";

const BYTES_PER_LINE = [8, 12, 16, 24, 32];
const PREVIEW_BYTES = 320;

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

export function HeaderExportDialog({
  open,
  onOpenChange,
  file,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
}) {
  const base = file ? toCIdentifier(file.name) : "file_data";
  const [identifier, setIdentifier] = useState(base);
  const [bytesPerLine, setBytesPerLine] = useState(16);
  const [hexPrefix, setHexPrefix] = useState(true);
  const [addLength, setAddLength] = useState(true);
  const [includeGuard, setIncludeGuard] = useState(true);
  const [offsetComments, setOffsetComments] = useState(false);

  const [preview, setPreview] = useState("");
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

  const opts: Partial<HeaderExportOptions> = {
    identifier,
    bytesPerLine,
    hexPrefix,
    addLength,
    includeGuard,
    offsetComments,
  };

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    const previewOpts = sanitizeOptions(opts);
    file
      .slice(0, PREVIEW_BYTES)
      .arrayBuffer()
      .then((buf) => {
        if (cancelled) return;
        setPreview(
          previewHeader(file.name, new Uint8Array(buf), file.size, previewOpts),
        );
      })
      .catch(() => {
        if (!cancelled) setPreview("");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file, identifier, bytesPerLine, hexPrefix, addLength, includeGuard, offsetComments]);

  const handleExport = useCallback(async () => {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setDone(0);
    try {
      const result = await exportFileAsHeader(file, opts, {
        signal: controller.signal,
        onProgress: (bytesDone) => setDone(bytesDone),
      });
      toast.success(`Saved ${result.filename}`, {
        description:
          result.method === "stream"
            ? `${formatBytes(file.size)} written directly to disk`
            : `${formatBytes(file.size)} · browser download`,
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.message("Export cancelled");
      } else {
        console.error(error);
        toast.error("Could not generate header");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, opts, onOpenChange]);

  const cancel = () => {
    abortRef.current?.abort();
  };

  const pct = file && file.size > 0 ? Math.min(100, Math.round((done / file.size) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? undefined : onOpenChange(v))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="size-5 text-gold" />
            Extract full file to a C header
          </DialogTitle>
          <DialogDescription>
            Generates an <code className="font-mono-tight text-gold">xxd -i</code>-style{" "}
            <span className="font-mono-tight text-foreground">
              {file ? headerFileName(file.name) : "file.h"}
            </span>{" "}
            containing the complete file contents as a byte array. Every byte is read locally — the
            file size is not capped.
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <p className="py-6 text-sm text-muted-foreground">
            Load a file in the inspector first.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="hdr-identifier" className="text-xs text-muted-foreground">
                  Array identifier
                </Label>
                <Input
                  id="hdr-identifier"
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
                <Select
                  value={String(bytesPerLine)}
                  onValueChange={(v) => setBytesPerLine(Number(v))}
                >
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
                label="0x prefix"
                hint="Emit 0x… instead of bare hex pairs"
                checked={hexPrefix}
                onCheckedChange={setHexPrefix}
              />
              <ToggleRow
                label="Length constant"
                hint={`Add static const unsigned long ${toCIdentifier(identifier)}_len`}
                checked={addLength}
                onCheckedChange={setAddLength}
              />
              <ToggleRow
                label="Include guard"
                hint={guardName(toCIdentifier(identifier))}
                checked={includeGuard}
                onCheckedChange={setIncludeGuard}
              />
              <ToggleRow
                label="Offset comments"
                hint="Annotate each line with its file offset"
                checked={offsetComments}
                onCheckedChange={setOffsetComments}
              />
            </div>

            <div className="rounded-xl border border-border/60 bg-card/60">
              <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 font-mono-tight text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                <span>Preview · first {PREVIEW_BYTES} bytes</span>
                <span>{formatBytes(file.size)} total</span>
              </div>
              <pre className="scrollbar-gold max-h-52 overflow-auto p-3 font-mono-tight text-[11.5px] leading-5 text-foreground/90">
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
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          )}
          <Button onClick={handleExport} disabled={!file || busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {busy ? "Generating…" : "Download .h"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
