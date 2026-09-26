/**
 * LUCKY HUB — browser PC (DOS) emulator loader.
 *
 * Wraps the js-dos player, which runs a full DOSBox build compiled to
 * WebAssembly. The player script and emulator core are fetched on demand from
 * the official js-dos CDN the first time someone powers on a program, so they
 * never bloat the app bundle.
 */

export interface DosInstance {
  stop: () => Promise<void> | void;
  setFullScreen?: (value: boolean) => void;
  setPaused?: (value: boolean) => void;
  setVolume?: (value: number) => void;
  getVersion?: () => [string, string];
}

export type DosFactory = (element: HTMLElement, options: Record<string, unknown>) => DosInstance;

declare global {
  interface Window {
    Dos?: DosFactory;
  }
}

const CDN_BASE = "https://v8.js-dos.com/latest/";
const STYLE_FLAG = "jsdos-styles";

let dosPromise: Promise<DosFactory> | null = null;

function injectStyles(): void {
  if (document.getElementById(STYLE_FLAG)) return;
  const link = document.createElement("link");
  link.id = STYLE_FLAG;
  link.rel = "stylesheet";
  link.href = `${CDN_BASE}js-dos.css`;
  document.head.appendChild(link);
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-jsdos="1"]');
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.jsdos = "1";
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Could not download the PC emulator. A network connection is required."));
    document.head.appendChild(script);
  });
}

/** Loads (once) and returns the js-dos factory. */
export function loadDosEmulator(): Promise<DosFactory> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("The emulator needs a browser window."));
  }
  if (window.Dos) return Promise.resolve(window.Dos);
  if (!dosPromise) {
    dosPromise = (async () => {
      injectStyles();
      await loadScript(`${CDN_BASE}js-dos.js`);
      if (!window.Dos) {
        throw new Error("The emulator loaded but did not expose its player API.");
      }
      return window.Dos;
    })().catch((error: unknown) => {
      dosPromise = null;
      throw error;
    });
  }
  return dosPromise;
}

export function isEmulatorLoaded(): boolean {
  return typeof window !== "undefined" && Boolean(window.Dos);
}

/** DOS programs must live in an 8.3 uppercase filename. */
export function toDosName(filename: string): string {
  const cleaned = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  const dot = cleaned.lastIndexOf(".");
  const base = (dot === -1 ? cleaned : cleaned.slice(0, dot)).toUpperCase().slice(0, 8) || "PROGRAM";
  const extRaw = dot === -1 ? "" : cleaned.slice(dot + 1).toUpperCase().slice(0, 3);
  const ext = extRaw || "EXE";
  return `${base}.${ext}`;
}

export function buildDosboxConf(memSizeMb: number, programName: string): string {
  return [
    "[sdl]",
    "autolock=false",
    "[dosbox]",
    `memsize=${memSizeMb}`,
    "machine=svga_s3",
    "[cpu]",
    "cycles=auto",
    "[autoexec]",
    "mount c .",
    "c:",
    programName,
  ].join("\n");
}

const BASE_OPTIONS: Record<string, unknown> = {
  pathPrefix: `${CDN_BASE}emulators/`,
  theme: "dark",
  autoStart: true,
  workerThread: true,
  mouseCapture: false,
  imageRendering: "pixelated",
  renderAspect: "4/3",
  volume: 0.8,
  fsChanges: { local: false },
};

export interface BootProgramOptions {
  memSizeMb: number;
  programName: string;
  program: Uint8Array;
  onEvent?: (event: string) => void;
}

/** Boots a single MS-DOS program (`.exe` / `.com`) inside a fresh DOS PC. */
export function bootProgram(
  factory: DosFactory,
  host: HTMLElement,
  options: BootProgramOptions,
): DosInstance {
  return factory(host, {
    ...BASE_OPTIONS,
    dosboxConf: buildDosboxConf(options.memSizeMb, options.programName),
    initFs: [{ path: options.programName, contents: options.program }],
    onEvent: (event: string) => options.onEvent?.(event),
  });
}

/** Boots a ready-made `.jsdos` bundle (e.g. a Windows 3.x game disk). */
export function bootBundle(
  factory: DosFactory,
  host: HTMLElement,
  url: string,
  onEvent?: (event: string) => void,
): DosInstance {
  return factory(host, {
    ...BASE_OPTIONS,
    url,
    onEvent: (event: string) => onEvent?.(event),
  });
}
