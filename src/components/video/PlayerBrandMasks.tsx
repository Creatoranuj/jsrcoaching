import birdLogo from "../../assets/branding/jsr-mark.webp";

interface PlayerBrandMasksProps {
  showInfinityLogo: boolean;
  showYoutubeMask: boolean;
  isLandscapeRotation: boolean;
  isFakeFullscreen: boolean;
}

export function PlayerBrandMasks({
  showInfinityLogo,
  showYoutubeMask,
  isLandscapeRotation,
  isFakeFullscreen,
}: PlayerBrandMasksProps) {
  const bharatBirdLogo = birdLogo;
  const shouldUseLandscapePortalMask = isLandscapeRotation || isFakeFullscreen;

  return (
    <>
      {showInfinityLogo && (
        <div
          className="absolute z-[52] pointer-events-none select-none flex items-center justify-center"
          style={{
            ...(shouldUseLandscapePortalMask
              ? {
                  width: "5.8%",
                  aspectRatio: "1 / 1",
                  left: "0.4%",
                  bottom: "1.6%",
                  transform: "translateY(-6px) translateX(18px) scale(0.85)",
                  transformOrigin: "center center",
                }
              : isFakeFullscreen
                ? { bottom: "22px", left: "52px" }
                : { bottom: "18px", left: "44px" }),
          }}
        >
          <img
            src={birdLogo}
            alt=""
            className="rounded-full"
            style={{
              ...(shouldUseLandscapePortalMask
                ? { width: "100%", height: "100%" }
                : { width: "34px", height: "34px" }),
              filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.85))",
            }}
            draggable={false}
          />
        </div>
      )}

      {showYoutubeMask && (
        <div
          className="absolute z-[35] select-none flex items-center"
          style={{
            right: 52,
            bottom: 24,
            height: "28px",
            paddingLeft: "6px",
            paddingRight: "10px",
            background: "rgba(30,30,30,0.97)",
            pointerEvents: "none",
            gap: "5px",
            borderRadius: "4px",
          }}
        >
          <img
            src={bharatBirdLogo}
            alt=""
            draggable={false}
            className="rounded-full"
            style={{
              height: "22px",
              width: "22px",
            }}
          />
          <span
            className="font-bold tracking-wider whitespace-nowrap uppercase"
            style={{
              fontSize: "11px",
              letterSpacing: "0.08em",
              color: "rgba(255,255,255,0.9)",
            }}
          >
            Bharat
          </span>
        </div>
      )}
    </>
  );
}
