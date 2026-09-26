import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FileSearch, Upload } from "lucide-react";
import { useRef, useState } from "react";

export function FileDropzone({
  onFile,
  busy,
  stage,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  stage: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={cn(
        "relative rounded-xl border-2 border-dashed p-8 text-center transition-colors",
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
        const file = e.dataTransfer.files?.[0];
        if (file && !busy) onFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && !busy) onFile(file);
          e.target.value = "";
        }}
      />

      {busy ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-2">
          <div className="flex size-14 items-center justify-center rounded-full bg-gold/10">
            <FileSearch className="size-7 animate-pulse text-gold" />
          </div>
          <div className="space-y-1">
            <p className="font-mono-tight text-sm text-foreground">{stage}</p>
            <p className="text-xs text-muted-foreground">
              Running locally — nothing is uploaded anywhere.
            </p>
          </div>
          <Progress value={45} className="h-1.5 w-56" />
        </div>
      ) : (
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full bg-gold/10">
            <Upload className="size-6 text-gold" />
          </div>
          <div className="space-y-1">
            <p className="font-display font-semibold text-foreground">
              Drop a binary here to inspect it
            </p>
            <p className="text-sm text-muted-foreground">
              <code className="font-mono-tight text-gold">.so</code> ·{" "}
              <code className="font-mono-tight text-gold">.dll</code> ·{" "}
              <code className="font-mono-tight text-gold">.bin</code> ·{" "}
              <code className="font-mono-tight text-gold">.exe</code> · any file, up to 2 GB
            </p>
          </div>
          <Button onClick={() => inputRef.current?.click()}>Choose file</Button>
          <p className="text-xs text-muted-foreground">
            Read-only analysis on your device. Files are never uploaded.
          </p>
        </div>
      )}
    </div>
  );
}
