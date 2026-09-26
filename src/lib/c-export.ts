/**
 * LUCKY HUB — binary / shared-library → `.c` converter.
 *
 * Emits a single C translation unit containing:
 *   1. the complete file bytes as `static const unsigned char <id>[]`
 *   2. a readable analysis report as a C string constant
 *   3. every parsed library table — sections, symbols, imports, exports and
 *      function candidates — as `static const` C struct arrays.
 *
 * The byte image is streamed, so the download size is not capped.
 */

import {
  entropyVerdict,
  formatBytes,
  type AnalysisResult,
} from "@/lib/binary-analysis";
import {
  HexByteFormatter,
  cEscape,
  clampBytesPerLine,
  streamTextExport,
  toCIdentifier,
  type ExportCallbacks,
  type ExportHandle,
} from "@/lib/export-engine";

export interface CSourceOptions {
  identifier: string;
  bytesPerLine: number;
  hexPrefix: boolean;
  includeReport: boolean;
  includeTables: boolean;
  includeBytes: boolean;
}

export const C_SOURCE_DEFAULTS: CSourceOptions = {
  identifier: "lib_file",
  bytesPerLine: 16,
  hexPrefix: true,
  includeReport: true,
  includeTables: true,
  includeBytes: true,
};

export function sanitizeCSourceOptions(o: Partial<CSourceOptions>): CSourceOptions {
  const merged = { ...C_SOURCE_DEFAULTS, ...o };
  return {
    ...merged,
    identifier: toCIdentifier(merged.identifier),
    bytesPerLine: clampBytesPerLine(merged.bytesPerLine),
  };
}

export function cSourceFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "file";
  return `${toCIdentifier(base)}.c`;
}

export function cSourceIdentifier(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "") || "file";
  return toCIdentifier(base);
}

/* ------------------------------------------------------------------ */
/* Human-readable report                                               */
/* ------------------------------------------------------------------ */

export function buildReportLines(result: AnalysisResult): string[] {
  const out: string[] = [];
  out.push("LUCKY HUB — BINARY / LIBRARY REPORT");
  out.push("================================================");
  out.push(`File       : ${result.name}`);
  out.push(`Size       : ${formatBytes(result.size)} (${result.size} bytes)`);
  out.push(`Analyzed   : ${result.truncated ? "first 64 MB window" : "full file"}`);
  out.push(`Format     : ${result.format} (${result.magic})`);
  out.push(
    `Entropy    : ${result.entropy.toFixed(3)} bits/byte — ${entropyVerdict(result.entropy).label}`,
  );
  out.push(`Scan time  : ${result.scanMs} ms`);
  out.push("");
  out.push("--- INTEGRITY ---");
  out.push(`SHA-256    : ${result.sha256}`);
  out.push(`CRC32      : ${result.crc32}`);
  out.push(`Quick sum  : ${result.md5StyleSum}`);
  out.push("");

  if (result.elf.valid) {
    const e = result.elf;
    out.push("--- ELF HEADER ---");
    out.push(`Class      : ${e.bitness}-bit, ${e.endian}-endian`);
    out.push(`Type       : ${e.type}`);
    out.push(`Machine    : ${e.machine}`);
    out.push(`Entry      : 0x${e.entry.toString(16)}`);
    out.push(`Sections   : ${e.sections.length}`);
    out.push(`Segments   : ${e.programs.length}`);
    out.push("");
    out.push("--- PROGRAM HEADERS ---");
    for (const p of e.programs) {
      out.push(
        `${p.type.padEnd(14)} off=0x${p.offset.toString(16)} vaddr=0x${p.vaddr.toString(16)} filesz=0x${p.filesz.toString(16)} ${p.flags}`,
      );
    }
    out.push("");
    out.push("--- SECTIONS ---");
    for (const s of e.sections) {
      out.push(
        `${s.name.padEnd(20)} ${s.type.padEnd(14)} addr=0x${s.addr.toString(16)} off=0x${s.offset.toString(16)} size=0x${s.size.toString(16)} ${s.flags}`,
      );
    }
    out.push("");
  }

  if (result.pe.valid) {
    const p = result.pe;
    out.push("--- PE HEADER ---");
    out.push(`Class      : ${p.bitness}-bit`);
    out.push(`Machine    : ${p.machine}`);
    out.push(`Subsystem  : ${p.subsystem}`);
    out.push(`Entry RVA  : 0x${p.entryPoint.toString(16)}`);
    out.push(`Image base : 0x${p.imageBase.toString(16)}`);
    out.push(
      `Linked     : ${p.timestamp ? new Date(p.timestamp * 1000).toISOString() : "unknown"}`,
    );
    out.push("");
    out.push("--- SECTIONS ---");
    for (const s of p.sections) {
      out.push(
        `${s.name.padEnd(12)} vaddr=0x${s.virtualAddress.toString(16)} raw=0x${s.rawOffset.toString(16)} size=0x${s.rawSize.toString(16)} entropy=${s.entropy.toFixed(2)}`,
      );
    }
    out.push("");
  }

  if (result.symbols.length > 0) {
    out.push(`--- SYMBOLS (${result.symbols.length}) ---`);
    for (const s of result.symbols) {
      out.push(
        `${s.bind.padEnd(7)} ${s.type.padEnd(7)} 0x${s.value.toString(16).padStart(8, "0")} size=${s.size} ${s.name}`,
      );
    }
    out.push("");
  }

  if (result.imports.length > 0) {
    out.push(`--- IMPORTS (${result.imports.length}) ---`);
    for (const m of result.imports) {
      out.push(`${m.dll} :: ${m.name || `#${m.ordinal}`}`);
    }
    out.push("");
  }

  if (result.exports.length > 0) {
    out.push(`--- EXPORTS (${result.exports.length}) ---`);
    for (const e of result.exports) {
      out.push(`#${e.ordinal} rva=0x${e.rva.toString(16)} ${e.name}`);
    }
    out.push("");
  }

  if (result.functions.length > 0) {
    out.push(`--- FUNCTION CANDIDATES (${result.functions.length}) ---`);
    for (const f of result.functions) {
      out.push(`0x${f.offset.toString(16).padStart(8, "0")} ${f.arch} ${f.pattern}`);
    }
    out.push("");
  }

  if (result.indicators.length > 0) {
    out.push("--- INDICATORS ---");
    const byCat = new Map<string, string[]>();
    for (const h of result.indicators) {
      const list = byCat.get(h.category) ?? [];
      list.push(`  0x${h.offset.toString(16).padStart(8, "0")}  ${h.value.slice(0, 200)}`);
      byCat.set(h.category, list);
    }
    for (const [cat, rows] of byCat) {
      out.push(`== ${cat.toUpperCase()} (${rows.length}) ==`);
      out.push(...rows.slice(0, 200));
    }
    out.push("");
  }

  out.push(`--- STRINGS (first 500 of ${result.strings.length}, min length 5) ---`);
  for (const s of result.strings.slice(0, 500)) {
    out.push(`0x${s.offset.toString(16).padStart(8, "0")}  ${s.text.slice(0, 200)}`);
  }
  out.push("");
  out.push("Generated locally with LUCKY HUB Binary Inspector — nothing was uploaded.");
  return out;
}

function emitStringArray(constName: string, lines: string[]): string {
  const body = lines.length > 0 ? lines : [""];
  const out: string[] = [`static const char ${constName}[] =`];
  for (const line of body) out.push(`  "${cEscape(line)}\\n"`);
  out.push("  ;");
  return out.join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* Library tables                                                      */
/* ------------------------------------------------------------------ */

export function buildTables(result: AnalysisResult, id: string): string {
  const out: string[] = [];

  const sections = result.elf.valid
    ? result.elf.sections.map((s) => ({
        name: s.name,
        type: s.type,
        addr: s.addr,
        offset: s.offset,
        size: s.size,
        flags: s.flags,
      }))
    : result.pe.valid
      ? result.pe.sections.map((s) => ({
          name: s.name,
          type: "PE",
          addr: s.virtualAddress,
          offset: s.rawOffset,
          size: s.rawSize,
          flags: "",
        }))
      : [];

  if (sections.length > 0) {
    out.push(
      `typedef struct { const char *name; const char *type; unsigned long addr; unsigned long offset; unsigned long size; const char *flags; } ${id}_section_t;`,
    );
    out.push(`static const ${id}_section_t ${id}_sections[] = {`);
    for (const s of sections) {
      out.push(
        `  { "${cEscape(s.name)}", "${cEscape(s.type)}", 0x${s.addr.toString(16)}UL, 0x${s.offset.toString(16)}UL, ${Math.round(s.size)}UL, "${cEscape(s.flags)}" },`,
      );
    }
    out.push("};");
    out.push(`static const unsigned long ${id}_section_count = ${sections.length}UL;`);
    out.push("");
  }

  if (result.symbols.length > 0) {
    out.push(
      `typedef struct { const char *name; const char *bind; const char *type; unsigned long value; unsigned long size; } ${id}_symbol_t;`,
    );
    out.push(`static const ${id}_symbol_t ${id}_symbols[] = {`);
    for (const s of result.symbols) {
      out.push(
        `  { "${cEscape(s.name)}", "${cEscape(s.bind)}", "${cEscape(s.type)}", 0x${s.value.toString(16)}UL, ${Math.round(s.size)}UL },`,
      );
    }
    out.push("};");
    out.push(`static const unsigned long ${id}_symbol_count = ${result.symbols.length}UL;`);
    out.push("");
  }

  if (result.imports.length > 0) {
    out.push(
      `typedef struct { const char *dll; const char *function; int ordinal; } ${id}_import_t;`,
    );
    out.push(`static const ${id}_import_t ${id}_imports[] = {`);
    for (const m of result.imports) {
      out.push(`  { "${cEscape(m.dll)}", "${cEscape(m.name)}", ${m.ordinal ?? -1} },`);
    }
    out.push("};");
    out.push(`static const unsigned long ${id}_import_count = ${result.imports.length}UL;`);
    out.push("");
  }

  if (result.exports.length > 0) {
    out.push(
      `typedef struct { const char *name; unsigned long ordinal; unsigned long rva; } ${id}_export_t;`,
    );
    out.push(`static const ${id}_export_t ${id}_exports[] = {`);
    for (const e of result.exports) {
      out.push(`  { "${cEscape(e.name)}", ${e.ordinal}UL, 0x${e.rva.toString(16)}UL },`);
    }
    out.push("};");
    out.push(`static const unsigned long ${id}_export_count = ${result.exports.length}UL;`);
    out.push("");
  }

  if (result.functions.length > 0) {
    out.push(
      `typedef struct { unsigned long offset; const char *pattern; const char *arch; int entry; } ${id}_function_t;`,
    );
    out.push(`static const ${id}_function_t ${id}_functions[] = {`);
    for (const f of result.functions) {
      out.push(
        `  { 0x${f.offset.toString(16)}UL, "${cEscape(f.pattern)}", "${cEscape(f.arch)}", ${f.entry ? 1 : 0} },`,
      );
    }
    out.push("};");
    out.push(`static const unsigned long ${id}_function_count = ${result.functions.length}UL;`);
    out.push("");
  }

  return out.join("\n");
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

export function buildCSourcePreamble(
  file: File,
  result: AnalysisResult,
  opts: CSourceOptions,
): string {
  const id = opts.identifier;
  const lines: string[] = [];
  lines.push("/*");
  lines.push(` * ${cSourceFileName(file.name)} — generated from ${file.name}`);
  lines.push(" *");
  lines.push(` * Source  : ${file.name}`);
  lines.push(` * Format  : ${result.format} (${result.magic})`);
  lines.push(` * Size    : ${formatBytes(result.size)} (${result.size} bytes)`);
  lines.push(` * SHA-256 : ${result.sha256}`);
  lines.push(` * Created : ${new Date().toISOString()}`);
  lines.push(" * Tool    : LUCKY HUB Binary Inspector — generated locally, no upload.");
  lines.push(" *");
  lines.push(
    ` * Contains: full byte image${opts.includeReport ? " + analysis report" : ""}${opts.includeTables ? " + parsed library tables" : ""}.`,
  );
  lines.push(" */");
  lines.push("");
  lines.push("#include <stddef.h>");
  lines.push("");
  if (opts.includeBytes) {
    lines.push("/* ------------------------------------------------------------------ */");
    lines.push("/* Full file byte image                                                */");
    lines.push("/* ------------------------------------------------------------------ */");
    lines.push(`static const unsigned char ${id}[] = {`);
  } else {
    lines.push("/* Byte image omitted (metadata-only export). */");
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

export function buildCSourceFooter(file: File, result: AnalysisResult, opts: CSourceOptions): string {
  const id = opts.identifier;
  const out: string[] = [];
  if (opts.includeBytes) {
    out.push("};");
    out.push("");
    out.push(`static const unsigned long ${id}_len = ${file.size}UL;`);
    out.push("");
  }
  if (opts.includeReport) {
    out.push("/* ------------------------------------------------------------------ */");
    out.push("/* Analysis report                                                     */");
    out.push("/* ------------------------------------------------------------------ */");
    out.push(emitStringArray(`${id}_report`, buildReportLines(result)));
  }
  if (opts.includeTables) {
    out.push("/* ------------------------------------------------------------------ */");
    out.push("/* Parsed library data                                                 */");
    out.push("/* ------------------------------------------------------------------ */");
    out.push(buildTables(result, id));
  }
  out.push("/* Generated by LUCKY HUB Binary Inspector. */");
  out.push("");
  return out.join("\n");
}

export async function exportFileAsCSource(
  file: File,
  result: AnalysisResult,
  userOpts: Partial<CSourceOptions>,
  callbacks: ExportCallbacks = {},
): Promise<ExportHandle> {
  const opts = sanitizeCSourceOptions(userOpts);
  const filename = cSourceFileName(file.name);
  const formatter = opts.includeBytes
    ? new HexByteFormatter({ bytesPerLine: opts.bytesPerLine, hexPrefix: opts.hexPrefix })
    : null;
  return streamTextExport(
    file,
    filename,
    {
      preamble: buildCSourcePreamble(file, result, opts),
      formatter,
      footer: buildCSourceFooter(file, result, opts),
    },
    callbacks,
    "text/x-c;charset=utf-8",
  );
}

/** Build a short preview (header + first bytes) for the dialog. */
export function previewCSource(
  file: File,
  result: AnalysisResult,
  userOpts: Partial<CSourceOptions>,
  headBytes = 128,
): string {
  const opts = sanitizeCSourceOptions(userOpts);
  const head = buildCSourcePreamble(file, result, opts);
  if (!opts.includeBytes) {
    return `${head}/* report and library tables follow */\n`;
  }
  const sample = result.view.subarray(0, Math.min(headBytes, result.view.length));
  const formatter = new HexByteFormatter({
    bytesPerLine: opts.bytesPerLine,
    hexPrefix: opts.hexPrefix,
  });
  const body = formatter.write(sample, 0) + formatter.flush();
  const more = result.size > sample.length ? "  /* … remaining bytes follow … */\n" : "";
  return `${head}${body}${more}};\n\n/* report + parsed library tables follow */\n`;
}
