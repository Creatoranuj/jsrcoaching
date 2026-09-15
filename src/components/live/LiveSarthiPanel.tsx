import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Send, Bot, RotateCcw, Copy } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { getErrorMessage } from "@/lib/errorMessage";

interface Props {
  sessionId: string;
  sessionTitle: string;
  sessionDescription?: string | null;
  courseTitle?: string | null;
}

type Msg = { role: "user" | "assistant"; content: string; ts: number; error?: boolean };

const SUGGESTIONS = [
  "Is topic ka short summary do",
  "Ek easy example de do",
  "Exam me kaise puche jaate hain?",
];

const LiveSarthiPanel = ({ sessionId, sessionTitle, sessionDescription, courseTitle }: Props) => {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setInput("");
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const invoke = useCallback(async (text: string, history: Msg[]) => {
    const call = () => supabase.functions.invoke("resolve-doubt", {
        body: {
          message: text,
          history: history.map((m) => ({ role: m.role, content: m.content })),
          lesson: {
            title: sessionTitle,
            description: sessionDescription || undefined,
            course: courseTitle || "Live Class",
            chapter: "Live Session",
          },
        },
    });
    let { data, error } = await call();
    for (let attempt = 0; error && attempt < 2; attempt += 1) {
      const status = (error as { context?: { status?: number } })?.context?.status;
      if (status !== undefined && status !== 429 && status < 500) break;
      await new Promise((resolve) => setTimeout(resolve, 900 * 2 ** attempt));
      ({ data, error } = await call());
    }
    if (error) {
      const status = (error as any)?.context?.status;
      if (status === 429) throw new Error("Bahut requests — thodi der ruk ke try karo.");
      if (status === 402) throw new Error("AI credits khatam. Admin ko batayein.");
      throw new Error(error.message || "AI error");
    }
    const apiErr = (data as any)?.error;
    if (apiErr) throw new Error(apiErr);
    return (data as any)?.reply || "Answer nahi mila.";
  }, [sessionTitle, sessionDescription, courseTitle]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    const history = messages;
    setMessages((p) => [...p, { role: "user", content: text, ts: Date.now() }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await invoke(text, history);
      setMessages((p) => [...p, { role: "assistant", content: reply, ts: Date.now() }]);
    } catch (e: any) {
      const msg = e?.message || "AI could not answer";
      toast.error(msg);
      setMessages((p) => [...p, { role: "assistant", content: `_${msg}_`, ts: Date.now(), error: true }]);
    } finally {
      setBusy(false);
    }
  }, [input, busy, messages, invoke]);

  const regenerate = useCallback(async () => {
    if (busy) return;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx < 0) return;
    const last = messages[lastUserIdx];
    const trimmed = messages.slice(0, lastUserIdx + 1);
    const history = messages.slice(0, lastUserIdx);
    setMessages(trimmed);
    setBusy(true);
    try {
      const reply = await invoke(last.content, history);
      setMessages((p) => [...p, { role: "assistant", content: reply, ts: Date.now() }]);
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "AI error");
    } finally {
      setBusy(false);
    }
  }, [busy, messages, invoke]);

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copied"); }
    catch { toast.error("Copy fail"); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 bg-primary/5">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Sarthi AI • Live Doubt Solver</span>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {messages.length === 0 && (
            <div className="py-6 text-center space-y-3">
              <p className="text-xs text-muted-foreground">Live class ka doubt Sarthi se pucho — turant answer milega.</p>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-[11px] px-2 py-1 rounded-full border border-border bg-background hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
              {m.role === "user" ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm bg-primary text-primary-foreground">
                  {m.content}
                </div>
              ) : (
                <div className={`max-w-[90%] text-sm ${m.error ? "text-destructive" : "text-foreground"}`}>
                  <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => copyText(m.content)} className="p-1 rounded hover:bg-muted" aria-label="Copy">
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    </button>
                    {i === messages.length - 1 && (
                      <button onClick={regenerate} className="p-1 rounded hover:bg-muted" aria-label="Regenerate" disabled={busy}>
                        <RotateCcw className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="h-3 w-3 animate-pulse text-primary" />
              Sarthi soch raha hai...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-border shrink-0">
        <div className="flex items-center gap-1.5 rounded-2xl bg-background px-2 py-1.5 shadow-[0_0_0_1px_hsl(var(--border)),0_1px_1px_rgba(0,0,0,0.04)]">
          <Input
            placeholder="Sarthi se doubt pucho..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            className="h-9 flex-1 border-0 bg-transparent px-2 text-base sm:text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-foreground/40"
            disabled={busy}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
            onClick={() => send()}
            disabled={busy || !input.trim()}
            aria-label="Ask Sarthi"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LiveSarthiPanel;
