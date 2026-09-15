import { useState, useCallback } from "react";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../integrations/supabase/client";
import {
  useAllHeroBanners,
  useCreateBanner,
  useUpdateBanner,
  useDeleteBanner,
  useReorderBanners,
  importBannerFromUrl,
  HeroBanner,
  HeroBannerInsert,
} from "../../hooks/useHeroBanners";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Switch } from "../ui/switch";
import { Badge } from "../ui/badge";
import {
  GripVertical,
  Trash2,
  Pencil,
  Plus,
  X,
  Check,
  Upload,
  ImageIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { getErrorMessage } from "@/lib/errorMessage";

const EMPTY_FORM: HeroBannerInsert = {
  title: "",
  subtitle: "",
  description: "",
  image_url: "",
  bg_color: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)",
  badge_text: "",
  cta_text: "Explore Now",
  cta_link: "/courses",
  position: 0,
  is_active: true,
};

export default function HeroBannerManager() {
  const { data: banners = [], isLoading } = useAllHeroBanners();
  const confirmAction = useConfirm();
  const createBanner = useCreateBanner();
  const updateBanner = useUpdateBanner();
  const deleteBanner = useDeleteBanner();
  const reorderBanners = useReorderBanners();

  const [form, setForm] = useState<HeroBannerInsert>(EMPTY_FORM);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<HeroBanner>>({});
  const [uploading, setUploading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = banners.findIndex((b) => b.id === active.id);
      const newIndex = banners.findIndex((b) => b.id === over.id);
      const reordered = arrayMove(banners, oldIndex, newIndex);

      const updates = reordered.map((b, i) => ({ id: b.id, position: i }));
      reorderBanners.mutate(updates);
    },
    [banners, reorderBanners]
  );

  const handleImageUpload = async (
    file: File,
    onDone: (url: string) => void
  ) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `hero-banners/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("content")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      // Bucket is now private (audit H-1) — store a storage:// URI and let
      // resolveContentUrl sign on demand.
      onDone(`storage://content/${path}`);

      toast.success("Image uploaded!");
    } catch (e: unknown) {
      toast.error("Upload failed: " + getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const handleAdd = () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    createBanner.mutate(
      { ...form, position: banners.length },
      { onSuccess: () => { setForm(EMPTY_FORM); setShowAddForm(false); } }
    );
  };

  const handleSaveEdit = () => {
    if (!editingId || !editForm.title?.trim()) {
      toast.error("Title is required");
      return;
    }
    updateBanner.mutate(
      { id: editingId, ...editForm },
      { onSuccess: () => { setEditingId(null); setEditForm({}); } }
    );
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ title: "Delete this banner?", variant: "destructive" }))) return;
    deleteBanner.mutate(id);
  };

  const startEdit = (banner: HeroBanner) => {
    setEditingId(banner.id);
    setEditForm({ ...banner });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Hero Banner Manager</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage dashboard carousel banners. Drag to reorder.
          </p>
        </div>
        <Button onClick={() => setShowAddForm((v) => !v)} size="sm" className="gap-2">
          {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAddForm ? "Cancel" : "Add Banner"}
        </Button>
      </div>

      {/* Add Banner Form */}
      {showAddForm && (
        <Card className="border-2 border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              New Banner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <BannerForm
              data={form}
              onChange={(f) => setForm((prev) => ({ ...prev, ...f }))}
              onImageUpload={(file) =>
                handleImageUpload(file, (url) =>
                  setForm((prev) => ({ ...prev, image_url: url }))
                )
              }
              uploading={uploading}
            />
            <div className="flex gap-2">
              <Button onClick={handleAdd} disabled={createBanner.isPending} className="gap-2">
                <Plus className="h-4 w-4" />
                {createBanner.isPending ? "Adding…" : "Add Banner"}
              </Button>
              <Button variant="ghost" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Preview */}
      {banners.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground font-medium flex items-center gap-2">
              <Eye className="h-4 w-4" /> Live Preview — First Active Banner
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BannerPreview banner={banners.find((b) => b.is_active) || banners[0]} />
          </CardContent>
        </Card>
      )}

      {/* Banner List */}
      {banners.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No banners yet</p>
          <p className="text-sm">Click "Add Banner" to create your first slide.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={banners.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {banners.map((banner) => (
                <SortableBannerRow
                  key={banner.id}
                  banner={banner}
                  isEditing={editingId === banner.id}
                  editForm={editForm}
                  onEditFormChange={setEditForm}
                  onStartEdit={() => startEdit(banner)}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={() => { setEditingId(null); setEditForm({}); }}
                  onDelete={() => handleDelete(banner.id)}
                  onToggleActive={() =>
                    updateBanner.mutate({ id: banner.id, is_active: !banner.is_active })
                  }
                  onImageUpload={(file) =>
                    handleImageUpload(file, (url) =>
                      setEditForm((prev) => ({ ...prev, image_url: url }))
                    )
                  }
                  uploading={uploading}
                  isSaving={updateBanner.isPending}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableBannerRow({
  banner,
  isEditing,
  editForm,
  onEditFormChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onToggleActive,
  onImageUpload,
  uploading,
  isSaving,
}: {
  banner: HeroBanner;
  isEditing: boolean;
  editForm: Partial<HeroBanner>;
  onEditFormChange: (f: Partial<HeroBanner>) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onImageUpload: (file: File) => void;
  uploading: boolean;
  isSaving: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: banner.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isGradient =
    banner.bg_color?.startsWith("linear-gradient") ||
    banner.bg_color?.startsWith("radial-gradient");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border bg-card transition-shadow",
        isDragging ? "shadow-xl z-50 opacity-90" : "shadow-sm"
      )}
    >
      {isEditing ? (
        <div className="p-4 space-y-4">
          <BannerForm
            data={editForm as HeroBannerInsert}
            onChange={(f) => onEditFormChange({ ...editForm, ...f })}
            onImageUpload={onImageUpload}
            uploading={uploading}
          />
          <div className="flex gap-2">
            <Button onClick={onSaveEdit} size="sm" disabled={isSaving} className="gap-2">
              <Check className="h-3 w-3" />
              {isSaving ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-3">
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            aria-label="Reorder banner (drag handle)"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0 touch-none"
          >

            <GripVertical className="h-5 w-5" />
          </button>

          {/* Color swatch / thumbnail */}
          <div
            className="w-12 h-10 rounded-lg flex-shrink-0 border overflow-hidden"
            style={
              isGradient
                ? { backgroundImage: banner.bg_color }
                : { backgroundColor: banner.bg_color }
            }
          >
            {banner.image_url && (
              <img
                src={banner.image_url}
                alt=""
                className="w-full h-full object-cover opacity-60"
              />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm text-foreground truncate">
                {banner.title}
              </span>
              {banner.badge_text && (
                <Badge variant="outline" className="text-xs shrink-0">
                  {banner.badge_text}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {banner.cta_text} → {banner.cta_link}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onToggleActive}
              title={banner.is_active ? "Disable" : "Enable"}
              aria-label={banner.is_active ? "Disable banner" : "Enable banner"}
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            >
              {banner.is_active ? (
                <Eye className="h-4 w-4 text-primary" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11"
              onClick={onStartEdit}
              aria-label="Edit banner"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Delete banner"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>

          </div>
        </div>
      )}
    </div>
  );
}

function BannerForm({
  data,
  onChange,
  onImageUpload,
  uploading,
}: {
  data: Partial<HeroBannerInsert>;
  onChange: (f: Partial<HeroBannerInsert>) => void;
  onImageUpload: (file: File) => void;
  uploading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Title *</Label>
          <Input
            value={data.title || ""}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="GET 40% OFF on All Batches!"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Subtitle</Label>
          <Input
            value={data.subtitle || ""}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            placeholder="Limited Time Offer"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Textarea
            value={data.description || ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Short description for the banner…"
            rows={2}
            className="mt-1 resize-none"
          />
        </div>
        <div>
          <Label className="text-xs">Badge Text</Label>
          <Input
            value={data.badge_text || ""}
            onChange={(e) => onChange({ badge_text: e.target.value })}
            placeholder="🎉 Special Offer"
            className="mt-1"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs">CTA Button Text</Label>
          <Input
            value={data.cta_text || ""}
            onChange={(e) => onChange({ cta_text: e.target.value })}
            placeholder="Enroll Now"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">CTA Link</Label>
          <Input
            value={data.cta_link || ""}
            onChange={(e) => onChange({ cta_link: e.target.value })}
            placeholder="/courses or https://..."
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Background (gradient or hex color)</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={data.bg_color || ""}
              onChange={(e) => onChange({ bg_color: e.target.value })}
              placeholder="linear-gradient(135deg, #f97316, #ea580c)"
              className="flex-1"
            />
            <div
              className="w-10 h-10 rounded-md border flex-shrink-0"
              style={
                data.bg_color?.startsWith("linear") || data.bg_color?.startsWith("radial")
                  ? { backgroundImage: data.bg_color }
                  : { backgroundColor: data.bg_color || "#1e40af" }
              }
            />
          </div>
          <div className="flex gap-1 mt-1 flex-wrap">
            {[
              "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
              "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)",
              "linear-gradient(135deg, #059669 0%, #047857 100%)",
              "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
              "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
            ].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onChange({ bg_color: g })}
            className="w-6 h-6 rounded border-2 border-background shadow hover:scale-110 transition-transform"
                style={{ backgroundImage: g }}
                title={g}
              />
            ))}
          </div>
        </div>
        <div>
          <Label className="text-xs">Banner Image</Label>
          <div className="flex gap-2 mt-1">
            <Input
              value={data.image_url || ""}
              onChange={(e) => onChange({ image_url: e.target.value })}
              placeholder="Paste image URL or upload"
              className="flex-1"
            />
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImageUpload(file);
                }}
              />
              <Button variant="outline" size="icon" asChild type="button" disabled={uploading}>
                <span>
                  <Upload className={cn("h-4 w-4", uploading && "animate-spin")} />
                </span>
              </Button>
            </label>
          </div>
          <UrlImportRow
            onImported={(uri) => onChange({ image_url: uri })}
          />
          {data.image_url && (
            <div className="mt-2 aspect-[12/5] w-full rounded-md overflow-hidden border bg-muted">
              <img
                src={data.image_url.startsWith("storage://") ? "" : data.image_url}
                alt="Preview"
                className="w-full h-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1">
          <Switch
            checked={data.is_active ?? true}
            onCheckedChange={(v) => onChange({ is_active: v })}
          />
          <Label className="text-xs">Active (visible to students)</Label>
        </div>
      </div>
    </div>
  );
}

function BannerPreview({ banner }: { banner: HeroBanner }) {
  const isGradient =
    banner.bg_color?.startsWith("linear-gradient") ||
    banner.bg_color?.startsWith("radial-gradient");

  return (
    <div
      className="relative w-full aspect-[12/5] rounded-xl overflow-hidden flex items-center ring-1 ring-white/10"
      style={
        isGradient
          ? { backgroundImage: banner.bg_color }
          : { backgroundColor: banner.bg_color }
      }
    >
      {banner.image_url && (
        <img
          src={banner.image_url}
          alt=""
          className="absolute right-0 bottom-0 h-full max-w-[35%] object-contain object-bottom opacity-80"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-black/20 to-transparent" />
      <div className="relative z-10 px-5 space-y-1">
        {banner.badge_text && (
          <span className="inline-block bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full border border-white/30">
            {banner.badge_text}
          </span>
        )}
        <h3 className="text-white font-extrabold text-base leading-tight line-clamp-1">
          {banner.title}
        </h3>
        {banner.subtitle && (
          <p className="text-white/90 text-xs">{banner.subtitle}</p>
        )}
        <button className="mt-1 inline-flex items-center bg-background text-foreground font-bold text-xs px-3 py-1.5 rounded-full shadow">
          {banner.cta_text}
        </button>
      </div>
    </div>
  );
}

function UrlImportRow({ onImported }: { onImported: (uri: string) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const handleImport = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const uri = await importBannerFromUrl(url);
      onImported(uri);
      setUrl("");
      toast.success("Image imported to CDN!");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Import failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex gap-2 mt-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://... (fetch & save to storage)"
        className="flex-1"
        disabled={busy}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleImport}
        disabled={busy || !url.trim()}
        className="gap-1.5"
      >
        <Upload className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
        {busy ? "Fetching…" : "Fetch & Save"}
      </Button>
    </div>
  );
}
