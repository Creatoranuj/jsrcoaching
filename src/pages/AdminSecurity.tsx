import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldAlert, RefreshCw, Plus, Minus, Check, ExternalLink, Video } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAdminScreenProtectionOptIn } from "@/hooks/useScreenProtection";
import { reportError } from "@/lib/sentry";
// Vite bundles package.json as JSON at build time.
// The import is untyped in this project's tsconfig — cast to a known shape.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pkgJson from "../../package.json";

type Finding = {
  id: string;
  package: string;
  version: string;
  summary: string;
  severity: string;
  aliases: string[];
  url: string;
};

type ScanResponse = {
  current: {
    id: string;
    created_at: string;
    package_count: number;
    vulnerability_count: number;
    findings: Finding[];
  };
  previous: {
    id: string;
    created_at: string;
    vulnerability_count: number;
    package_count: number;
  } | null;
  diff: { added: Finding[]; resolved: Finding[]; unchanged_count: number };
};

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MODERATE: 2,
  MEDIUM: 2,
  LOW: 3,
  UNKNOWN: 4,
};

function severityVariant(sev: string): "destructive" | "default" | "secondary" | "outline" {
  switch (sev.toUpperCase()) {
    case "CRITICAL":
    case "HIGH":
      return "destructive";
    case "MODERATE":
    case "MEDIUM":
      return "default";
    case "LOW":
      return "secondary";
    default:
      return "outline";
  }
}

function collectPackages(): Array<{ name: string; version: string }> {
  const pkg = pkgJson as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const merged: Record<string, string> = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  return Object.entries(merged).map(([name, version]) => ({ name, version }));
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function FindingRow({ f }: { f: Finding }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-border/60 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={severityVariant(f.severity)} className="uppercase text-[10px]">
            {f.severity || "UNKNOWN"}
          </Badge>
          <span className="font-mono text-sm font-medium truncate">{f.package}</span>
          <span className="text-xs text-muted-foreground">{f.version}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.summary}</p>
      </div>
      <a
        href={f.url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
      >
        {f.id} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default function AdminSecurity() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState<
    Array<{ id: string; created_at: string; vulnerability_count: number; package_count: number }>
  >([]);

  const packages = useMemo(() => collectPackages(), []);

  useEffect(() => {
    if (!isAdmin) return;
    const ac = new AbortController();
    (async () => {
      setHistoryLoading(true);
      const { data, error } = await supabase
        .from("dependency_scan_reports")
        .select("id, created_at, vulnerability_count, package_count")
        .order("created_at", { ascending: false })
        .limit(10)
        .abortSignal(ac.signal);
      if (error && error.name !== "AbortError") {
        reportError(error, { surface: "AdminSecurity.loadHistory" });
      } else if (data) {
        setHistory(data);
      }
      setHistoryLoading(false);
    })();
    return () => ac.abort();
  }, [isAdmin]);

  const runScan = async () => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke<ScanResponse>("dependency-scan", {
        body: { packages },
      });
      if (error) throw error;
      if (!data) throw new Error("Empty response from scanner");
      setResult(data);
      setHistory((prev) => [
        {
          id: data.current.id,
          created_at: data.current.created_at,
          vulnerability_count: data.current.vulnerability_count,
          package_count: data.current.package_count,
        },
        ...prev,
      ].slice(0, 10));
      const { diff } = data;
      if (diff.added.length === 0 && diff.resolved.length === 0) {
        toast.success(`Scan complete — no changes since last report`);
      } else {
        toast.success(
          `Scan complete: ${diff.added.length} new, ${diff.resolved.length} resolved`,
        );
      }
    } catch (err) {
      reportError(err, { surface: "AdminSecurity.runScan" });
      toast.error((err as Error).message || "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  if (authLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const sortedCurrent = result
    ? [...result.current.findings].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity.toUpperCase()] ?? 5) -
          (SEVERITY_ORDER[b.severity.toUpperCase()] ?? 5),
      )
    : [];

  return (
    <main className="min-h-dvh bg-background">
      <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Admin
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="h-5 w-5 text-primary shrink-0" />
              <h1 className="text-lg md:text-xl font-semibold truncate">Dependency Security</h1>
            </div>
          </div>
          <Button onClick={runScan} disabled={scanning} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning…" : "Run scan"}
          </Button>
        </div>

        <AdminScreenProtectionCard />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Latest scan</CardTitle>
          </CardHeader>
          <CardContent>
            {!result && !scanning && (
              <p className="text-sm text-muted-foreground">
                Scans {packages.length} packages against the OSV.dev advisory database and diffs against the previous report.
              </p>
            )}
            {scanning && (
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            )}
            {result && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Scanned</div>
                    <div className="font-medium">{formatDate(result.current.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Packages</div>
                    <div className="font-medium">{result.current.package_count}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Vulnerabilities</div>
                    <div className="font-medium">{result.current.vulnerability_count}</div>
                  </div>
                  {result.previous && (
                    <div>
                      <div className="text-xs text-muted-foreground">Previous</div>
                      <div className="font-medium">
                        {result.previous.vulnerability_count} on {formatDate(result.previous.created_at)}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Plus className="h-4 w-4 text-destructive" />
                      New since last scan ({result.diff.added.length})
                    </h3>
                    {result.diff.added.length === 0 ? (
                      <p className="text-xs text-muted-foreground">None</p>
                    ) : (
                      <div>{result.diff.added.map((f) => <FindingRow key={`a-${f.id}-${f.package}`} f={f} />)}</div>
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Minus className="h-4 w-4 text-primary" />
                      Resolved since last scan ({result.diff.resolved.length})
                    </h3>
                    {result.diff.resolved.length === 0 ? (
                      <p className="text-xs text-muted-foreground">None</p>
                    ) : (
                      <div>{result.diff.resolved.map((f) => <FindingRow key={`r-${f.id}-${f.package}`} f={f} />)}</div>
                    )}
                  </div>
                </div>

                {result.diff.unchanged_count > 0 && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="h-3 w-3" /> {result.diff.unchanged_count} pre-existing finding
                    {result.diff.unchanged_count === 1 ? "" : "s"} carried over
                  </p>
                )}

                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-2">All findings ({sortedCurrent.length})</h3>
                  {sortedCurrent.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No known vulnerabilities.</p>
                  ) : (
                    <div>{sortedCurrent.map((f) => <FindingRow key={`${f.id}-${f.package}`} f={f} />)}</div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent scans</CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No previous scans yet.</p>
            ) : (
              <ul className="text-sm divide-y divide-border/60">
                {history.map((h) => (
                  <li key={h.id} className="py-2 flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{formatDate(h.created_at)}</span>
                    <span>
                      <Badge variant={h.vulnerability_count > 0 ? "destructive" : "secondary"}>
                        {h.vulnerability_count} vuln{h.vulnerability_count === 1 ? "" : "s"}
                      </Badge>{" "}
                      <span className="text-xs text-muted-foreground">/ {h.package_count} pkgs</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/**
 * Per-device toggle: whether this admin device applies Android FLAG_SECURE.
 * Default OFF (admin can screen-record). Non-admin users never see this UI.
 * Stored in localStorage so it survives reloads on the same device.
 */
function AdminScreenProtectionCard() {
  const [optIn, setOptIn] = useAdminScreenProtectionOptIn();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Video className="h-4 w-4 text-primary" />
          Screen recording (admin device)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Label htmlFor="admin-screen-protection" className="text-sm font-medium">
              Enable FLAG_SECURE on this device
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              OFF (default) rakhne se aap lesson pages record karke students ko guide kar sakte hain.
              ON karne se aapke device pe bhi screen recording block ho jaayegi — jaise ek regular student.
              Ye setting sirf is device pe apply hoti hai.
            </p>
          </div>
          <Switch
            id="admin-screen-protection"
            checked={optIn}
            onCheckedChange={(v) => {
              setOptIn(v);
              toast.success(
                v
                  ? "Screen protection ON for this admin device"
                  : "Screen protection OFF — you can record lessons",
              );
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}