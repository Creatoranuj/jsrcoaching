import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Copy, RefreshCw, ShieldAlert } from "lucide-react";
import Header from "@/components/Layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

/**
 * Backend Guardian — admin-only, read-only live proof of the security gates.
 *
 * Every number on this screen comes from `public.admin_guardian_snapshot()`,
 * a STABLE SECURITY DEFINER function that raises `forbidden` (42501) for
 * anonymous visitors and non-admins. Nothing here writes data.
 */

interface EnrollPolicy {
  name: string;
  with_check: string | null;
  admin_only: boolean;
  checks_price: boolean;
  checks_payment: boolean;
}

interface OpenWritePolicy {
  table: string;
  policy: string;
  cmd: string;
}

interface CronJob {
  name: string | null;
  schedule: string | null;
  active: boolean | null;
}

interface TopTable {
  table: string;
  rows: number | null;
  bytes: number | null;
}

interface Snapshot {
  checked_at: string;
  rls: { total: number; off: string[] };
  profiles_role_column: boolean;
  enrollment_insert_policies: EnrollPolicy[];
  user_roles_open_write_policies: number;
  buckets: { total: number; public: string[] };
  definer_without_search_path: string[];
  open_write_policies: OpenWritePolicy[];
  policy_regressions: number | null;
  cron_jobs: CronJob[] | null;
  top_tables: TopTable[];
  payments: { completed: number; missing_enrollment: number };
}

type GateState = "ok" | "bad" | "unknown";

interface Gate {
  id: string;
  label: string;
  state: GateState;
  value: string;
  detail?: string;
}

// The generated Supabase types in this repo are refreshed separately from
// migrations, so call the new function through a narrow typed shim instead of
// widening the whole client with `any`.
type GuardianRpc = (name: "admin_guardian_snapshot") => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

const bytesToText = (bytes: number | null): string => {
  if (bytes === null || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
};

const dot = (state: GateState) =>
  state === "ok" ? "🟢" : state === "bad" ? "🔴" : "⚪";

export function buildGates(s: Snapshot): Gate[] {
  const rlsOff = s.rls.off?.length ?? 0;
  const enrollPolicies = s.enrollment_insert_policies ?? [];
  const enrollUnsafe = enrollPolicies.filter(
    (p) => !p.admin_only && !p.checks_payment && !p.checks_price,
  );
  const publicBuckets = s.buckets?.public?.length ?? 0;
  const openWrite = s.open_write_policies?.length ?? 0;
  const definerOpen = s.definer_without_search_path?.length ?? 0;
  const cron = s.cron_jobs;
  const activeCron = cron ? cron.filter((j) => j.active).length : 0;

  return [
    {
      id: "rls",
      label: "Har table par suraksha niyam chalu",
      state: rlsOff === 0 ? "ok" : "bad",
      value: `${s.rls.total - rlsOff}/${s.rls.total} chalu`,
      detail: rlsOff > 0 ? `Band: ${s.rls.off.join(", ")}` : undefined,
    },
    {
      id: "enroll",
      label: "Bina payment paid course me enroll",
      state: enrollUnsafe.length === 0 ? "ok" : "bad",
      value:
        enrollUnsafe.length === 0
          ? `${enrollPolicies.length} niyam — sab jaanch karte hain`
          : `${enrollUnsafe.length} khula niyam`,
      detail:
        enrollUnsafe.length > 0
          ? enrollUnsafe.map((p) => p.name).join(", ")
          : undefined,
    },
    {
      id: "roles",
      label: "Roles sirf admin badal sakta hai",
      state: s.user_roles_open_write_policies === 0 && !s.profiles_role_column ? "ok" : "bad",
      value:
        s.user_roles_open_write_policies === 0
          ? s.profiles_role_column
            ? "profile me role column mila"
            : "sirf admin"
          : `${s.user_roles_open_write_policies} khula niyam`,
      detail: s.profiles_role_column
        ? "Role kabhi profile table me nahi hona chahiye."
        : undefined,
    },
    {
      id: "buckets",
      label: "Public file buckets",
      state: publicBuckets === 0 ? "ok" : "unknown",
      value: `${publicBuckets} / ${s.buckets?.total ?? 0} public`,
      detail: publicBuckets > 0 ? s.buckets.public.join(", ") : undefined,
    },
    {
      id: "open-write",
      label: "Koi niyam poori tarah khula",
      state: openWrite === 0 ? "ok" : "bad",
      value: openWrite === 0 ? "koi nahi" : `${openWrite} mile`,
      detail:
        openWrite > 0
          ? s.open_write_policies.map((p) => `${p.table} · ${p.policy} (${p.cmd})`).join(", ")
          : undefined,
    },
    {
      id: "definer",
      label: "Server helpers ka safe setting",
      state: definerOpen === 0 ? "ok" : "bad",
      value: definerOpen === 0 ? "sab sahi" : `${definerOpen} adhoore`,
      detail: definerOpen > 0 ? s.definer_without_search_path.join(", ") : undefined,
    },
    {
      id: "cron",
      label: "Safai wale scheduled kaam",
      state: cron === null ? "unknown" : activeCron > 0 ? "ok" : "bad",
      value:
        cron === null
          ? "pata nahi chala"
          : `${activeCron}/${cron.length} chalu`,
      detail: cron?.length
        ? cron.map((j) => `${j.name ?? "—"} (${j.schedule ?? "—"})`).join(", ")
        : undefined,
    },
    {
      id: "payments",
      label: "Poore hue payment ↔ course access",
      state: s.payments.missing_enrollment === 0 ? "ok" : "bad",
      value: `${s.payments.completed} payment · ${s.payments.missing_enrollment} bina access`,
    },
    {
      id: "regressions",
      label: "Purane suraksha niyam ki jaanch",
      state:
        s.policy_regressions === null
          ? "unknown"
          : s.policy_regressions === 0
            ? "ok"
            : "bad",
      value:
        s.policy_regressions === null
          ? "pata nahi chala"
          : s.policy_regressions === 0
            ? "0 gadbad"
            : `${s.policy_regressions} gadbad`,
    },
    {
      // Supabase Auth's own leaked-password setting lives in the dashboard and
      // is not readable from SQL, so this gate stays neutral on purpose: the
      // app-side HIBP check (src/lib/leakedPassword.ts) is what we can prove.
      id: "leaked-password",
      label: "Leak hue password rokna",
      state: "unknown",
      value: "App me chalu · Supabase dashboard me ek click baaki",
      detail:
        "Signup, reset aur password change par app khud breach list se milaata hai. Dusri parat (Supabase Auth ka setting) dashboard me ON karni hai — wo yahan se padhi nahi jaa sakti.",
    },
  ];
}


export type { Snapshot as GuardianSnapshot, Gate as GuardianGate };

export default function AdminGuardian() {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    const rpc = supabase.rpc as unknown as GuardianRpc;
    const { data, error: rpcError } = await rpc("admin_guardian_snapshot");
    if (rpcError) {
      const message = /forbidden/i.test(rpcError.message)
        ? "Ye screen sirf admin ke liye hai."
        : rpcError.message;
      setError(message);
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setSnapshot(data as Snapshot);
    setLoading(false);
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const gates = useMemo(() => (snapshot ? buildGates(snapshot) : []), [snapshot]);
  const problems = gates.filter((g) => g.state === "bad").length;

  const copy = useCallback(() => {
    if (!snapshot) return;
    navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    toast.success("Report copy ho gayi");
  }, [snapshot]);

  return (
    <div className="min-h-screen bg-background">
      <Header onMenuClick={() => navigate("/admin")} />
      <main className="container mx-auto max-w-3xl px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin")}
            className="-ml-1 h-11 gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Admin
          </Button>
        </div>

        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex min-w-0 items-center gap-2">
              <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
              <span className="truncate">Backend Guardian</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Sirf padhne wali jaanch — kuch badalta nahi. Har line ka jawab
              abhi ke live data se aata hai.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void run()} disabled={loading} className="h-11 gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Jaanch chal rahi hai…" : "Dobara jaanch"}
              </Button>
              <Button
                variant="outline"
                onClick={copy}
                disabled={!snapshot}
                className="h-11 gap-2"
              >
                <Copy className="h-4 w-4" /> Report copy
              </Button>
              {snapshot && (
                <Badge variant={problems === 0 ? "default" : "destructive"}>
                  {problems === 0 ? "Sab theek" : `${problems} dhyan dene layak`}
                </Badge>
              )}
            </div>

            {snapshot && (
              <p className="text-xs text-muted-foreground">
                Kab check hua: {new Date(snapshot.checked_at).toLocaleString()}
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {loading && !snapshot && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
            )}

            {snapshot && (
              <ul className="space-y-2">
                {gates.map((g) => (
                  <li key={g.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start gap-2">
                      <span aria-hidden className="shrink-0 leading-6">
                        {dot(g.state)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{g.label}</p>
                        <p className="text-muted-foreground tabular-nums break-words">
                          {g.value}
                        </p>
                        {g.detail && (
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            {g.detail}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          g.state === "ok"
                            ? "default"
                            : g.state === "bad"
                              ? "destructive"
                              : "outline"
                        }
                        className="shrink-0"
                      >
                        {g.state === "ok" ? "Theek" : g.state === "bad" ? "Dekhein" : "—"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aapke hisse ka kaam</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Supabase dashboard me <strong>Leaked password protection</strong> ON karein
              (Authentication → Sign In / Providers → Password). Ye setting sirf dashboard se
              badalti hai, isliye Guardian ise khud nahi padh sakta.
            </p>
            <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
              <a
                href="https://supabase.com/dashboard/project/wegamscqtvqhxowlskfm/auth/providers"
                target="_blank"
                rel="noreferrer noopener"
              >
                Supabase setting kholein
              </a>
            </Button>
          </CardContent>
        </Card>


        {snapshot && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sabse bade tables (bandwidth)</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {snapshot.top_tables.map((t) => (
                  <li
                    key={t.table}
                    className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{t.table}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {(t.rows ?? 0).toLocaleString()} rows · {bytesToText(t.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
