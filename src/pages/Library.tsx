import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import { WifiOff, HardDrive, Plus, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import PdfCard from "../components/library/PdfCard";
import { usePdfLibrary, type CatalogPdf } from "../hooks/usePdfLibrary";
import UniversalFileViewer from "../components/library/UniversalFileViewer";
import { addBlobToDefaultLibrary, addFilesToFolder, getOrCreateFolder } from "../services/personalLibrary";
import { toast } from "sonner";
import { selectionHaptic, tapHaptic } from "@/lib/native/haptics";


const LEVELS = [
  { key: "beginner", label: "Beginner" },
  { key: "intermediate", label: "Intermediate" },
  { key: "advanced", label: "Advanced" },
] as const;

function fmtBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const Library = () => {
  const navigate = useNavigate();
  // Screen protection intentionally not applied here; only LessonView blocks recording for students.
  const {
    online,
    loading,
    catalog,
    downloaded,
    downloadedIds,
    progress,
    totalUsed,
    download,
    remove,
    cancel,
    getLocalFileUri,
  } = usePdfLibrary();

  const [open, setOpen] = useState<{ title: string; url: string; filename: string } | null>(null);

  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = "";
    if (!files || files.length === 0) return;
    setAdding(true);
    // Single-file path keeps the original "Added to My Library" toast.
    if (files.length === 1) {
      const file = files[0];
      const t = toast.loading(`Adding "${file.name}"…`);
      try {
        await addBlobToDefaultLibrary(file, file.name, file.name);
        toast.success("Added to My Library", { id: t });
        window.dispatchEvent(new Event("personalLibrary:refresh"));
      } catch (err) {
        toast.error((err as Error)?.message || "Could not add file", { id: t });
      } finally {
        setAdding(false);
      }
      return;
    }
    // Batch path: dedup + serial import via the write queue, with progress.
    const t = toast.loading(`Importing 0 / ${files.length}…`);
    try {
      const folder = await getOrCreateFolder("Saved PDFs");
      const result = await addFilesToFolder(
        folder.id,
        files,
        "device",
        (done, total, name) => {
          toast.loading(`Importing ${done} / ${total} — ${name}`, { id: t });
        }
      );
      const parts: string[] = [];
      if (result.added.length) parts.push(`${result.added.length} added`);
      if (result.skipped.length) parts.push(`${result.skipped.length} skipped`);
      if (result.failed.length) parts.push(`${result.failed.length} failed`);
      toast.success(parts.join(" · ") || "Done", { id: t });
      window.dispatchEvent(new Event("personalLibrary:refresh"));
    } catch (err) {
      toast.error((err as Error)?.message || "Import failed", { id: t });
    } finally {
      setAdding(false);
    }
  };

  const fileTypeFor = (name: string) => {
    const ext = name.match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();
    if (!ext) return "PDF";
    if (ext === "MARKDOWN") return "MD";
    return ext;
  };

  // Offline → show only downloads as a synthetic catalog so the user sees
  // their saved PDFs even when the network catalog is empty.
  const effective: CatalogPdf[] = useMemo(() => {
    if (online) return catalog;
    return downloaded.map((r) => ({
      pdf_id: r.pdf_id,
      title: r.title,
      url: "",
      version: r.version,
      subject: r.subject,
      skill_level: r.skill_level,
      file_name: r.title,
      file_size: r.size_bytes,
      created_at: r.downloaded_at,
    }));
  }, [online, catalog, downloaded]);

  const grouped = useMemo(() => {
    const out: Record<string, Record<string, CatalogPdf[]>> = {
      beginner: {},
      intermediate: {},
      advanced: {},
    };
    for (const p of effective) {
      const lvl = (p.skill_level || "beginner") as keyof typeof out;
      const subj = p.subject || "General";
      (out[lvl] ||= {})[subj] ||= [];
      out[lvl][subj].push(p);
    }
    return out;
  }, [effective]);

  const handleOpen = async (pdf: CatalogPdf) => {
    const local = downloadedIds.get(pdf.pdf_id);
    if (local) {
      const uri = await getLocalFileUri(pdf.pdf_id);
      // On web, local_path may be a viewer URL; prefer the catalog URL so
      // useLocalPdfSource can resolve it to raw bytes.
      const isViewer = uri && /\/view\/[a-f0-9-]{20,}/i.test(uri);
      if (uri && !isViewer) {
        setOpen({ title: pdf.title, url: uri, filename: pdf.file_name || pdf.title });
        return;
      }
    }
    if (pdf.url) setOpen({ title: pdf.title, url: pdf.url, filename: pdf.file_name || pdf.title });
  };

  if (open) {
    return (
      <UniversalFileViewer
        url={open.url}
        title={open.title}
        filename={open.filename}
        fileType={fileTypeFor(open.filename)}
        onBack={() => setOpen(null)}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-background pb-20 safe-area-bottom">
      <header
        className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 shadow-sm"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: 'calc(env(safe-area-inset-top, 0px) + 52px)' }}
      >
        <BackButton />
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">Library</h1>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <HardDrive className="h-3 w-3" />
            Used: {fmtBytes(totalUsed)} · {downloaded.length} saved
          </p>
        </div>
      </header>

      {!online && (
        <div className="flex items-center gap-2 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          <WifiOff className="h-3.5 w-3.5" />
          You're offline — showing your downloads.
        </div>
      )}

      <Tabs defaultValue="beginner" className="px-3 pt-3">
        <TabsList className="grid w-full grid-cols-3">
          {LEVELS.map((l) => (
            <TabsTrigger key={l.key} value={l.key} className="text-xs">
              {l.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {LEVELS.map((l) => {
          const subjects = Object.entries(grouped[l.key] || {});
          return (
            <TabsContent key={l.key} value={l.key} className="mt-3 space-y-4">
              {loading ? (
                <>
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </>
              ) : subjects.length === 0 ? (
                <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
                  {online
                    ? `No ${l.label.toLowerCase()} PDFs yet.`
                    : "You're offline. Download PDFs while online to access them anytime."}
                </div>
              ) : (
                subjects.map(([subject, list]) => (
                  <section key={subject}>
                    <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {subject}
                    </h2>
                    <div className="space-y-2">
                      {list.map((pdf) => (
                        <PdfCard
                          key={pdf.pdf_id}
                          pdf={pdf}
                          local={downloadedIds.get(pdf.pdf_id)}
                          progress={progress[pdf.pdf_id]}
                          onDownload={() => download(pdf)}
                          onOpen={() => handleOpen(pdf)}
                          onDelete={() => remove(pdf.pdf_id)}
                          onCancel={() => cancel(pdf.pdf_id)}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {/* Floating "Add file" FAB — pick a local PDF/image and stash in My Library */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*,.md,.txt"
        multiple
        className="hidden"
        onChange={handleAddLocalFile}
      />
      <button
        type="button"
        aria-label="Add file from device"
        onClick={() => { void tapHaptic("light"); fileInputRef.current?.click(); }}
        disabled={adding}
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)" }}
        className="fixed right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition active:scale-95 disabled:opacity-60"
      >
        {adding ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" strokeWidth={2.5} />}
      </button>
    </main>
  );
};

export default Library;