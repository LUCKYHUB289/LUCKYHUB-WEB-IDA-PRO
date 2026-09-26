/**
 * LUCKY HUB — image / logo → `.h` converter.
 *
 * Decodes any raster image the browser understands (PNG, JPEG, WebP, GIF,
 * BMP…) and emits a C header with width/height defines and the pixel buffer
 * in a choice of common embedded formats. Runs entirely in the browser.
 */

import { formatBytes } from "@/lib/binary-analysis";
import {
  HexByteFormatter,
  clampBytesPerLine,
  guardName,
  saveText,
  toCIdentifier,
  type ExportCallbacks,
  type ExportHandle,
} from "@/lib/export-engine";

export type ImagePixelFormat = "rgba8888" | "rgb888" | "argb8888" | "rgb565";

export const IMAGE_FORMAT_OPTIONS: { value: ImagePixelFormat; label: string }[] = [
  { value: "rgba8888", label: "RGBA8888 — 32-bit, R G B A" },
  { value: "rgb888", label: "RGB888 — 24-bit, R G B" },
  { value: "argb8888", label: "ARGB8888 — 32-bit, A R G B" },
  { value: "rgb565", label: "RGB565 — 16-bit, 5-6-5" },
];

export interface ImageHeaderOptions {
  identifier: string;
  format: ImagePixelFormat;
  bytesPerLine: number;
  hexPrefix: boolean;
}

export const IMAGE_HEADER_DEFAULTS: ImageHeaderOptions = {
  identifier: "image",
  format: "rgba8888",
  bytesPerLine: 16,
  hexPrefix: true,
};

export function sanitizeImageOptions(o: Partial<ImageHeaderOptions>): ImageHeaderOptions {
  const merged = { ...IMAGE_HEADER_DEFAULTS, ...o };
  return {
    ...merged,
    identifier: toCIdentifier(merged.identifier),
    bytesPerLine: clampBytesPerLine(merged.bytesPerLine),
  };
}

export function imageHeaderFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "image";
  return `${toCIdentifier(base)}.h`;
}

export function imageIdentifier(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "image";
  return toCIdentifier(base);
}

export interface LoadedImage {
  width: number;
  height: number;
  /** Raw RGBA8888 pixel data (4 bytes per pixel). */
  data: Uint8ClampedArray;
}

/** Decode an image file into RGBA pixels via an offscreen canvas. */
export async function loadImagePixels(file: File): Promise<LoadedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D context is unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, data: imageData.data };
  } finally {
    bitmap.close?.();
  }
}

function packPixels(img: LoadedImage, format: ImagePixelFormat): number[] {
  const out: number[] = [];
  const px = img.data;
  const count = img.width * img.height;
  for (let i = 0; i < count; i++) {
    const r = px[i * 4];
    const g = px[i * 4 + 1];
    const b = px[i * 4 + 2];
    const a = px[i * 4 + 3];
    if (format === "rgba8888") out.push(r, g, b, a);
    else if (format === "argb8888") out.push(a, r, g, b);
    else out.push(r, g, b); // rgb888
  }
  return out;
}

export function buildImageHeader(
  fileName: string,
  img: LoadedImage,
  userOpts: Partial<ImageHeaderOptions>,
): string {
  const opts = sanitizeImageOptions(userOpts);
  const id = opts.identifier;
  const upper = id.toUpperCase();
  const guard = guardName(id);
  const lines: string[] = [];

  lines.push("/*");
  lines.push(` * ${imageHeaderFileName(fileName)} — image pixels as a C array`);
  lines.push(" *");
  lines.push(` * Source  : ${fileName}`);
  lines.push(` * Size    : ${img.width} x ${img.height} px`);
  lines.push(` * Format  : ${opts.format}`);
  lines.push(` * Created : ${new Date().toISOString()}`);
  lines.push(" * Tool    : LUCKY HUB Binary Inspector — generated locally, no upload.");
  lines.push(" */");
  lines.push("");
  lines.push(`#ifndef ${guard}`);
  lines.push(`#define ${guard}`);
  lines.push("");
  lines.push(`#define ${upper}_WIDTH  ${img.width}`);
  lines.push(`#define ${upper}_HEIGHT ${img.height}`);
  lines.push("");

  if (opts.format === "rgb565") {
    const px = img.data;
    const count = img.width * img.height;
    const words: string[] = [];
    for (let i = 0; i < count; i++) {
      const r = px[i * 4];
      const g = px[i * 4 + 1];
      const b = px[i * 4 + 2];
      const value = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
      words.push(`0x${value.toString(16).padStart(4, "0")}`);
    }
    const perLine = Math.max(1, Math.floor(opts.bytesPerLine / 2));
    lines.push(`static const unsigned short ${id}[${count}] = {`);
    for (let i = 0; i < words.length; i += perLine) {
      lines.push(`  ${words.slice(i, i + perLine).join(", ")},`);
    }
  } else {
    const bytes = packPixels(img, opts.format);
    const formatter = new HexByteFormatter({
      bytesPerLine: opts.bytesPerLine,
      hexPrefix: opts.hexPrefix,
    });
    const body = formatter.write(Uint8Array.from(bytes), 0) + formatter.flush();
    lines.push(`static const unsigned char ${id}[${bytes.length}] = {`);
    lines.push(body.replace(/\n$/, ""));
  }

  lines.push("};");
  lines.push("");
  lines.push(`#endif /* ${guard} */`);
  lines.push("");
  return lines.join("\n");
}

export async function exportImageAsHeader(
  file: File,
  userOpts: Partial<ImageHeaderOptions>,
  callbacks: ExportCallbacks = {},
): Promise<ExportHandle> {
  if (callbacks.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
  const opts = sanitizeImageOptions(userOpts);
  const img = await loadImagePixels(file);
  const text = buildImageHeader(file.name, img, opts);
  callbacks.onProgress?.(file.size, file.size);
  return saveText(imageHeaderFileName(file.name), text, "text/x-c;charset=utf-8");
}

/** Rough size of the generated header array in bytes, for the dialog. */
export function estimateImageHeaderBytes(
  width: number,
  height: number,
  format: ImagePixelFormat,
): number {
  const pixels = width * height;
  if (format === "rgb565") return pixels * 2;
  if (format === "rgb888") return pixels * 3;
  return pixels * 4;
}

export function formatImageMeta(img: LoadedImage): string {
  return `${img.width}×${img.height} px · ${formatBytes(img.data.length)} decoded RGBA`;
}
