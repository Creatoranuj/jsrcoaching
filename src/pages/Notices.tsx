/**
 * Notices.tsx - Announcements and notices board with PDF upload support.
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "../components/ui/BackButton";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { useNotices } from "../hooks/useNotices";
import { useAuth } from "../contexts/AuthContext";
import EmptyState from "../components/common/EmptyState";
import ListCardSkeleton from "../components/ui/skeletons/ListCardSkeleton";
import { 
  Bell, Pin, Plus, Loader2, 
  Calendar, AlertCircle, Trash2, Upload
} from "lucide-react";

const Notices = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, isAdmin, isTeacher, isLoading: authLoading } = useAuth();
  const { notices, loading, createNotice, deleteNotice, uploadPdf } = useNotices();
  
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManage = isAdmin || isTeacher;

  const handleCreate = async () => {
    if (!title || !content) return;
    
    setCreating(true);
    let pdfUrl: string | null = null;

    if (pdfFile) {
      pdfUrl = await uploadPdf(pdfFile);
    }

    const success = await createNotice({ title, content, isPinned, pdfUrl });
    setCreating(false);
    
    if (success) {
      setShowCreate(false);
      setTitle("");
      setContent("");
      setIsPinned(false);
      setPdfFile(null);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);
  if (!authLoading && !isAuthenticated) return null;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <div className="bg-primary px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton tone="onPrimary" />
          <h1 className="text-lg font-semibold text-primary-foreground">Notices</h1>
        </div>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Notice
          </Button>
        )}
      </div>

      <main className="flex-1 p-4 space-y-4 pb-24 md:pb-6">
        {showCreate && canManage && (
          <Card className="border-primary/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-primary" /> Create Notice
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input placeholder="Notice Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Textarea placeholder="Notice content..." value={content} onChange={(e) => setContent(e.target.value)} rows={4} />
              
              {/* PDF Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Attach PDF (optional)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> {pdfFile ? "Change File" : "Upload PDF"}
                  </Button>
                  {pdfFile && (
                    <span className="text-sm text-muted-foreground truncate max-w-[200px]">{pdfFile.name}</span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="rounded border-border" />
                <span className="text-sm">Pin this notice</span>
              </label>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowCreate(false); setPdfFile(null); }} className="flex-1">Cancel</Button>
                <Button onClick={handleCreate} disabled={creating || !title || !content} className="flex-1">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <ListCardSkeleton rows={5} rowHeight={104} lines={2} label="Loading notices" />
        ) : notices.length === 0 ? (
          <EmptyState title="No notices yet" description="You'll see announcements from your teachers here." />
        ) : (
          <div className="space-y-3">
            {notices.map((notice) => (
              <Card key={notice.id} className={`transition-all ${notice.isPinned ? 'border-primary/30 bg-primary/5' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {notice.isPinned && <Pin className="h-4 w-4 text-primary" />}
                        <h3 className="font-semibold text-foreground">{notice.title}</h3>
                        {notice.targetRole && (
                          <Badge variant="outline" className="text-xs">{notice.targetRole}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notice.content}</p>
                      
                      
                      

                      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(notice.createdAt).toLocaleDateString()}
                        </span>
                        {notice.expiresAt && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <AlertCircle className="h-3 w-3" />
                            Expires: {new Date(notice.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="icon" onClick={() => deleteNotice(notice.id)} className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Notices;
