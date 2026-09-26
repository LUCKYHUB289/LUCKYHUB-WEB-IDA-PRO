import { tokenize, type TokenType } from "@/lib/code-highlight";
import type { HighlightLanguage } from "@/lib/ui-codegen";
import { cn } from "@/lib/utils";
import { useCallback, useMemo, useRef } from "react";

const TOKEN_CLASS: Record<TokenType, string> = {
  comment: "text-muted-foreground/70 italic",
  string: "text-emerald",
  number: "text-warn",
  keyword: "text-gold font-medium",
  type: "text-gold-bright",
  literal: "text-danger",
  punctuation: "text-foreground/45",
  plain: "text-foreground/90",
};

/** Renders highlighted code as a fragment of <span>s. */
export function HighlightedCode({
  code,
  language,
}: {
  code: string;
  language: HighlightLanguage;
}) {
  const tokens = useMemo(() => tokenize(code, language), [code, language]);
  return (
    <>
      {tokens.map((token, index) => (
        <span key={index} className={TOKEN_CLASS[token.type]}>
          {token.value}
        </span>
      ))}
    </>
  );
}

/**
 * Editable syntax-highlighted code field.
 *
 * A transparent <textarea> sits on top of a highlighted <pre>; both share the
 * exact same font metrics and padding so the caret lines up perfectly.
 */
export function CodeEditor({
  value,
  onChange,
  language,
  className,
  readOnly = false,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  language: HighlightLanguage;
  className?: string;
  readOnly?: boolean;
  ariaLabel?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLDivElement>(null);

  const sync = useCallback(() => {
    const ta = taRef.current;
    const pre = preRef.current;
    if (!ta || !pre) return;
    pre.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
  }, []);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/60 bg-[#0c0c08]",
        className,
      )}
    >
      <pre
        aria-hidden
        className="pointer-events-none absolute inset-0 m-0 overflow-hidden p-3 font-mono-tight text-[12.5px] leading-[1.6] whitespace-pre"
      >
        <div ref={preRef} className="min-w-full will-change-transform">
          <HighlightedCode code={`${value}\n`} language={language} />
        </div>
      </pre>
      <textarea
        ref={taRef}
        value={value}
        readOnly={readOnly}
        aria-label={ariaLabel ?? "Code editor"}
        spellCheck={false}
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        onKeyDown={(e) => {
          if (e.key !== "Tab" || readOnly) return;
          e.preventDefault();
          const ta = e.currentTarget;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          onChange(`${value.slice(0, start)}  ${value.slice(end)}`);
          requestAnimationFrame(() => {
            ta.selectionStart = start + 2;
            ta.selectionEnd = start + 2;
          });
        }}
        className="scrollbar-gold relative block h-full w-full resize-none overflow-auto bg-transparent p-3 font-mono-tight text-[12.5px] leading-[1.6] whitespace-pre text-transparent caret-gold outline-none"
      />
    </div>
  );
}
