import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, History, Smartphone } from "lucide-react";
import { fetchReleases, type AppRelease } from "@/lib/releases";
import { UPDATE_PAGE_URL } from "@/config/updatePage";

const STATUS_LABEL: Record<AppRelease["status"], string> = {
  supported: "Supported",
  deprecated: "Purana version",
  forced_update: "Update zaroori hai",
};

const StatusChip = ({ release }: { release: AppRelease }) => {
  if (release.is_current) {
    return (
      <Badge className="bg-green-600 text-white hover:bg-green-600 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Current
      </Badge>
    );
  }
  if (release.status === "forced_update") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" /> {STATUS_LABEL.forced_update}
      </Badge>
    );
  }
  if (release.status === "deprecated") {
    return <Badge variant="secondary">{STATUS_LABEL.deprecated}</Badge>;
  }
  return <Badge variant="outline">{STATUS_LABEL.supported}</Badge>;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
};

const Releases = () => {
  useEffect(() => {
    document.title = "App Versions & Release Notes — JSR Coaching";
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute(
        "content",
        "JSR Coaching app ke purane versions, release notes aur abhi ka supported version dekhein.",
      );
    }
  }, []);

  const { data: releases, isLoading, isError } = useQuery({
    queryKey: ["app_releases_public"],
    queryFn: fetchReleases,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });

  const current = releases?.find((r) => r.is_current) ?? null;

  return (
    <main className="min-h-dvh bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="text-primary hover:underline text-sm">
          ← Back to Home
        </Link>

        <h1 className="text-3xl font-bold mt-4 mb-2 flex items-center gap-2">
          <History className="h-7 w-7 text-primary" /> App Versions
        </h1>
        <p className="text-muted-foreground mb-8">
          JSR Coaching app ke saare versions aur unme kya naya aaya — ek jagah.
        </p>

        {isLoading && (
          <div className="space-y-4" aria-label="Loading releases">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {isError && (
          <Card className="p-6 text-sm text-muted-foreground">
            Release history abhi load nahi ho payi. Thodi der baad dobara try karein.
          </Card>
        )}

        {!isLoading && !isError && current && (
          <Card className="p-6 mb-8 border-green-600/40 bg-green-50 dark:bg-green-950/20">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm text-muted-foreground">Abhi ka supported version</p>
                <p className="text-2xl font-bold">v{current.version}</p>
                {current.title && (
                  <p className="text-sm text-muted-foreground mt-1">{current.title}</p>
                )}
              </div>
              <Button asChild className="gap-2">
                <a href={UPDATE_PAGE_URL} target="_blank" rel="noreferrer">
                  <Smartphone className="h-4 w-4" /> Update / Download
                </a>
              </Button>
            </div>
          </Card>
        )}

        {!isLoading && !isError && releases && releases.length === 0 && (
          <Card className="p-6 text-sm text-muted-foreground">
            Abhi koi release listed nahi hai.
          </Card>
        )}

        <ol className="space-y-4">
          {releases?.map((r) => (
            <li key={r.id}>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-semibold">v{r.version}</span>
                      <StatusChip release={r} />
                    </div>
                    {r.title && (
                      <p className="font-medium mt-1">{r.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(r.released_at)}
                    </p>
                  </div>
                </div>
                {r.notes && (
                  <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">
                    {r.notes}
                  </p>
                )}
                {r.status === "forced_update" && !r.is_current && (
                  <p className="text-sm text-destructive mt-3 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" />
                    Yeh version ab band hai — app chalane ke liye update karna zaroori hai.
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
};

export default Releases;
