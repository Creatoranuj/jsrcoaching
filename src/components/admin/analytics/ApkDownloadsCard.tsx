import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, RefreshCw, ExternalLink } from "lucide-react";
import { getErrorMessage } from "@/lib/errorMessage";

interface ReleaseAsset {
  name: string;
  download_count: number;
  size: number;
  browser_download_url: string;
}
interface Release {
  id: number;
  tag_name: string;
  name: string | null;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

const REPO = "MrAnujBabu/Sadguruclasses";

export default function ApkDownloadsCard() {
  const [loading, setLoading] = useState(true);
  const [releases, setReleases] = useState<Release[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data: Release[] = await res.json();
      setReleases(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e) ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const total = releases.reduce(
    (sum, r) => sum + r.assets.reduce((s, a) => s + a.download_count, 0),
    0,
  );

  return (
    <Card className="border-border">
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          APK Downloads (GitHub)
        </CardTitle>
        <a
          href={`https://github.com/${REPO}/releases`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-32 flex items-center justify-center">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">Error: {error}</p>
        ) : releases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No releases yet.</p>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Total downloads
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {total.toLocaleString()}
              </p>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {releases.map((r) => {
                const relTotal = r.assets.reduce(
                  (s, a) => s + a.download_count,
                  0,
                );
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.name || r.tag_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.tag_name} ·{" "}
                        {new Date(r.published_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-lg font-semibold tabular-nums">
                        {relTotal.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase">
                        downloads
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}