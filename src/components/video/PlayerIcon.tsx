import { cn } from "@/lib/utils";
import { RotateCw, Settings } from "lucide-react";

type PlayerIconKind = "rotate" | "settings";

interface PlayerIconProps {
  kind: PlayerIconKind;
  className?: string;
  alt?: string;
}

const ICONS = {
  rotate: RotateCw,
  settings: Settings,
} as const;

/**
 * Video-player icons. Bundled lucide glyphs (previously CDN asset pointers,
 * which 404'd and rendered as broken images inside the APK).
 */
export const PlayerIcon = ({ kind, className, alt }: PlayerIconProps) => {
  const Icon = ICONS[kind];
  return (
    <Icon
      aria-label={alt ?? kind}
      className={cn("select-none pointer-events-none", className)}
    />
  );
};

export default PlayerIcon;
