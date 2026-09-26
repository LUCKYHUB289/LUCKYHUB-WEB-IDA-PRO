import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { CodeEditor } from "@/components/studio/CodeEditor";
import {
  DEFAULT_UI_DOC,
  UI_TARGETS,
  WIDGET_KINDS,
  generateCode,
  nextWidgetId,
  targetInfo,
  type UiDoc,
  type UiTarget,
  type Widget,
  type WidgetKind,
  widgetKindInfo,
} from "@/lib/ui-codegen";
import { cn } from "@/lib/utils";
import { Code2, Copy, Download, LayoutTemplate, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Canvas widget preview                                               */
/* ------------------------------------------------------------------ */

function WidgetPreview({ widget }: { widget: Widget }) {
  const base: React.CSSProperties = {
    position: "absolute",
    left: widget.x,
    top: widget.y,
    width: widget.w,
    height: widget.h,
  };
  const textStyle: React.CSSProperties = {
    color: widget.color,
    fontSize: widget.fontSize,
    lineHeight: 1.3,
  };

  switch (widget.kind) {
    case "panel":
      return <div style={{ ...base, background: widget.color, borderRadius: 6 }} />;
    case "label":
      return (
        <div style={{ ...base, ...textStyle, display: "flex", alignItems: "center" }}>
          {widget.text}
        </div>
      );
    case "button":
      return (
        <div
          style={{
            ...base,
            background: widget.color,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "#14140e", fontSize: widget.fontSize, fontWeight: 600 }}>
            {widget.text}
          </span>
        </div>
      );
    case "input":
      return (
        <div
          style={{
            ...base,
            background: widget.color,
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            paddingLeft: 10,
          }}
        >
          <span style={{ color: "#ddd8c8", fontSize: widget.fontSize }}>{widget.text}</span>
        </div>
      );
    case "checkbox":
      return (
        <div style={{ ...base, display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 18,
              height: 18,
              border: `2px solid ${widget.color}`,
              borderRadius: 3,
              display: "inline-block",
            }}
          />
          <span style={{ color: widget.color, fontSize: widget.fontSize }}>{widget.text}</span>
        </div>
      );
    case "slider":
      return (
        <div style={{ ...base, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ color: "#c9c4b3", fontSize: Math.max(10, widget.fontSize - 1) }}>
            {widget.text}
          </span>
          <div
            style={{
              position: "relative",
              height: 6,
              marginTop: 6,
              background: `${widget.color}40`,
              borderRadius: 3,
            }}
          >
            <div style={{ width: "60%", height: "100%", background: widget.color, borderRadius: 3 }} />
            <span
              style={{
                position: "absolute",
                left: "60%",
                top: "50%",
                width: 14,
                height: 14,
                marginLeft: -7,
                marginTop: -7,
                background: widget.color,
                borderRadius: 9999,
              }}
            />
          </div>
        </div>
      );
    case "progress":
      return (
        <div style={{ ...base, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ height: 10, background: `${widget.color}33`, borderRadius: 5 }}>
            <div style={{ width: "62%", height: "100%", background: widget.color, borderRadius: 5 }} />
          </div>
        </div>
      );
    case "image":
      return (
        <div
          style={{
            ...base,
            border: `2px dashed ${widget.color}`,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: widget.color,
            fontSize: widget.fontSize,
          }}
        >
          {widget.text || "image"}
        </div>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Small property field                                                */
/* ------------------------------------------------------------------ */

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </Label>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 font-mono-tight text-sm"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Studio                                                              */
/* ------------------------------------------------------------------ */

export function UiStudio() {
  const [doc, setDoc] = useState<UiDoc>(() => structuredClone(DEFAULT_UI_DOC));
  const [target, setTarget] = useState<UiTarget>("cpp-imgui");
  const [selectedId, setSelectedId] = useState<string | null>(
    DEFAULT_UI_DOC.widgets[0]?.id ?? null,
  );
  const [code, setCode] = useState(() => generateCode(DEFAULT_UI_DOC, "cpp-imgui"));

  const generated = useMemo(() => generateCode(doc, target), [doc, target]);
  useEffect(() => {
    setCode(generated);
  }, [generated]);

  const info = targetInfo(target);
  const selected = doc.widgets.find((w) => w.id === selectedId) ?? null;

  const updateWidget = useCallback((id: string, patch: Partial<Widget>) => {
    setDoc((d) => ({
      ...d,
      widgets: d.widgets.map((w) => (w.id === id ? { ...w, ...patch } : w)),
    }));
  }, []);

  const addWidget = (kind: WidgetKind) => {
    const meta = widgetKindInfo(kind);
    const id = nextWidgetId();
    setDoc((d) => {
      const count = d.widgets.filter((w) => w.kind === kind).length + 1;
      const offset = (d.widgets.length % 6) * 26;
      const widget: Widget = {
        id,
        kind,
        name: `${kind}${count}`,
        x: 40 + offset,
        y: 40 + offset,
        w: meta.w,
        h: meta.h,
        text: meta.defaultText,
        color: "#f0c14b",
        fontSize: 14,
      };
      return { ...d, widgets: [...d.widgets, widget] };
    });
    setSelectedId(id);
  };

  const deleteWidget = (id: string) => {
    setDoc((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== id) }));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  /* ---- canvas scaling ---- */
  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setBoxWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setBoxWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const scale = boxWidth > 0 ? Math.min(1, (boxWidth - 24) / doc.width) : 1;

  /* ---- dragging ---- */
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const onWidgetPointerDown = (e: React.PointerEvent<HTMLDivElement>, widget: Widget) => {
    e.stopPropagation();
    setSelectedId(widget.id);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = {
      id: widget.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: widget.x,
      origY: widget.y,
    };
  };

  const onWidgetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const nx = drag.origX + (e.clientX - drag.startX) / scale;
    const ny = drag.origY + (e.clientY - drag.startY) / scale;
    const w = doc.widgets.find((item) => item.id === drag.id);
    if (!w) return;
    updateWidget(drag.id, {
      x: Math.max(0, Math.min(doc.width - w.w, Math.round(nx))),
      y: Math.max(0, Math.min(doc.height - w.h, Math.round(ny))),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  /* ---- export ---- */
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied to clipboard");
    } catch {
      toast.error("Clipboard unavailable in this browser");
    }
  };

  const downloadCode = () => {
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = info.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    toast.success(`Saved ${info.filename}`);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Card className="border-border/70 bg-card/60 shadow-none">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutTemplate className="size-4 text-gold" />
                UI Studio
              </CardTitle>
              <CardDescription>
                Design a screen visually, then export real source for C++, Lua or Java. Unlimited
                projects — no account, no limits, nothing uploaded.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-gold/40 font-mono-tight text-gold">
              {doc.widgets.length} widget{doc.widgets.length === 1 ? "" : "s"}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left: palette + canvas */}
        <div className="flex flex-col gap-4">
          <Card className="border-border/70 bg-card/60 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Add widgets</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {WIDGET_KINDS.map((kind) => (
                <Button
                  key={kind.kind}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 font-mono-tight text-xs"
                  onClick={() => addWidget(kind.kind)}
                >
                  <Plus className="size-3.5" />
                  {kind.label}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/60 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-sm">Preview</CardTitle>
                <div className="flex items-center gap-2">
                  <Input
                    value={doc.title}
                    onChange={(e) => setDoc((d) => ({ ...d, title: e.target.value }))}
                    className="h-8 w-44 font-mono-tight text-xs"
                    aria-label="Window title"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-muted-foreground"
                    onClick={() => {
                      setDoc(structuredClone(DEFAULT_UI_DOC));
                      setSelectedId(DEFAULT_UI_DOC.widgets[0]?.id ?? null);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div ref={boxRef} className="w-full">
                <div
                  className="scrollbar-gold relative overflow-hidden rounded-xl border border-border/60"
                  style={{ height: doc.height * scale }}
                  onPointerDown={() => setSelectedId(null)}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: doc.width,
                      height: doc.height,
                      background: doc.background,
                      transform: `scale(${scale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    {doc.widgets.map((widget) => (
                      <div
                        key={widget.id}
                        onPointerDown={(e) => onWidgetPointerDown(e, widget)}
                        onPointerMove={onWidgetPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        style={{ cursor: "grab", touchAction: "none" }}
                        className={cn(
                          "select-none",
                          selectedId === widget.id && "outline outline-2 outline-gold/80",
                        )}
                      >
                        <WidgetPreview widget={widget} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="mt-3 font-mono-tight text-[11px] text-muted-foreground">
                {doc.width} × {doc.height} · drag widgets to position them · click empty space to
                deselect
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/60 shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Canvas</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumberField
                label="Width"
                value={doc.width}
                min={320}
                max={2560}
                onChange={(v) => setDoc((d) => ({ ...d, width: v || 320 }))}
              />
              <NumberField
                label="Height"
                value={doc.height}
                min={240}
                max={1600}
                onChange={(v) => setDoc((d) => ({ ...d, height: v || 240 }))}
              />
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  Background
                </Label>
                <input
                  type="color"
                  value={doc.background}
                  onChange={(e) => setDoc((d) => ({ ...d, background: e.target.value }))}
                  className="h-9 w-full cursor-pointer rounded-md border border-border/60 bg-transparent"
                  aria-label="Canvas background"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right: properties + code */}
        <div className="flex flex-col gap-4">
          <Card className="border-border/70 bg-card/60 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm">
                  {selected ? `Selected · ${selected.kind}` : "No widget selected"}
                </CardTitle>
                {selected && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs text-danger hover:text-danger"
                    onClick={() => deleteWidget(selected.id)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!selected ? (
                <p className="py-4 text-sm text-muted-foreground">
                  Click a widget on the canvas to edit its text, position and styling.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Text
                      </Label>
                      <Input
                        value={selected.text}
                        onChange={(e) => updateWidget(selected.id, { text: e.target.value })}
                        className="h-9 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Variable name
                      </Label>
                      <Input
                        value={selected.name}
                        onChange={(e) => updateWidget(selected.id, { name: e.target.value })}
                        className="h-9 font-mono-tight text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <NumberField
                      label="X"
                      value={selected.x}
                      onChange={(v) => updateWidget(selected.id, { x: v || 0 })}
                    />
                    <NumberField
                      label="Y"
                      value={selected.y}
                      onChange={(v) => updateWidget(selected.id, { y: v || 0 })}
                    />
                    <NumberField
                      label="W"
                      value={selected.w}
                      min={8}
                      onChange={(v) => updateWidget(selected.id, { w: v || 8 })}
                    />
                    <NumberField
                      label="H"
                      value={selected.h}
                      min={8}
                      onChange={(v) => updateWidget(selected.id, { h: v || 8 })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        Color
                      </Label>
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(selected.color) ? selected.color : "#f0c14b"}
                        onChange={(e) => updateWidget(selected.id, { color: e.target.value })}
                        className="h-9 w-full cursor-pointer rounded-md border border-border/60 bg-transparent"
                        aria-label="Widget color"
                      />
                    </div>
                    <NumberField
                      label="Font size"
                      value={selected.fontSize}
                      min={8}
                      max={72}
                      onChange={(v) => updateWidget(selected.id, { fontSize: v || 12 })}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/60 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Code2 className="size-4 text-gold" />
                  Generated source
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={target} onValueChange={(v) => setTarget(v as UiTarget)}>
                    <SelectTrigger className="h-8 w-48 font-mono-tight text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UI_TARGETS.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={copyCode}>
                    <Copy className="size-3.5" />
                    Copy
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={downloadCode}>
                    <Download className="size-3.5" />
                    Save
                  </Button>
                </div>
              </div>
              <CardDescription className="font-mono-tight text-[11px]">
                {info.blurb} · {info.filename} · {info.hint}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CodeEditor
                value={code}
                onChange={setCode}
                language={info.language}
                className="h-[420px]"
                ariaLabel="Generated source code"
              />
              <Separator className="my-3" />
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="size-3.5 text-gold" />
                The code updates whenever you move a widget. Edits you make here are yours — tweak
                the design to regenerate.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
