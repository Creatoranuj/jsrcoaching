import { useState, useEffect, useRef } from "react";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { Textarea } from "../ui/textarea";
import { Send, HelpCircle, MessageCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface LiveMessage {
  id: string;
  session_id: string;
  user_id: string;
  user_name: string;
  message: string;
  type: string;
  is_answered: boolean;
  answer: string | null;
  created_at: string;
}

interface LiveChatProps {
  sessionId: string;
  isAdmin?: boolean;
  canModerate?: boolean;
  /** When used inside TeacherLiveView tabs, force a single tab to render */
  activeTab?: "chat" | "doubts";
}

const RATE_LIMIT_MS = 2000; // 2s between sends per user
const MAX_LEN = 300;

const LiveChat = ({ sessionId, isAdmin = false, canModerate = false, activeTab }: LiveChatProps) => {
  const { user, profile } = useAuth();
  const showModerate = isAdmin || canModerate;
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [doubtInput, setDoubtInput] = useState("");
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [sending, setSending] = useState(false);
  const lastSendRef = useRef<number>(0);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("live_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
      if (data) setMessages(data as LiveMessage[]);
    };

    fetchMessages();

    const channel = supabase
      .channel(`live-chat-${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_messages", filter: `session_id=eq.${sessionId}` },
        () => fetchMessages()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (type: "chat" | "doubt") => {
    if (!user || !profile) return;
    const raw = type === "chat" ? chatInput : doubtInput;
    const text = raw.trim().slice(0, MAX_LEN);
    if (!text) return;

    const now = Date.now();
    if (now - lastSendRef.current < RATE_LIMIT_MS) {
      toast.info("Thoda dhire — 2 second ruk ke bhejo.");
      return;
    }
    lastSendRef.current = now;

    // Optimistic UI
    const tempId = `temp-${now}`;
    const optimistic: LiveMessage = {
      id: tempId,
      session_id: sessionId,
      user_id: user.id,
      user_name: profile.fullName || profile.email || "Student",
      message: text,
      type,
      is_answered: false,
      answer: null,
      created_at: new Date().toISOString(),
    };
    setMessages((p) => [...p, optimistic]);
    if (type === "chat") setChatInput(""); else setDoubtInput("");

    setSending(true);
    const { error } = await supabase
      .from("live_messages")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        user_name: profile.fullName || profile.email || "Student",
        message: text,
        type,
      });

    if (error) {
      toast.error("Message send nahi hua");
      setMessages((p) => p.filter((m) => m.id !== tempId));
    }
    setSending(false);
  };

  const handleAnswerDoubt = async (doubtId: string) => {
    if (!answerText.trim()) return;
    const { error } = await supabase
      .from("live_messages")
      .update({ is_answered: true, answer: answerText.trim() })
      .eq("id", doubtId);

    if (error) toast.error("Failed to save answer");
    else {
      toast.success("Doubt answered!");
      setAnsweringId(null);
      setAnswerText("");
    }
  };

  const chatMessages = messages.filter((m) => m.type === "chat");
  const doubtMessages = messages.filter((m) => m.type === "doubt");
  const unansweredCount = doubtMessages.filter((d) => !d.is_answered).length;

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  const renderChatContent = () => (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-2">
          {chatMessages.length === 0 && (
            <p className="text-center text-muted-foreground text-xs py-6">No messages yet. Say hello! 👋</p>
          )}
          {chatMessages.map((msg) => {
            const isOwn = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                {!isOwn && <span className="text-[10px] text-muted-foreground mb-0.5 ml-1">{msg.user_name}</span>}
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                  {msg.message}
                </div>
                <span className="text-[10px] text-muted-foreground mt-0.5 mx-1">{formatTime(msg.created_at)}</span>
              </div>
            );
          })}
          <div ref={chatBottomRef} />
        </div>
      </ScrollArea>
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex items-center gap-1.5 rounded-2xl bg-background px-2 py-1.5 shadow-[0_0_0_1px_hsl(var(--border)),0_1px_1px_rgba(0,0,0,0.04)]">
          <Input
            placeholder="Type a message..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage("chat")}
            className="h-9 flex-1 border-0 bg-transparent px-2 text-base sm:text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-foreground/40"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
            onClick={() => sendMessage("chat")}
            disabled={sending || !chatInput.trim()}
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderDoubtsContent = () => (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-3">
          {doubtMessages.length === 0 && (
            <p className="text-center text-muted-foreground text-xs py-6">No doubts asked yet. Ask your first doubt! 🤔</p>
          )}
          {doubtMessages.map((doubt) => (
            <div key={doubt.id} className="bg-muted rounded-xl p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">{doubt.user_name}</span>
                    <span className="text-[10px] text-muted-foreground">{formatTime(doubt.created_at)}</span>
                    {doubt.is_answered ? (
                      <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] gap-0.5 h-4 px-1.5">
                        <CheckCircle2 className="h-3 w-3" /> Answered
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5">Pending</Badge>
                    )}
                  </div>
                  <p className="text-sm text-foreground">{doubt.message}</p>
                </div>
              </div>

              {doubt.is_answered && doubt.answer && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-2">
                  <p className="text-[10px] font-semibold text-primary mb-0.5">Teacher's Answer:</p>
                  <p className="text-xs text-foreground">{doubt.answer}</p>
                </div>
              )}

              {showModerate && !doubt.is_answered && (
                answeringId === doubt.id ? (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Type your answer..."
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      className="text-xs min-h-[60px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="text-xs h-7 flex-1" onClick={() => handleAnswerDoubt(doubt.id)}>Submit Answer</Button>
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => { setAnsweringId(null); setAnswerText(""); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setAnsweringId(doubt.id)}>
                    Answer this doubt
                  </Button>
                )
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-3 border-t border-border shrink-0">
        <div className="flex items-center gap-1.5 rounded-2xl bg-background px-2 py-1.5 shadow-[0_0_0_1px_hsl(var(--border)),0_1px_1px_rgba(0,0,0,0.04)]">
          <Input
            placeholder="Ask your doubt..."
            value={doubtInput}
            onChange={(e) => setDoubtInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage("doubt")}
            className="h-9 flex-1 border-0 bg-transparent px-2 text-base sm:text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-foreground/40"
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
            onClick={() => sendMessage("doubt")}
            disabled={sending || !doubtInput.trim()}
            aria-label="Send doubt"
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  // When activeTab is specified, render only that content (no tab switcher)
  if (activeTab === "chat") return renderChatContent();
  if (activeTab === "doubts") return renderDoubtsContent();

  return (
    <Tabs defaultValue="chat" className="flex flex-col h-full">
      <TabsList className="grid grid-cols-2 mx-3 mt-3 shrink-0">
        <TabsTrigger value="chat" className="gap-1 text-xs">
          <MessageCircle className="h-3.5 w-3.5" /> Chat
        </TabsTrigger>
        <TabsTrigger value="doubts" className="gap-1 text-xs">
          <HelpCircle className="h-3.5 w-3.5" /> Doubts
          {unansweredCount > 0 && (
            <Badge className="bg-destructive text-destructive-foreground text-[10px] h-4 px-1 ml-1">{unansweredCount}</Badge>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="chat" className="flex flex-col flex-1 mt-0 overflow-hidden">
        {renderChatContent()}
      </TabsContent>
      <TabsContent value="doubts" className="flex flex-col flex-1 mt-0 overflow-hidden">
        {renderDoubtsContent()}
      </TabsContent>
    </Tabs>
  );
};

export default LiveChat;
