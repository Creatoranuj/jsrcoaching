/**
 * Timetable.tsx
 * ==============
 * Weekly schedule/timetable view for students and teachers.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Layout/Header";
import Sidebar from "../components/Layout/Sidebar";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { selectionHaptic } from "../lib/native/haptics";
import { useTimetable, DAY_NAMES } from "../hooks/useTimetable";
import { useAuth } from "../contexts/AuthContext";
import { ArrowLeft, Calendar, Clock, MapPin, Loader2 } from "lucide-react";
import { formatGrade } from "../lib/formatGrade";

const Timetable = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { timetable, loading, getTimetableByDay } = useTimetable();
  
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());

  // Get today's day index
  const today = new Date().getDay();

  // Auth redirect
  if (!authLoading && !isAuthenticated) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <Header onMenuClick={() => setSidebarOpen(true)} />

      {/* Page Header */}
      <div className="bg-primary px-4 py-4 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/dashboard")}
          className="text-primary-foreground hover:bg-primary-foreground/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-primary-foreground">Timetable</h1>
      </div>

      <main className="flex-1 p-4 space-y-4 pb-24 md:pb-6">
        {/* Day Selector — horizontally swipeable chip row */}
        <Card>
          <CardContent className="p-3">
            <div
              className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 snap-x"
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
            >
              {DAY_NAMES.map((day, index) => (
                <Button
                  key={day}
                  variant={selectedDay === index ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    void selectionHaptic();
                    setSelectedDay(index);
                  }}
                  className={`shrink-0 min-w-[72px] snap-start active:scale-[0.97] transition-transform duration-150 ease-out ${index === today ? 'ring-2 ring-primary/30' : ''}`}
                >
                  <span className="hidden sm:inline">{day}</span>
                  <span className="sm:hidden">{day.substring(0, 3)}</span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Schedule Display */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calendar className="h-5 w-5 text-primary" />
              {DAY_NAMES[selectedDay]}'s Schedule
              {selectedDay === today && (
                <Badge variant="secondary" className="ml-2">Today</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Loading timetable…</p>
              </div>
            ) : getTimetableByDay(selectedDay).length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>No classes scheduled for {DAY_NAMES[selectedDay]}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {getTimetableByDay(selectedDay).map((entry) => (
                  <div 
                    key={entry.id} 
                    className="flex gap-4 p-4 rounded-xl border bg-card hover:shadow-md transition-shadow"
                  >
                    {/* Time Column */}
                    <div className="flex flex-col items-center justify-center min-w-[60px] text-center">
                      <div className="text-lg font-bold text-primary">
                        {entry.startTime.substring(0, 5)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        to {entry.endTime.substring(0, 5)}
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="w-1 rounded-full bg-primary/20" />

                    {/* Content */}
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">
                        {entry.course?.title || 'Untitled Class'}
                      </h3>
                      <div className="flex flex-wrap gap-3 mt-2 text-sm text-muted-foreground">
                        {entry.course?.grade && (
                          <Badge variant="outline">{formatGrade(entry.course.grade, "Grade")}</Badge>
                        )}
                        {entry.room && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {entry.room}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {calculateDuration(entry.startTime, entry.endTime)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

// Helper to calculate class duration
function calculateDuration(start: string, end: string): string {
  const startParts = start.split(':').map(Number);
  const endParts = end.split(':').map(Number);
  
  const startMinutes = startParts[0] * 60 + startParts[1];
  const endMinutes = endParts[0] * 60 + endParts[1];
  
  const duration = endMinutes - startMinutes;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes}m`;
  }
}

export default Timetable;
