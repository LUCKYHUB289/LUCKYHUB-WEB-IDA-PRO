/**
 * LUCKY HUB — tiny dependency-free syntax highlighter.
 *
 * A single scanner that understands C/C++, Lua and Java well enough to colour
 * comments, strings, numbers, keywords and types. No external editor bundle,
 * no CDN, no bundle-size cost.
 */

import type { HighlightLanguage } from "@/lib/ui-codegen";

export type TokenType =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "type"
  | "literal"
  | "punctuation"
  | "plain";

export interface CodeToken {
  type: TokenType;
  value: string;
}

const KEYWORDS: Record<HighlightLanguage, string[]> = {
  cpp: [
    "alignas", "auto", "break", "case", "catch", "class", "const", "constexpr", "continue",
    "default", "delete", "do", "else", "enum", "explicit", "export", "extern", "for", "friend",
    "goto", "if", "inline", "namespace", "new", "noexcept", "operator", "override", "private",
    "protected", "public", "return", "sizeof", "static", "struct", "switch", "template", "this",
    "throw", "try", "typedef", "typename", "union", "using", "virtual", "volatile", "while",
  ],
  lua: [
    "and", "break", "do", "else", "elseif", "end", "false", "for", "function", "goto", "if",
    "in", "local", "nil", "not", "or", "repeat", "return", "then", "true", "until", "while",
  ],
  java: [
    "abstract", "assert", "break", "case", "catch", "class", "const", "continue", "default",
    "do", "else", "enum", "extends", "final", "finally", "for", "goto", "if", "implements",
    "import", "instanceof", "interface", "native", "new", "package", "private", "protected",
    "public", "return", "static", "strictfp", "super", "switch", "synchronized", "this", "throw",
    "throws", "transient", "try", "volatile", "while",
  ],
};

const TYPES: Record<HighlightLanguage, string[]> = {
  cpp: [
    "bool", "char", "char8_t", "char16_t", "char32_t", "double", "float", "int", "long", "short",
    "signed", "unsigned", "void", "wchar_t", "size_t", "uint8_t", "uint16_t", "uint32_t",
    "uint64_t", "int8_t", "int16_t", "int32_t", "int64_t", "ImVec2", "ImVec4", "ImU32", "QString",
    "QWidget", "QLabel", "QPushButton", "QLineEdit", "QCheckBox", "QSlider", "QProgressBar",
  ],
  lua: ["love", "table", "string", "math", "os", "io", "coroutine"],
  java: [
    "boolean", "byte", "char", "double", "float", "int", "long", "short", "void", "String",
    "Object", "Integer", "Double", "Boolean", "JFrame", "JPanel", "JLabel", "JButton",
    "JTextField", "JCheckBox", "JSlider", "JProgressBar", "Color", "Font", "BorderFactory",
    "SwingConstants", "SwingUtilities", "System",
  ],
};

const LITERALS = new Set(["true", "false", "null", "nullptr", "nil", "undefined", "self", "NULL"]);

function classifyIdentifier(word: string, lang: HighlightLanguage): TokenType {
  if (KEYWORDS[lang].includes(word)) return "keyword";
  if (LITERALS.has(word)) return "literal";
  if (TYPES[lang].includes(word)) return "type";
  // Heuristic: PascalCase identifiers usually read as types/classes.
  if (/^[A-Z][A-Za-z0-9]*$/.test(word) && word.length > 1) return "type";
  return "plain";
}

const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_$]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

export function tokenize(code: string, lang: HighlightLanguage): CodeToken[] {
  const tokens: CodeToken[] = [];
  const n = code.length;
  let i = 0;

  const push = (type: TokenType, value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last && last.type === type) last.value += value;
    else tokens.push({ type, value });
  };

  while (i < n) {
    const ch = code[i];

    // Block comments
    if (lang !== "lua" && ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      push("comment", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (lang === "lua" && code.startsWith("--[[", i)) {
      const end = code.indexOf("]]", i + 4);
      const stop = end === -1 ? n : end + 2;
      push("comment", code.slice(i, stop));
      i = stop;
      continue;
    }

    // Line comments
    const lineComment = lang === "lua" ? "--" : "//";
    if (code.startsWith(lineComment, i)) {
      let stop = code.indexOf("\n", i);
      if (stop === -1) stop = n;
      push("comment", code.slice(i, stop));
      i = stop;
      continue;
    }

    // Lua long strings [[ ... ]]
    if (lang === "lua" && code.startsWith("[[", i)) {
      const end = code.indexOf("]]", i + 2);
      const stop = end === -1 ? n : end + 2;
      push("string", code.slice(i, stop));
      i = stop;
      continue;
    }

    // Quoted strings / chars
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          j += 1;
          break;
        }
        if (code[j] === "\n") break;
        j += 1;
      }
      push("string", code.slice(i, Math.min(j, n)));
      i = j;
      continue;
    }

    // Numbers
    if (isDigit(ch) || (ch === "." && isDigit(code[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9A-Fa-fxXbBoO._eE+-]/.test(code[j])) {
        // stop after a sign that is not part of an exponent
        if ((code[j] === "+" || code[j] === "-") && !/[eE]/.test(code[j - 1] ?? "")) break;
        j += 1;
      }
      push("number", code.slice(i, j));
      i = j;
      continue;
    }

    // Identifiers
    if (isIdentStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentPart(code[j])) j += 1;
      const word = code.slice(i, j);
      push(classifyIdentifier(word, lang), word);
      i = j;
      continue;
    }

    // Whitespace / punctuation
    if (/\s/.test(ch)) {
      let j = i;
      while (j < n && /\s/.test(code[j])) j += 1;
      push("plain", code.slice(i, j));
      i = j;
      continue;
    }

    push("punctuation", ch);
    i += 1;
  }

  return tokens;
}
