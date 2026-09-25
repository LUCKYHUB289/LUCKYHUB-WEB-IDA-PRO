import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { Hexagon, ShieldCheck, Send, List, X, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

export function TelegramButton({
  className,
  variant = "default",
  size = "default",
}: {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Button asChild variant={variant} size={size} className={className}>
      <a href="https://t.me/LUCKY_HUB_DEV" target="_blank" rel="noopener noreferrer">
        <Send className="size-4" />
        @LUCKY_HUB_DEV
      </a>
    </Button>
  );
}

export function BrandHeader() {
  const { isAuthenticated, isLoading } = useAuth();
  const [open, setOpen] = useState(false);

  const links = (
    <>
      <a
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        href="#features"
      >
        Features
      </a>
      <a
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        href="#how"
      >
        How it works
      </a>
      <a
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        href="#faq"
      >
        FAQ
      </a>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="LUCKY HUB logo" className="size-9 rounded-lg" />
          <div className="leading-tight">
            <div className="font-display text-sm font-bold tracking-wide text-foreground">
              LUCKY&nbsp;HUB
            </div>
            <div className="font-mono-tight text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Binary Inspector
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">{links}</nav>

        <div className="hidden items-center gap-2 md:flex">
          <TelegramButton variant="ghost" size="sm" />
          {!isLoading &&
            (isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/dashboard">
                  <Hexagon className="size-4" />
                  Open Inspector
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link to="/auth?returnTo=%2Fdashboard">
                  <ShieldCheck className="size-4" />
                  Launch App
                </Link>
              </Button>
            ))}
        </div>

        <button
          type="button"
          aria-label="Toggle menu"
          className="inline-flex size-9 items-center justify-center rounded-lg border border-border/60 text-foreground md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-4" /> : <List className="size-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-border/60 bg-background/95 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {links}
            <TelegramButton variant="outline" size="sm" className="w-full" />
            {!isLoading &&
              (isAuthenticated ? (
                <Button asChild size="sm" className="w-full">
                  <Link to="/dashboard">
                    <Sparkles className="size-4" /> Open Inspector
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" className="w-full">
                  <Link to="/auth?returnTo=%2Fdashboard">Launch App</Link>
                </Button>
              ))}
          </div>
        </div>
      )}
    </header>
  );
}

export function BrandFooter() {
  return (
    <footer className="border-t border-border/60 bg-card/40">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" className="size-7 rounded-md" />
            <span className="font-display text-sm font-bold tracking-wide">LUCKY HUB</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Free, browser-based binary inspection for learning and debugging. Files never leave
            your device.
          </p>
          <p className="mt-3 font-mono-tight text-xs text-muted-foreground">
            Developer: <span className="text-gold">LUCKY HATHUNGO WALA</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
          <div>
            <div className="font-mono-tight text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Product
            </div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link to="/" className="text-muted-foreground hover:text-foreground">
                Home
              </Link>
              <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
                Inspector
              </Link>
              <a href="#faq" className="text-muted-foreground hover:text-foreground">
                FAQ
              </a>
            </div>
          </div>
          <div>
            <div className="font-mono-tight text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Community
            </div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <a
                href="https://t.me/LUCKY_HUB_DEV"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Send className="size-4" /> Telegram
              </a>
              <span className="text-muted-foreground">@LUCKY_HUB_DEV</span>
            </div>
          </div>
          <div>
            <div className="font-mono-tight text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Analysis
            </div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <span className="text-muted-foreground">100% client-side</span>
              <span className="text-muted-foreground">No uploads · read-only</span>
              <Badge variant="outline" className="w-fit border-gold/40 text-gold">
                v1.0
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border/60 py-4 text-center font-mono-tight text-xs text-muted-foreground">
        © {new Date().getFullYear()} LUCKY HUB · Built by LUCKY HATHUNGO WALA
      </div>
    </footer>
  );
}
