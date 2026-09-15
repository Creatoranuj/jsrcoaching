import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

interface Student {
  id: number;
  name: string;
  rollNumber: string;
  grade: number;
  section: string;
}

interface StudentAttendanceRowProps {
  student: Student;
  status: "present" | "absent" | "late" | null;
  onStatusChange: (status: "present" | "absent" | "late") => void;
}

const StudentAttendanceRow = ({ student, status, onStatusChange }: StudentAttendanceRowProps) => {
  return (
    <div className="flex items-center justify-between bg-card p-4 rounded-xl border border-border">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
          {student.name.charAt(0)}
        </div>
        <div>
          <p className="font-medium text-foreground">{student.name}</p>
          <p className="text-xs text-muted-foreground">Roll #{student.rollNumber}</p>
        </div>
      </div>

      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStatusChange("present")}
          className={cn(
            "min-w-[50px] text-xs font-semibold transition-all border",
            status === "present"
              ? "bg-success text-success-foreground border-success hover:bg-success/90"
              : "hover:border-success hover:text-success"
          )}
        >
          P
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStatusChange("absent")}
          className={cn(
            "min-w-[50px] text-xs font-semibold transition-all border",
            status === "absent"
              ? "bg-destructive text-destructive-foreground border-destructive hover:bg-destructive/90"
              : "hover:border-destructive hover:text-destructive"
          )}
        >
          A
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onStatusChange("late")}
          className={cn(
            "min-w-[50px] text-xs font-semibold transition-all border",
            status === "late"
              ? "bg-accent text-accent-foreground border-accent hover:bg-accent/90"
              : "hover:border-accent hover:text-accent"
          )}
        >
          L
        </Button>
      </div>
    </div>
  );
};

export default StudentAttendanceRow;
