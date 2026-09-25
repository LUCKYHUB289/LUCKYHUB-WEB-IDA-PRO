import { BrandFooter, BrandHeader, TelegramButton } from "@/components/BrandChrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Binary,
  Fingerprint,
  Gauge,
  Hexagon,
  Layers,
  ScanText,
  ShieldCheck,
  Sigma,
} from "lucide-react";
import { Link } from "react-router";

const FEATURES = [
  {
    icon: Binary,
    title: "Hex viewer",
    body: "Virtualized hex + ASCII dump with go-to-offset, paging and one-click row copy. Smooth on files up to 64 MB.",
  },
  {
    icon: Layers,
    title: "ELF & PE sections",
    body: "Section and segment tables for .so files, PE section tables with per-section entropy for .dll and .exe.",
  },
  {
    icon: ScanText,
    title: "Strings scanner",
    body: "Extract every printable string with offsets, then filter by text, length or category and export as CSV.",
  },
  {
    icon: Sigma,
    title: "Indicators",
    body: "Auto-groups URLs, filesystem paths, Java packages, exported symbols, crypto primitives and toolchain tags.",
  },
  {
    icon: Gauge,
    title: "Entropy map",
    body: "Shannon entropy across the file. Spot packed, encrypted or compressed regions at a glance.",
  },
  {
    icon: Fingerprint,
    title: "Integrity",
    body: "SHA-256, whole-file CRC32 and a custom-range CRC32 calculator, all computed locally.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Drop a file",
    body: "Drag a .so, .dll, .bin, .exe — honestly any file — into the inspector. It's read in your browser.",
  },
  {
    n: "02",
    title: "Pick a lens",
    body: "Overview for verdicts, Hex for raw bytes, Strings for text, Indicators for grouped findings, Sections for headers.",
  },
  {
    n: "03",
    title: "Export what matters",
    body: "Download a plain-text report, a strings CSV or an indicator list — formatted with offsets so you can cite them.",
  },
];

const FAQ = [
  {
    q: "Are my files uploaded anywhere?",
    a: "No. Every byte stays on your device. There is no analysis server, no telemetry on file contents and no storage. Close the tab and it's gone.",
  },
  {
    q: "What can this tool inspect?",
    a: "Any binary. ELF images (Linux/Android .so, executables) get full header and section parsing; PE images (Windows .dll/.exe) get the section table with entropy; anything else still gets hex, strings, checksums and entropy analysis.",
  },
  {
    q: "Does it modify or patch files?",
    a: "No. The inspector is strictly read-only — it reports what a file contains. There are no write, patch or edit capabilities by design.",
  },
  {
    q: "Is there a size limit?",
    a: "Files up to 64 MB are fully analyzed. Larger files are analyzed over their first 64 MB, and the report tells you when that happened.",
  },
  {
    q: "Why do I need to sign in?",
    a: "A free account just remembers your workspace and keeps the tool free to grow. Guest sign-in works too if you don't want to use an email.",
  },
  {
    q: "Who built this?",
    a: "LUCKY HUB — developed by LUCKY HATHUNGO WALA. Join the Telegram channel @LUCKY_HUB_DEV for updates.",
  },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const primaryHref = isAuthenticated ? "/dashboard" : "/auth?returnTo=%2Fdashboard";

  return (
    <div className="flex min-h-screen flex-col">
      <BrandHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="hub-grid-bg relative overflow-hidden border-b border-border/60">
          <div className="hub-radial pointer-events-none absolute inset-0" />
          <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-20 text-center md:py-28">
            <motion.img
              src={logo}
              alt="LUCKY HUB logo"
              className="size-20 rounded-2xl gold-glow"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="mt-6 flex flex-col items-center"
            >
              <Badge
                variant="outline"
                className="mb-4 gap-1.5 border-gold/40 bg-gold/5 px-3 py-1 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-gold"
              >
                <ShieldCheck className="size-3.5" />
                100% local · read-only · no uploads
              </Badge>
              <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-5xl md:text-6xl">
                LUCKY HUB{" "}
                <span className="text-gold text-glow-gold">Binary Inspector</span>
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Inspect binaries the honest way: hex dumps, strings, ELF &amp; PE section tables,
                checksums and entropy — computed entirely in your browser. Nothing leaves your
                device, and nothing is modified.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button asChild size="lg" className="gap-2 text-base">
                  <a href={primaryHref}>
                    Open the Inspector
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <TelegramButton variant="outline" size="lg" />
              </div>
              <p className="mt-4 font-mono-tight text-xs text-muted-foreground">
                Free · no install · works on Android, desktop and everything between
              </p>
            </motion.div>

            {/* Terminal-style preview strip */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.55 }}
              className="mt-14 w-full max-w-3xl overflow-hidden rounded-xl border border-border/70 bg-card/70 text-left shadow-2xl backdrop-blur"
            >
              <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2.5">
                <span className="size-2.5 rounded-full bg-destructive/70" />
                <span className="size-2.5 rounded-full bg-warn/70" />
                <span className="size-2.5 rounded-full bg-ok/70" />
                <span className="ml-3 font-mono-tight text-xs text-muted-foreground">
                  luckyhub — inspector
                </span>
              </div>
              <pre className="scrollbar-gold overflow-x-auto p-4 font-mono-tight text-[12.5px] leading-6 text-foreground/90">
{`$ file libtarget.so
ELF 64-bit LSB shared object, ARM aarch64, dynamically linked

$ luckyhub inspect libtarget.so
  format     ELF 64-bit · little-endian
  entry      0x00000000 (shared object)
  sections   128 parsed  ·  .text .rodata .data .bss …
  strings    14 282 extracted (min length 5)
  indicators 231 hits  ·  7 categories
  entropy    5.412 bits/byte — mixed code/data
  sha256     9f2c…e041   crc32 0x8A31B7F2
  scan time  412 ms · all local

  > report saved: libtarget.so.luckyhub-report.txt`}
              </pre>
            </motion.div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-border/60 bg-background">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
            <div className="mb-10 text-center">
              <p className="font-mono-tight text-[11px] uppercase tracking-[0.24em] text-gold">
                Capabilities
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Six lenses on every binary
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
                The same building blocks professional RE toolchains start with — wired into one
                clean, local workspace.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                >
                  <Card className="h-full border-border/70 bg-card/60 shadow-none transition-colors hover:border-gold/30">
                    <CardContent className="pt-5">
                      <div className="flex size-10 items-center justify-center rounded-lg bg-gold/10">
                        <f.icon className="size-5 text-gold" />
                      </div>
                      <h3 className="mt-4 font-display text-base font-semibold">{f.title}</h3>
                      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{f.body}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="border-b border-border/60 bg-card/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 md:py-20">
            <div className="mb-10 text-center">
              <p className="font-mono-tight text-[11px] uppercase tracking-[0.24em] text-gold">
                Workflow
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Three steps, zero setup
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <motion.div
                  key={s.n}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className="relative rounded-xl border border-border/70 bg-background/60 p-6"
                >
                  <span className="font-mono-tight text-3xl font-bold text-gold/40">{s.n}</span>
                  <h3 className="mt-3 font-display text-base font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{s.body}</p>
                </motion.div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Button asChild size="lg">
                <a href={primaryHref}>
                  Start inspecting — it's free
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-b border-border/60 bg-background">
          <div className="mx-auto w-full max-w-3xl px-4 py-16 md:py-20">
            <div className="mb-8 text-center">
              <p className="font-mono-tight text-[11px] uppercase tracking-[0.24em] text-gold">
                FAQ
              </p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Straight answers
              </h2>
            </div>
            <Accordion type="single" collapsible className="w-full">
              {FAQ.map((item) => (
                <AccordionItem key={item.q} value={item.q}>
                  <AccordionTrigger className="text-left text-sm font-medium sm:text-base">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-6 text-muted-foreground">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden bg-card/30">
          <div className="hub-radial pointer-events-none absolute inset-0" />
          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-4 py-16 text-center md:py-20">
            <Hexagon className="size-8 text-gold" />
            <h2 className="mt-4 max-w-2xl font-display text-2xl font-bold tracking-tight sm:text-4xl">
              Know what's inside the file — before it runs
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              LUCKY HUB Binary Inspector is free, instant and private. Your files never leave the
              browser tab.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg" className="gap-2">
                <a href={primaryHref}>
                  Launch the app
                  <ArrowRight className="size-4" />
                </a>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/auth?returnTo=%2Fdashboard">Create a free account</Link>
              </Button>
            </div>
            <p className="mt-6 font-mono-tight text-xs text-muted-foreground">
              Telegram · <span className="text-gold">@LUCKY_HUB_DEV</span> · Developer{" "}
              <span className="text-gold">LUCKY HATHUNGO WALA</span>
            </p>
          </div>
        </section>
      </main>

      <BrandFooter />
    </div>
  );
}
