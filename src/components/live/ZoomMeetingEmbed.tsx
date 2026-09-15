import { useEffect, useRef, useState } from "react";
import { supabase } from "../../integrations/supabase/client";
import { Loader2, VideoOff, ExternalLink } from "lucide-react";
import { Button } from "../ui/button";
import { logger } from "../../lib/logger";

interface ZoomMeetingEmbedProps {
  meetingNumber: string;
  password: string;
  userName: string;
  userEmail?: string;
  role: 0 | 1; // 0 = participant, 1 = host
  onLeave?: () => void;
}

declare global {
  interface Window {
    ZoomMtg?: {
      setZoomJSLib: (path: string, dir: string) => void;
      preLoadWasm: () => void;
      prepareWebSDK: () => void;
      init: (opts: {
        leaveUrl: string;
        success?: () => void;
        error?: (e: unknown) => void;
      }) => void;
      join: (opts: {
        sdkKey: string;
        signature: string;
        meetingNumber: string;
        passWord: string;
        userName: string;
        userEmail: string;
        success?: () => void;
        error?: (e: unknown) => void;
      }) => void;
    };
  }
}

const ZoomMeetingEmbed = ({
  meetingNumber,
  password,
  userName,
  userEmail = "",
  role,
  onLeave,
}: ZoomMeetingEmbedProps) => {
  const [status, setStatus] = useState<"loading" | "ready" | "joined" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [signatureData, setSignatureData] = useState<{ signature: string; sdkKey: string } | null>(null);
  const zoomRootRef = useRef<HTMLDivElement>(null);
  const sdkLoaded = useRef(false);

  // Step 1: Fetch signature from edge function
  useEffect(() => {
    const fetchSignature = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("get-zoom-signature", {
          body: { meetingNumber, role },
        });
        if (error) throw new Error(error.message || "Failed to get signature");
        setSignatureData(data);
        setStatus("ready");
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to initialize Zoom");
        setStatus("error");
      }
    };

    fetchSignature();
  }, [meetingNumber, role]);

  // Step 2: Load Zoom Web SDK via CDN and join
  useEffect(() => {
    if (status !== "ready" || !signatureData || sdkLoaded.current) return;
    sdkLoaded.current = true;

    // Inject Zoom CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://source.zoom.us/3.1.2/css/bootstrap.css";
    document.head.appendChild(link);

    const link2 = document.createElement("link");
    link2.rel = "stylesheet";
    link2.href = "https://source.zoom.us/3.1.2/css/react-select.css";
    document.head.appendChild(link2);

    // Inject Zoom JS SDK
    const script = document.createElement("script");
    script.src = "https://source.zoom.us/zoom-meeting-3.1.2.min.js";
    script.onload = () => {
      const ZoomMtg = window.ZoomMtg;
      if (!ZoomMtg) {
        setErrorMsg("Zoom SDK failed to load");
        setStatus("error");
        return;
      }

      ZoomMtg.setZoomJSLib("https://source.zoom.us/3.1.2/lib", "/av");
      ZoomMtg.preLoadWasm();
      ZoomMtg.prepareWebSDK();

      ZoomMtg.init({
        leaveUrl: window.location.href,
        success: () => {
          ZoomMtg.join({
            sdkKey: signatureData.sdkKey,
            signature: signatureData.signature,
            meetingNumber,
            passWord: password,
            userName,
            userEmail,
            success: () => {
              setStatus("joined");
            },
            error: (e) => {
              logger.error("Zoom join error", e);
              setErrorMsg("Failed to join meeting. Check credentials.");
              setStatus("error");
            },
          });
        },
        error: (e) => {
          logger.error("Zoom init error", e);
          setErrorMsg("Failed to initialize Zoom SDK.");
          setStatus("error");
        },
      });
    };
    script.onerror = () => {
      setErrorMsg("Failed to load Zoom SDK script");
      setStatus("error");
    };
    document.body.appendChild(script);
  }, [status, signatureData, meetingNumber, password, userName, userEmail]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Connecting to Zoom...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <VideoOff className="h-10 w-10 text-destructive" />
        <p className="text-sm font-medium text-destructive">{errorMsg}</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Try joining directly via the Zoom link or refresh the page.
        </p>
        {onLeave && (
          <Button variant="outline" onClick={onLeave}>
            Go Back
          </Button>
        )}
      </div>
    );
  }

  if (status === "joined") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
        <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
        <p className="text-sm font-medium text-green-600">Zoom meeting active in the Zoom window</p>
        <p className="text-xs text-muted-foreground">The meeting is running. You can minimize this panel.</p>
        {onLeave && (
          <Button variant="outline" size="sm" onClick={onLeave}>
            Leave Session
          </Button>
        )}
      </div>
    );
  }

  // status === "ready" — SDK loading in progress
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">Loading Zoom SDK...</p>
      <div ref={zoomRootRef} id="zmmtg-root" />
    </div>
  );
};

export default ZoomMeetingEmbed;
