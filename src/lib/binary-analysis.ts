/**
 * LUCKY HUB — Binary Inspector analysis engine.
 *
 * Everything here runs locally in the browser. Files are never uploaded;
 * there is no backend involved in analysis at all.
 *
 * This is a general-purpose static inspection toolkit (the browser cousin of
 * `file`, `readelf`, `strings`, and a hex editor). It reports what a binary
 * contains — headers, sections, strings, checksums — for learning,
 * debugging and triage. It does not modify files and offers no patching.
 */

export const ANALYSIS_LIMIT = 64 * 1024 * 1024; // 64 MB analyzed window

export interface StringHit {
  offset: number;
  text: string;
}

export interface IndicatorHit {
  offset: number;
  value: string;
  category: string;
}

export interface ElfSection {
  name: string;
  type: string;
  addr: number;
  offset: number;
  size: number;
  flags: string;
  /** Section header link (e.g. the string table backing a symbol table). */
  link: number;
  /** Fixed entry size for table sections (SYMTAB/DYNSYM/RELA…). */
  entsize: number;
}

export interface ElfProgram {
  type: string;
  offset: number;
  vaddr: number;
  filesz: number;
  flags: string;
}

export interface ElfInfo {
  valid: boolean;
  bitness: 32 | 64 | null;
  endian: "little" | "big" | null;
  type: string;
  machine: string;
  entry: number;
  sections: ElfSection[];
  programs: ElfProgram[];
}

export interface PeSection {
  name: string;
  virtualSize: number;
  virtualAddress: number;
  rawSize: number;
  rawOffset: number;
  entropy: number;
  /** IMAGE_SECTION_HEADER Characteristics — bit 0x20000000 marks executable code. */
  characteristics: number;
}

export interface PeInfo {
  valid: boolean;
  bitness: 32 | 64 | null;
  machine: string;
  timestamp: number | null;
  subsystem: string;
  entryPoint: number;
  imageBase: number;
  sections: PeSection[];
  /** Raw data directory table (export, import, resource …) as RVA/size pairs. */
  dataDirectories: { rva: number; size: number }[];
}

export interface ChunkEntropy {
  offset: number;
  entropy: number;
}

export interface HexRow {
  offset: number;
  hex: string[];
  ascii: string;
}

export interface ElfSymbol {
  name: string;
  value: number;
  size: number;
  bind: string;
  type: string;
  shndx: number;
  kind: "symtab" | "dynsym";
}

export interface PeImport {
  dll: string;
  name: string;
  ordinal: number | null;
}

export interface PeExport {
  name: string;
  ordinal: number;
  rva: number;
}

export interface FunctionCandidate {
  offset: number;
  pattern: string;
  arch: string;
  /** True when the candidate is the image entry point rather than a guessed prologue. */
  entry: boolean;
}

export interface AnalysisResult {
  name: string;
  size: number;
  truncated: boolean;
  /** The analyzed byte window (up to ANALYSIS_LIMIT) kept for follow-up scans. */
  view: Uint8Array;
  sha256: string;
  crc32: string;
  md5StyleSum: string;
  entropy: number;
  chunkEntropy: ChunkEntropy[];
  magic: string;
  format: "ELF" | "PE" | "Mach-O" | "Unknown";
  elf: ElfInfo;
  pe: PeInfo;
  strings: StringHit[];
  indicators: IndicatorHit[];
  symbols: ElfSymbol[];
  imports: PeImport[];
  exports: PeExport[];
  functions: FunctionCandidate[];
  scanMs: number;
}

/* ------------------------------------------------------------------ */
/* Checksums                                                           */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Range(data: Uint8Array, start: number, end: number): number {
  let crc = 0xffffffff;
  const lo = Math.max(0, Math.min(start, data.length));
  const hi = Math.max(lo, Math.min(end, data.length));
  for (let i = lo; i < hi; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function crc32Hex(value: number): string {
  return value.toString(16).toUpperCase().padStart(8, "0");
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Cheap non-crypto 64-bit-ish folding sum, used as a quick change detector. */
export function foldingSum(data: Uint8Array): string {
  let h1 = 0x9e3779b9;
  let h2 = 0x85ebca6b;
  for (let i = 0; i < data.length; i++) {
    h1 = (Math.imul(h1 ^ data[i], 0x01000193) >>> 0) + i;
    h2 = (Math.imul(h2 + data[i], 0x85ebca6b) >>> 0) ^ (h1 >>> 3);
  }
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0")).toUpperCase();
}

/* ------------------------------------------------------------------ */
/* Entropy                                                             */
/* ------------------------------------------------------------------ */

export function entropyOf(data: Uint8Array, start: number, end: number): number {
  const lo = Math.max(0, Math.min(start, data.length));
  const hi = Math.max(lo, Math.min(end, data.length));
  const n = hi - lo;
  if (n === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = lo; i < hi; i++) counts[data[i]]++;
  let h = 0;
  for (let i = 0; i < 256; i++) {
    if (counts[i] === 0) continue;
    const p = counts[i] / n;
    h -= p * Math.log2(p);
  }
  return h;
}

function chunkEntropy(data: Uint8Array, buckets = 64): ChunkEntropy[] {
  const out: ChunkEntropy[] = [];
  const n = data.length;
  if (n === 0) return out;
  const size = Math.max(1, Math.ceil(n / buckets));
  for (let off = 0; off < n; off += size) {
    const end = Math.min(n, off + size);
    out.push({ offset: off, entropy: entropyOf(data, off, end) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ELF parsing                                                         */
/* ------------------------------------------------------------------ */

function readU64(dv: DataView, off: number, le: boolean): number {
  if (le) return dv.getUint32(off, true) + dv.getUint32(off + 4, true) * 2 ** 32;
  return dv.getUint32(off + 4, false) + dv.getUint32(off, false) * 2 ** 32;
}

const ELF_TYPES: Record<number, string> = {
  0: "NONE", 1: "REL (relocatable)", 2: "EXEC (executable)", 3: "DYN (shared object)", 4: "CORE",
};

const ELF_MACHINES: Record<number, string> = {
  0x02: "SPARC", 0x03: "x86", 0x08: "MIPS", 0x14: "PowerPC", 0x28: "ARM",
  0x32: "IA-64", 0x3e: "x86-64", 0xb7: "AArch64", 0xf3: "RISC-V",
};

const SH_TYPES: Record<number, string> = {
  0: "NULL", 1: "PROGBITS", 2: "SYMTAB", 3: "STRTAB", 4: "RELA", 5: "HASH", 6: "DYNAMIC",
  7: "NOTE", 8: "NOBITS", 9: "REL", 11: "DYNSYM", 14: "INIT_ARRAY", 15: "FINI_ARRAY",
  0x6ffffff6: "GNU_HASH", 0x6ffffffe: "VERNEED", 0x6fffffff: "VERSYM", 0x6ffffffd: "VERDEF",
};

const PH_TYPES: Record<number, string> = {
  0: "NULL", 1: "LOAD", 2: "DYNAMIC", 3: "INTERP", 4: "NOTE", 6: "PHDR", 7: "TLS",
  0x6474e550: "GNU_EH_FRAME", 0x6474e551: "GNU_STACK", 0x6474e552: "GNU_RELRO", 0x6474e553: "GNU_PROPERTY",
};

function shFlagsStr(f: number | bigint): string {
  const n = typeof f === "bigint" ? Number(f) : f;
  const parts: string[] = [];
  if (n & 0x1) parts.push("W");
  if (n & 0x2) parts.push("A");
  if (n & 0x4) parts.push("X");
  if (n & 0x400) parts.push("M");
  if (n & 0x800) parts.push("S");
  return parts.join("") || "—";
}

function phFlagsStr(f: number): string {
  const parts: string[] = [];
  if (f & 4) parts.push("R");
  if (f & 2) parts.push("W");
  if (f & 1) parts.push("X");
  return parts.join("") || "—";
}

export function emptyElf(): ElfInfo {
  return { valid: false, bitness: null, endian: null, type: "—", machine: "—", entry: 0, sections: [], programs: [] };
}

export function parseElf(data: Uint8Array): ElfInfo {
  const info = emptyElf();
  if (data.length < 52) return info;
  if (data[0] !== 0x7f || data[1] !== 0x45 || data[2] !== 0x4c || data[3] !== 0x46) return info;

  info.valid = true;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const is64 = data[4] === 2;
  const le = data[5] === 1;
  info.bitness = is64 ? 64 : 32;
  info.endian = le ? "little" : "big";

  const e_type = dv.getUint16(16, le);
  const e_machine = dv.getUint16(18, le);
  info.type = ELF_TYPES[e_type] ?? `0x${e_type.toString(16)}`;
  info.machine = ELF_MACHINES[e_machine] ?? `0x${e_machine.toString(16)}`;

  if (is64) {
    if (data.length < 64) return info;
    info.entry = readU64(dv, 24, le);
  } else {
    info.entry = dv.getUint32(24, le);
  }

  const shoff = is64 ? readU64(dv, 40, le) : dv.getUint32(40, le);
  const shentsize = dv.getUint16(is64 ? 58 : 46, le);
  const shnum = dv.getUint16(is64 ? 60 : 48, le);
  const shstrndx = dv.getUint16(is64 ? 62 : 50, le);

  const phoff = is64 ? readU64(dv, 32, le) : dv.getUint32(32, le);
  const phentsize = dv.getUint16(is64 ? 54 : 42, le);
  const phnum = dv.getUint16(is64 ? 56 : 44, le);

  // Program headers
  if (phoff > 0 && phnum > 0 && phnum < 128) {
    for (let i = 0; i < phnum; i++) {
      const base = phoff + i * phentsize;
      if (base + (is64 ? 56 : 32) > data.length) break;
      try {
        if (is64) {
          const p_type = dv.getUint32(base, le);
          const p_flags = dv.getUint32(base + 4, le);
          info.programs.push({
            type: PH_TYPES[p_type] ?? `0x${p_type.toString(16)}`,
            offset: readU64(dv, base + 8, le),
            vaddr: readU64(dv, base + 16, le),
            filesz: readU64(dv, base + 32, le),
            flags: phFlagsStr(p_flags),
          });
        } else {
          const p_type = dv.getUint32(base, le);
          info.programs.push({
            type: PH_TYPES[p_type] ?? `0x${p_type.toString(16)}`,
            offset: dv.getUint32(base + 4, le),
            vaddr: dv.getUint32(base + 8, le),
            filesz: dv.getUint32(base + 16, le),
            flags: phFlagsStr(dv.getUint32(base + 24, le)),
          });
        }
      } catch {
        break;
      }
    }
  }

  // Section headers (with names from shstrtab)
  if (shoff > 0 && shnum > 0 && shnum < 4096 && shentsize > 0) {
    // First pass: locate shstrtab
    let strTab: Uint8Array | null = null;
    if (shstrndx < shnum) {
      const base = shoff + shstrndx * shentsize;
      if (base + (is64 ? 64 : 40) <= data.length) {
        try {
          const strOff = is64 ? readU64(dv, base + 24, le) : dv.getUint32(base + 16, le);
          const strSize = is64 ? readU64(dv, base + 32, le) : dv.getUint32(base + 20, le);
          if (strOff + strSize <= data.length) strTab = data.subarray(strOff, strOff + strSize);
        } catch { /* ignore */ }
      }
    }
    const readName = (nameOff: number): string => {
      if (!strTab || nameOff >= strTab.length) return "";
      let end = nameOff;
      while (end < strTab.length && strTab[end] !== 0) end++;
      return new TextDecoder().decode(strTab.subarray(nameOff, end));
    };

    for (let i = 0; i < shnum; i++) {
      const base = shoff + i * shentsize;
      if (base + (is64 ? 64 : 40) > data.length) break;
      try {
        if (is64) {
          const sh_name = dv.getUint32(base, le);
          const sh_type = dv.getUint32(base + 4, le);
          const sh_flags = readU64(dv, base + 8, le);
          const sh_addr = readU64(dv, base + 16, le);
          const sh_offset = readU64(dv, base + 24, le);
          const sh_size = readU64(dv, base + 32, le);
          info.sections.push({
            name: readName(sh_name) || `<unnamed ${i}>`,
            type: SH_TYPES[sh_type] ?? `0x${sh_type.toString(16)}`,
            addr: sh_addr,
            offset: sh_offset,
            size: sh_size,
            flags: shFlagsStr(sh_flags),
            link: dv.getUint32(base + 40, le),
            entsize: readU64(dv, base + 56, le),
          });
        } else {
          const sh_name = dv.getUint32(base, le);
          const sh_type = dv.getUint32(base + 4, le);
          const sh_flags = dv.getUint32(base + 8, le);
          info.sections.push({
            name: readName(sh_name) || `<unnamed ${i}>`,
            type: SH_TYPES[sh_type] ?? `0x${sh_type.toString(16)}`,
            addr: dv.getUint32(base + 12, le),
            offset: dv.getUint32(base + 16, le),
            size: dv.getUint32(base + 20, le),
            flags: shFlagsStr(sh_flags),
            link: dv.getUint32(base + 24, le),
            entsize: dv.getUint32(base + 36, le),
          });
        }
      } catch {
        break;
      }
    }
  }

  return info;
}

/* ------------------------------------------------------------------ */
/* PE parsing                                                          */
/* ------------------------------------------------------------------ */

const PE_MACHINES: Record<number, string> = {
  0x014c: "i386", 0x8664: "x86-64", 0x01c0: "ARM", 0x01c4: "ARMNT", 0xaa64: "ARM64",
  0x0200: "IA-64", 0x5032: "RISC-V32", 0x5064: "RISC-V64",
};

function emptyPe(): PeInfo {
  return {
    valid: false,
    bitness: null,
    machine: "—",
    timestamp: null,
    subsystem: "—",
    entryPoint: 0,
    imageBase: 0,
    sections: [],
    dataDirectories: [],
  };
}

export function parsePe(data: Uint8Array): PeInfo {
  const info = emptyPe();
  if (data.length < 0x40) return info;
  if (data[0] !== 0x4d || data[1] !== 0x5a) return info; // "MZ"

  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let e_lfanew: number;
  try {
    e_lfanew = dv.getUint32(0x3c, true);
  } catch {
    return info;
  }
  if (e_lfanew + 24 > data.length) return info;
  if (data[e_lfanew] !== 0x50 || data[e_lfanew + 1] !== 0x45) return info; // "PE"

  info.valid = true;
  const machine = dv.getUint16(e_lfanew + 4, true);
  const numSections = dv.getUint16(e_lfanew + 6, true);
  const timestamp = dv.getUint32(e_lfanew + 8, true);
  const optSize = dv.getUint16(e_lfanew + 20, true);
  info.machine = PE_MACHINES[machine] ?? `0x${machine.toString(16)}`;
  info.timestamp = timestamp;

  const optBase = e_lfanew + 24;
  if (optSize >= 68 && optBase + 68 <= data.length) {
    const magic = dv.getUint16(optBase, true);
    const is64 = magic === 0x20b;
    info.bitness = is64 ? 64 : 32;

    // AddressOfEntryPoint sits at optional-header offset 16 for both widths.
    info.entryPoint = dv.getUint32(optBase + 16, true);
    // ImageBase is 4 bytes at +28 (PE32) or 8 bytes at +24 (PE32+).
    info.imageBase = is64 ? readU64(dv, optBase + 24, true) : dv.getUint32(optBase + 28, true);

    // Subsystem is at optional-header offset 68 for both PE32 and PE32+.
    if (optBase + 70 <= data.length) {
      const sub = dv.getUint16(optBase + 68, true);
      info.subsystem = sub === 2 ? "Windows GUI" : sub === 3 ? "Console" : `0x${sub.toString(16)}`;
    }

    const dirOff = optBase + (is64 ? 112 : 96);
    const numDirsOff = optBase + (is64 ? 108 : 92);
    const numDirs = numDirsOff + 4 <= data.length ? dv.getUint32(numDirsOff, true) : 0;
    for (let i = 0; i < Math.min(numDirs, 16); i++) {
      const b = dirOff + i * 8;
      if (b + 8 > data.length) break;
      info.dataDirectories.push({ rva: dv.getUint32(b, true), size: dv.getUint32(b + 4, true) });
    }
  }

  const secBase = optBase + optSize;
  for (let i = 0; i < Math.min(numSections, 96); i++) {
    const base = secBase + i * 40;
    if (base + 40 > data.length) break;
    const nameBytes = data.subarray(base, base + 8);
    let nameEnd = 0;
    while (nameEnd < 8 && nameBytes[nameEnd] !== 0) nameEnd++;
    const name = new TextDecoder().decode(nameBytes.subarray(0, nameEnd)) || `<${i}>`;
    const virtualSize = dv.getUint32(base + 8, true);
    const virtualAddress = dv.getUint32(base + 12, true);
    const rawSize = dv.getUint32(base + 16, true);
    const rawOffset = dv.getUint32(base + 20, true);
    info.sections.push({
      name,
      virtualSize,
      virtualAddress,
      rawSize,
      rawOffset,
      entropy: entropyOf(data, rawOffset, rawOffset + rawSize),
      characteristics: dv.getUint32(base + 36, true),
    });
  }
  return info;
}

/* ------------------------------------------------------------------ */
/* PE RVA mapping + import / export tables                             */
/* ------------------------------------------------------------------ */

/** Translate an RVA into a file offset, or null when it is not file-backed. */
export function rvaToOffset(pe: PeInfo, data: Uint8Array, rva: number): number | null {
  if (!pe.valid) return null;
  for (const s of pe.sections) {
    const span = Math.max(s.rawSize, s.virtualSize);
    if (rva >= s.virtualAddress && rva < s.virtualAddress + span) {
      const off = s.rawOffset + (rva - s.virtualAddress);
      return off >= 0 && off < data.length ? off : null;
    }
  }
  return rva < data.length ? rva : null;
}

function readCString(data: Uint8Array, offset: number, max = 512): string {
  if (offset < 0 || offset >= data.length) return "";
  let end = offset;
  const limit = Math.min(data.length, offset + max);
  while (end < limit && data[end] !== 0) end++;
  return new TextDecoder().decode(data.subarray(offset, end));
}

/** Walk the PE import directory, resolving each DLL and imported symbol. */
export function parsePeImports(data: Uint8Array, pe: PeInfo): PeImport[] {
  const out: PeImport[] = [];
  if (!pe.valid) return out;
  const dir = pe.dataDirectories[1];
  if (!dir || dir.rva === 0) return out;
  const descriptorBase = rvaToOffset(pe, data, dir.rva);
  if (descriptorBase === null) return out;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const is64 = pe.bitness === 64;
  const thunk = is64 ? 8 : 4;

  for (let d = 0; d < 512; d++) {
    const base = descriptorBase + d * 20;
    if (base + 20 > data.length) break;
    const originalFirstThunk = dv.getUint32(base, true);
    const nameRva = dv.getUint32(base + 12, true);
    const firstThunk = dv.getUint32(base + 16, true);
    if (originalFirstThunk === 0 && nameRva === 0 && firstThunk === 0) break;
    const dllOff = rvaToOffset(pe, data, nameRva);
    const dll = dllOff !== null ? readCString(data, dllOff, 260) : "?";
    const thunkRva = originalFirstThunk || firstThunk;
    const thunkOff = rvaToOffset(pe, data, thunkRva);
    if (thunkOff === null) continue;
    for (let t = 0; t < 4096; t++) {
      const off = thunkOff + t * thunk;
      if (off + thunk > data.length) break;
      const lo = dv.getUint32(off, true);
      const hi = is64 ? dv.getUint32(off + 4, true) : 0;
      if (lo === 0 && hi === 0) break;
      const byOrdinal = is64 ? (hi & 0x80000000) !== 0 : (lo & 0x80000000) !== 0;
      if (byOrdinal) {
        out.push({ dll, name: "", ordinal: lo & 0xffff });
      } else {
        const nbr = rvaToOffset(pe, data, lo);
        if (nbr !== null && nbr + 2 < data.length) {
          out.push({ dll, name: readCString(data, nbr + 2, 256), ordinal: null });
        }
      }
      if (out.length >= 20000) return out;
    }
  }
  return out;
}

/** Parse the named entries of a PE export directory. */
export function parsePeExports(data: Uint8Array, pe: PeInfo): PeExport[] {
  const out: PeExport[] = [];
  if (!pe.valid) return out;
  const dir = pe.dataDirectories[0];
  if (!dir || dir.rva === 0) return out;
  const base = rvaToOffset(pe, data, dir.rva);
  if (base === null || base + 40 > data.length) return out;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const numFuncs = dv.getUint32(base + 0x14, true);
  const numNames = dv.getUint32(base + 0x18, true);
  const addrFuncs = dv.getUint32(base + 0x1c, true);
  const addrNames = dv.getUint32(base + 0x20, true);
  const addrOrds = dv.getUint32(base + 0x24, true);
  const funcsOff = rvaToOffset(pe, data, addrFuncs);
  const namesOff = rvaToOffset(pe, data, addrNames);
  const ordsOff = rvaToOffset(pe, data, addrOrds);
  if (namesOff === null || ordsOff === null) return out;
  const count = Math.min(numNames, 20000);
  for (let i = 0; i < count; i++) {
    if (namesOff + (i + 1) * 4 > data.length) break;
    if (ordsOff + (i + 1) * 2 > data.length) break;
    const nameRva = dv.getUint32(namesOff + i * 4, true);
    const nameOff = rvaToOffset(pe, data, nameRva);
    if (nameOff === null) continue;
    const ordinal = dv.getUint16(ordsOff + i * 2, true);
    let rva = 0;
    if (funcsOff !== null && ordinal < numFuncs && funcsOff + (ordinal + 1) * 4 <= data.length) {
      rva = dv.getUint32(funcsOff + ordinal * 4, true);
    }
    out.push({ name: readCString(data, nameOff, 256), ordinal, rva });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ELF symbol tables                                                   */
/* ------------------------------------------------------------------ */

const SYM_BINDS = ["LOCAL", "GLOBAL", "WEAK"];
const SYM_TYPES = ["NOTYPE", "OBJECT", "FUNC", "SECTION", "FILE", "COMMON", "TLS"];

/** Extract .symtab and .dynsym entries, resolving names via the linked strtab. */
export function parseElfSymbols(data: Uint8Array, elf: ElfInfo): ElfSymbol[] {
  const out: ElfSymbol[] = [];
  if (!elf.valid || elf.bitness === null) return out;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const is64 = elf.bitness === 64;
  const le = elf.endian === "little";

  for (const sec of elf.sections) {
    if (sec.type !== "SYMTAB" && sec.type !== "DYNSYM") continue;
    const kind: ElfSymbol["kind"] = sec.type === "SYMTAB" ? "symtab" : "dynsym";
    const entSize = sec.entsize || (is64 ? 24 : 16);
    const strSec = elf.sections[sec.link];
    if (!strSec || entSize <= 0) continue;
    const strStart = strSec.offset;
    const strEnd = Math.min(data.length, strSec.offset + strSec.size);
    const readName = (off: number): string => {
      const at = strStart + off;
      if (off < 0 || at < strStart || at >= strEnd) return "";
      let end = at;
      const limit = Math.min(strEnd, at + 256);
      while (end < limit && data[end] !== 0) end++;
      return new TextDecoder().decode(data.subarray(at, end));
    };
    const count = Math.min(Math.floor(sec.size / entSize), 20000);
    for (let i = 0; i < count; i++) {
      const base = sec.offset + i * entSize;
      if (base + entSize > data.length) break;
      try {
        let nameOff: number;
        let value: number;
        let size: number;
        let info: number;
        let shndx: number;
        if (is64) {
          nameOff = dv.getUint32(base, le);
          info = data[base + 4];
          shndx = dv.getUint16(base + 6, le);
          value = readU64(dv, base + 8, le);
          size = readU64(dv, base + 16, le);
        } else {
          nameOff = dv.getUint32(base, le);
          value = dv.getUint32(base + 4, le);
          size = dv.getUint32(base + 8, le);
          info = data[base + 12];
          shndx = dv.getUint16(base + 14, le);
        }
        const name = readName(nameOff);
        if (!name) continue;
        out.push({
          name,
          value,
          size,
          bind: SYM_BINDS[info >> 4] ?? `0x${(info >> 4).toString(16)}`,
          type: SYM_TYPES[info & 0xf] ?? `0x${(info & 0xf).toString(16)}`,
          shndx,
          kind,
        });
      } catch {
        break;
      }
    }
    if (out.length >= 20000) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Function candidates (prologue heuristics over executable sections)  */
/* ------------------------------------------------------------------ */

const PROLOGUES: { bytes: number[]; label: string; arch: string }[] = [
  { bytes: [0xf3, 0x0f, 0x1e, 0xfa], label: "endbr64", arch: "x86-64" },
  { bytes: [0xf3, 0x0f, 0x1e, 0xfb], label: "endbr32", arch: "x86" },
  { bytes: [0x55, 0x48, 0x89, 0xe5], label: "push rbp; mov rbp, rsp", arch: "x86-64" },
  { bytes: [0x55, 0x8b, 0xec], label: "push ebp; mov ebp, esp", arch: "x86" },
  { bytes: [0x55, 0x89, 0xe5], label: "push ebp; mov ebp, esp", arch: "x86" },
  { bytes: [0x48, 0x83, 0xec], label: "sub rsp, imm8", arch: "x86-64" },
  { bytes: [0xfd, 0x7b, 0xbf, 0xa9], label: "stp x29, x30, [sp, #-16]!", arch: "aarch64" },
  { bytes: [0xfd, 0x7b, 0xbd, 0xa9], label: "stp x29, x30, [sp, #-48]!", arch: "aarch64" },
];

export function findFunctionCandidates(
  data: Uint8Array,
  elf: ElfInfo,
  pe: PeInfo,
  limit = 4000,
): FunctionCandidate[] {
  const byFirst = new Map<number, typeof PROLOGUES>();
  for (const p of PROLOGUES) {
    const list = byFirst.get(p.bytes[0]) ?? [];
    list.push(p);
    byFirst.set(p.bytes[0], list);
  }

  const ranges: { offset: number; size: number }[] = [];
  if (elf.valid) {
    for (const s of elf.sections) {
      if (s.size > 0 && s.type !== "NOBITS" && s.flags.includes("X")) {
        ranges.push({ offset: s.offset, size: s.size });
      }
    }
  } else if (pe.valid) {
    for (const s of pe.sections) {
      if (s.rawSize > 0 && (s.characteristics & 0x20000000 || s.characteristics & 0x20)) {
        ranges.push({ offset: s.rawOffset, size: s.rawSize });
      }
    }
  }

  const out: FunctionCandidate[] = [];
  for (const r of ranges) {
    const start = Math.max(0, r.offset);
    const end = Math.min(data.length, r.offset + r.size);
    for (let i = start; i + 4 <= end; i++) {
      const cands = byFirst.get(data[i]);
      if (!cands) continue;
      for (const p of cands) {
        let match = true;
        for (let k = 1; k < p.bytes.length; k++) {
          if (data[i + k] !== p.bytes[k]) {
            match = false;
            break;
          }
        }
        if (match) {
          out.push({ offset: i, pattern: p.label, arch: p.arch, entry: false });
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Address → file offset                                               */
/* ------------------------------------------------------------------ */

/** Map an ELF virtual address to a file offset using LOAD segments, then sections. */
export function elfVaddrToOffset(elf: ElfInfo, vaddr: number): number | null {
  for (const p of elf.programs) {
    if (p.type !== "LOAD") continue;
    if (vaddr >= p.vaddr && vaddr < p.vaddr + p.filesz) return p.offset + (vaddr - p.vaddr);
  }
  for (const s of elf.sections) {
    if (s.type === "NOBITS" || s.size <= 0) continue;
    if (vaddr >= s.addr && vaddr < s.addr + s.size) return s.offset + (vaddr - s.addr);
  }
  return null;
}

/** Resolve any address (ELF vaddr or PE vaddr) to a file offset within the analyzed view. */
export function vaddrToOffset(result: AnalysisResult, vaddr: number): number | null {
  if (result.elf.valid) return elfVaddrToOffset(result.elf, vaddr);
  if (result.pe.valid) return rvaToOffset(result.pe, result.view, vaddr - result.pe.imageBase);
  return null;
}

/* ------------------------------------------------------------------ */
/* Strings                                                             */
/* ------------------------------------------------------------------ */

export const STRINGS_MIN_DEFAULT = 5;
const STRINGS_MAX_RESULTS = 30000;

export function extractStrings(data: Uint8Array, minLength: number): StringHit[] {
  const out: StringHit[] = [];
  const min = Math.max(2, Math.min(minLength, 128));
  let runStart = -1;
  const n = data.length;
  const ascii = new TextDecoder("ascii");
  for (let i = 0; i <= n; i++) {
    const b = i < n ? data[i] : 0;
    const isPrintable = b >= 0x20 && b <= 0x7e;
    if (isPrintable) {
      if (runStart < 0) runStart = i;
    } else {
      if (runStart >= 0 && i - runStart >= min) {
        out.push({ offset: runStart, text: ascii.decode(data.subarray(runStart, i)) });
        if (out.length >= STRINGS_MAX_RESULTS) return out;
      }
      runStart = -1;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Indicators (informational string categories)                        */
/* ------------------------------------------------------------------ */

interface Category {
  name: string;
  test: (s: string) => boolean;
}

const DOMAIN_RE = /^(?!.*\.so$)(?!.*\.so\.)(?!lib)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/i;

const CATEGORIES: Category[] = [
  {
    name: "URLs",
    test: (s) => /^https?:\/\/\S{4,}$/i.test(s),
  },
  {
    name: "Hostnames & domains",
    test: (s) => s.length >= 6 && s.length <= 253 && DOMAIN_RE.test(s),
  },
  {
    name: "Filesystem paths",
    test: (s) =>
      /^\/(data|system|vendor|storage|proc|dev|etc|usr|lib|bin|sbin|apex|product|odm|mnt|cache|sys|config|application)\//i.test(s) ||
      /^[a-z]:\\[^\s]{3,}/i.test(s) ||
      s.startsWith("/proc/") ||
      s.startsWith("/dev/"),
  },
  {
    name: "Java packages & classes",
    test: (s) =>
      /^(android|java|javax|com|org|net|io|de|cn)\.[a-zA-Z0-9_$.]{3,}$/.test(s) ||
      /^L[a-z][a-zA-Z0-9/$_]*;$/.test(s) ||
      /^java\/[a-zA-Z0-9/_$]+$/.test(s) ||
      /^android\/[a-zA-Z0-9/_$]+$/.test(s),
  },
  {
    name: "Symbols & exports",
    test: (s) =>
      s.startsWith("__") ||
      /^_Z[NKLVIT]/.test(s) ||
      s.startsWith("Java_") ||
      s.includes("@GLIBC") ||
      s.startsWith("_ZN") ||
      /^(JNI_OnLoad|JNI_OnUnload)$/.test(s),
  },
  {
    name: "Crypto & security primitives",
    test: (s) =>
      /^(AES|RSA|ECDSA|SHA-?(1|256|512)?|MD5|HMAC| ChaCha20|Salsa20|Curve25519|P-256|TLSv1\.[0-3]|SSLv[23])$/i.test(s.trim()) ||
      /^(EVP_|BIGNUM|RSA_|EC_KEY|AES_|SHA_|HMAC_)/.test(s) ||
      /^(openssl|mbedtls|boringssl|libsodium|wolfssl|gnutls)$/i.test(s),
  },
  {
    name: "Build & toolchain tags",
    test: (s) =>
      /^(arm|aarch64|x86_64|i386|mips)-/i.test(s) ||
      /clang version|GCC: \(|Android \(?\d+|NDK|r[0-9]+[a-z]?\/|rustc version|go1\.\d+/i.test(s) ||
      /^\.note\.go?buildid$/.test(s),
  },
  {
    name: "Log tags & linker notes",
    test: (s) =>
      /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}/.test(s) ||
      /^(D\/|E\/|I\/|W\/|V\/)[A-Za-z0-9_. -]{2,40}/.test(s) ||
      /^(DEBUG|INFO|WARN|ERROR|FATAL)[:\s]/.test(s),
  },
];

function collectIndicators(strings: StringHit[]): IndicatorHit[] {
  const hits: IndicatorHit[] = [];
  const perCategory = new Map<string, number>();
  const MAX_PER_CATEGORY = 250;
  outer: for (const hit of strings) {
    const s = hit.text.trim();
    if (s.length < 4 || s.length > 300) continue;
    for (const cat of CATEGORIES) {
      if (cat.test(s)) {
        const count = perCategory.get(cat.name) ?? 0;
        if (count >= MAX_PER_CATEGORY) continue;
        perCategory.set(cat.name, count + 1);
        hits.push({ offset: hit.offset, value: s, category: cat.name });
        if (hits.length >= 5000) break outer;
        break;
      }
    }
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* Hex dump                                                            */
/* ------------------------------------------------------------------ */

export const HEX_ROW_BYTES = 16;

export function hexRow(data: Uint8Array, rowOffset: number): HexRow {
  const hex: string[] = [];
  let ascii = "";
  for (let i = 0; i < HEX_ROW_BYTES; i++) {
    const off = rowOffset + i;
    if (off < data.length) {
      const b = data[off];
      hex.push(b.toString(16).padStart(2, "0"));
      ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : "·";
    } else {
      hex.push("  ");
      ascii += " ";
    }
  }
  return { offset: rowOffset, hex, ascii };
}

/* ------------------------------------------------------------------ */
/* Top-level analysis                                                  */
/* ------------------------------------------------------------------ */

function detectFormat(data: Uint8Array): { format: AnalysisResult["format"]; magic: string } {
  if (data.length >= 4 && data[0] === 0x7f && data[1] === 0x45 && data[2] === 0x4c && data[3] === 0x46)
    return { format: "ELF", magic: "7F 45 4C 46 (ELF)" };
  if (data.length >= 2 && data[0] === 0x4d && data[1] === 0x5a)
    return { format: "PE", magic: "4D 5A (MZ / PE)" };
  if (
    data.length >= 4 &&
    ((data[0] === 0xcf && data[1] === 0xfa && data[2] === 0xed && data[3] === 0xfe) ||
      (data[0] === 0xca && data[1] === 0xfe && data[2] === 0xba && data[3] === 0xbe))
  )
    return { format: "Mach-O", magic: "CF FA ED FE (Mach-O)" };
  const magic = [...data.subarray(0, Math.min(8, data.length))]
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(" ");
  return { format: "Unknown", magic: magic || "—" };
}

export async function analyzeFile(file: File): Promise<AnalysisResult> {
  const t0 = performance.now();
  const truncated = file.size > ANALYSIS_LIMIT;
  const buf = await file.slice(0, ANALYSIS_LIMIT).arrayBuffer();
  const data = new Uint8Array(buf);

  const { format, magic } = detectFormat(data);
  const strings = extractStrings(data, STRINGS_MIN_DEFAULT);
  const elf = parseElf(data);
  const pe = parsePe(data);
  const symbols = parseElfSymbols(data, elf);
  const imports = parsePeImports(data, pe);
  const exports = parsePeExports(data, pe);
  const functions = findFunctionCandidates(data, elf, pe);

  let entryOffset: number | null = null;
  if (elf.valid && elf.entry > 0) entryOffset = elfVaddrToOffset(elf, elf.entry);
  else if (pe.valid && pe.entryPoint > 0) entryOffset = rvaToOffset(pe, data, pe.entryPoint);
  if (entryOffset !== null && entryOffset < data.length) {
    functions.unshift({
      offset: entryOffset,
      pattern: "image entry point",
      arch: elf.valid ? elf.machine : pe.machine,
      entry: true,
    });
  }

  const result: AnalysisResult = {
    name: file.name,
    size: file.size,
    truncated,
    view: data,
    sha256: await sha256Hex(data),
    crc32: crc32Hex(crc32Range(data, 0, data.length)),
    md5StyleSum: foldingSum(data),
    entropy: entropyOf(data, 0, data.length),
    chunkEntropy: chunkEntropy(data),
    magic,
    format,
    elf,
    pe,
    strings,
    indicators: collectIndicators(strings),
    symbols,
    imports,
    exports,
    functions,
    scanMs: Math.round(performance.now() - t0),
  };
  return result;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function hexOffset(n: number, width = 8): string {
  return "0x" + n.toString(16).toUpperCase().padStart(width, "0");
}

export function entropyVerdict(e: number): { label: string; tone: "ok" | "warn" | "danger" } {
  if (e < 4) return { label: "Low entropy — structured data / code", tone: "ok" };
  if (e < 7.2) return { label: "Mixed — code and compressed sections", tone: "warn" };
  return { label: "High entropy — likely packed or encrypted", tone: "danger" };
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
