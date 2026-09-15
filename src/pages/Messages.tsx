/**
 * Messages.tsx - Private Chat Interface
 * Real-time messaging between teachers and students with file sharing.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { openResource } from "../lib/openResource";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ScrollArea } from "../components/ui/scroll-area";
import { List, type RowComponentProps } from "react-window";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import {
  ArrowLeft, Send, Paperclip, Loader2, MessageCircle,
  Image as ImageIcon, FileText, Link as LinkIcon, X
} from "lucide-react";
import { logger } from "../lib/logger";
import EmptyState from "../components/common/EmptyState";
import { getErrorMessage } from "@/lib/errorMessage";

interface ChatContact {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
}

interface ChatMessage {
  id: string;
  senderId: string;
  recipientId: string;
  content: string;
  attachmentUrl: string | null;
  attachmentType: string | null;
  isRead: boolean;
  createdAt: string;
}

const Messages = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const userId = user?.id;

  // State
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<ChatContact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guards setState-after-unmount across all async fetchers below.
  const aliveRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Fetch contacts from profiles_public + messages
  const fetchContacts = useCallback(async () => {
    if (!userId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;
    try {
      setLoadingContacts(true);
      
      // Get all messages for this user to find contacts
      const { data: msgData } = await supabase
        .from("messages")
        .select("sender_id, recipient_id, content, created_at, is_read")
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .abortSignal(signal);


      // Build contact map from messages
      const contactMap = new Map<string, { lastMessage: string; lastMessageAt: string; unread: number }>();
      
      (msgData || []).forEach((m) => {
        const contactId = m.sender_id === userId ? m.recipient_id : m.sender_id;
        if (!contactMap.has(contactId)) {
          contactMap.set(contactId, {
            lastMessage: m.content,
            lastMessageAt: m.created_at,
            unread: (!m.is_read && m.recipient_id === userId) ? 1 : 0,
          });
        } else if (!m.is_read && m.recipient_id === userId) {
          const existing = contactMap.get(contactId)!;
          existing.unread += 1;
        }
      });

      // Fetch profile info for all contacts
      const contactIds = Array.from(contactMap.keys());
      
      // Also fetch all profiles for new chat search. Uses the profiles_public
      // view (id, full_name, avatar_url only) — base profiles table SELECT is
      // owner+staff scoped since 2026-07-15 to prevent PII enumeration.
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, full_name, avatar_url")
        .abortSignal(signal);

      if (signal.aborted || !aliveRef.current) return;

      const contactList: ChatContact[] = (profiles || [])
        .filter((p) => p.id && p.id !== userId)
        .map((p) => {
          const meta = contactMap.get(p.id);
          return {
            id: p.id,
            fullName: p.full_name,
            avatarUrl: p.avatar_url,
            lastMessage: meta?.lastMessage,
            lastMessageAt: meta?.lastMessageAt,
            unreadCount: meta?.unread || 0,
          };
        })
        // Sort: contacts with messages first, then alphabetically
        .sort((a: ChatContact, b: ChatContact) => {
          if (a.lastMessageAt && !b.lastMessageAt) return -1;
          if (!a.lastMessageAt && b.lastMessageAt) return 1;
          if (a.lastMessageAt && b.lastMessageAt) {
            return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
          }
          return (a.fullName || "").localeCompare(b.fullName || "");
        });

      if (aliveRef.current && !signal.aborted) setContacts(contactList);
    } catch (err: unknown) {
      if (aliveRef.current && !signal.aborted) logger.error("Error fetching contacts", err);
    } finally {
      if (aliveRef.current && !signal.aborted) setLoadingContacts(false);
    }
  }, [userId]);


  // Fetch messages for selected contact
  const fetchMessages = useCallback(async (contactId: string) => {
    if (!userId) return;
    const controller = new AbortController();
    const signal = controller.signal;
    try {
      setLoadingMessages(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${userId},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${userId})`)
        .order("created_at", { ascending: true })
        .abortSignal(signal);

      if (error) throw error;

      if (!aliveRef.current || signal.aborted) return;

      setMessages((data || []).map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        recipientId: m.recipient_id,
        content: m.content,
        attachmentUrl: m.attachment_url,
        attachmentType: m.attachment_type,
        isRead: m.is_read,
        createdAt: m.created_at,
      })));

      // Mark unread messages as read
      await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("sender_id", contactId)
        .eq("recipient_id", userId)
        .eq("is_read", false);

    } catch (err: unknown) {
      if (aliveRef.current) logger.error("Error fetching messages", err);
    } finally {
      if (aliveRef.current) setLoadingMessages(false);
    }
  }, [userId]);

  // Send message
  const handleSend = async () => {
    if ((!newMessage.trim() && !attachmentFile) || !selectedContact || !userId) return;

    try {
      setSending(true);

      let attachmentUrl: string | null = null;
      let attachmentType: string | null = null;

      // Upload attachment if present
      if (attachmentFile) {
        const filePath = `${userId}/${Date.now()}_${attachmentFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("chat-attachments")
          .upload(filePath, attachmentFile);

        if (uploadError) throw uploadError;

        const { data: urlData, error: urlError } = await supabase.storage
          .from("chat-attachments")
          .createSignedUrl(filePath, 60 * 60 * 24 * 365);

        if (urlError) throw urlError;
        attachmentUrl = urlData.signedUrl;
        attachmentType = attachmentFile.type.startsWith("image/") ? "image" : "file";
      }


      const { error } = await supabase.from("messages").insert({
        sender_id: userId,
        recipient_id: selectedContact.id,
        subject: "Chat",
        content: newMessage.trim() || (attachmentFile ? `📎 ${attachmentFile.name}` : ""),
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
      });

      if (error) throw error;

      setNewMessage("");
      setAttachmentFile(null);
      await fetchMessages(selectedContact.id);
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // Realtime subscription
  useEffect(() => {
    if (!userId || !selectedContact) return;

    const channel = supabase
      .channel(`chat-${userId}-${selectedContact.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `recipient_id=eq.${userId}`,
      }, () => {
        fetchMessages(selectedContact.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, selectedContact, fetchMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initial load
  useEffect(() => {
    if (userId) fetchContacts();
  }, [userId, fetchContacts]);

  // When contact is selected
  useEffect(() => {
    if (selectedContact) fetchMessages(selectedContact.id);
  }, [selectedContact, fetchMessages]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);
  if (!authLoading && !isAuthenticated) return null;

  const filteredContacts = contacts.filter(c =>
    !searchQuery || (c.fullName || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  const isUrl = (text: string) => /https?:\/\/[^\s]+/.test(text);

  const renderContent = (content: string) => {
    // Replace URLs with clickable links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) =>
      urlRegex.test(part) ? (
        <a key={`${part}-${i}`} href={part} target="_blank" rel="noopener noreferrer" className="text-primary underline break-all">
          {part}
        </a>
      ) : (
        <span key={`t-${i}-${part.length}`}>{part}</span>
      )
    );
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString([], { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <main className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex-1 flex overflow-hidden" style={{ height: "calc(100dvh - 64px - 56px)" }} /* 56px = BottomNav h-14 on mobile */>
        {/* Contact List */}
        <div className={cn(
          "w-full sm:w-80 border-r border-border flex flex-col bg-card",
          selectedContact && "hidden sm:flex"
        )}>
          <div className="p-3 border-b border-border">
            <Input
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="flex-1 min-h-0">
            {loadingContacts ? (
              <div className="p-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              </div>
            ) : filteredContacts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No contacts found</p>
              </div>
            ) : (
              // perf-exam-ready Lane 3 #3: virtualize contacts list — a teacher
              // with 500+ students used to render all rows on mount, thrashing
              // scroll on low-end Android. react-window keeps ~15 rows mounted.
              <List
                rowCount={filteredContacts.length}
                rowHeight={68}
                rowComponent={ContactRow}
                rowProps={{
                  contacts: filteredContacts,
                  selectedId: selectedContact?.id ?? null,
                  onSelect: setSelectedContact,
                  getInitials,
                  formatTime,
                }}
                style={{ height: "100%" }}
                overscanCount={4}
              />
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={cn(
          "flex-1 flex flex-col",
          !selectedContact && "hidden sm:flex"
        )}>
          {selectedContact ? (
            <>
              {/* Chat Header */}
              <div className="p-3 border-b border-border flex items-center gap-3 bg-card">
                <Button aria-label="Back to contacts" variant="ghost" size="icon" className="sm:hidden" onClick={() => setSelectedContact(null)}>
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar className="h-9 w-9">
                  <AvatarImage src={selectedContact.avatarUrl || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">{getInitials(selectedContact.fullName)}</AvatarFallback>
                </Avatar>
                <h2 className="font-semibold text-foreground">{selectedContact.fullName || "Unknown"}</h2>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <EmptyState title="No messages yet" description="Start the conversation — say hi!" />
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => {
                      const isMine = msg.senderId === userId;
                      return (
                        <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                            isMine
                              ? "bg-primary text-primary-foreground rounded-br-md"
                              : "bg-muted text-foreground rounded-bl-md"
                          )}>
                            {/* Attachment */}
                            {msg.attachmentUrl && msg.attachmentType === "image" && (
                              <img
                                src={msg.attachmentUrl}
                                alt="Attachment"
                                className="rounded-lg mb-2 max-w-full max-h-48 object-cover cursor-pointer"
                                onClick={() => { void openResource({ url: msg.attachmentUrl!, kind: "image" }); }}
                              />
                            )}
                            {msg.attachmentUrl && msg.attachmentType === "file" && (
                              <button
                                type="button"
                                onClick={() => { void openResource({ url: msg.attachmentUrl! }); }}
                                className={cn("flex items-center gap-2 mb-2 underline text-left", isMine ? "text-primary-foreground" : "text-primary")}
                              >
                                <FileText className="h-4 w-4" />
                                View Attachment
                              </button>
                            )}
                            {/* Content */}
                            {msg.content && <p className="whitespace-pre-wrap break-words">{renderContent(msg.content)}</p>}
                            <p className={cn("text-[10px] mt-1", isMine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                              {formatTime(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Attachment preview */}
              {attachmentFile && (
                <div className="px-4 py-2 bg-muted/50 border-t border-border flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm truncate flex-1">{attachmentFile.name}</span>
                  <Button aria-label="Remove attachment" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAttachmentFile(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-border bg-card flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,.pdf,.doc,.docx,.xlsx,.csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 10 * 1024 * 1024) {
                        toast.error("File must be under 10MB");
                        return;
                      }
                      setAttachmentFile(f);
                    }
                    e.target.value = "";
                  }}
                />
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-5 w-5 text-muted-foreground" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  className="flex-1"
                />
                <Button size="icon" onClick={handleSend} disabled={sending || (!newMessage.trim() && !attachmentFile)}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-4 opacity-20" />
              <h3 className="text-lg font-semibold text-foreground mb-1">Private Chat</h3>
              <p>Select a contact to start messaging</p>
            </div>
          )}
        </div>
      </div>

    </main>

  );
};

type ContactRowProps = {
  contacts: ChatContact[];
  selectedId: string | null;
  onSelect: (c: ChatContact) => void;
  getInitials: (name: string | null) => string;
  formatTime: (iso: string) => string;
};

const ContactRow = ({
  index, style, contacts, selectedId, onSelect, getInitials, formatTime,
}: RowComponentProps<ContactRowProps>) => {
  const contact = contacts[index];
  if (!contact) return null;
  return (
    <button
      style={style}
      onClick={() => onSelect(contact)}
      className={cn(
        "w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border/50",
        selectedId === contact.id && "bg-muted"
      )}
    >
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage src={contact.avatarUrl || undefined} />
        <AvatarFallback className="bg-primary/10 text-primary text-sm">{getInitials(contact.fullName)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm truncate text-foreground">{contact.fullName || "Unknown"}</p>
          {contact.lastMessageAt && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {formatTime(contact.lastMessageAt)}
            </span>
          )}
        </div>
        {contact.lastMessage && (
          <p className="text-xs text-muted-foreground truncate">{contact.lastMessage}</p>
        )}
      </div>
      {(contact.unreadCount || 0) > 0 && (
        <span className="bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0">
          {contact.unreadCount}
        </span>
      )}
    </button>
  );
};

export default Messages;
