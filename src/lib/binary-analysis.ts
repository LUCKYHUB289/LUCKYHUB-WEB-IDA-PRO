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
}

export interface PeInfo {
  valid: boolean;
  machine: string;
  timestamp: number | null;
  subsystem: string;
  sections: PeSection[];
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
  return { valid: false, machine: "—", timestamp: null, subsystem: "—", sections: [] };
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
    const subOff = magic === 0x20b ? optBase + 68 : optBase + 68 - 16;
    if (subOff + 2 <= data.length) {
      const sub = dv.getUint16(subOff, true);
      info.subsystem = sub === 2 ? "Windows GUI" : sub === 3 ? "Console" : `0x${sub.toString(16)}`;
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
    });
  }
  return info;
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
    elf: parseElf(data),
    pe: parsePe(data),
    strings,
    indicators: collectIndicators(strings),
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
