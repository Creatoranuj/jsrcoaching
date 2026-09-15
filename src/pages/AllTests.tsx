import { useState, useEffect } from "react";
import { reportError } from "@/lib/sentry";
import { useNavigate } from "react-router-dom";
import { supabase } from "../integrations/supabase/client";
import { openResource } from "../lib/openResource";
import { useAuth } from "../contexts/AuthContext";
import { useBatch } from "../contexts/BatchContext";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { ArrowLeft, Search, ClipboardCheck, Filter, Clock } from "lucide-react";
import { cn } from "../lib/utils";
import BatchSelector from "../components/dashboard/BatchSelector";

interface TestLesson {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  courseId: number | null;
  category: string | null;
  createdAt: string | null;
  position: number | null;
  lectureType: string | null;
  quizId: string | null;
}

type CategoryTab = "all" | "mock" | "chapter" | "dpp" | "dpp-attempt" | "previous" | "practice";

const AllTests = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedBatch } = useBatch();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tests, setTests] = useState<TestLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryTab>("all");
  const [sortBy, setSortBy] = useState("recent");

  useEffect(() => {
    const fetchTests = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("lessons")
          .select("*")
          .in("lecture_type", ["TEST", "DPP", "DPP_ATTEMPT"])
          .order("created_at", { ascending: false });

        if (selectedBatch) {
          query = query.eq("course_id", selectedBatch.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        const lessonIds = (data || []).map((l) => l.id);

        // Fetch quizzes linked to these lessons
        let quizMap = new Map<string, string>();
        if (lessonIds.length > 0) {
          const { data: quizzes } = await supabase
            .from("quizzes")
            .select("id, lesson_id")
            .in("lesson_id", lessonIds)
            .eq("is_published", true);

          for (const q of (quizzes || [])) {
            if (q.lesson_id) quizMap.set(q.lesson_id, q.id);
          }
        }

        const allTests: TestLesson[] = (data || []).map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description,
          videoUrl: l.video_url,
          courseId: l.course_id,
          category: l.category || null,
          createdAt: l.created_at,
          position: l.position,
          lectureType: l.lecture_type || null,
          quizId: quizMap.get(l.id) || null,
        }));

        // Also fetch standalone published quizzes (no lesson) so quizzes
        // created directly in the Quiz Manager (especially "dpp-attempt"
        // type) show up in the right tab.
        let standaloneQuery = supabase
          .from("quizzes")
          .select("id, title, description, type, course_id, created_at, lesson_id")
          .eq("is_published", true)
          .is("lesson_id", null);
        if (selectedBatch) {
          standaloneQuery = standaloneQuery.eq("course_id", selectedBatch.id);
        }
        const { data: standaloneQuizzes } = await standaloneQuery;

        const standaloneTests: TestLesson[] = (standaloneQuizzes || []).map((q) => {
          const t = String(q.type || "").toLowerCase();
          const lectureType =
            t === "dpp-attempt" ? "DPP_ATTEMPT" :
            t === "dpp" ? "DPP" : "TEST";
          return {
            id: `quiz-${q.id}`,
            title: q.title,
            description: q.description,
            videoUrl: "",
            courseId: q.course_id,
            category: t,
            createdAt: q.created_at,
            position: 0,
            lectureType,
            quizId: q.id,
          };
        });

        setTests([...allTests, ...standaloneTests]);
      } catch (err) {
        reportError(err, { surface: "AllTests.fetch" });
      } finally {
        setLoading(false);
      }
    };

    fetchTests();
  }, [selectedBatch]);

  const filteredTests = tests
    .filter((t) => {
      if (searchQuery.trim()) {
        return t.title.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    })
    .filter((t) => {
      if (activeCategory === "all") return true;
      if (activeCategory === "dpp") return (t.lectureType || "").toUpperCase() === "DPP";
      if (activeCategory === "dpp-attempt") return (t.lectureType || "").toUpperCase() === "DPP_ATTEMPT";
      const cat = (t.category || "").toLowerCase();
      return cat.includes(activeCategory);
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.title.localeCompare(b.title);
      if (sortBy === "position") return (a.position || 0) - (b.position || 0);
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const categories: { id: CategoryTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "mock", label: "Mock Test" },
    { id: "chapter", label: "Chapter Test" },
    { id: "dpp", label: "DPP" },
    { id: "dpp-attempt", label: "DPP Attempt" },
    { id: "previous", label: "Previous Year" },
    { id: "practice", label: "Practice" },
  ];

  const handleTestClick = (test: TestLesson) => {
    if (test.quizId) {
      navigate(`/quiz/${test.quizId}`);
    } else if (test.videoUrl) {
      void openResource({ url: test.videoUrl });
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      <header className="bg-primary px-4 py-4 flex items-center gap-3">
        <Button
          variant="ghost" size="icon"
          onClick={() => navigate("/dashboard")}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">All Tests</h1>
      </header>

      <main className="flex-1 p-4 space-y-4">
        <BatchSelector />

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tests..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-32">
              <Filter className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="position">Sequence</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 snap-x snap-mandatory">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "shrink-0 snap-start px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No tests found</p>
            <p className="text-sm text-muted-foreground/60 mt-1">
              {selectedBatch ? "No tests in this batch yet." : "Select a batch to view tests."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTests.map((test) => (
              <div
                key={test.id}
                onClick={() => handleTestClick(test)}
                className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl shadow-sm cursor-pointer hover:shadow-md transition-all"
              >
                <div className="min-w-[48px] h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <ClipboardCheck className="h-6 w-6 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground line-clamp-1">{test.title}</h3>
                  {test.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{test.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {test.category && (
                      <Badge variant="secondary" className="text-[10px]">{test.category}</Badge>
                    )}
                    {test.quizId && (
                      <Badge variant="default" className="text-[10px]">Quiz Ready</Badge>
                    )}
                    {test.createdAt && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(test.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    )}
                  </div>
                </div>
                <Button size="sm" variant={test.quizId ? "default" : "outline"} className="shrink-0">
                  {test.quizId ? "Start Quiz" : "Open"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default AllTests;
