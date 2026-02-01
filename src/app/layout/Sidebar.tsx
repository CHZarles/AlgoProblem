import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn";
import {
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Layers,
  NotebookPen,
  RefreshCcw,
  Settings,
  SquareTerminal,
} from "lucide-react";
import { useMemo } from "react";
import { getStats } from "../../api/client";
import { useApiQuery } from "../../api/hooks";

const nav = [
  { to: "/problems", label: "题库", icon: SquareTerminal },
  { to: "/review", label: "复习", icon: RefreshCcw },
  { to: "/notes", label: "笔记", icon: NotebookPen },
  { to: "/solutions", label: "题解", icon: BookOpen },
  { to: "/collections", label: "集合", icon: Layers },
  { to: "/stats", label: "统计", icon: BarChart3 },
  { to: "/settings", label: "设置", icon: Settings },
];

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

function formatMb(bytes: number | null | undefined) {
  const b = Number(bytes ?? 0);
  if (!Number.isFinite(b) || b <= 0) return "—";
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: (v: boolean) => void;
}) {
  const widthClass = collapsed ? "w-[72px]" : "w-[240px]";

  const qStats = useApiQuery(() => getStats(), []);
  const meta = useMemo(() => {
    const s = qStats.data;
    return {
      dataMb: s ? formatMb(s.dataBytes) : "—",
      problemsTotal: s?.problemsTotal ?? null,
      notesTotal: s?.notesTotal ?? null,
      solutionsTotal: s?.solutionsTotal ?? null,
    };
  }, [qStats.data]);
  const progress = useMemo(() => {
    if (!qStats.data) return { today: null as number | null, streak: null as number | null };
    const todayKeyNow = dayKey(new Date());
    const keys = new Set<string>();
    let today = 0;
    for (const a of qStats.data.activities) {
      const k = dayKey(new Date(a.at));
      keys.add(k);
      if (k === todayKeyNow) today++;
    }
    return { today, streak: streakFromActivities(keys) };
  }, [qStats.data]);

  return (
    <div
      className={cn(
        "sticky top-0 h-dvh border-r border-white/8 bg-[#0B0F14]",
        "flex flex-col",
        widthClass,
      )}
    >
      <div className="flex h-14 items-center justify-between px-3">
        <div className={cn("flex items-center gap-2", collapsed ? "justify-center" : "")}>
          <NavLink
            to="/problems"
            aria-label="回到题库"
            title="AlgoWorkspace"
            className={cn(
              "group relative grid h-8 w-8 place-items-center rounded-xl",
              "bg-gradient-to-br from-sky-500/18 via-sky-500/10 to-indigo-500/16",
              "shadow-[0_0_0_1px_rgba(14,165,233,0.22)]",
              "hover:brightness-[1.08] active:brightness-[0.98]",
            )}
          >
            <span className="select-none text-[12px] font-semibold tracking-tight text-slate-50">AW</span>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#0B0F14] shadow-[0_0_0_1px_rgba(148,163,184,0.22)]" />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </NavLink>
          {!collapsed ? (
            <div>
              <div className="text-sm font-semibold text-slate-200">AlgoWorkspace</div>
              <div className="mt-0.5 text-[11px] text-slate-500">Workspace</div>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onToggle(!collapsed)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/6",
            collapsed ? "" : "",
          )}
          title={collapsed ? "展开侧边栏" : "收起侧边栏"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <div className="px-2">
        <div className="h-px bg-white/8" />
      </div>

      <nav className="mt-3 flex flex-col gap-1 px-2">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-slate-300 transition",
                  "hover:bg-white/6 hover:text-slate-100",
                  isActive && "bg-white/8 text-slate-50 shadow-[0_0_0_1px_rgba(148,163,184,0.12)]",
                  collapsed && "justify-center px-0",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed ? <span>{item.label}</span> : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto px-3 pb-4">
        <NavLink
          to="/stats"
          className={({ isActive }) =>
            cn(
              "block rounded-2xl bg-white/3 p-3 transition",
              "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
              isActive ? "bg-white/6" : "hover:bg-white/5",
              collapsed ? "hidden" : "",
            )
          }
          title="查看统计"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium text-slate-300">今日进度</div>
              <div className="mt-1 text-sm text-slate-200">
                活动 {progress.today ?? "—"} · 连续 {progress.streak ?? "—"} 天
              </div>
            </div>
            <ArrowUpRight className="mt-0.5 h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            数据大小：{meta.dataMb} · 题目 {meta.problemsTotal ?? "—"} · 笔记 {meta.notesTotal ?? "—"} · 题解{" "}
            {meta.solutionsTotal ?? "—"}
          </div>
        </NavLink>
      </div>
    </div>
  );
}
