import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";

interface CourseCompletion { course: string; completion: number; total: number; completed: number }

const CourseCompletionChart = ({ data }: { data: CourseCompletion[] }) => (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="course" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
      <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
      <Tooltip content={<ChartTooltip />} />
      <Bar dataKey="completion" name="Completion %" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

export default CourseCompletionChart;
