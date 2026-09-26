import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandFooter, BrandHeader } from "@/components/BrandChrome";
import { FileDropzone } from "@/components/inspector/FileDropzone";
import { CSourceDialog } from "@/components/inspector/CSourceDialog";
import { ImageHeaderDialog } from "@/components/inspector/ImageHeaderDialog";
import { HexView, type HexJump } from "@/components/inspector/HexView";
import { IndicatorsTab } from "@/components/inspector/IndicatorsTab";
import { OverviewTab } from "@/components/inspector/OverviewTab";
import { SectionsTab } from "@/components/inspector/SectionsTab";
import { StringsTab } from "@/components/inspector/StringsTab";
import { SymbolsTab } from "@/components/inspector/SymbolsTab";
import { useAuth } from "@/hooks/use-auth";
import { analyzeFile, formatBytes, type AnalysisResult } from "@/lib/binary-analysis";
import {
  Activity,
  Braces,
  FileCode2,
  FileSearch,
  ImageIcon,
  Layers,
  LogOut,
  ScanText,
  Sigma,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB file selection limit

export default function Dashboard() {
  const { user, signOut, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [data, setData] = useState<Uint8Array | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("overview");
  const [hexJump, setHexJump] = useState<HexJump | undefined>(undefined);
  const [csourceOpen, setCsourceOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`File too large (${formatBytes(file.size)}). Limit is 2 GB.`);
      return;
    }
    setFile(file);
    setBusy(true);
    setStage("Reading file…");
    await new Promise((r) => setTimeout(r, 30)); // let the UI paint
    try {
      setStage("Parsing headers, strings and checksums…");
      const res = await analyzeFile(file);
      setResult(res);
      setData(res.view);
      toast.success(`Analyzed ${file.name}`, {
        description: `${formatBytes(res.size)} · ${res.scanMs} ms · all local`,
      });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Analysis failed");
      toast.error("Analysis failed");
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const jumpToOffset = (offset: number) => {
    if (offset < 0 || offset >= (data?.length ?? 0)) {
      toast.message("Offset is outside the analyzed window");
      return;
    }
    setHexJump({ offset, token: Date.now() });
    setTab("hex");
  };

  const tabsMeta = [
    { value: "overview", label: "Overview", icon: Activity },
    { value: "hex", label: "Hex", icon: FileSearch },
    { value: "strings", label: "Strings", icon: ScanText },
    { value: "symbols", label: "Symbols", icon: Braces },
    { value: "indicators", label: "Indicators", icon: Sigma },
    { value: "sections", label: "Sections", icon: Layers },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <BrandHeader />

      <main className="hub-grid-bg flex-1">
        <div className="hub-radial mx-auto w-full max-w-6xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono-tight text-[11px] uppercase tracking-[0.24em] text-gold">
                Inspector workspace
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {result ? result.name : "Load a binary to begin"}
              </h1>
              {result && (
                <p className="mt-1 font-mono-tight text-xs text-muted-foreground">
                  {formatBytes(result.size)} · scanned in {result.scanMs} ms ·{" "}
                  {result.truncated ? "first 64 MB analyzed" : "fully analyzed"}
                  {user?.name ? ` · signed in as ${user.name}` : ""}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setImageOpen(true)}>
                <ImageIcon className="size-4" />
                Image → .h
              </Button>
              {file && result && (
                <Button variant="outline" size="sm" onClick={() => setCsourceOpen(true)}>
                  <FileCode2 className="size-4" />
                  Download .c File
                </Button>
              )}
              {result && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setData(null);
                    setFile(null);
                    setHexJump(undefined);
                    setTab("overview");
                  }}
                >
                  <Trash2 className="size-4" />
                  Clear
                </Button>
              )}
              {isAuthenticated && (
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              )}
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {!result && !busy && (
            <Card className="border-border/70 bg-card/60 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSearch className="size-4 text-gold" />
                  What this tool does
                </CardTitle>
                <CardDescription>
                  Static inspection of binaries on your device — headers, strings, checksums and
                  entropy. Read-only: nothing is modified and nothing leaves your machine.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileDropzone onFile={handleFile} busy={false} stage="" />
                <ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <li className="flex items-center gap-2">
                    <Badge variant="outline" className="border-gold/40 font-mono-tight text-gold">
                      ELF
                    </Badge>
                    Section &amp; segment tables for .so files
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="outline" className="border-gold/40 font-mono-tight text-gold">
                      PE
                    </Badge>
                    Section table + entropy for .dll / .exe
                  </li>
                  <li className="flex items-center gap-2">
                    <Badge variant="outline" className="border-gold/40 font-mono-tight text-gold">
                      RAW
                    </Badge>
                    Any other file: hex, strings, CRC32, SHA-256
                  </li>
                </ul>
              </CardContent>
            </Card>
          )}

          {busy && (
            <Card className="border-border/70 bg-card/60 shadow-none">
              <CardContent className="py-10">
                <FileDropzone onFile={handleFile} busy stage={stage} />
              </CardContent>
            </Card>
          )}

          {result && data && (
            <Tabs value={tab} onValueChange={setTab} className="gap-4">
              <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-card/60 p-1">
                {tabsMeta.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="gap-1.5 px-3 py-1.5 font-mono-tight text-xs data-[state=active]:border-gold/40 data-[state=active]:bg-gold/10 data-[state=active]:text-gold"
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="overview">
                <OverviewTab result={result} />
              </TabsContent>
              <TabsContent value="hex">
                <HexView data={data} jump={hexJump} />
              </TabsContent>
              <TabsContent value="strings">
                <StringsTab result={result} />
              </TabsContent>
              <TabsContent value="symbols">
                <SymbolsTab result={result} onJump={jumpToOffset} />
              </TabsContent>
              <TabsContent value="indicators">
                <IndicatorsTab result={result} />
              </TabsContent>
              <TabsContent value="sections">
                <SectionsTab result={result} />
              </TabsContent>
            </Tabs>
          )}

          {!result && !busy && (
            <p className="mt-6 text-center font-mono-tight text-xs text-muted-foreground">
              LUCKY HUB never uploads files. Analysis runs entirely in your browser.
            </p>
          )}
        </div>
      </main>

      <BrandFooter />

      <CSourceDialog
        open={csourceOpen}
        onOpenChange={setCsourceOpen}
        file={file}
        result={result}
      />
      <ImageHeaderDialog open={imageOpen} onOpenChange={setImageOpen} />
    </div>
  );
}
