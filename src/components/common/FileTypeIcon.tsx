import { cn } from "@/lib/utils";
import {
  FileText, FileSpreadsheet, Presentation, Image as ImageIcon,
  Video, Link as LinkIcon, FileType2, FileCode2,
} from "lucide-react";
import PdfIcon from "./PdfIcon";

interface Props {
  type?: string;
  /** Optional URL used to refine the icon when `type` is generic ("LINK", ""). */
  url?: string;
  className?: string;
}

function refineType(type: string, url?: string): string {
  const u = (url || "").toLowerCase();
  if (/\.(md|markdown)(\?|#|$)/.test(u)) return "MD";
  if (/\.(pdf)(\?|#|$)/.test(u)) return "PDF";
  if (/\.(doc|docx)(\?|#|$)/.test(u)) return "DOCX";
  if (/\.(xls|xlsx|csv)(\?|#|$)/.test(u)) return "XLSX";
  if (/\.(ppt|pptx)(\?|#|$)/.test(u)) return "PPTX";
  if (u.includes("docs.google.com/spreadsheets")) return "SHEET";
  if (u.includes("docs.google.com/presentation")) return "SLIDES";
  if (u.includes("docs.google.com/document")) return "DOC";
  if (/\.(jpg|jpeg|png|webp|gif|svg|heic)(\?|#|$)/.test(u)) return "IMAGE";
  if (/\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/.test(u)) return "VIDEO";
  if (type && type !== "LINK") return type;
  return type || "LINK";
}

export default function FileTypeIcon({ type, url, className }: Props) {
  const t = refineType((type || "").toUpperCase(), url);
  if (t === "PDF" || t === "NOTES" || t === "DPP") return <PdfIcon className={className} />;

  const map: Record<string, { Icon: typeof FileText; bg: string; fg: string }> = {
    DOC:  { Icon: FileText,        bg: "bg-blue-500/10",   fg: "text-blue-600 dark:text-blue-400" },
    DOCX: { Icon: FileText,        bg: "bg-blue-500/10",   fg: "text-blue-600 dark:text-blue-400" },
    XLSX: { Icon: FileSpreadsheet, bg: "bg-emerald-500/10",fg: "text-emerald-600 dark:text-emerald-400" },
    XLS:  { Icon: FileSpreadsheet, bg: "bg-emerald-500/10",fg: "text-emerald-600 dark:text-emerald-400" },
    SHEET:{ Icon: FileSpreadsheet, bg: "bg-emerald-500/10",fg: "text-emerald-600 dark:text-emerald-400" },
    PPT:  { Icon: Presentation,    bg: "bg-orange-500/10", fg: "text-orange-600 dark:text-orange-400" },
    PPTX: { Icon: Presentation,    bg: "bg-orange-500/10", fg: "text-orange-600 dark:text-orange-400" },
    SLIDES:{Icon: Presentation,    bg: "bg-orange-500/10", fg: "text-orange-600 dark:text-orange-400" },
    MD:   { Icon: FileCode2,       bg: "bg-slate-500/10",  fg: "text-slate-600 dark:text-slate-400" },
    IMAGE:{ Icon: ImageIcon,       bg: "bg-purple-500/10", fg: "text-purple-600 dark:text-purple-400" },
    VIDEO:{ Icon: Video,           bg: "bg-rose-500/10",   fg: "text-rose-600 dark:text-rose-400" },
    LINK: { Icon: LinkIcon,        bg: "bg-slate-500/10",  fg: "text-slate-600 dark:text-slate-400" },
  };
  const entry = map[t] || { Icon: FileType2, bg: "bg-muted", fg: "text-muted-foreground" };
  const { Icon, bg, fg } = entry;
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg", bg, className)}
      aria-hidden="true"
    >
      <Icon className={cn("h-1/2 w-1/2", fg)} />
    </span>
  );
}