/**
 * LUCKY HUB — full-file `.h` (C header) export.
 *
 * Turns any file into an `xxd -i`-style C header containing the complete
 * byte contents as an array, exactly like the "extract to header" step in
 * reverse-engineering toolchains. Everything runs locally in the browser.
 *
 * The export streams the file in slices, so it never needs the whole file in
 * memory. When the File System Access API is available it writes directly to
 * disk (no practical download size limit); otherwise it assembles a Blob and
 * triggers a normal download.
 */

import { formatBytes } from "@/lib/binary-analysis";

export interface HeaderExportOptions {
  /** C identifier used for the byte array and its length constant. */
  identifier: string;
  /** Bytes emitted per line (8/16/32 …). */
  bytesPerLine: number;
  /** Emit `0x` prefixed hex instead of bare pairs. */
  hexPrefix: boolean;
  /** Emit a `<identifier>_len` constant. */
  addLength: boolean;
  /** Wrap the declaration in an include guard (otherwise `#pragma once`). */
  includeGuard: boolean;
  /** Append a `/* 0x00000000 *\/` offset comment to every line. */
  offsetComments: boolean;
}

export const HEADER_EXPORT_DEFAULTS: HeaderExportOptions = {
  identifier: "file_data",
  bytesPerLine: 16,
  hexPrefix: true,
  addLength: true,
  includeGuard: true,
  offsetComments: false,
};

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

export function headerFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "file";
  return `${toCIdentifier(base)}.h`;
}

export function guardName(identifier: string): string {
  return `LUCKY_HUB_${identifier.toUpperCase()}_H`.replace(/[^A-Z0-9_]/g, "_");
}

export function sanitizeOptions(opts: Partial<HeaderExportOptions>): HeaderExportOptions {
  const merged = { ...HEADER_EXPORT_DEFAULTS, ...opts };
  return {
    ...merged,
    identifier: toCIdentifier(merged.identifier),
    bytesPerLine: Math.max(1, Math.min(64, Math.round(merged.bytesPerLine) || 16)),
  };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** Accumulates bytes into comma-separated hex lines, flushing in bulk. */
class HeaderFormatter {
  private parts: string[] = [];
  private line: string[] = [];
  private lineStart = 0;

  constructor(private opts: HeaderExportOptions) {}

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
        `  ${body}, /* 0x${this.lineStart.toString(16).padStart(8, "0")} */\n`,
      );
    } else {
      this.parts.push(`  ${body},\n`);
    }
    this.line = [];
  }

  private drain(): string {
    const out = this.parts.join("");
    this.parts = [];
    return out;
  }
}

function buildPreamble(file: File, opts: HeaderExportOptions): string {
  const lines = [
    "/*",
    ` * ${headerFileName(file.name)} — file contents as a C byte array`,
    ` * Source : ${file.name}`,
    ` * Size   : ${file.size.toLocaleString()} bytes (${formatBytes(file.size)})`,
    ` * Created: ${new Date().toISOString()}`,
    ` * Tool   : LUCKY HUB Binary Inspector — generated locally, no upload.`,
    " *",
    ` * Usage  : #include "${headerFileName(file.name)}"`,
    ` *          const unsigned char *p = ${opts.identifier};`,
    ` *          size_t n = ${opts.addLength ? `${opts.identifier}_len` : `sizeof(${opts.identifier})`};`,
    " */",
    "",
  ];
  if (opts.includeGuard) {
    const guard = guardName(opts.identifier);
    lines.push(`#ifndef ${guard}`, `#define ${guard}`, "");
  } else {
    lines.push("#pragma once", "");
  }
  lines.push(`static const unsigned char ${opts.identifier}[] = {`);
  return lines.join("\n") + "\n";
}

function buildFooter(file: File, opts: HeaderExportOptions): string {
  const lines = ["};", ""];
  if (opts.addLength) {
    lines.push(`static const unsigned long ${opts.identifier}_len = ${file.size}UL;`, "");
  }
  if (opts.includeGuard) {
    lines.push(`#endif /* ${guardName(opts.identifier)} */`);
  }
  lines.push("");
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Streaming export                                                    */
/* ------------------------------------------------------------------ */

const READ_CHUNK = 4 * 1024 * 1024; // 4 MiB slices — bounded memory

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

async function* readChunks(file: File, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  let offset = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
    const end = Math.min(file.size, offset + READ_CHUNK);
    const buf = await file.slice(offset, end).arrayBuffer();
    yield new Uint8Array(buf);
    offset = end;
  }
}

function isCancel(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "NotAllowedError")
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export interface HeaderExportCallbacks {
  onProgress?: (bytesDone: number, totalBytes: number) => void;
  signal?: AbortSignal;
}

export interface HeaderExportHandle {
  filename: string;
  /** "stream" = written straight to disk; "blob" = browser download. */
  method: "stream" | "blob";
}

/**
 * Generate a C header for the *entire* file and save it.
 *
 * Uses `showSaveFilePicker` (Chromium) to stream to disk without a size cap;
 * falls back to an in-memory Blob download everywhere else.
 */
export async function exportFileAsHeader(
  file: File,
  userOpts: Partial<HeaderExportOptions>,
  callbacks: HeaderExportCallbacks = {},
): Promise<HeaderExportHandle> {
  const opts = sanitizeOptions(userOpts);
  const filename = headerFileName(file.name);
  const formatter = new HeaderFormatter(opts);
  const preamble = buildPreamble(file, opts);
  const footer = buildFooter(file, opts);

  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === "function") {
    let handle: Awaited<ReturnType<NonNullable<SaveFilePickerWindow["showSaveFilePicker"]>>> | null =
      null;
    try {
      handle = await picker({
        suggestedName: filename,
        types: [{ description: "C header", accept: { "text/x-c": [".h"] } }],
      });
    } catch (error) {
      // A user cancellation must stop the export, not silently download.
      if (isCancel(error)) throw error;
      handle = null;
    }

    if (handle) {
      const writable = await handle.createWritable();
      try {
        await writable.write(preamble);
        let done = 0;
        for await (const chunk of readChunks(file, callbacks.signal)) {
          const text = formatter.write(chunk, done);
          done += chunk.length;
          if (text) await writable.write(text);
          callbacks.onProgress?.(done, file.size);
        }
        const tail = formatter.flush();
        if (tail) await writable.write(tail);
        await writable.write(footer);
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
  const parts: string[] = [preamble];
  let done = 0;
  for await (const chunk of readChunks(file, callbacks.signal)) {
    const text = formatter.write(chunk, done);
    done += chunk.length;
    if (text) parts.push(text);
    callbacks.onProgress?.(done, file.size);
  }
  const tail = formatter.flush();
  if (tail) parts.push(tail);
  parts.push(footer);
  triggerDownload(new Blob(parts, { type: "text/x-c;charset=utf-8" }), filename);
  return { filename, method: "blob" };
}

/** Build a small header preview (first `maxBytes`) without touching the disk. */
export function previewHeader(
  fileName: string,
  bytes: Uint8Array,
  totalSize: number,
  userOpts: Partial<HeaderExportOptions>,
  maxBytes = 256,
): string {
  const opts = sanitizeOptions(userOpts);
  const slice = bytes.subarray(0, Math.min(maxBytes, bytes.length, totalSize));
  const formatter = new HeaderFormatter(opts);
  const body = formatter.write(slice, 0) + formatter.flush();
  const truncated = totalSize > slice.length;
  const fileLike = { name: fileName, size: totalSize } as unknown as File;
  const preview = buildPreamble(fileLike, opts) + body;
  return truncated ? `${preview}  /* … more bytes follow … */\n};` : preview;
}
