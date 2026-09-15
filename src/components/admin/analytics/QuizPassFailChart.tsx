import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";

interface QuizRate { quiz: string; passed: number; failed: number; total: number }

const QuizPassFailChart = ({ data }: { data: QuizRate[] }) => (
  <ResponsiveContainer width="100%" height={200}>
    <BarChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="quiz" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
      <Tooltip content={<ChartTooltip />} />
      <Legend wrapperStyle={{ fontSize: 12 }} />
      <Bar dataKey="passed" name="Passed" fill="hsl(142,71%,45%)" radius={[4, 4, 0, 0]} stackId="a" />
      <Bar dataKey="failed" name="Failed" fill="hsl(0,72%,50%)" radius={[4, 4, 0, 0]} stackId="a" />
    </BarChart>
  </ResponsiveContainer>
);

export default QuizPassFailChart;
