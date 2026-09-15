import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, Play } from "lucide-react";
import Header from "@/components/Layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface DiagCheck {
  name: string;
  ok?: boolean;
  status?: number;
  ms?: number;
  code?: string;
  upstream?: string;
  detail?: string;
}

interface DiagResult {
  keyPresent: boolean;
  configuredModel: string | null;
  effectiveModel: string;
  checks: DiagCheck[];
}

/**
 * Admin-only AI diagnostics. Calls ai-health?diag=1, which runs the exact
 * gateway path JSR Agent (chatbot) and Ask Doubt (resolve-doubt) use and
 * reports the real upstream status instead of the student-facing copy.
 */
export default function AdminAiHealth() {
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiagResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Session expire ho gaya — dobara login karein.");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-health?diag=1`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error((json as { error?: string })?.error || `HTTP ${res.status}`);
      setResult(json as DiagResult);
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, []);

  const copy = useCallback(() => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toast.success("Report copied");
  }, [result]);

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuClick={() => navigate("/admin")} />
      <main className="container mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin")} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Admin
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>AI Health / Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              JSR Agent aur Ask Doubt dono ka asli gateway status. Agar student ko
              "server key issue" dikhe, yahan real reason milega.
            </p>
            <div className="flex gap-2">
              <Button onClick={run} disabled={running} className="gap-2">
                <Play className="h-4 w-4" /> {running ? "Checking…" : "Run check"}
              </Button>
              <Button variant="outline" onClick={copy} disabled={!result} className="gap-2">
                <Copy className="h-4 w-4" /> Copy report
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {result && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant={result.keyPresent ? "default" : "destructive"}>
                    {result.keyPresent ? "API key present" : "API key missing"}
                  </Badge>
                  <Badge variant="outline">Configured: {result.configuredModel || "—"}</Badge>
                  <Badge variant="outline">Effective: {result.effectiveModel}</Badge>
                </div>

                <ul className="space-y-2">
                  {result.checks.map((c) => (
                    <li key={c.name} className="rounded-md border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium break-all">{c.name}</span>
                        <Badge variant={c.ok ? "default" : "destructive"}>
                          {c.ok ? "OK" : c.code || "Failed"}
                        </Badge>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {c.status !== undefined && <span>HTTP {c.status} </span>}
                        {c.ms !== undefined && <span>· {c.ms} ms</span>}
                      </div>
                      {(c.upstream || c.detail) && (
                        <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-muted-foreground">
                          {c.upstream || c.detail}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}