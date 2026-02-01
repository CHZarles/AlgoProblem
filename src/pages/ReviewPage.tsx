import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { getTodayReviewQueue, reviewCheckIn, type ReviewQueueItem } from "../api/client";
import { useApiQuery } from "../api/hooks";
import { Badge } from "../app/components/Badge";
import { Button } from "../app/components/Button";
import { cn } from "../lib/cn";

const PRESET_MISTAKE_TAGS = ["思路", "边界", "实现", "复杂度", "数据结构", "数学", "细节"];
const EMPTY_ITEMS: ReviewQueueItem[] = [];

function difficultyTone(d: string) {
  if (d === "easy") return "easy" as const;
  if (d === "medium") return "medium" as const;
  if (d === "hard") return "hard" as const;
  return "neutral" as const;
}

function difficultyLabel(d: string) {
  if (d === "easy") return "Easy";
  if (d === "medium") return "Medium";
  if (d === "hard") return "Hard";
  return "Unknown";
}

export default function ReviewPage() {
  const qQueue = useApiQuery(() => getTodayReviewQueue(80), []);
  const items = qQueue.data?.items ?? EMPTY_ITEMS;

  const [mistakes, setMistakes] = useState<Record<string, string[]>>({});

  const dueCount = items.length;

  const toggleMistake = (id: string, tag: string) => {
    setMistakes((m) => {
      const cur = new Set(m[id] ?? []);
      if (cur.has(tag)) cur.delete(tag);
      else cur.add(tag);
      return { ...m, [id]: Array.from(cur) };
    });
  };

  const checkin = async (item: ReviewQueueItem, result: "good" | "hard" | "again") => {
    try {
      await reviewCheckIn(item.id, { result, mistakeTags: mistakes[item.id] ?? [] });
      toast.success("已打卡");
      qQueue.reload();
    } catch {
      toast.error("打卡失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50">今日复习</div>
          <div className="mt-1 text-sm text-slate-500">间隔重复：优先复习“到期 + 难度高 + 有错因”的题。</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => qQueue.reload()}>
            刷新
          </Button>
          <Link to="/stats" className="text-sm text-sky-300 hover:underline">
            查看热力图
          </Link>
        </div>
      </div>

      <div className="rounded-2xl bg-white/3 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-slate-300">到期 {dueCount} 题</div>
          <div className="text-xs text-slate-500">一键打卡后会自动安排下一次复习</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white/3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
        <div className="border-b border-white/8 px-4 py-3">
          <div className="text-sm font-medium text-slate-300">复习队列</div>
        </div>

        <div className="divide-y divide-white/8">
          {qQueue.loading ? (
            <div className="p-6 text-sm text-slate-500">加载中…</div>
          ) : items.length ? (
            items.map((it) => (
              <div key={it.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/problems/${it.id}`} className="truncate text-sm font-semibold text-slate-50 hover:underline">
                        {it.title}
                      </Link>
                      <span className="rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">
                        {it.platform.toUpperCase()}
                      </span>
                      <Badge tone={difficultyTone(it.difficulty)}>{difficultyLabel(it.difficulty)}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>到期：{new Date(it.reviewNextAt).toLocaleDateString()}</span>
                      <span>间隔：{it.reviewIntervalDays} 天</span>
                      <span>次数：{it.reviewCount}</span>
                      {it.reviewMistakeTags.length ? <span>错因：{it.reviewMistakeTags.join(" / ")}</span> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {it.tags.slice(0, 6).map((t) => (
                        <span key={t} className="rounded-full bg-white/6 px-2 py-0.5 text-[11px] text-slate-300">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button variant="secondary" onClick={() => checkin(it, "again")}>
                      再来
                    </Button>
                    <Button variant="primary" onClick={() => checkin(it, "good")}>
                      打卡
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-xs text-slate-500">错因标签：</div>
                  {PRESET_MISTAKE_TAGS.map((t) => {
                    const active = (mistakes[it.id] ?? []).includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleMistake(it.id, t)}
                        className={cn(
                          "rounded-full px-2 py-1 text-[11px] transition",
                          active
                            ? "bg-rose-500/16 text-rose-200 shadow-[0_0_0_1px_rgba(244,63,94,0.30)]"
                            : "bg-white/6 text-slate-300 hover:bg-white/8",
                        )}
                      >
                        {t}
                      </button>
                    );
                  })}
                  <Button variant="ghost" onClick={() => checkin(it, "hard")}>
                    有点模糊
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-6 text-sm text-slate-500">今天没有到期复习，去题库做题吧。</div>
          )}
        </div>
      </div>
    </div>
  );
}
