import { memo, useEffect, useState } from "react";
import { SmartImage } from "../common/SmartImage";

interface ProfileAvatarProps {
  avatarUrl?: string | null;
  fullName?: string | null;
  userId?: string;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
}

const sizeMap = {
  sm: "h-8 w-8 text-sm",
  md: "h-20 w-20 text-2xl",
  lg: "h-28 w-28 text-4xl",
};

// Generate consistent color from user ID
const getAvatarColor = (id?: string): string => {
  if (!id) return "hsl(var(--primary))";
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
};

const getInitials = (name?: string | null): string => {
  if (!name) return "U";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0][0].toUpperCase();
};

/**
 * Module-level cache of avatar URLs that have already loaded successfully
 * in this session. Used to skip the initials-flash on subsequent renders
 * (route change, list virtualization, re-mount) — the image is already in
 * the browser HTTP cache, so we can render it as "already loaded" instead
 * of fading in from the initials underlay every time.
 */
const loadedUrls = new Set<string>();

const ProfileAvatar = memo(({ avatarUrl, fullName, userId, size = "sm", onClick, className = "" }: ProfileAvatarProps) => {
  const sizeClass = sizeMap[size];
  const bgColor = getAvatarColor(userId);

  // Seed loaded=true when this URL was already fetched successfully earlier
  // in the session — kills the blink on route change / re-mount.
  const [loaded, setLoaded] = useState<boolean>(() => !!avatarUrl && loadedUrls.has(avatarUrl));

  // If the URL changes, reset loaded to whatever the cache says for the new URL.
  useEffect(() => {
    setLoaded(!!avatarUrl && loadedUrls.has(avatarUrl));
  }, [avatarUrl]);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-full overflow-hidden flex items-center justify-center font-bold border-2 border-background shadow-md select-none ${sizeClass} ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{
        backgroundColor: avatarUrl ? "transparent" : bgColor,
        // Contain paints so the layered image swap doesn't trigger a
        // full-parent repaint on Android WebView (the source of the flash).
        contain: "paint",
      }}
    >
      {/* Initials underlay — always mounted so a broken/loading avatar
          shows initials instead of alt-text bleed. Fades out only AFTER
          the image successfully paints, so we never blink between them. */}
      <span
        className="absolute inset-0 flex items-center justify-center text-white transition-opacity duration-150"
        style={{
          backgroundColor: bgColor,
          opacity: avatarUrl && loaded ? 0 : 1,
          willChange: "opacity",
        }}
        aria-hidden={avatarUrl && loaded ? "true" : undefined}
      >
        {getInitials(fullName)}
      </span>
      {avatarUrl ? (
        <SmartImage
          // Keying on the URL means React only remounts when the URL truly
          // changes, not on every parent re-render.
          key={avatarUrl}
          src={avatarUrl}
          alt=""
          width={size === "lg" ? 224 : size === "md" ? 160 : 64}
          height={size === "lg" ? 224 : size === "md" ? 160 : 64}
          className="relative w-full h-full object-cover"
          fallbackSrc="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="
          onLoad={() => {
            loadedUrls.add(avatarUrl);
            setLoaded(true);
          }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.opacity = "0";
            setLoaded(false);
          }}
        />
      ) : null}
    </div>
  );
});

ProfileAvatar.displayName = "ProfileAvatar";
export default ProfileAvatar;
