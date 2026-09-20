/**
 * JSR COACHING — public "/update" page.
 *
 * Opened in the phone's real browser by the in-app update button and by the
 * "update available" push notification. The download button is a plain <a>
 * pointing at the stable app-download endpoint, so Chrome handles it with its
 * normal download flow (progress in the notification bar, tap to install).
 *
 * Public on purpose: a student on an outdated build must be able to update
 * without signing in.
 */
import { useQuery } from "@tanstack/react-query";
import { Download, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_DOWNLOAD_ENDPOINT, LATEST_APK_FALLBACK } from "@/utils/downloadUrl";
import { fetchLatestReleaseVersion } from "@/utils/latestRelease";
import { isUpdateAvailable } from "@/utils/version";

interface UpdateInfo {
  latest_android_version: string | null;
  update_notes: string | null;
  update_message: string | null;
}

const STEPS = [
  'Neeche "Update download karein" dabayein — file download hone lagegi.',
  'Download poora hone par notification ya Downloads folder me file par tap karein.',
  'Android "Install" ka option dega — Install dabayein. (Pehli baar browser ko "Unknown apps install karne dein" allow karna padega.)',
];

export default function AppUpdate() {
  const { data, isLoading } = useQuery<UpdateInfo>({
    queryKey: ["update_page_config"],
    queryFn: async () => {
      const { data: cfg, error } = await supabase
        .from("app_config")
        .select("latest_android_version,update_notes,update_message")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return (cfg as UpdateInfo) ?? { latest_android_version: null, update_notes: null, update_message: null };
    },
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const { data: releaseVersion } = useQuery<string | null>({
    queryKey: ["latest_release_version"],
    queryFn: () => fetchLatestReleaseVersion(),
    staleTime: 1000 * 60 * 60 * 6,
    retry: 0,
  });

  const published = data?.latest_android_version ?? null;
  const version =
    releaseVersion && (!published || isUpdateAvailable(published, releaseVersion))
      ? releaseVersion
      : published;

  return (
    <main className="min-h-dvh bg-background px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">App update karein</h1>
            <p className="text-sm text-muted-foreground">JSR COACHING Android app</p>
          </div>
        </div>

        <Card className="space-y-4 p-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm text-muted-foreground">Naya version</span>
                <span className="text-lg font-semibold tabular-nums">{version ?? "Latest"}</span>
              </div>
              {data?.update_message ? (
                <p className="text-sm text-foreground/80">{data.update_message}</p>
              ) : null}
              {data?.update_notes ? (
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Kya naya hai
                  </p>
                  <p className="whitespace-pre-line text-sm text-foreground/80">{data.update_notes}</p>
                </div>
              ) : null}
            </div>
          )}

          <Button asChild size="lg" className="h-12 w-full text-base">
            <a href={APP_DOWNLOAD_ENDPOINT} rel="noopener">
              <Download className="mr-2 h-5 w-5" />
              Update download karein
            </a>
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Download shuru na ho to{" "}
            <a className="text-primary underline" href={LATEST_APK_FALLBACK} rel="noopener">
              yahan se try karein
            </a>
            .
          </p>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-medium">Install kaise karein</p>
          <ol className="space-y-2">
            {STEPS.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm text-foreground/80">{step}</span>
              </li>
            ))}
          </ol>
        </Card>

        <div className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Purana app hatane ki zarurat nahi — install hone par wahi app update ho jayega aur aapka
            data safe rahega.
          </span>
        </div>
      </div>
    </main>
  );
}
