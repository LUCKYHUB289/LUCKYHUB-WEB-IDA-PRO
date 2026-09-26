/**
 * LUCKY HUB — shared client-side code-export engine.
 *
 * Backs both the binary `.c` exporter and the image `.h` exporter. Everything
 * runs locally; large files are streamed in slices so nothing ever needs to
 * hold the whole file in memory. When the File System Access API is available
 * output is written straight to disk (no practical download size limit).
 */

export interface ExportCallbacks {
  onProgress?: (bytesDone: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface ExportHandle {
  filename: string;
  /** "stream" = written directly to disk; "blob" = browser download. */
  method: "stream" | "blob";
}

/* ------------------------------------------------------------------ */
/* Identifiers & string escaping                                       */
/* ------------------------------------------------------------------ */

/** Turn an arbitrary file name into a valid C identifier. */
export function toCIdentifier(name: string): string {
  let s = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_");
  if (!/^[A-Za-z_]/.test(s)) s = `_${s}`;
  if (s.length > 80) s = s.slice(0, 80);
  return s || "file_data";
}

export function guardName(identifier: string): string {
  return `LUCKY_HUB_${identifier.toUpperCase()}_H`.replace(/[^A-Z0-9_]/g, "_");
}

/** Escape a string for a C string literal, using unambiguous octal escapes. */
export function cEscape(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\") out += "\\\\";
    else if (ch === '"') out += '\\"';
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else if (code >= 0x20 && code <= 0x7e) out += ch;
    else out += `\\${code.toString(8).padStart(3, "0")}`;
  }
  return out;
}

/** Wrap a value as a C string literal. */
export function cString(s: string): string {
  return `"${cEscape(s)}"`;
}

/* ------------------------------------------------------------------ */
/* Byte formatting                                                     */
/* ------------------------------------------------------------------ */

export interface HexFormatterOptions {
  bytesPerLine: number;
  hexPrefix: boolean;
  offsetComments?: boolean;
  indent?: string;
}

/** Accumulates bytes into comma-separated hex lines, flushing in bulk. */
export class HexByteFormatter {
  private parts: string[] = [];
  private line: string[] = [];
  private lineStart = 0;
  private indent: string;
  private opts: HexFormatterOptions;

  constructor(opts: HexFormatterOptions) {
    this.opts = opts;
    this.indent = opts.indent ?? "  ";
  }

  write(bytes: Uint8Array, baseIndex: number): string {
    for (let i = 0; i < bytes.length; i++) {
      if (this.line.length === 0) this.lineStart = baseIndex + i;
      const h = bytes[i].toString(16).padStart(2, "0");
      this.line.push(this.opts.hexPrefix ? `0x${h}` : h);
      if (this.line.length >= this.opts.bytesPerLine) this.flushLine();
    }
    return this.drain();
  }

  flush(): string {
    this.flushLine();
    return this.drain();
  }

  private flushLine(): void {
    if (this.line.length === 0) return;
    const body = this.line.join(", ");
    if (this.opts.offsetComments) {
      this.parts.push(
        `${this.indent}${body}, /* 0x${this.lineStart.toString(16).padStart(8, "0")} */\n`,
      );
    } else {
      this.parts.push(`${this.indent}${body},\n`);
    }
    this.line = [];
  }

  private drain(): string {
    const out = this.parts.join("");
    this.parts = [];
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Streaming reads & saves                                             */
/* ------------------------------------------------------------------ */

export const READ_CHUNK = 4 * 1024 * 1024; // 4 MiB slices — bounded memory

export async function* readFileChunks(
  file: File,
  signal?: AbortSignal,
  chunkSize = READ_CHUNK,
): AsyncGenerator<Uint8Array> {
  let offset = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    const end = Math.min(file.size, offset + chunkSize);
    const buf = await file.slice(offset, end).arrayBuffer();
    yield new Uint8Array(buf);
    offset = end;
  }
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: BlobPart) => Promise<void>;
      close: () => Promise<void>;
      abort?: () => Promise<void>;
    }>;
  }>;
}

function isCancel(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "NotAllowedError")
  );
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Save an in-memory string as a download (used for image headers). */
export function saveText(
  filename: string,
  text: string,
  mime = "text/plain;charset=utf-8",
): ExportHandle {
  triggerDownload(new Blob([text], { type: mime }), filename);
  return { filename, method: "blob" };
}

/**
 * Stream a formatted code file: static preamble, then the file bytes through
 * `formatter`, then a static footer. Writes to disk when possible.
 */
export async function streamTextExport(
  file: File,
  filename: string,
  parts: { preamble: string; formatter: HexByteFormatter | null; footer: string },
  callbacks: ExportCallbacks = {},
  mime = "text/plain;charset=utf-8",
): Promise<ExportHandle> {
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    let handle: Awaited<ReturnType<NonNullable<SaveFilePickerWindow["showSaveFilePicker"]>>> | null =
      null;
    try {
      handle = await picker({
        suggestedName: filename,
        types: [{ description: "Source file", accept: { "text/x-c": [".c", ".h"] } }],
      });
    } catch (error) {
      // A user cancellation must stop the export, not silently download.
      if (isCancel(error)) throw error;
      handle = null;
    }

    if (handle) {
      const writable = await handle.createWritable();
      try {
        await writable.write(parts.preamble);
        let done = 0;
        if (parts.formatter) {
          for await (const chunk of readFileChunks(file, callbacks.signal)) {
            const text = parts.formatter.write(chunk, done);
            done += chunk.length;
            if (text) await writable.write(text);
            callbacks.onProgress?.(done, file.size);
          }
          const tail = parts.formatter.flush();
          if (tail) await writable.write(tail);
        } else {
          callbacks.onProgress?.(file.size, file.size);
        }
        await writable.write(parts.footer);
        await writable.close();
        callbacks.onProgress?.(file.size, file.size);
        return { filename, method: "stream" };
      } catch (error) {
        try {
          await writable.abort?.();
        } catch {
          /* ignore */
        }
        throw error;
      }
    }
  }

  // Fallback: assemble a Blob and trigger a normal download.
  const out: string[] = [parts.preamble];
  let done = 0;
  if (parts.formatter) {
    for await (const chunk of readFileChunks(file, callbacks.signal)) {
      const text = parts.formatter.write(chunk, done);
      done += chunk.length;
      if (text) out.push(text);
      callbacks.onProgress?.(done, file.size);
    }
    const tail = parts.formatter.flush();
    if (tail) out.push(tail);
  } else {
    callbacks.onProgress?.(file.size, file.size);
  }
  out.push(parts.footer);
  triggerDownload(new Blob(out, { type: mime }), filename);
  return { filename, method: "blob" };
}

/** Clamp a user-supplied bytes-per-line value. */
export function clampBytesPerLine(value: number): number {
  return Math.max(1, Math.min(64, Math.round(value) || 16));
}
