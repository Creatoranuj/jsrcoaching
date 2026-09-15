import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Play, RefreshCw, Copy, Square } from "lucide-react";
import Header from "@/components/Layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  SOURCE_LABEL,
  usePdfSourceHealth,
  type PdfSourceRow,
  type ProbeStatus,
} from "@/hooks/usePdfSourceHealth";

const PAGE_SIZE = 50;

const STATUS_VARIANT: Record<ProbeStatus, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  checking: "secondary",
  ok: "default",
  warn: "secondary",
  fail: "destructive",
};

const STATUS_LABEL: Record<ProbeStatus, string> = {
  pending: "Not checked",
  checking: "Checking…",
  ok: "Opens fine",
  warn: "Needs review",
  fail: "Broken",
};

function reportLine(row: PdfSourceRow): string {
  const parts = [
    STATUS_LABEL[row.status],
    SOURCE_LABEL[row.kind],
    row.httpStatus ? `HTTP ${row.httpStatus}` : "",
    row.contentType ?? "",
    row.signature ? `signature ${row.signature}` : "",
    row.elapsedMs != null ? `${row.elapsedMs}ms` : "",
    row.reason ?? "",
  ].filter(Boolean);
  return `- [${parts.join(" | ")}] ${row.lessonTitle} — ${row.fileName} (${row.field})\n  ${row.url}`;
}

export default function AdminPdfHealth() {
  const navigate = useNavigate();
  const { courses, rows, loading, running, error, load, runProbes, stop } = usePdfSourceHealth();
  const [courseId, setCourseId] = useState<string>("all");
  const [filter, setFilter] = useState<"all" | ProbeStatus>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const base: Record<ProbeStatus, number> = { pending: 0, checking: 0, ok: 0, warn: 0, fail: 0 };
    rows.forEach((r) => { base[r.status] += 1; });
    return base;
  }, [rows]);

  const handleLoad = async () => {
    setVisible(PAGE_SIZE);
    await load(courseId === "all" ? "all" : Number(courseId));
  };

  const copyReport = async () => {
    const body = [
      `PDF Source Health — ${new Date().toISOString()}`,
      `Total: ${rows.length} | OK: ${counts.ok} | Review: ${counts.warn} | Broken: ${counts.fail}`,
      "",
      ...rows.map(reportLine),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Report copied");
    } catch {
      toast.error("Copy failed — select the table manually");
    }
  };

  return (
    <div className="min-h-screen bg-background">
        <Header onMenuClick={() => navigate("/admin")} />
      <main className="container mx-auto max-w-5xl px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="Back to admin">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">PDF Source Health</h1>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Check every lesson PDF link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All courses</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleLoad} disabled={loading} variant="secondary">
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Load links
              </Button>
              <Button onClick={running ? stop : runProbes} disabled={rows.length === 0}>
                {running ? <Square className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                {running ? "Stop" : "Run check"}
              </Button>
              <Button variant="outline" onClick={copyReport} disabled={rows.length === 0}>
                <Copy className="mr-2 h-4 w-4" /> Copy report
              </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-wrap gap-2 text-xs">
              {(["all", "ok", "warn", "fail", "pending"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-3 py-1 ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  {f === "all" ? `All (${rows.length})` : `${STATUS_LABEL[f]} (${counts[f]})`}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {filtered.slice(0, visible).map((row) => (
            <Card key={row.key}>
              <CardContent className="space-y-1 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.lessonTitle}</p>
                    <p className="truncate text-xs text-muted-foreground">{row.fileName}</p>
                    <p className="text-[11px] text-muted-foreground">Field: {row.field}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {SOURCE_LABEL[row.kind]}
                  {row.httpStatus ? ` · HTTP ${row.httpStatus}` : ""}
                  {row.contentType ? ` · ${row.contentType}` : ""}
                  {row.signature ? ` · ${row.signature}` : ""}
                  {row.elapsedMs != null ? ` · ${row.elapsedMs} ms` : ""}
                </p>
                {row.reason && <p className="text-xs text-destructive break-words">{row.reason}</p>}
                <p className="truncate text-[11px] text-muted-foreground">{row.url}</p>
              </CardContent>
            </Card>
          ))}

          {filtered.length > visible && (
            <Button variant="outline" className="w-full" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
            </Button>
          )}

          {!loading && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Pick a course and tap “Load links”.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}