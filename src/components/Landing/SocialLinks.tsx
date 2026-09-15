import { useMemo } from "react";
import { useSocialLinks } from "../../hooks/useSocialLinks";
import { Youtube } from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  youtube: Youtube,
};

export default function SocialLinks() {
  const { data: links, isLoading } = useSocialLinks();

  const visible = useMemo(
    () =>
      (links || []).filter(
        (l) => l.is_active && l.platform.toLowerCase() !== "telegram"
      ),
    [links]
  );

  if (isLoading || visible.length === 0) return null;

  return (
    <div className="flex items-center gap-3">
      {visible.map((link) => {
        const Icon = iconMap[link.platform.toLowerCase()] || Youtube;
        return (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.platform}
            className="h-9 w-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-secondary-foreground/70 hover:text-secondary-foreground hover:bg-white/10 transition-colors"
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
    </div>
  );
}
