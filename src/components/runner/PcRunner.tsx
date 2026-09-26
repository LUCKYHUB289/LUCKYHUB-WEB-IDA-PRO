import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBytes } from "@/lib/binary-analysis";
import {
  bootBundle,
  bootProgram,
  buildDosboxConf,
  loadDosEmulator,
  toDosName,
  type DosInstance,
} from "@/lib/dos-emulator";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Monitor,
  Play,
  Power,
  RefreshCw,
  Upload,
  Maximize2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Mode = "program" | "bundle";
type Status = "idle" | "loading" | "running" | "error";

const PROGRAM_LIMIT = 256 * 1024 * 1024; // 256 MB
const BUNDLE_LIMIT = 2 * 1024 * 1024 * 1024; // 2 GB

const isBundleName = (name: string) => /\.(jsdos|zip)$/i.test(name);

export function PcRunner() {
  const [mode, setMode] = useState<Mode>("program");
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [memSize, setMemSize] = useState(32);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<DosInstance | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const pushLog = (line: string) => {
    setLogs((prev) => [...prev.slice(-199), line]);
  };

  const revokeUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  // Tear the emulator down when the workspace unmounts.
  useEffect(() => {
    return () => {
      try {
        void instanceRef.current?.stop();
      } catch {
        /* ignore */
      }
      instanceRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
  }, []);

  const handleFile = async (next: File) => {
    const bundle = isBundleName(next.name);
    const limit = bundle ? BUNDLE_LIMIT : PROGRAM_LIMIT;
    if (next.size > limit) {
      toast.error(`${next.name} is too large (${formatBytes(next.size)}). Limit is ${formatBytes(limit)}.`);
      return;
    }
    if (next.size === 0) {
      toast.error("That file is empty.");
      return;
    }
    setError(null);
    setFile(next);
    setMode(bundle ? "bundle" : "program");
    if (!bundle) {
      try {
        setBytes(new Uint8Array(await next.arrayBuffer()));
      } catch {
        setBytes(null);
      }
    } else {
      setBytes(null);
    }
    pushLog(`Loaded ${next.name} · ${formatBytes(next.size)}${bundle ? " (bundle)" : ""}`);
  };

  const powerOff = async () => {
    const instance = instanceRef.current;
    instanceRef.current = null;
    try {
      await instance?.stop();
    } catch {
      /* ignore */
    }
    revokeUrl();
    if (hostRef.current) hostRef.current.innerHTML = "";
    setStatus("idle");
    pushLog("PC powered off.");
  };

  const powerOn = async () => {
    if (!file) {
      toast.error("Choose a program first");
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    setStatus("loading");
    setError(null);
    host.innerHTML = "";
    pushLog(`Powering on · ${file.name}`);
    try {
      const factory = await loadDosEmulator();
      let instance: DosInstance;
      if (mode === "bundle") {
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        instance = bootBundle(factory, host, url, (event) => pushLog(`event · ${event}`));
      } else {
        if (!bytes) throw new Error("Could not read the program bytes.");
        instance = bootProgram(factory, host, {
          memSizeMb: memSize,
          programName: toDosName(file.name),
          program: bytes,
          onEvent: (event) => pushLog(`event · ${event}`),
        });
      }
      instanceRef.current = instance;
      setStatus("running");
      pushLog("PC ready. Click the screen to capture the mouse and keyboard.");
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "The emulator could not start on this device.";
      setError(message);
      setStatus("error");
      pushLog(`error · ${message}`);
      toast.error("The PC could not start", { description: message });
    }
  };

  const restart = async () => {
    await powerOff();
    await powerOn();
  };

  const busy = status === "loading";

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-border/70 bg-card/60 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="size-4 text-gold" />
                Web PC · run legacy programs
              </CardTitle>
              <CardDescription>
                Boot a real x86 PC in your browser (DOSBox compiled to WebAssembly), mount your
                program and run it graphically. Nothing is uploaded — the program stays in this tab.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-gold/40 font-mono-tight text-gold">
              WASM x86 · DOSBox
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <p className="font-mono-tight text-[11px] uppercase tracking-[0.16em] text-gold">
              Runs
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              MS-DOS programs (<code className="text-gold">.exe</code>,{" "}
              <code className="text-gold">.com</code>) and ready-made{" "}
              <code className="text-gold">.jsdos</code> bundles.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <p className="font-mono-tight text-[11px] uppercase tracking-[0.16em] text-gold">
              Also good for
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Turbo C / QuickBASIC builds, DOS tooling, retro games, Windows 3.x bundles.
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <p className="font-mono-tight text-[11px] uppercase tracking-[0.16em] text-warn">
              Honest limit
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Modern 64-bit Windows <code className="text-warn">.exe</code> files need Windows
              itself and will not run — this is a DOS-era PC.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/60 shadow-none">
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".exe,.com,.jsdos,.zip,application/zip,application/x-msdownload"
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (next) void handleFile(next);
                e.target.value = "";
              }}
            />
            <Button variant="outline" className="gap-1.5" onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" />
              {file ? "Change program" : "Choose .exe / .com"}
            </Button>

            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                Type
              </Label>
              <Select
                value={mode}
                onValueChange={(v) => {
                  const next = v as Mode;
                  setMode(next);
                  if (next === "bundle") setBytes(null);
                }}
              >
                <SelectTrigger className="h-9 w-52 font-mono-tight text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="program" className="text-xs">
                    DOS program (.exe / .com)
                  </SelectItem>
                  <SelectItem value="bundle" className="text-xs">
                    js-dos bundle (.jsdos / .zip)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "program" && (
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Memory
                </Label>
                <Select value={String(memSize)} onValueChange={(v) => setMemSize(Number(v))}>
                  <SelectTrigger className="h-9 w-28 font-mono-tight text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[16, 32, 64, 128].map((mb) => (
                      <SelectItem key={mb} value={String(mb)} className="font-mono-tight text-xs">
                        {mb} MB
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                className="gap-1.5"
                disabled={!file || busy || status === "running"}
                onClick={() => void powerOn()}
              >
                <Play className="size-4" />
                {busy ? "Booting…" : "Power on"}
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={status === "idle" && !file}
                onClick={() => void restart()}
              >
                <RefreshCw className="size-4" />
                Reset
              </Button>
              <Button
                variant="outline"
                className="gap-1.5"
                disabled={status !== "running"}
                onClick={() => instanceRef.current?.setFullScreen?.(true)}
              >
                <Maximize2 className="size-4" />
                Fullscreen
              </Button>
              <Button
                variant="ghost"
                className="gap-1.5"
                disabled={status === "idle"}
                onClick={() => void powerOff()}
              >
                <Power className="size-4" />
                Off
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono-tight text-[11px] text-muted-foreground">
            {file ? (
              <>
                <span className="text-foreground/80">{file.name}</span>
                <span>·</span>
                <span>{formatBytes(file.size)}</span>
                <span>·</span>
                <span>
                  {mode === "program"
                    ? `mounted as ${toDosName(file.name)} · memsize ${memSize} MB`
                    : "js-dos bundle"}
                </span>
              </>
            ) : (
              <span>No program loaded yet — the first power-on downloads the emulator core.</span>
            )}
          </div>

          <div
            className={cn(
              "relative h-[460px] overflow-hidden rounded-xl border bg-black",
              status === "running" ? "border-gold/40" : "border-border/60",
            )}
          >
            <div ref={hostRef} className="h-full w-full" />
            {status !== "running" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#0b0b07] to-[#161509] px-6 text-center">
                <Monitor className={cn("size-9", busy ? "animate-pulse text-gold" : "text-gold/60")} />
                <p className="font-display text-base font-semibold">
                  {busy ? "Starting the PC…" : "The screen is off"}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">
                  {busy
                    ? "Downloading the emulator core and mounting your program."
                    : "Choose a DOS program and press Power on. The emulator core is fetched on demand, so a network connection is required."}
                </p>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-background/40">
            <div className="border-b border-border/60 px-3 py-2 font-mono-tight text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Console
            </div>
            <pre className="scrollbar-gold max-h-40 overflow-auto p-3 font-mono-tight text-[11.5px] leading-5 text-foreground/85">
              {logs.length === 0
                ? "// boot log will appear here\n" + buildDosboxConf(memSize, "PROGRAM.EXE")
                : logs.join("\n")}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
