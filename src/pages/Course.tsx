import { useEffect, useState, memo, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { resolveCourseRoot, resolveFromParam } from '../config/backNavigation';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Breadcrumbs } from '../components/course/Breadcrumbs';
import { Video, Lock, Play, Clock, FileText, BookOpen, ClipboardCheck, BadgeCheck } from 'lucide-react';
import { formatGrade } from "../lib/formatGrade";

interface Course {
  id: number;
  title: string;
  description: string | null;
  grade: string | null;
  teacher_name?: string | null;
  teacher_title?: string | null;
  teacher_bio?: string | null;
  teacher_avatar_url?: string | null;
  teacher_verified?: boolean | null;
}

interface Lesson {
  id: string;
  title: string;
  videoUrl: string;
  description: string | null;
  isLocked: boolean | null;
  createdAt: string | null;
  lectureType: string | null;
  position: number | null;
}

type TabFilter = "all" | "lectures" | "notes" | "tests";

const LessonCard = memo(({ lesson, index, onWatch }: { lesson: Lesson; index: number; onWatch: (l: Lesson) => void }) => {
  const extractYouTubeId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const type = lesson.lectureType || "VIDEO";
  const isVideo = type === "VIDEO";

  const getIcon = () => {
    switch (type) {
      case "VIDEO": return <Video className="h-5 w-5 text-primary" />;
      case "PDF": case "NOTES": return <FileText className="h-5 w-5 text-purple-500" />;
      case "DPP": return <BookOpen className="h-5 w-5 text-orange-500" />;
      case "TEST": return <ClipboardCheck className="h-5 w-5 text-red-500" />;
      default: return <FileText className="h-5 w-5" />;
    }
  };

  const getLabel = () => {
    switch (type) {
      case "VIDEO": return "Lecture";
      case "PDF": return "PDF";
      case "NOTES": return "Notes";
      case "DPP": return "DPP";
      case "TEST": return "Test";
      default: return type;
    }
  };

  return (
    <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => onWatch(lesson)}>
      <CardHeader className="p-0">
        <div className="aspect-video bg-muted rounded-t-lg relative overflow-hidden">
          {isVideo && extractYouTubeId(lesson.videoUrl) && (
            <img
              src={`https://img.youtube.com/vi/${extractYouTubeId(lesson.videoUrl)}/mqdefault.jpg`}
              alt={lesson.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          {!isVideo && (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              {getIcon()}
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            {lesson.isLocked ? (
              <Lock className="h-12 w-12 text-white" />
            ) : (
              <Play className="h-12 w-12 text-white" />
            )}
          </div>
          <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded flex items-center gap-1">
            {getIcon()}
            {getLabel()} {index + 1}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <CardTitle className="text-base line-clamp-1">{lesson.title}</CardTitle>
        {lesson.description && (
          <CardDescription className="line-clamp-2 mt-1">
            {lesson.description}
          </CardDescription>
        )}
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          {lesson.createdAt
            ? new Date(lesson.createdAt).toLocaleDateString()
            : 'Recently added'}
        </div>
      </CardContent>
    </Card>
  );
});

LessonCard.displayName = "LessonCard";

const CoursePage = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromParam = resolveFromParam(searchParams, id);
  
  const [activeTab, setActiveTab] = useState<TabFilter>("all");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  // React-Query: course + lessons fetched in parallel, cached, deduped.
  // Replaces manual useEffect+useState chain (P1 from senior-architect-audit).
  const courseQuery = useQuery({
    queryKey: ['course', id],
    enabled: !!id && !!user,
    staleTime: 5 * 60 * 1000, // 5 min — course meta rarely changes
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('id, title, description, grade, teacher_name, teacher_title, teacher_bio, teacher_avatar_url, teacher_verified')
        .eq('id', Number(id))
        .single();
      if (error) throw error;
      return data as Course;
    },
  });

  const lessonsQuery = useQuery({
    queryKey: ['course-lessons', id],
    enabled: !!id && !!user,
    // Short stale window + always refetch on mount so an admin reorder shows up
    // on the student's next screen open instead of minutes later.
    staleTime: 30 * 1000,
    refetchOnMount: 'always',
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lessons')
        .select('*')
        .eq('course_id', Number(id))
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []).map((l) => ({
        id: l.id,
        title: l.title,
        videoUrl: l.video_url,
        description: l.description,
        isLocked: l.is_locked,
        createdAt: l.created_at,
        lectureType: l.lecture_type || 'VIDEO',
        position: l.position,
      })) as Lesson[];
    },
  });

  const course = courseQuery.data ?? null;
  const lessons = lessonsQuery.data ?? [];
  const loading = courseQuery.isLoading || lessonsQuery.isLoading;

  const filteredLessons = useMemo(() => lessons.filter(l => {
    const type = l.lectureType || "VIDEO";
    if (activeTab === "all") return true;
    if (activeTab === "lectures") return type === "VIDEO";
    if (activeTab === "notes") return type === "NOTES" || type === "PDF" || type === "DPP";
    if (activeTab === "tests") return type === "TEST";
    return true;
  }), [lessons, activeTab]);

  const handleWatch = (lesson: Lesson) => {
    const fromQS = fromParam ? `&from=${fromParam}` : '&from=courses';
    navigate(`/classes/${id}/lessons?lessonId=${lesson.id}${fromQS}`);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-dvh bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-96 mb-8" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!course && courseQuery.isSuccess) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Card className="text-center p-8">
          <p className="text-muted-foreground mb-4">Course not found</p>
          <Button onClick={() => navigate('/dashboard')}>Go Back</Button>
        </Card>
      </div>
    );
  }

  if (!course) {
    // Query still in-flight (refetch after cache-hit) — hold on skeleton
    // instead of blinking the empty state.
    return (
      <div className="min-h-dvh bg-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-96 mb-8" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const root = resolveCourseRoot(fromParam ?? 'courses');
  const breadcrumbSegments = [
    { label: "Dashboard", href: "/dashboard" },
    { label: root.label, href: root.href },
    { label: course.title },
  ];

  return (
    <div className="min-h-dvh bg-background">
      {/* Breadcrumbs hidden on mobile per design; visible md+ */}
      <div className="hidden md:block sticky top-0 z-20" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        <Breadcrumbs segments={breadcrumbSegments} />
      </div>




      <header className="bg-card border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold">{course.title}</h1>
          {course.grade && (
            <p className="text-muted-foreground">{formatGrade(course.grade, "Grade")}</p>
          )}
          {course.description && (
            <p className="mt-2 text-muted-foreground">{course.description}</p>
          )}
          {course.teacher_name && (
            <div className="mt-4 flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/30">
              {course.teacher_avatar_url ? (
                <img src={course.teacher_avatar_url} alt={course.teacher_name} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {course.teacher_name.charAt(0)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="font-semibold text-sm">{course.teacher_name}</p>
                  {course.teacher_verified && <BadgeCheck className="h-4 w-4 text-primary" />}
                </div>
                {course.teacher_title && <p className="text-xs text-muted-foreground">{course.teacher_title}</p>}
                {course.teacher_bio && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{course.teacher_bio}</p>}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabFilter)} className="mb-6">
          <TabsList className="grid grid-cols-4 w-full max-w-md">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="lectures">Lectures</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="tests">Tests</TabsTrigger>
          </TabsList>
        </Tabs>

        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <Video className="h-5 w-5 text-primary" />
          Content ({filteredLessons.length})
        </h2>

        {filteredLessons.length === 0 ? (
          <Card className="text-center py-12">
            <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No content available for this filter.</p>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredLessons.map((lesson, index) => (
              <LessonCard key={lesson.id} lesson={lesson} index={index} onWatch={handleWatch} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default CoursePage;
