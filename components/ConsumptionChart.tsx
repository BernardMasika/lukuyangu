"use client";

import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useLang, useTheme } from "./Providers";
import { tr } from "@/lib/i18n";

type ChartType = "bar" | "line";

export default function ConsumptionChart({
  data,
  height = 200,
  showToggle = true,
}: {
  data: { label: string; value: number }[];
  height?: number;
  showToggle?: boolean;
}) {
  const { lang } = useLang();
  const { theme } = useTheme();
  const [chartType, setChartType] = useState<ChartType>("bar");

  useEffect(() => {
    const saved = localStorage.getItem("luku-chart-type") as ChartType | null;
    if (saved) setChartType(saved);
  }, []);

  const toggleChart = () => {
    const next = chartType === "bar" ? "line" : "bar";
    setChartType(next);
    localStorage.setItem("luku-chart-type", next);
  };

  const isDark = theme === "dark";
  const gridColor = isDark ? "#333" : "#e4e4e7";
  const tickColor = isDark ? "#999" : "#71717a";
  const tooltipBg = isDark ? "#1a1a1a" : "#ffffff";
  const tooltipBorder = isDark ? "#333" : "#e4e4e7";
  const tooltipText = isDark ? "#fff" : "#18181b";

  return (
    <div>
      {showToggle && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={toggleChart}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {chartType === "bar"
              ? tr("analytics.line", lang)
              : tr("analytics.bar", lang)}
          </button>
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        {chartType === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
            <YAxis tick={{ fontSize: 11, fill: tickColor }} />
            <Tooltip
              contentStyle={{
                background: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 8,
                color: tooltipText,
              }}
            />
            <Bar dataKey="value" fill="#003399" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
            <YAxis tick={{ fontSize: 11, fill: tickColor }} />
            <Tooltip
              contentStyle={{
                background: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 8,
                color: tooltipText,
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#003399"
              fill="#003399"
              fillOpacity={0.2}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
