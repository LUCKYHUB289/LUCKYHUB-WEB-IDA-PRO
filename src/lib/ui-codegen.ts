/**
 * LUCKY HUB — UI Studio code generator.
 *
 * Turns a small declarative widget document into runnable UI source for four
 * developer stacks. Everything happens in the browser: no compiler, no server,
 * unlimited projects, no sign-in.
 */

/* ------------------------------------------------------------------ */
/* Targets                                                             */
/* ------------------------------------------------------------------ */

export type UiTarget = "cpp-imgui" | "cpp-qt" | "lua-love" | "java-swing";

export type HighlightLanguage = "cpp" | "lua" | "java";

export interface UiTargetInfo {
  id: UiTarget;
  label: string;
  short: string;
  filename: string;
  language: HighlightLanguage;
  blurb: string;
  hint: string;
}

export const UI_TARGETS: UiTargetInfo[] = [
  {
    id: "cpp-imgui",
    label: "C++ · Dear ImGui",
    short: "C++",
    filename: "lucky_ui.cpp",
    language: "cpp",
    blurb: "Immediate-mode tool & game overlays",
    hint: "Drop the drawUi() call into your frame loop. Requires imgui.h.",
  },
  {
    id: "cpp-qt",
    label: "C++ · Qt Widgets",
    short: "Cpp",
    filename: "mainwindow.cpp",
    language: "cpp",
    blurb: "Native desktop apps with Qt",
    hint: "Build with qmake/CMake and the Qt Widgets module.",
  },
  {
    id: "lua-love",
    label: "Lua · LÖVE 2D",
    short: "Lua",
    filename: "main.lua",
    language: "lua",
    blurb: "Game UI with LÖVE 2D",
    hint: "Drop into a LÖVE project and run love .",
  },
  {
    id: "java-swing",
    label: "Java · Swing",
    short: "Java",
    filename: "MyFrame.java",
    language: "java",
    blurb: "Cross-platform Java desktop UI",
    hint: "javac MyFrame.java && java MyFrame",
  },
];

export function targetInfo(id: UiTarget): UiTargetInfo {
  return UI_TARGETS.find((t) => t.id === id) ?? UI_TARGETS[0];
}

/* ------------------------------------------------------------------ */
/* Document model                                                      */
/* ------------------------------------------------------------------ */

export type WidgetKind =
  | "panel"
  | "label"
  | "button"
  | "input"
  | "checkbox"
  | "slider"
  | "progress"
  | "image";

export interface WidgetKindInfo {
  kind: WidgetKind;
  label: string;
  defaultText: string;
  w: number;
  h: number;
}

export const WIDGET_KINDS: WidgetKindInfo[] = [
  { kind: "label", label: "Text label", defaultText: "Hello LUCKY HUB", w: 180, h: 28 },
  { kind: "button", label: "Button", defaultText: "Click me", w: 140, h: 40 },
  { kind: "input", label: "Text input", defaultText: "Type here", w: 220, h: 36 },
  { kind: "checkbox", label: "Checkbox", defaultText: "Enable feature", w: 180, h: 28 },
  { kind: "slider", label: "Slider", defaultText: "Volume", w: 220, h: 28 },
  { kind: "progress", label: "Progress bar", defaultText: "Loading", w: 220, h: 18 },
  { kind: "panel", label: "Panel", defaultText: "", w: 260, h: 160 },
  { kind: "image", label: "Image slot", defaultText: "logo.png", w: 160, h: 120 },
];

export function widgetKindInfo(kind: WidgetKind): WidgetKindInfo {
  return WIDGET_KINDS.find((k) => k.kind === kind) ?? WIDGET_KINDS[0];
}

export interface Widget {
  id: string;
  kind: WidgetKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface UiDoc {
  title: string;
  width: number;
  height: number;
  background: string;
  widgets: Widget[];
}

export const DEFAULT_UI_DOC: UiDoc = {
  title: "LUCKY HUB Panel",
  width: 720,
  height: 440,
  background: "#12120d",
  widgets: [
    {
      id: "w1",
      kind: "panel",
      name: "panel1",
      x: 40,
      y: 40,
      w: 640,
      h: 100,
      text: "",
      color: "#1c1b14",
      fontSize: 14,
    },
    {
      id: "w2",
      kind: "label",
      name: "label1",
      x: 64,
      y: 64,
      w: 300,
      h: 30,
      text: "LUCKY HUB — UI Studio",
      color: "#f0c14b",
      fontSize: 20,
    },
    {
      id: "w3",
      kind: "input",
      name: "input1",
      x: 64,
      y: 190,
      w: 260,
      h: 40,
      text: "Project name",
      color: "#2a2820",
      fontSize: 15,
    },
    {
      id: "w4",
      kind: "button",
      name: "button1",
      x: 356,
      y: 190,
      w: 160,
      h: 40,
      text: "Generate",
      color: "#f0c14b",
      fontSize: 15,
    },
    {
      id: "w5",
      kind: "progress",
      name: "progress1",
      x: 64,
      y: 268,
      w: 452,
      h: 20,
      text: "Build progress",
      color: "#f0c14b",
      fontSize: 13,
    },
    {
      id: "w6",
      kind: "checkbox",
      name: "checkbox1",
      x: 64,
      y: 320,
      w: 220,
      h: 28,
      text: "Export on finish",
      color: "#e8e4d6",
      fontSize: 14,
    },
    {
      id: "w7",
      kind: "slider",
      name: "slider1",
      x: 320,
      y: 320,
      w: 200,
      h: 28,
      text: "Opacity",
      color: "#f0c14b",
      fontSize: 13,
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

let idCounter = 0;

export function nextWidgetId(): string {
  idCounter += 1;
  return `w${Date.now().toString(36)}${idCounter}`;
}

export function sanitizeIdentifier(raw: string, fallback: string): string {
  let s = raw
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+/, "");
  if (!/^[A-Za-z_]/.test(s)) s = `${fallback}_${s}`;
  if (!s) s = fallback;
  return s.slice(0, 48);
}

function clamp(v: number, lo: number, hi: number): number {
  if (Number.isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function num(v: number): number {
  return Math.round(v);
}

function f(v: number): string {
  const n = Math.round(v * 1000) / 1000;
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean.padEnd(6, "0").slice(0, 6);
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return [0, 0, 0];
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function normalizeDoc(doc: UiDoc): UiDoc {
  return {
    ...doc,
    title: doc.title.trim() || "LUCKY HUB Panel",
    width: clamp(doc.width, 320, 2560),
    height: clamp(doc.height, 240, 1600),
    widgets: doc.widgets.map((w) => ({
      ...w,
      x: num(w.x),
      y: num(w.y),
      w: Math.max(8, num(w.w)),
      h: Math.max(8, num(w.h)),
      fontSize: Math.max(6, num(w.fontSize)),
      text: w.text ?? "",
      color: /^#?[0-9a-fA-F]{3,8}$/.test(w.color) ? w.color : "#f0c14b",
      name: sanitizeIdentifier(w.name, "widget"),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* C++ · Dear ImGui                                                    */
/* ------------------------------------------------------------------ */

function widgetVar(w: Widget): string {
  return sanitizeIdentifier(w.name, "widget");
}

function generateImGui(doc: UiDoc): string {
  const d = normalizeDoc(doc);
  const L: string[] = [];
  L.push("// LUCKY HUB — UI Studio");
  L.push("// Target: C++ / Dear ImGui. Generated locally in your browser.");
  L.push("// Wire drawUi() into your render loop: call it once per frame.");
  L.push("#include \"imgui.h\"");
  L.push("");
  L.push("namespace lucky_ui {");
  L.push("");
  L.push(`constexpr float kWindowWidth  = ${f(d.width)}f;`);
  L.push(`constexpr float kWindowHeight = ${f(d.height)}f;`);
  L.push("");
  L.push("// --- generated widget state -------------------------------------");
  d.widgets
    .filter((w) => w.kind === "input" || w.kind === "checkbox" || w.kind === "slider")
    .forEach((w) => {
      const v = widgetVar(w);
      if (w.kind === "input") L.push(`static char  ${v}[128] = "${escapeC(w.text)}";`);
      if (w.kind === "checkbox") L.push(`static bool  ${v} = false;`);
      if (w.kind === "slider") L.push(`static float ${v} = 0.5f;`);
    });
  L.push("");
  L.push("inline void drawUi() {");
  L.push("    ImGui::SetNextWindowPos(ImVec2(40.0f, 40.0f), ImGuiCond_FirstUseEver);");
  L.push("    ImGui::SetNextWindowSize(ImVec2(kWindowWidth, kWindowHeight), ImGuiCond_FirstUseEver);");
  L.push(`    ImGui::Begin("${escapeC(d.title)}");`);
  L.push("");

  for (const w of d.widgets) {
    const v = widgetVar(w);
    const [r, g, b] = hexToRgb01(w.color);
    L.push(`    // ${w.kind} — ${v}`);
    if (w.kind === "panel") {
      L.push(
        `    ImGui::GetWindowDrawList()->AddRectFilled(ImVec2(${f(w.x)}, ${f(w.y)}), ImVec2(${f(
          w.x + w.w,
        )}, ${f(w.y + w.h)}), IM_COL32(${to255(r)}, ${to255(g)}, ${to255(b)}, 255), 6.0f);`,
      );
    } else if (w.kind === "label") {
      L.push(
        `    ImGui::GetWindowDrawList()->AddText(ImVec2(${f(w.x)}, ${f(w.y)}), IM_COL32(${to255(
          r,
        )}, ${to255(g)}, ${to255(b)}, 255), "${escapeC(w.text)}");`,
      );
    } else if (w.kind === "button") {
      L.push(`    ImGui::SetCursorPos(ImVec2(${f(w.x)}, ${f(w.y)}));`);
      L.push(`    ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(${f(r)}, ${f(g)}, ${f(b)}, 1.0f));`);
      L.push(
        `    if (ImGui::Button("${escapeC(w.text)}", ImVec2(${f(w.w)}, ${f(w.h)}))) { /* TODO: ${v} action */ }`,
      );
      L.push("    ImGui::PopStyleColor();");
    } else if (w.kind === "input") {
      L.push(`    ImGui::SetCursorPos(ImVec2(${f(w.x)}, ${f(w.y)}));`);
      L.push(`    ImGui::SetNextItemWidth(${f(w.w)});`);
      L.push(`    ImGui::InputText("##${v}", ${v}, sizeof(${v}));`);
    } else if (w.kind === "checkbox") {
      L.push(`    ImGui::SetCursorPos(ImVec2(${f(w.x)}, ${f(w.y)}));`);
      L.push(`    ImGui::Checkbox("${escapeC(w.text)}", &${v});`);
    } else if (w.kind === "slider") {
      L.push(`    ImGui::SetCursorPos(ImVec2(${f(w.x)}, ${f(w.y)}));`);
      L.push(`    ImGui::SetNextItemWidth(${f(w.w)});`);
      L.push(`    ImGui::SliderFloat("${escapeC(w.text)}", &${v}, 0.0f, 1.0f);`);
    } else if (w.kind === "progress") {
      L.push(`    ImGui::SetCursorPos(ImVec2(${f(w.x)}, ${f(w.y)}));`);
      L.push(`    ImGui::ProgressBar(0.62f, ImVec2(${f(w.w)}, ${f(w.h)}), "${escapeC(w.text)}");`);
    } else if (w.kind === "image") {
      L.push(`    ImGui::SetCursorPos(ImVec2(${f(w.x)}, ${f(w.y)}));`);
      L.push(`    ImGui::Button("${escapeC(w.text)}", ImVec2(${f(w.w)}, ${f(w.h)})); // TODO: draw a texture here`);
    }
    L.push("");
  }

  L.push("    ImGui::End();");
  L.push("}");
  L.push("");
  L.push("} // namespace lucky_ui");
  L.push("");
  return L.join("\n");
}

function to255(v: number): number {
  return Math.round(v * 255);
}

function escapeC(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function escapeQt(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/* ------------------------------------------------------------------ */
/* C++ · Qt Widgets                                                    */
/* ------------------------------------------------------------------ */

function generateQt(doc: UiDoc): string {
  const d = normalizeDoc(doc);
  const L: string[] = [];
  L.push("// LUCKY HUB — UI Studio");
  L.push("// Target: C++ / Qt Widgets. Generated locally in your browser.");
  L.push("#include <QApplication>");
  L.push("#include <QWidget>");
  L.push("#include <QLabel>");
  L.push("#include <QPushButton>");
  L.push("#include <QLineEdit>");
  L.push("#include <QCheckBox>");
  L.push("#include <QSlider>");
  L.push("#include <QProgressBar>");
  L.push("");
  L.push("class MainWindow : public QWidget {");
  L.push("public:");
  L.push("    MainWindow() {");
  L.push(`        setWindowTitle("${escapeQt(d.title)}");`);
  L.push(`        resize(${num(d.width)}, ${num(d.height)});`);
  L.push("        setStyleSheet(QStringLiteral(\"background:%s;\"));".replace("%s", d.background));
  L.push("");

  d.widgets.forEach((w) => {
    const v = widgetVar(w);
    const color = w.color;
    if (w.kind === "panel") {
      L.push(`        // panel — ${v}`);
      L.push(`        auto *${v} = new QWidget(this);`);
      L.push(`        ${v}->setGeometry(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}->setStyleSheet(QStringLiteral("background:${color}; border-radius:6px;"));`);
    } else if (w.kind === "label") {
      L.push(`        auto *${v} = new QLabel(QStringLiteral("${escapeQt(w.text)}"), this);`);
      L.push(`        ${v}->setGeometry(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}->setStyleSheet(QStringLiteral("color:${color}; font-size:${num(w.fontSize)}px;"));`);
    } else if (w.kind === "button") {
      L.push(`        auto *${v} = new QPushButton(QStringLiteral("${escapeQt(w.text)}"), this);`);
      L.push(`        ${v}->setGeometry(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}->setStyleSheet(QStringLiteral("background:${color}; color:#12120d; font-size:${num(w.fontSize)}px; border-radius:6px;"));`);
      L.push(`        connect(${v}, &QPushButton::clicked, this, [this]() { /* TODO: ${v} action */ });`);
    } else if (w.kind === "input") {
      L.push(`        auto *${v} = new QLineEdit(QStringLiteral("${escapeQt(w.text)}"), this);`);
      L.push(`        ${v}->setGeometry(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}->setStyleSheet(QStringLiteral("background:${color}; color:#e8e4d6; padding-left:8px; font-size:${num(w.fontSize)}px; border-radius:6px;"));`);
    } else if (w.kind === "checkbox") {
      L.push(`        auto *${v} = new QCheckBox(QStringLiteral("${escapeQt(w.text)}"), this);`);
      L.push(`        ${v}->setGeometry(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}->setStyleSheet(QStringLiteral("color:${color}; font-size:${num(w.fontSize)}px;"));`);
    } else if (w.kind === "slider") {
      L.push(`        auto *${v} = new QSlider(Qt::Horizontal, this);`);
      L.push(`        ${v}->setGeometry(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}->setRange(0, 100);`);
      L.push(`        ${v}->setValue(60); // ${escapeQt(w.text)}`);
    } else if (w.kind === "progress") {
      L.push(`        auto *${v} = new QProgressBar(this);`);
      L.push(`        ${v}->setGeometry(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}->setValue(62); // ${escapeQt(w.text)}`);
      L.push(`        ${v}->setStyleSheet(QStringLiteral("QProgressBar{background:${color}33; border-radius:6px;} QProgressBar::chunk{background:${color}; border-radius:6px;}"));`);
    } else if (w.kind === "image") {
      L.push(`        // image slot — ${v}: set a pixmap when you have assets`);
      L.push(`        auto *${v} = new QLabel(QStringLiteral("${escapeQt(w.text)}"), this);`);
      L.push(`        ${v}->setGeometry(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}->setAlignment(Qt::AlignCenter);`);
      L.push(`        ${v}->setStyleSheet(QStringLiteral("border:1px dashed ${color}; color:${color}; border-radius:6px;"));`);
    }
    L.push("");
  });

  L.push("    }");
  L.push("};");
  L.push("");
  L.push("int main(int argc, char *argv[]) {");
  L.push("    QApplication app(argc, argv);");
  L.push("    MainWindow window;");
  L.push("    window.show();");
  L.push("    return app.exec();");
  L.push("}");
  L.push("");
  return L.join("\n");
}

/* ------------------------------------------------------------------ */
/* Lua · LÖVE 2D                                                       */
/* ------------------------------------------------------------------ */

function luaColor(hex: string): string {
  const [r, g, b] = hexToRgb01(hex);
  return `${f(r)}, ${f(g)}, ${f(b)}`;
}

function generateLua(doc: UiDoc): string {
  const d = normalizeDoc(doc);
  const L: string[] = [];
  L.push("-- LUCKY HUB — UI Studio");
  L.push("-- Target: Lua / LOVE 2D. Generated locally in your browser.");
  L.push("-- Put this file in a folder and run: love .");
  L.push("");
  L.push("local ui = {}");
  L.push("");
  L.push("function love.load()");
  L.push(`  love.window.setTitle("${luaString(d.title)}")`);
  L.push(`  love.window.setMode(${num(d.width)}, ${num(d.height)})`);
  L.push(`  love.graphics.setBackgroundColor(${luaColor(d.background)})`);
  L.push("  ui.font = love.graphics.newFont(15)");
  L.push("  ui.small = love.graphics.newFont(13)");
  L.push("  ui.slider = 0.6");
  L.push("  ui.progress = 0.62");
  L.push("  ui.checked = false");
  L.push("end");
  L.push("");
  L.push("function love.draw()");
  L.push("  love.graphics.setFont(ui.font)");
  L.push("");
  for (const w of d.widgets) {
    const c = luaColor(w.color);
    L.push(`  -- ${w.kind}: ${widgetVar(w)}`);
    if (w.kind === "panel") {
      L.push(`  love.graphics.setColor(${c}, 1)`);
      L.push(`  love.graphics.rectangle("fill", ${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)}, 6, 6)`);
    } else if (w.kind === "label") {
      L.push(`  love.graphics.setColor(${c}, 1)`);
      L.push(`  love.graphics.print("${luaString(w.text)}", ${num(w.x)}, ${num(w.y)})`);
    } else if (w.kind === "button") {
      L.push(`  love.graphics.setColor(${c}, 1)`);
      L.push(`  love.graphics.rectangle("fill", ${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)}, 6, 6)`);
      L.push(`  love.graphics.setColor(0.07, 0.07, 0.05, 1)`);
      L.push(`  love.graphics.printf("${luaString(w.text)}", ${num(w.x)}, ${num(w.y + w.h / 2 - 9)}, ${num(w.w)}, "center")`);
    } else if (w.kind === "input") {
      L.push(`  love.graphics.setColor(${c}, 1)`);
      L.push(`  love.graphics.rectangle("fill", ${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)}, 6, 6)`);
      L.push(`  love.graphics.setColor(0.91, 0.89, 0.84, 1)`);
      L.push(`  love.graphics.print("${luaString(w.text)}", ${num(w.x + 10)}, ${num(w.y + w.h / 2 - 9)})`);
    } else if (w.kind === "checkbox") {
      L.push(`  love.graphics.setColor(${c}, 1)`);
      L.push(`  love.graphics.rectangle("line", ${num(w.x)}, ${num(w.y + 4)}, 18, 18, 3, 3)`);
      L.push(`  if ui.checked then love.graphics.rectangle("fill", ${num(w.x + 4)}, ${num(w.y + 8)}, 10, 10, 2, 2) end`);
      L.push(`  love.graphics.print("${luaString(w.text)}", ${num(w.x + 28)}, ${num(w.y + 4)})`);
    } else if (w.kind === "slider") {
      L.push(`  love.graphics.setColor(${c}, 1)`);
      L.push(`  love.graphics.rectangle("fill", ${num(w.x)}, ${num(w.y + w.h / 2 - 3)}, ${num(w.w)}, 6, 3, 3)`);
      L.push(`  love.graphics.circle("fill", ${num(w.x)} + ui.slider * ${num(w.w)}, ${num(w.y + w.h / 2)}, 8)`);
    } else if (w.kind === "progress") {
      L.push(`  love.graphics.setColor(${c}, 0.25)`);
      L.push(`  love.graphics.rectangle("fill", ${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)}, 5, 5)`);
      L.push(`  love.graphics.setColor(${c}, 1)`);
      L.push(`  love.graphics.rectangle("fill", ${num(w.x)}, ${num(w.y)}, ${num(w.w)} * ui.progress, ${num(w.h)}, 5, 5)`);
    } else if (w.kind === "image") {
      L.push(`  love.graphics.setColor(${c}, 1)`);
      L.push(`  love.graphics.rectangle("line", ${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)}, 6, 6)`);
      L.push(`  love.graphics.printf("${luaString(w.text)}", ${num(w.x)}, ${num(w.y + w.h / 2 - 9)}, ${num(w.w)}, "center")`);
    }
    L.push("");
  }
  L.push("  love.graphics.setColor(1, 1, 1, 1)");
  L.push("end");
  L.push("");
  L.push("function love.mousepressed(mx, my, button)");
  L.push("  -- wire your interactions here using the layout above");
  L.push("end");
  L.push("");
  return L.join("\n");
}

function luaString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/* ------------------------------------------------------------------ */
/* Java · Swing                                                        */
/* ------------------------------------------------------------------ */

function generateJava(doc: UiDoc): string {
  const d = normalizeDoc(doc);
  const className = sanitizeIdentifier(pascal(d.title) || "LuckyFrame", "LuckyFrame");
  const L: string[] = [];
  L.push("// LUCKY HUB — UI Studio");
  L.push("// Target: Java / Swing. Generated locally in your browser.");
  L.push("import javax.swing.*;");
  L.push("import java.awt.*;");
  L.push("");
  L.push(`public class ${className} extends JFrame {`);
  L.push("");
  L.push(`    public ${className}() {`);
  L.push(`        setTitle("${javaString(d.title)}");`);
  L.push(`        setSize(${num(d.width)}, ${num(d.height)});`);
  L.push("        setLayout(null);");
  L.push("        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);");
  L.push(`        getContentPane().setBackground(Color.decode("${d.background}"));`);
  L.push("");

  d.widgets.forEach((w) => {
    const v = widgetVar(w);
    if (w.kind === "panel") {
      L.push(`        JPanel ${v} = new JPanel();`);
      L.push(`        ${v}.setBounds(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}.setBackground(Color.decode("${w.color}"));`);
      L.push(`        add(${v});`);
    } else if (w.kind === "label") {
      L.push(`        JLabel ${v} = new JLabel("${javaString(w.text)}");`);
      L.push(`        ${v}.setBounds(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}.setForeground(Color.decode("${w.color}"));`);
      L.push(`        ${v}.setFont(new Font("SansSerif", Font.PLAIN, ${num(w.fontSize)}));`);
      L.push(`        add(${v});`);
    } else if (w.kind === "button") {
      L.push(`        JButton ${v} = new JButton("${javaString(w.text)}");`);
      L.push(`        ${v}.setBounds(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}.setBackground(Color.decode("${w.color}"));`);
      L.push(`        ${v}.setForeground(Color.decode("${d.background}"));`);
      L.push(`        ${v}.addActionListener(e -> { /* TODO: ${v} action */ });`);
      L.push(`        add(${v});`);
    } else if (w.kind === "input") {
      L.push(`        JTextField ${v} = new JTextField("${javaString(w.text)}");`);
      L.push(`        ${v}.setBounds(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}.setBackground(Color.decode("${w.color}"));`);
      L.push(`        ${v}.setForeground(Color.decode("#e8e4d6"));`);
      L.push(`        ${v}.setFont(new Font("SansSerif", Font.PLAIN, ${num(w.fontSize)}));`);
      L.push(`        add(${v});`);
    } else if (w.kind === "checkbox") {
      L.push(`        JCheckBox ${v} = new JCheckBox("${javaString(w.text)}");`);
      L.push(`        ${v}.setBounds(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}.setForeground(Color.decode("${w.color}"));`);
      L.push(`        ${v}.setOpaque(false);`);
      L.push(`        add(${v});`);
    } else if (w.kind === "slider") {
      L.push(`        JSlider ${v} = new JSlider(0, 100, 60);`);
      L.push(`        ${v}.setBounds(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}.setOpaque(false);`);
      L.push(`        ${v}.setToolTipText("${javaString(w.text)}");`);
      L.push(`        add(${v});`);
    } else if (w.kind === "progress") {
      L.push(`        JProgressBar ${v} = new JProgressBar(0, 100);`);
      L.push(`        ${v}.setBounds(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}.setValue(62);`);
      L.push(`        ${v}.setForeground(Color.decode("${w.color}"));`);
      L.push(`        ${v}.setBackground(Color.decode("${d.background}"));`);
      L.push(`        add(${v});`);
    } else if (w.kind === "image") {
      L.push(`        JLabel ${v} = new JLabel("${javaString(w.text)}", SwingConstants.CENTER);`);
      L.push(`        ${v}.setBounds(${num(w.x)}, ${num(w.y)}, ${num(w.w)}, ${num(w.h)});`);
      L.push(`        ${v}.setForeground(Color.decode("${w.color}"));`);
      L.push(`        ${v}.setBorder(BorderFactory.createDashedBorder(Color.decode("${w.color}")));`);
      L.push(`        add(${v});`);
    }
    L.push("");
  });

  L.push("    }");
  L.push("");
  L.push("    public static void main(String[] args) {");
  L.push(`        SwingUtilities.invokeLater(() -> new ${className}().setVisible(true));`);
  L.push("    }");
  L.push("}");
  L.push("");
  return L.join("\n");
}

function javaString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function pascal(s: string): string {
  return s
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function generateCode(doc: UiDoc, target: UiTarget): string {
  switch (target) {
    case "cpp-imgui":
      return generateImGui(doc);
    case "cpp-qt":
      return generateQt(doc);
    case "lua-love":
      return generateLua(doc);
    case "java-swing":
      return generateJava(doc);
  }
}
