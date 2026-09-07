import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Database, Boxes, Tags, Terminal, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DEFAULT_BASE_URL, getBaseUrl, setBaseUrl } from "@/lib/shrapnel-api";
import { toast } from "sonner";

const NAV = [
  { to: "/", label: "Overview", icon: Database },
  { to: "/fields", label: "Fields", icon: Tags },
  { to: "/objects", label: "Objects", icon: Boxes },
  { to: "/encode", label: "Encode", icon: Terminal },
];

function EndpointDialog() {
  const [url, setUrl] = useState(DEFAULT_BASE_URL);
  const [current, setCurrent] = useState(DEFAULT_BASE_URL);

  useEffect(() => {
    setUrl(getBaseUrl());
    setCurrent(getBaseUrl());
  }, []);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="font-mono text-sm">
          <Settings2 className="size-3.5" />
          {current}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>shrapnel-srv endpoint</DialogTitle>
          <DialogDescription>
            Base URL of the REST API. The server must allow CORS from this origin.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="base-url">Base URL</Label>
          <Input
            id="base-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="font-mono"
          />
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              setBaseUrl(url);
              setCurrent(url.replace(/\/+$/, ""));
              toast.success("Endpoint saved — reloading");
              setTimeout(() => window.location.reload(), 400);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-5">
          <Link to="/" className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Database className="size-4" />
            </span>
            <span className="font-mono text-sm font-semibold tracking-tight">
              shrapnel<span className="text-muted-foreground">/console</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => {
              const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-sm transition-colors ${
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <EndpointDialog />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}

export function PageHeading({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function TypeBadge({ code }: { code: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-accent-foreground">
      <span className="text-muted-foreground">{code}</span>
      {
        ({ 1: "Long", 2: "String", 3: "Double", 4: "Boolean", 5: "Timestamp", 6: "JSONB", 7: "UUID" } as Record<number, string>)[
          code
        ]
      }
    </span>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 font-mono text-sm text-destructive">
      {error instanceof Error ? error.message : String(error)}
    </div>
  );
}
