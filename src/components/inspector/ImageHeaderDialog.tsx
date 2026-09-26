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
  IMAGE_FORMAT_OPTIONS,
  estimateImageHeaderBytes,
  exportImageAsHeader,
  imageHeaderFileName,
  imageIdentifier,
  loadImagePixels,
  type ImageHeaderOptions,
  type ImagePixelFormat,
  type LoadedImage,
} from "@/lib/image-header";
import { cn } from "@/lib/utils";
import { Download, ImageIcon, Loader2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const BYTES_PER_LINE = [8, 12, 16, 24, 32];

export function ImageHeaderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const [identifier, setIdentifier] = useState("image");
  const [format, setFormat] = useState<ImagePixelFormat>("rgba8888");
  const [bytesPerLine, setBytesPerLine] = useState(16);
  const [hexPrefix, setHexPrefix] = useState(true);

  // Revoke the active object URL exactly once, outside of any state updater so
  // React StrictMode's double-invocation cannot leak or free a live URL.
  const clearUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      clearUrl();
      setFile(null);
      setImage(null);
      setImageUrl(null);
      setBusy(false);
    }
  }, [open, clearUrl]);

  useEffect(() => clearUrl, [clearUrl]);

  const acceptFile = useCallback(
    async (next: File) => {
      setFile(next);
      setIdentifier(imageIdentifier(next.name));
      setImage(null);
      setLoading(true);
      try {
        const decoded = await loadImagePixels(next);
        setImage(decoded);
        clearUrl();
        const url = URL.createObjectURL(next);
        urlRef.current = url;
        setImageUrl(url);
      } catch (error) {
        console.error(error);
        clearUrl();
        setImageUrl(null);
        toast.error("Could not decode that image", {
          description: "Try a PNG, JPEG, WebP, GIF or BMP file.",
        });
      } finally {
        setLoading(false);
      }
    },
    [clearUrl],
  );

  const opts: Partial<ImageHeaderOptions> = { identifier, format, bytesPerLine, hexPrefix };

  const estimated =
    image ? estimateImageHeaderBytes(image.width, image.height, format) : 0;

  const handleExport = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    try {
      const exported = await exportImageAsHeader(file, opts);
      toast.success(`Saved ${exported.filename}`, {
        description: image ? `${image.width}×${image.height} px · ${format}` : format,
      });
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error("Could not generate the header");
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, image, identifier, format, bytesPerLine, hexPrefix, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? undefined : onOpenChange(v))}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="size-5 text-gold" />
            Image / Logo → .h
          </DialogTitle>
          <DialogDescription>
            Converts any image into a C header with width/height defines and the pixel array —
            ready to drop into firmware, UI or game code. Runs entirely in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const next = e.target.files?.[0];
              if (next) void acceptFile(next);
              e.target.value = "";
            }}
          />

          <div
            className={cn(
              "rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-gold bg-gold/5" : "border-border/70 bg-card/40",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const next = e.dataTransfer.files?.[0];
              if (next) void acceptFile(next);
            }}
          >
            {imageUrl && image ? (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={imageUrl}
                  alt="Selected"
                  className="max-h-40 rounded-lg border border-border/60 bg-[repeating-conic-gradient(#00000010_0_25%,transparent_0_50%)] bg-[length:16px_16px] object-contain"
                />
                <p className="font-mono-tight text-xs text-muted-foreground">
                  {file?.name} · {image.width}×{image.height} px · {formatBytes(file?.size ?? 0)}
                </p>
                <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  Choose another image
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-gold/10">
                  {loading ? (
                    <Loader2 className="size-5 animate-spin text-gold" />
                  ) : (
                    <Upload className="size-5 text-gold" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {loading ? "Decoding image…" : "Drop an image or logo here"}
                </p>
                <Button onClick={() => inputRef.current?.click()}>Choose image</Button>
                <p className="font-mono-tight text-xs text-muted-foreground">
                  PNG · JPEG · WebP · GIF · BMP
                </p>
              </div>
            )}
          </div>

          {image && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="img-identifier" className="text-xs text-muted-foreground">
                    Array identifier
                  </Label>
                  <Input
                    id="img-identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="font-mono-tight text-sm"
                  />
                  <p className="font-mono-tight text-[11px] text-muted-foreground">
                    → {imageIdentifier(identifier)}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Pixel format</Label>
                  <Select value={format} onValueChange={(v) => setFormat(v as ImagePixelFormat)}>
                    <SelectTrigger className="h-9 w-full font-mono-tight text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMAGE_FORMAT_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value} className="font-mono-tight text-sm">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Values per line</Label>
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
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3 self-end rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">0x prefix</div>
                    <div className="text-xs text-muted-foreground">
                      {formatBytes(estimated)} array
                    </div>
                  </div>
                  <Switch checked={hexPrefix} onCheckedChange={setHexPrefix} />
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-card/60 px-3 py-2 font-mono-tight text-xs text-muted-foreground">
                Output:{" "}
                <span className="text-gold">
                  {file ? imageHeaderFileName(file.name) : "image.h"}
                </span>{" "}
                · {imageIdentifier(identifier).toUpperCase()}_WIDTH / _HEIGHT defines ·{" "}
                {formatBytes(estimated)} of pixel data
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Close
          </Button>
          <Button onClick={handleExport} disabled={!image || busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {busy ? "Generating…" : "Download .h"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
