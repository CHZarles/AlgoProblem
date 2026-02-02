import { useMemo, useState } from "react";
import { getStats } from "../api/client";
import { Heatmap } from "../app/components/Heatmap";
import { Button } from "../app/components/Button";
import { ErrorBlock, LoadingBlock } from "../app/components/StateBlocks";
import { cn } from "../lib/cn";
import { useApiQuery } from "../api/hooks";

type Mode = "review" | "publish";

function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function streakFromActivities(keys: Set<string>) {
  let streak = 0;
  for (let i = 0; ; i++) {
    const d = new Date(Date.now() - i * 86400000);
    if (!keys.has(dayKey(d))) break;
    streak++;
  }
  return streak;
}

export default function StatsPage() {
  const qStats = useApiQuery(() => getStats(), []);
  const stats = qStats.data;
  const [mode, setMode] = useState<Mode>("review");

  const visibleActivities = useMemo(() => {
    if (!stats) return [];
    if (mode === "publish") return stats.activities.filter((a) => a.type === "solution_published");
    return stats.activities.filter((a) => a.type === "review_completed");
  }, [mode, stats]);

  const keys = useMemo(() => {
    const set = new Set<string>();
    for (const a of visibleActivities) set.add(dayKey(new Date(a.at)));
    return set;
  }, [visibleActivities]);

  const streak = useMemo(() => streakFromActivities(keys), [keys]);

  const last30 = mode === "publish" ? stats?.publishesLast30 : stats?.reviewsLast30;
  const total = mode === "publish" ? stats?.publishesTotal : stats?.reviewsTotal;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">统计</div>
          <div className="mt-1 text-sm text-slate-500">热力图与统计支持按「复习 / 发布」口径切换。</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={mode === "review" ? "primary" : "secondary"} onClick={() => setMode("review")}>
            复习
          </Button>
          <Button variant={mode === "publish" ? "primary" : "secondary"} onClick={() => setMode("publish")}>
            发布
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {!stats ? (
          <div className="col-span-12">
            {qStats.loading ? (
              <LoadingBlock title="加载统计…" />
            ) : (
              <ErrorBlock error={qStats.error} onAction={qStats.reload} />
            )}
          </div>
        ) : (
          [
            { k: mode === "publish" ? "连续发布天数" : "连续复习天数", v: `${streak} 天` },
            { k: mode === "publish" ? "近 30 天发布" : "近 30 天复习", v: `${last30 ?? "—"}` },
            { k: mode === "publish" ? "累计发布次数" : "累计复习次数", v: `${total ?? "—"}` },
            { k: mode === "publish" ? "已发布题解" : "已做题数", v: `${mode === "publish" ? stats.solutionsDone : stats.problemsDone}` },
          ].map((x) => (
            <div
              key={x.k}
              className={cn(
                "col-span-12 sm:col-span-6 xl:col-span-3 rounded-2xl bg-white/3 p-4",
                "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
              )}
            >
              <div className="text-xs text-slate-500">{x.k}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-50">{x.v}</div>
            </div>
          ))
        )}
      </div>

      {stats ? <Heatmap activities={stats.activities} mode={mode} /> : null}
    </div>
  );
}
