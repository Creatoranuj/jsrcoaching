import { useNavigate } from "react-router-dom";
import { Loader2, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface DppItem {
  id: string;
  title: string;
  total_marks: number | null;
  type: string | null;
}

interface DppCardProps {
  dpps: DppItem[];
  loading: boolean;
}

export function DppCard({ dpps, loading }: DppCardProps) {
  const navigate = useNavigate();
  return (
    <Card className="border border-border">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4 text-primary" />
          Attempt DPP
          {dpps.length > 0 && (
            <Badge variant="secondary" className="ml-auto">{dpps.length}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="py-6 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dpps.map((dpp) => (
              <button
                key={dpp.id}
                onClick={() => navigate(`/quiz/${dpp.id}`)}
                className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-accent/10 transition-colors group"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Target className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{dpp.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {dpp.type?.toUpperCase() || "DPP"}
                    {dpp.total_marks ? ` · ${dpp.total_marks} marks` : ""}
                  </p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">Attempt</Badge>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
