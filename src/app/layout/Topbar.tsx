import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, Laptop, Moon, Palette, Search, Sparkles, Sun } from "lucide-react";
import { Button } from "../components/Button";
import { cn } from "../../lib/cn";
import { useTheme } from "../theme";

export function Topbar({
  onOpenCommand,
  onOpenIngest,
}: {
  onOpenCommand: () => void;
  onOpenIngest: () => void;
}) {
  const theme = useTheme();
  const meta = (() => {
    if (theme.preference === "system") return { Icon: Laptop, label: "系统", iconClass: "text-slate-400" };
    if (theme.preference === "light") return { Icon: Sun, label: "浅色", iconClass: "text-amber-400" };
    if (theme.preference === "cream") return { Icon: Palette, label: "米白", iconClass: "text-[#B0893B]" };
    return { Icon: Moon, label: "深色", iconClass: "text-indigo-300" };
  })();

  return (
    <div className="sticky top-0 z-10 h-14 border-b border-white/8 bg-[#0B0F14]/80 backdrop-blur">
      <div className="mx-auto flex h-full max-w-[1360px] items-center gap-3 px-4">
        <button
          type="button"
          onClick={onOpenCommand}
          className={cn(
            "flex h-9 flex-1 items-center gap-2 rounded-xl bg-white/4 px-3 text-sm text-slate-400",
            "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] hover:bg-white/6",
          )}
        >
          <Search className="h-4 w-4" />
          <span className="truncate">搜索题库 / 笔记 / 题解…</span>
          <span className="ml-auto rounded-md bg-white/6 px-2 py-0.5 text-[11px] text-slate-400">⌘ K</span>
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" aria-label="主题" className="gap-2.5">
              <meta.Icon className={cn("h-4 w-4", meta.iconClass)} />
              <span className="hidden sm:inline text-xs font-medium text-slate-200">{meta.label}</span>
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={8}
              align="end"
              className="w-40 rounded-xl bg-[#0F1520] p-1 shadow-[0_0_0_1px_rgba(148,163,184,0.14)] shadow-panel"
            >
              <DropdownMenu.Item
                onSelect={() => theme.setPreference("system")}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm outline-none",
                  "text-slate-200 data-[highlighted]:bg-white/6 data-[highlighted]:text-slate-50",
                  theme.preference === "system" && "bg-white/4",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/4 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
                    <Laptop className="h-4 w-4 text-slate-400" />
                  </span>
                  <span className="font-medium">跟随系统</span>
                </span>
                {theme.preference === "system" ? <Check className="h-4 w-4 text-sky-500" /> : null}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => theme.setPreference("light")}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm outline-none",
                  "text-slate-200 data-[highlighted]:bg-white/6 data-[highlighted]:text-slate-50",
                  theme.preference === "light" && "bg-white/4",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/14 shadow-[0_0_0_1px_rgba(245,158,11,0.22)]">
                    <Sun className="h-4 w-4 text-amber-400" />
                  </span>
                  <span className="font-medium">浅色</span>
                </span>
                {theme.preference === "light" ? <Check className="h-4 w-4 text-sky-500" /> : null}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => theme.setPreference("cream")}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm outline-none",
                  "text-slate-200 data-[highlighted]:bg-white/6 data-[highlighted]:text-slate-50",
                  theme.preference === "cream" && "bg-white/4",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#EAD9B7]/35 shadow-[0_0_0_1px_rgba(176,137,59,0.28)]">
                    <Palette className="h-4 w-4 text-[#B0893B]" />
                  </span>
                  <span className="font-medium">米白（护眼）</span>
                </span>
                {theme.preference === "cream" ? <Check className="h-4 w-4 text-sky-500" /> : null}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => theme.setPreference("dark")}
                className={cn(
                  "flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm outline-none",
                  "text-slate-200 data-[highlighted]:bg-white/6 data-[highlighted]:text-slate-50",
                  theme.preference === "dark" && "bg-white/4",
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/14 shadow-[0_0_0_1px_rgba(99,102,241,0.22)]">
                    <Moon className="h-4 w-4 text-indigo-300" />
                  </span>
                  <span className="font-medium">深色</span>
                </span>
                {theme.preference === "dark" ? <Check className="h-4 w-4 text-sky-500" /> : null}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Button variant="primary" onClick={onOpenIngest}>
          <Sparkles className="h-4 w-4" />
          收集题目
        </Button>
      </div>
    </div>
  );
}
