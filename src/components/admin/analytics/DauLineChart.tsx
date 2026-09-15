import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ChartTooltip } from "./ChartTooltip";

interface DauPoint { date: string; users: number }

const DauLineChart = ({ data }: { data: DauPoint[] }) => (
  <ResponsiveContainer width="100%" height={200}>
    <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
      <Tooltip content={<ChartTooltip />} />
      <Line
        type="monotone"
        dataKey="users"
        name="Active Users"
        stroke="hsl(var(--primary))"
        strokeWidth={2.5}
        dot={{ fill: "hsl(var(--primary))", r: 4 }}
        activeDot={{ r: 6 }}
      />
    </LineChart>
  </ResponsiveContainer>
);

export default DauLineChart;
