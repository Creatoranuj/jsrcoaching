import { useState, useEffect } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, BookOpen, List, Loader2 } from "lucide-react";

interface SyllabusItem {
  id: string;
  courseId: number;
  title: string;
  description: string | null;
  weekNumber: number | null;
  topics: string[] | null;
  createdAt: string;
  courseTitle?: string;
  courseGrade?: string | null;
}

const SyllabusPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  
  const [syllabus, setSyllabus] = useState<SyllabusItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSyllabus = async () => {
      try {
        const { data, error } = await supabase
          .from("syllabus")
          .select("*, courses:course_id (title, grade)")
          .order("week_number", { ascending: true });

        if (error) throw error;

        const mapped: SyllabusItem[] = (data || []).map((s) => ({
          id: s.id,
          courseId: s.course_id,
          title: s.title,
          description: s.description,
          weekNumber: s.week_number,
          topics: s.topics,
          createdAt: s.created_at,
          courseTitle: s.courses?.title || "Unknown Course",
          courseGrade: s.courses?.grade,
        }));

        setSyllabus(mapped);
      } catch (err) {
        reportError(err, { surface: "Syllabus.fetch" });
      } finally {
        setLoading(false);
      }
    };

    fetchSyllabus();
  }, []);

  const groupedSyllabus = syllabus.reduce((acc, item) => {
    const courseTitle = item.courseTitle || 'Unknown Course';
    if (!acc[courseTitle]) acc[courseTitle] = [];
    acc[courseTitle].push(item);
    return acc;
  }, {} as Record<string, SyllabusItem[]>);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/login");
  }, [authLoading, isAuthenticated, navigate]);
  if (!authLoading && !isAuthenticated) return null;

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <div className="bg-primary px-4 py-4 flex items-center gap-3">
        <Button aria-label="Back to dashboard" variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-primary-foreground hover:bg-primary-foreground/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">Syllabus</h1>
      </div>

      <main className="flex-1 p-4 space-y-4">
        {loading ? (
          <div className="py-12 text-center flex flex-col items-center gap-2"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /><p className="text-xs text-muted-foreground">Loading syllabus…</p></div>
        ) : Object.keys(groupedSyllabus).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No syllabus available</p>
            </CardContent>
          </Card>
        ) : (
          Object.entries(groupedSyllabus).map(([courseTitle, items]) => (
            <Card key={courseTitle}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BookOpen className="h-5 w-5 text-primary" />
                  {courseTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {items.map((item) => (
                    <AccordionItem key={item.id} value={String(item.id)}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center gap-3 text-left">
                          {item.weekNumber && (
                            <Badge variant="outline" className="shrink-0">Week {item.weekNumber}</Badge>
                          )}
                          <span className="font-medium">{item.title}</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="pl-4 space-y-3">
                          {item.description && <p className="text-muted-foreground">{item.description}</p>}
                          {item.topics && item.topics.length > 0 && (
                            <div>
                              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <List className="h-4 w-4" /> Topics Covered
                              </h4>
                              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                {item.topics.map((topic, topicIndex) => (<li key={topicIndex}>{topic}</li>))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </div>
  );
};

export default SyllabusPage;
