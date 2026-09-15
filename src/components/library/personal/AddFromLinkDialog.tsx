import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Loader2, Smartphone, WifiOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Button } from "../../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { toast } from "sonner";
import { needsAppToRead, parseLink, SOURCE_LABEL, type ParsedLink } from "../../../lib/linkSources";
// linkOfflineSave pulls in the download/filesystem stack. It is imported
// dynamically here (and in FolderView) so it stays out of the library entry
// chunk — a static import here made FolderView's dynamic import ineffective
// (rollup INEFFECTIVE_DYNAMIC_IMPORT). Keep both call sites dynamic.
import { LINKS_FOLDER } from "../../../lib/linkMigration";
import type { PersonalFolder } from "../../../lib/personalLibraryDB";
import { useOnlineStatus } from "../../../hooks/useOnlineStatus";
import { isNative } from "../../../lib/platform";

const NEW_FOLDER = "__new__";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Folders the link can be filed into. */
  folders: PersonalFolder[];
  /** Pre-selected folder (the one currently open), if any. */
  currentFolderId?: string | null;
  /** Fired after the library changed, so the caller can refresh. */
  onSaved: () => void;
  /** Fired when the user chooses "Read now". */
  onRead: (link: { url: string; title: string; kind: string }) => void;
}

export default function AddFromLinkDialog({
  open,
  onOpenChange,
  folders,
  currentFolderId,
  onSaved,
  onRead,
}: Props) {
  const online = useOnlineStatus();
  const [raw, setRaw] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [folderId, setFolderId] = useState<string>(currentFolderId || NEW_FOLDER);
  const [newFolderName, setNewFolderName] = useState(LINKS_FOLDER);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) setFolderId(currentFolderId || (folders[0]?.id ?? NEW_FOLDER));
  }, [open, currentFolderId, folders]);

  // Never leave a download running behind a closed dialog.
  useEffect(() => () => abortRef.current?.abort(), []);

  const preview = useMemo<{ ok: true; value: ParsedLink } | { ok: false; error: string } | null>(() => {
    if (!raw.trim()) return null;
    try {
      return { ok: true, value: parseLink(raw, title) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }, [raw, title]);

  // On the web build a non-relayable host will be blocked by CORS; inside the
  // Android app native HTTP handles it. Say so up-front instead of failing later.
  const appOnly = preview?.ok === true && !isNative() && needsAppToRead(preview.value.url);

  const reset = () => {
    setRaw("");
    setTitle("");
    setBusy(false);
    setNewFolderName(LINKS_FOLDER);
  };

  const close = () => {
    abortRef.current?.abort();
    onOpenChange(false);
    reset();
  };

  /** Resolve the destination folder id, creating it when "New folder…". */
  const resolveFolderId = async (): Promise<string> => {
    const { getOrCreateFolder } = await import("../../../services/personalLibrary");
    if (folderId !== NEW_FOLDER && folders.some((f) => f.id === folderId)) return folderId;
    const folder = await getOrCreateFolder(newFolderName.trim() || LINKS_FOLDER);
    return folder.id;
  };

  const handleRead = () => {
    if (!preview?.ok) return;
    if (!online) {
      toast.error("Reading a link needs internet. Save it to a folder first.");
      return;
    }
    const { url, title: t, kind } = preview.value;
    onOpenChange(false);
    reset();
    onRead({ url, title: t, kind });
  };

  /** Save the link itself (no download) as a normal library item. */
  const handleSaveLink = async () => {
    if (!preview?.ok) return;
    setBusy(true);
    try {
      const target = await resolveFolderId();
      const { addLinkToFolder, emitLibraryRefresh } = await import(
        "../../../services/personalLibrary"
      );
      await addLinkToFolder(target, {
        url: preview.value.url,
        title: preview.value.title,
        source: preview.value.source,
        kind: preview.value.kind,
      });
      emitLibraryRefresh();
      onSaved();
      toast.success("Link added to your library");
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error((err as Error)?.message || "Could not add this link");
    } finally {
      setBusy(false);
    }
  };

  /** Save the link AND download its bytes into the same folder. */
  const handleSaveOffline = async () => {
    if (!preview?.ok) return;
    if (!online) {
      toast.error("You're offline — connect to download this file.");
      return;
    }
    setBusy(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = toast.loading("Downloading…");
    try {
      const target = await resolveFolderId();
      const { saveLinkOffline } = await import("../../../lib/linkOfflineSave");
      await saveLinkOffline({
        url: preview.value.url,
        title: preview.value.title,
        source: preview.value.source,
        folderId: target,
        signal: ctrl.signal,
      });
      onSaved();
      toast.success("Saved offline", { id: t });
      onOpenChange(false);
      reset();
    } catch (err) {
      if (ctrl.signal.aborted) toast("Download cancelled", { id: t });
      else toast.error((err as Error)?.message || "Could not download this link", { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" /> Add from link
          </DialogTitle>
          <DialogDescription className="text-xs">
            Google Drive, Notion, Archive.org or a direct PDF/CDN link. It lands in a folder like any
            other file — read it online, or keep an offline copy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            autoFocus
            inputMode="url"
            className="text-base"
            placeholder="https://drive.google.com/file/d/…"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <Input
            className="text-base"
            placeholder="Title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <div className="space-y-2">
            <label className="text-[11px] font-medium text-muted-foreground">Save into</label>
            <Select value={folderId} onValueChange={setFolderId}>
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Choose a folder" />
              </SelectTrigger>
              <SelectContent>
                {folders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_FOLDER}>New folder…</SelectItem>
              </SelectContent>
            </Select>
            {folderId === NEW_FOLDER && (
              <Input
                className="text-base"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
            )}
          </div>

          {preview?.ok === false && <p className="text-xs text-destructive">{preview.error}</p>}
          {preview?.ok && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                {SOURCE_LABEL[preview.value.source]}
              </span>
              <span>{preview.value.kind}</span>
              <span>·</span>
              <span>
                {preview.value.offlineCapable ? "Can be saved offline" : "Online reading only"}
              </span>
            </div>
          )}
          {appOnly && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Smartphone className="mt-px h-3.5 w-3.5 shrink-0" />
              This host doesn't allow browser reading — open it in the Android app, or use “Save
              offline” which works everywhere.
            </p>
          )}
          {!online && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <WifiOff className="h-3.5 w-3.5" /> You're offline — links need internet the first time.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {busy ? (
            <Button variant="outline" size="sm" onClick={close}>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Cancel
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={!preview?.ok || !preview.value.offlineCapable}
                onClick={handleSaveOffline}
              >
                Save offline
              </Button>
              <Button variant="outline" size="sm" disabled={!preview?.ok} onClick={handleSaveLink}>
                Save to folder
              </Button>
              <Button size="sm" disabled={!preview?.ok} onClick={handleRead}>
                Read now
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
