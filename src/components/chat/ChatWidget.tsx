import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { Markdown } from "../Markdown";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

import { cn } from "../../lib/utils";
import { X, ArrowUp, RotateCcw, ThumbsUp, ThumbsDown, Mic, MicOff, Paperclip, Lock, LogIn, Menu, Plus, Copy } from "lucide-react";
import { tapHaptic, selectionHaptic } from "@/lib/native/haptics";
// JSR COACHING brand mark — used as in-chat assistant avatar AND the FAB/header
// mark. Previously we shipped an NB monogram (sarthi-avatar / nb-fist-logo)
// which read as the wrong brand inside the JSR COACHING app.
import logoIcon from "../../assets/branding/jsr-mark.webp";
import fabLogo from "../../assets/branding/jsr-mark.webp";
import { logger } from "../../lib/logger";
import { friendlyAiError, isAiKeyFailure } from "../../lib/aiErrorMessage";
import { addBreadcrumb } from "../../lib/sentry";

/**
 * Chat failure classes that are *server configuration* faults (rotated
 * LOVABLE_API_KEY, credits exhausted, gateway rate limit). Every student on
 * the app hits them simultaneously, so one Sentry event per class per page
 * load is plenty — thousands of identical "[ChatWidget] chatbot call failed"
 * events (SAFAR-ENGLISH-APP-19) hid the real signal and burned quota.
 */
const CONFIG_FAILURE_CLASSES = new Set(["gateway_unauthorized", "credits_exhausted", "rate_limited"]);
const reportedChatFailureClasses = new Set<string>();

function classifyChatFailure(input: { code?: string; status?: number; message: string }): string {
  if (isAiKeyFailure(input)) return "gateway_unauthorized";
  const code = (input.code || "").toLowerCase();
  if (code) return code;
  if (input.status === 402) return "credits_exhausted";
  if (input.status === 429) return "rate_limited";
  if (input.status === 401) return "session_expired";
  if (input.status === 504 || /timeout|aborted/i.test(input.message)) return "gateway_timeout";
  if (/failed to send a request|functionsfetcherror/i.test(input.message)) return "blocked";
  if (/failed to fetch|networkerror|load failed/i.test(input.message)) return "offline";
  if (input.status && input.status >= 500) return "server_error";
  return "unknown";
}

/**
 * One canonical report per failure class. Config faults are reported once
 * per session; user-side conditions (session expired / offline) are only
 * breadcrumbs; everything else reports normally with a stable title.
 */
function reportChatFailure(err: unknown, input: { raw: string; status?: number; code?: string }) {
  const cls = classifyChatFailure({ code: input.code, status: input.status, message: input.raw });
  const ctx = { surface: "ChatWidget", failureClass: cls, status: input.status, code: input.code, raw: input.raw };
  if (cls === "session_expired" || cls === "offline") {
    addBreadcrumb("chat", `chatbot ${cls}`, ctx);
    return;
  }
  if (CONFIG_FAILURE_CLASSES.has(cls)) {
    if (reportedChatFailureClasses.has(cls)) {
      addBreadcrumb("chat", `chatbot ${cls} (suppressed duplicate)`, ctx);
      return;
    }
    reportedChatFailureClasses.add(cls);
    logger.error(`[ChatWidget] chatbot ${cls} (server config)`, err, ctx);
    return;
  }
  logger.error(`[ChatWidget] chatbot ${cls}`, err, ctx);
}


interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  id: string;
  feedbackGiven?: "up" | "down" | null;
  queryType?: string;
  imageUrl?: string; // for image/doc preview in chat
  /** Set on error replies — the prompt to resend when the user taps "फिर try करें". */
  retryPrompt?: string;
}


const QUICK_PROMPTS = [
  "📚 Recommend me a lecture",
  "📝 Quiz me on Physics",
  "🎯 Show DPP for my chapter",
  "🔥 Mera next lesson kya hai?",
];

const WELCOME_MSG = "🙏 Namaste! Main **JSR AI Sahayak** hoon — JSR COACHING ka 24×7 learning companion.\n\nMain aapki madad kar sakta hoon:\n- 📚 **Lessons, PDFs aur practice**\n- 💡 **Concept aur subject doubts**\n- 📝 **Quizzes aur exam preparation**\n- 🖼️ **Photo doubt** — page upload kijiye\n\nAaj aap kya padhna chahenge?";

// Allowed image/doc types
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Web Speech API type declarations
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor;
    webkitSpeechRecognition: SpeechRecognitionConstructor;
  }
}

const MarkdownMessage = ({ content }: { content: string }) => (
  <Markdown
    components={{
      h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-2 text-foreground">{children}</h1>,
      h2: ({ children }) => <h2 className="text-sm font-bold mt-3 mb-1.5 text-foreground">{children}</h2>,
      h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1 text-foreground">{children}</h3>,
      p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
      ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
      li: ({ children }) => <li className="text-sm leading-relaxed pl-0.5">{children}</li>,
      strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
      a: ({ href, children }) => <a href={href} className="underline text-primary" target="_blank" rel="noopener noreferrer">{children}</a>,
      table: ({ children }) => (
        <div className="overflow-x-auto my-2 rounded-lg border border-border shadow-sm">
          <table className="text-xs w-full min-w-[280px] border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-primary/10 sticky top-0">{children}</thead>,
      th: ({ children }) => <th className="px-3 py-2 text-left font-semibold border-b border-border text-foreground whitespace-nowrap">{children}</th>,
      td: ({ children }) => <td className="px-3 py-2 border-b border-border/40 text-foreground">{children}</td>,
      tr: ({ children }) => <tr className="even:bg-muted/20 hover:bg-muted/40 transition-colors">{children}</tr>,
      blockquote: ({ children }) => <blockquote className="border-l-[3px] border-primary/50 pl-3 italic text-muted-foreground my-2 bg-muted/10 py-1 rounded-r">{children}</blockquote>,
      code: ({ children, className }) => {
        const isBlock = className?.includes('language-');
        if (isBlock) {
          return <code className="block bg-muted/80 p-3 rounded-lg text-xs font-mono overflow-x-auto my-2 border border-border/30">{children}</code>;
        }
        return <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>;
      },
      pre: ({ children }) => <pre className="overflow-x-auto my-2">{children}</pre>,
      hr: () => <hr className="my-3 border-border/50" />,
    }}
  >
    {content}
  </Markdown>
);

// Route allowlist lives in a separate tiny module so App.tsx can gate the
// FAB without statically pulling this whole file into the main bundle.
// Re-exported here for backwards compatibility with any other consumers.
export { isPathAllowed } from "./chatWidgetRoutes";
import { isPathAllowed } from "./chatWidgetRoutes";
import { FAB_Z, fabBottom } from "../../config/fabStack";

const ChatWidget = forwardRef<HTMLDivElement>(() => {
  const { user } = useAuth();
  const location = useLocation();

  // Prefix-match: nested routes under allowed sections show the FAB again
  // (matches earlier behavior before the exact-match regression).
  const isHiddenRoute = !isPathAllowed(location.pathname);
  const [isOpen, setIsOpen] = useState(false);
  const [showLoginTip, setShowLoginTip] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: WELCOME_MSG, timestamp: new Date(), id: "welcome", feedbackGiven: null },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const sessionStorageKey = `chat-session-${user?.id || "anon"}`;
  const [sessionId, setSessionId] = useState(() => {
    try {
      const existing = sessionStorage.getItem(sessionStorageKey);
      if (existing) return existing;
      const fresh = crypto.randomUUID();
      sessionStorage.setItem(sessionStorageKey, fresh);
      return fresh;
    } catch {
      return crypto.randomUUID();
    }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Image/doc upload state
  const [uploadedFile, setUploadedFile] = useState<{ file: File; previewUrl: string; type: "image" | "pdf" } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Check voice support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognition);
  }, []);

  // Hide BottomNav when chat is open on mobile + Android hardware-back sentinel.
  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove('chat-fullscreen-open');
      return;
    }
    document.body.classList.add('chat-fullscreen-open');
    try { window.history.pushState({ overlay: true }, ""); } catch {}
    const onPop = () => setIsOpen(false);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      document.body.classList.remove('chat-fullscreen-open');
      // Pop our sentinel if the user closed via the X button (not via back).
      if (window.history.state?.overlay) {
        try { window.history.back(); } catch {}
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // app-crash-shield: revoke any dangling preview blob URL on unmount so
  // closing the widget mid-attach (before send/remove) doesn't leak memory
  // across long sessions on low-RAM Android.
  useEffect(() => {
    return () => {
      if (uploadedFile?.previewUrl) {
        try { URL.revokeObjectURL(uploadedFile.previewUrl); } catch { /* noop */ }
      }
    };
    // Intentionally track only the URL string — re-runs when the preview changes.
  }, [uploadedFile?.previewUrl]);




  // Voice input handler
  const toggleVoice = () => {
    if (!voiceSupported) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.lang = "hi-IN"; // Hindi + English support
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join("");
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // File upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("❌ Only images (JPG, PNG, GIF, WebP) and PDF files allowed!");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      alert("❌ File size must be under 5MB!");
      return;
    }

    const isImage = file.type.startsWith("image/");
    const previewUrl = isImage ? URL.createObjectURL(file) : "";

    setUploadedFile({ file, previewUrl, type: isImage ? "image" : "pdf" });

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeUploadedFile = () => {
    if (uploadedFile?.previewUrl) URL.revokeObjectURL(uploadedFile.previewUrl);
    setUploadedFile(null);
  };

  // Upload file to Supabase storage and get URL
  const uploadFileToStorage = async (file: File): Promise<string | null> => {
    try {
      const ext = file.name.split(".").pop();
      const path = `chat-doubts/${user?.id || "anon"}/${Date.now()}.${ext}`;

      const { supabase } = await import("../../integrations/supabase/client");
      const { data, error } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error || !data?.path) throw error || new Error("Upload failed");

      const { data: signed, error: signError } = await supabase.storage
        .from("chat-attachments")
        .createSignedUrl(data.path, 60 * 60 * 24 * 365);

      if (signError || !signed?.signedUrl) throw signError || new Error("Signed URL failed");

      return signed.signedUrl;
    } catch (err) {
      logger.error("ChatWidget upload error", err);
      return null;
    }
  };


  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if ((!msg && !uploadedFile) || isLoading) return;
    setInput("");

    let filePublicUrl: string | null = null;
    let fileType: "image" | "pdf" | null = null;
    const fileToSend = uploadedFile;
    setUploadedFile(null);

    if (fileToSend) {
      setIsUploading(true);
      filePublicUrl = await uploadFileToStorage(fileToSend.file);
      fileType = fileToSend.type;
      setIsUploading(false);
      if (fileToSend.previewUrl) URL.revokeObjectURL(fileToSend.previewUrl);
    }

    const displayMsg = msg || (fileType === "image" ? "🖼️ [Image doubt]" : "📄 [Document]");
    const userMsgId = crypto.randomUUID();
    const userMsg: Message = {
      role: "user",
      content: displayMsg,
      timestamp: new Date(),
      id: userMsgId,
      imageUrl: fileType === "image" && filePublicUrl ? filePublicUrl : undefined,
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));

      // Build message with image context if file uploaded
      let fullMsg = msg;
      if (filePublicUrl && fileType === "image") {
        fullMsg = `${msg ? msg + "\n\n" : ""}[Student ne ek image/doubt upload ki hai: ${filePublicUrl}]\nIs image mein jo bhi question ya concept hai usse explain karein step by step.`;
      } else if (filePublicUrl && fileType === "pdf") {
        fullMsg = `${msg ? msg + "\n\n" : ""}[Student ne ek PDF document upload kiya hai: ${filePublicUrl}]\nIs document ke baare mein help karein.`;
      }

      const { supabase } = await import("../../integrations/supabase/client");
      const invoke = () => supabase.functions.invoke("chatbot", {
        body: { message: fullMsg, history, sessionId },
      });
      let { data, error } = await invoke();

      // Retry only transient server/network failures. The backend also retries
      // upstream 429/5xx responses, so this protects the browser-to-function
      // hop without creating an unbounded request loop.
      for (let attempt = 0; error && attempt < 2; attempt += 1) {
        const status = (error as { context?: { status?: number } }).context?.status;
        if (status !== undefined && status !== 429 && status < 500) break;
        await new Promise((resolve) => setTimeout(resolve, 900 * 2 ** attempt));
        ({ data, error } = await invoke());
      }
      if (error) {
        // supabase.functions.invoke only exposes the HTTP status/body on
        // FunctionsHttpError. Without reading it, every server-side failure
        // (429 / 402 / gateway 403) collapsed into the generic "Failed to
        // send a request to the Edge Function" string and the user always saw
        // the same "Connection problem" toast.
        const { FunctionsHttpError } = await import("@supabase/functions-js");
        if (error instanceof FunctionsHttpError) {
          let serverMsg: string | undefined;
          let serverReply: string | undefined;
          let serverCode: string | undefined;
          try {
            const j = (await error.context?.json?.()) as
              | { error?: string; code?: string; response?: string }
              | undefined;
            serverCode = j?.code;
            serverMsg = j?.error || j?.code;
            serverReply = j?.response;
          } catch { /* body wasn't JSON */ }
          const httpErr = new Error(serverMsg || error.message || "Chatbot request failed");
          (httpErr as { status?: number }).status = error.context?.status;
          (httpErr as { code?: string }).code = serverCode;
          // The function already writes a precise, localised message for the
          // student ("credits khatam", "AI slow ho gaya"…). Prefer it over the
          // generic client-side copy so the user sees the real reason.
          (httpErr as { userMessage?: string }).userMessage = serverReply;
          throw httpErr;
        }
        throw new Error(error.message || "Chatbot request failed");
      }

      if (data?.error) throw new Error(data.error);
      const botReply = data?.response || "माफ़ कीजिए, जवाब नहीं बन पाया। कृपया फिर try करें। 🙏";

      setMessages(prev => [...prev, {
        role: "assistant",
        content: botReply,
        timestamp: new Date(),
        id: crypto.randomUUID(),
        feedbackGiven: null,
        queryType: data?.queryType,
      }]);
    } catch (err) {
      const raw = (err as { message?: string })?.message || "";
      const status =
        (err as { status?: number })?.status ??
        (err as { context?: { status?: number } })?.context?.status;
      const code = (err as { code?: string })?.code;
      reportChatFailure(err, { raw, status, code });
      // Classify on code → status only. Substring-matching the message used to
      // report every "gateway_timeout" as a server key problem.
      let friendly = friendlyAiError({ code, status, message: raw });
      const serverReply = (err as { userMessage?: string })?.userMessage;
      if (serverReply && serverReply.trim()) friendly = serverReply;


      setMessages(prev => [...prev, {
        role: "assistant",
        content: friendly,
        timestamp: new Date(),
        id: crypto.randomUUID(),
        feedbackGiven: null,
        retryPrompt: msg || undefined,
      }]);

    } finally {
      setIsLoading(false);
    }
  };

  const handleFeedback = useCallback(async (msgId: string, rating: "up" | "down") => {
    const msg = messages.find(m => m.id === msgId);
    if (!msg || msg.feedbackGiven) return;

    const msgIndex = messages.findIndex(m => m.id === msgId);
    const userMsg = msgIndex > 0 ? messages[msgIndex - 1] : null;

    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedbackGiven: rating } : m));

    try {
      const { supabase } = await import("../../integrations/supabase/client");
      const { error } = await supabase.functions.invoke("chatbot", {
        body: {
          message: "_feedback_",
          feedback: {
            messageContent: userMsg?.content || "",
            responseContent: msg.content,
            rating,
          },
          userId: user?.id,
          sessionId,
        },
      });
      if (error) throw error;
    } catch (err) {
      // AUDIT 2026-08-03 [M3]: feedback failures stay non-blocking for the
      // user (the thumb stays lit), but must not vanish — without a log we
      // cannot tell "nobody rates answers" from "every rating 500s".
      logger.error("chatbot feedback submit failed", err);
    }
  }, [messages, user, sessionId]);

  // Hide on video/lesson pages to avoid obstructing the player
  if (isHiddenRoute) return null;

  const resetChat = () => {
    removeUploadedFile();
    try {
      const fresh = crypto.randomUUID();
      sessionStorage.setItem(sessionStorageKey, fresh);
      setSessionId(fresh);
    } catch { /* noop */ }
    setMessages([{
      role: "assistant",
      content: "👋 Hello! I'm **JSR COACHING Agent** – let's start a fresh conversation. How can I help you today? 🤖🎓",
      timestamp: new Date(),
      id: "welcome-reset",
      feedbackGiven: null,
    }]);
  };

  // ─── LOGIN GATE: unauthenticated users see a locked button ───
  if (!user) {
    return (
      <div
        data-chat-widget="true"
        style={{ bottom: fabBottom("base"), zIndex: FAB_Z }}
        className="fixed right-4 md:!bottom-6 md:right-6 flex flex-col items-end gap-2"
      >
        {/* Login tooltip */}
        {showLoginTip && (
          <div
            className={cn(
              "bg-card border border-border rounded-2xl shadow-xl px-4 py-4 text-right",
              "max-w-[230px] animate-in slide-in-from-bottom-3 fade-in duration-200"
            )}
          >
            {/* Header row */}
            <div className="flex items-center justify-end gap-2 mb-2">
              <p className="font-semibold text-sm text-foreground">JSR COACHING Agent 🤖</p>
              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <img src={logoIcon} className="w-3.5 h-3.5 object-contain" alt="" />
              </div>
            </div>
            {/* Body */}
            <p className="text-muted-foreground text-xs leading-relaxed mb-3">
              <strong className="text-foreground">Login</strong> to chat with your 24×7 English learning agent.
            </p>
            {/* CTA */}
            <Link
              to="/login"
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-semibold",
                "bg-primary text-primary-foreground px-3 py-1.5 rounded-full",
                "hover:opacity-90 transition-opacity"
              )}
            >
              <LogIn className="h-3 w-3" />
              Login →
            </Link>
          </div>
        )}

        {/* Locked floating button */}
        <button
          onClick={() => setShowLoginTip(prev => !prev)}
          className={cn(
            "w-14 h-14 rounded-full shadow-md flex items-center justify-center",
            "bg-white dark:bg-card border border-border/50 transition-all duration-200",
            "hover:shadow-lg relative",
            showLoginTip && "shadow-lg ring-1 ring-border"
          )}
          aria-label="Login to chat with JSR COACHING Agent"
        >
          <img src={fabLogo} className="w-9 h-9 object-contain" alt="JSR COACHING Agent" />
          {/* Lock badge */}
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-card rounded-full border-2 border-border flex items-center justify-center shadow-sm">
            <Lock className="h-2.5 w-2.5 text-muted-foreground" />
          </span>
        </button>
      </div>
    );
  }

  return (
    <div data-chat-widget="true" className="contents">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        style={{ bottom: fabBottom("base"), zIndex: FAB_Z }}
        className={cn(
          "fixed right-4 md:!bottom-6 md:right-6",
          "w-14 h-14 flex items-center justify-center bg-transparent transition-transform duration-200 active:scale-95",
          isOpen && "scale-0 opacity-0 pointer-events-none"
        )}
        aria-label="Open JSR COACHING Agent"
      >
        <img src={fabLogo} className="w-14 h-14 object-contain drop-shadow-md" alt="JSR COACHING Agent" />
      </button>

      {/* Full-page chat overlay */}
      {isOpen && (
        <div className={cn(
          "fixed inset-0 z-50",
          "bg-background flex flex-col",
          "animate-in fade-in duration-200",
          "md:left-auto md:w-[640px] lg:w-[780px] md:shadow-2xl md:border-l md:border md:rounded-l-2xl"
        )}>
          {/* Header — Lovable-style minimal shell: menu · model pill · reset */}
          <div className="safe-area-top bg-background shrink-0">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full border border-border/60 text-foreground/80 hover:bg-muted/60"
                onClick={() => setIsOpen(false)}
                aria-label="Close chat"
                title="Close"
              >
                <Menu className="h-4 w-4" />
              </Button>

              <div
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 h-9 text-sm font-medium text-foreground"
                aria-label="JSR Agent"
              >
                <img src={fabLogo} alt="" className="h-4 w-4 rounded-full object-contain" />
                <span className="truncate max-w-[140px]">JSR Agent</span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full border border-dashed border-border/60 text-foreground/80 hover:bg-muted/60"
                onClick={() => { void tapHaptic("medium"); resetChat(); }}
                aria-label="Reset chat"
                title="Reset chat"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>


          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 md:p-5" ref={scrollRef}>
            <div className="space-y-4 pb-2">
              {/* Date divider — target style */}
              {messages.length > 0 && (
                <div className="text-center text-xs text-muted-foreground/70 py-1">
                  Today at {messages[0].timestamp.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex gap-2.5", msg.role === "user" ? "justify-end" : "justify-start")}>
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <img src={logoIcon} className="w-5 h-5 object-contain" alt="Sarthi" />
                    </div>
                  )}
                  <div className="flex flex-col gap-1 max-w-[92%]">
                    {/* Image preview in user message */}
                    {msg.imageUrl && (
                      <div className="rounded-xl overflow-hidden border border-border">
                        <img
                          src={msg.imageUrl}
                          alt="Uploaded doubt"
                          className="max-w-full max-h-48 object-contain bg-muted"
                        />
                      </div>
                    )}
                    <div className={cn(
                      "text-sm leading-[1.75]",
                      msg.role === "user"
                        ? "rounded-2xl rounded-br-md px-4 py-2.5 bg-muted/60 text-foreground"
                        : "text-foreground"
                    )}>
                      {msg.role === "assistant" ? <MarkdownMessage content={msg.content} /> : msg.content}
                    </div>

                    {/* Per-message actions row (assistant only, BELOW content — natural reading flow) */}
                    {msg.role === "assistant" && msg.id !== "welcome" && msg.id !== "welcome-reset" && (
                      <div className="flex items-center gap-0.5 -ml-1 mt-1 text-muted-foreground/70">
                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, "up")}
                          disabled={!!msg.feedbackGiven}
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            msg.feedbackGiven === "up"
                              ? "text-primary bg-primary/15"
                              : "hover:bg-muted/60 hover:text-foreground"
                          )}
                          aria-label="Helpful"
                          title="Helpful"
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFeedback(msg.id, "down")}
                          disabled={!!msg.feedbackGiven}
                          className={cn(
                            "p-1.5 rounded-md transition-colors",
                            msg.feedbackGiven === "down"
                              ? "text-destructive bg-destructive/15"
                              : "hover:bg-muted/60 hover:text-foreground"
                          )}
                          aria-label="Not helpful"
                          title="Not helpful"
                        >
                          <ThumbsDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { try { navigator.clipboard?.writeText(msg.content); } catch { /* noop */ } }}
                          className="p-1.5 rounded-md hover:bg-muted/60 hover:text-foreground transition-colors"
                          aria-label="Copy"
                          title="Copy"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Timestamp (user only — assistant timestamps live in the date divider) */}
                    {msg.role === "user" && (
                      <span className="text-[10px] text-muted-foreground/60 px-1 text-right">
                        {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                    )}
                    {msg.retryPrompt && msg.role === "assistant" && (
                      <button
                        type="button"
                        onClick={() => sendMessage(msg.retryPrompt)}
                        disabled={isLoading}
                        className="self-start mt-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground disabled:opacity-50"
                      >
                        🔄 फिर try करें
                      </button>
                    )}
                    {msg.feedbackGiven && msg.role === "assistant" && (
                      <span className="text-xs text-muted-foreground pl-1">
                        {msg.feedbackGiven === "up" ? "शुक्रिया! 😊" : "समझ गया, बेहतर करेंगे 🙏"}
                      </span>
                    )}

                  </div>
                </div>
              ))}

              {/* Animated typing indicator */}
              {(isLoading || isUploading) && (
                <div className="flex gap-2.5 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <img src={logoIcon} className="w-5 h-5 object-contain" alt="Sarthi" />
                  </div>
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                    {isUploading ? (
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    ) : (
                      [0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 bg-primary/60 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick prompts — tightened dashed pills */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 shrink-0">
              <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
                {QUICK_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="shrink-0 whitespace-nowrap text-xs rounded-full px-3.5 h-8 border border-border/50 bg-background text-foreground/80 hover:bg-muted/40 transition-colors active:scale-[0.98]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}




          {/* File preview — floating badge (target: paperclip in black circle, top-right) */}
          {uploadedFile && (
            <div className="px-3 pb-1 shrink-0 flex justify-end">
              <div className="relative inline-flex items-center">
                {uploadedFile.type === "image" ? (
                  <img src={uploadedFile.previewUrl} alt="preview" className="w-14 h-14 rounded-xl object-cover border border-border" />
                ) : (
                  <div className="w-14 h-14 rounded-xl border border-border bg-card flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground px-1 text-center truncate max-w-full">{uploadedFile.file.name}</span>
                  </div>
                )}
                <div className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-foreground text-background flex items-center justify-center shadow">
                  <Paperclip className="h-3 w-3" />
                </div>
                <button
                  onClick={removeUploadedFile}
                  className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-background border border-border text-muted-foreground hover:text-destructive flex items-center justify-center shadow-sm"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}


          {/* Voice listening indicator */}
          {isListening && (
            <div className="px-4 pb-1 shrink-0">
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-full px-3 py-1.5">
                <span className="w-2 h-2 bg-destructive rounded-full animate-pulse" />
                <span className="text-xs text-destructive font-medium">सुन रहा हूँ... बोलिए 🎤</span>
              </div>
            </div>
          )}

          {/* Input area — Lovable two-cluster composer */}
          <div className="bg-background px-3 pt-2 shrink-0" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 12px)" }}>
            <div className="rounded-3xl border border-border/60 bg-card px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              {/* Row 1: textarea */}
              <Input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={isListening ? "बोल रहे हैं..." : "Ask AI Agent…"}
                className="h-9 w-full border-0 bg-transparent px-1 text-base sm:text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-foreground/40"
                disabled={isLoading}
              />

              {/* Row 2: control clusters */}
              <div className="mt-1 flex items-center justify-between gap-2">
                {/* Left cluster: + and ••• */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-full border border-border/60 text-foreground/70 hover:bg-muted/60 hover:text-foreground"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    title="Attach image or PDF"
                    aria-label="Attach file"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {/* Right cluster: mic · send */}
                <div className="flex items-center gap-1.5">
                  {voiceSupported && (
                    <Button
                      variant={isListening ? "destructive" : "ghost"}
                      size="icon"
                      className={cn(
                        "h-9 w-9 shrink-0 rounded-full border transition-all",
                        !isListening && "border-border/60 text-foreground/70 hover:bg-muted/60 hover:text-foreground",
                        isListening && "animate-pulse border-transparent"
                      )}
                      onClick={() => { void selectionHaptic(); toggleVoice(); }}
                      disabled={isLoading}
                      title={isListening ? "Stop voice" : "Voice input"}
                      aria-label={isListening ? "Stop voice" : "Start voice"}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  )}

                  <Button
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground active:scale-95 transition-transform duration-150"
                    onClick={() => { void tapHaptic("light"); sendMessage(); }}
                    disabled={(!input.trim() && !uploadedFile) || isLoading}
                    aria-label="Send message"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                </div>

              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

});

ChatWidget.displayName = "ChatWidget";

export default ChatWidget;
