import type { Activity, ActivityType } from "../../types/model";
import { cn } from "../../lib/cn";

type Mode = "review" | "publish";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildDays(endDate: Date, days = 365) {
  const end = startOfDay(endDate);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const out: Date[] = [];
  for (let i = 0; i < days; i++) out.push(new Date(start.getTime() + i * 86400000));
  return out;
}

function pickTypes(mode: Mode): Set<ActivityType> {
  if (mode === "publish") return new Set<ActivityType>(["solution_published"]);
  return new Set<ActivityType>(["review_completed"]);
}

export function Heatmap({
  activities,
  mode,
  className,
}: {
  activities: Activity[];
  mode: Mode;
  className?: string;
}) {
  const types = pickTypes(mode);
  const counts = new Map<string, number>();

  for (const a of activities) {
    if (!types.has(a.type)) continue;
    const key = isoDayKey(new Date(a.at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const days = buildDays(new Date(), 364);
  const first = days[0];
  const firstDow = (first.getDay() + 6) % 7; // Monday=0

  // Pad to full weeks, GitHub-like
  const padded: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) padded.push(null);
  for (const d of days) padded.push(d);
  while (padded.length % 7 !== 0) padded.push(null);

  const palette =
    mode === "publish"
      ? {
          z0: "bg-white/5",
          z1: "bg-emerald-500/18",
          z2: "bg-emerald-500/30",
          z3: "bg-emerald-500/45",
          z4: "bg-emerald-400/70",
        }
      : {
          z0: "bg-white/5",
          z1: "bg-sky-500/18",
          z2: "bg-sky-500/30",
          z3: "bg-sky-500/45",
          z4: "bg-sky-400/70",
        };

  const intensity = (n: number) => {
    if (n <= 0) return palette.z0;
    if (n === 1) return palette.z1;
    if (n <= 3) return palette.z2;
    if (n <= 6) return palette.z3;
    return palette.z4;
  };

  return (
    <div className={cn("rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]", className)}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-200">{mode === "publish" ? "题解热力图" : "复习热力图"}</div>
        <div className="text-xs text-slate-500">过去约 12 个月</div>
      </div>

      <div className="mt-3 overflow-auto">
        <div className="grid grid-flow-col grid-rows-7 gap-1">
          {padded.map((d, idx) => {
            if (!d) return <div key={idx} className="h-3.5 w-3.5 rounded-[4px] bg-transparent" />;
            const key = isoDayKey(d);
            const n = counts.get(key) ?? 0;
            const title = `${key} · ${n} 次`;
            return <div key={idx} title={title} className={cn("h-3.5 w-3.5 rounded-[4px]", intensity(n))} />;
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-500">
        <span>少</span>
        <div className="flex gap-1">
          <div className={cn("h-3.5 w-3.5 rounded-[4px]", palette.z0)} />
          <div className={cn("h-3.5 w-3.5 rounded-[4px]", palette.z1)} />
          <div className={cn("h-3.5 w-3.5 rounded-[4px]", palette.z2)} />
          <div className={cn("h-3.5 w-3.5 rounded-[4px]", palette.z3)} />
          <div className={cn("h-3.5 w-3.5 rounded-[4px]", palette.z4)} />
        </div>
        <span>多</span>
      </div>
    </div>
  );
}
