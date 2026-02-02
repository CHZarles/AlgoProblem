import { useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import { toggleMarkdownTaskAtIndex } from "../../lib/markdownTasks";
import { applyTextareaMarkdownEnter, applyTextareaTabIndent } from "../../lib/textareaIndent";
import { Button } from "./Button";
import { Markdown } from "./Markdown";

type Mode = "split" | "write" | "preview";

function isComposing(e: { nativeEvent?: unknown }) {
  return Boolean((e.nativeEvent as { isComposing?: boolean } | undefined)?.isComposing);
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  minRows = 16,
  minHeightClass = "min-h-[56vh]",
  defaultMode = "preview",
  mode: modeProp,
  onModeChange,
  showModeSwitch = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
  minHeightClass?: string;
  defaultMode?: Mode;
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
  showModeSwitch?: boolean;
}) {
  const [internalMode, setInternalMode] = useState<Mode>(defaultMode);
  const mode = modeProp ?? internalMode;

  const rows = useMemo(() => Math.max(minRows, 10), [minRows]);

  return (
    <div
      className={cn(
        "rounded-2xl bg-white/3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
        "flex flex-col",
        minHeightClass,
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
        <div className="text-xs font-medium text-slate-300">Markdown</div>
        {showModeSwitch ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={mode === "write" ? "primary" : "secondary"}
              onClick={() => (modeProp ? onModeChange?.("write") : setInternalMode("write"))}
            >
              写作
            </Button>
            <Button
              size="sm"
              variant={mode === "split" ? "primary" : "secondary"}
              onClick={() => (modeProp ? onModeChange?.("split") : setInternalMode("split"))}
            >
              分屏
            </Button>
            <Button
              size="sm"
              variant={mode === "preview" ? "primary" : "secondary"}
              onClick={() => (modeProp ? onModeChange?.("preview") : setInternalMode("preview"))}
            >
              预览
            </Button>
          </div>
        ) : null}
      </div>

      <div className={cn("grid flex-1 gap-0", mode === "split" ? "grid-cols-2" : "grid-cols-1")}>
        {mode !== "preview" ? (
          <div className={cn("p-3", mode === "split" ? "border-r border-white/8" : "", "min-h-0")}>
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                const el = e.currentTarget;
                const currentValue = el.value;

                if (e.key === "Tab") {
                  e.preventDefault();
                  e.stopPropagation();
                  const out = applyTextareaTabIndent({
                    value: currentValue,
                    selectionStart: el.selectionStart ?? 0,
                    selectionEnd: el.selectionEnd ?? 0,
                    indent: "  ",
                    outdent: e.shiftKey,
                  });
                  onChange(out.value);
                  requestAnimationFrame(() => {
                    el.selectionStart = out.selectionStart;
                    el.selectionEnd = out.selectionEnd;
                  });
                  return;
                }

                if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !isComposing(e)) {
                  const out = applyTextareaMarkdownEnter({
                    value: currentValue,
                    selectionStart: el.selectionStart ?? 0,
                    selectionEnd: el.selectionEnd ?? 0,
                  });
                  if (!out) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(out.value);
                  requestAnimationFrame(() => {
                    el.selectionStart = out.selectionStart;
                    el.selectionEnd = out.selectionEnd;
                  });
                }
              }}
              placeholder={placeholder}
              rows={rows}
              className={cn(
                "w-full resize-none rounded-xl bg-black/10 p-3 text-sm text-slate-200",
                "h-full min-h-0",
                "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] placeholder:text-slate-500",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
              )}
            />
          </div>
        ) : null}

        {mode !== "write" ? (
          <div className="min-h-0 p-3">
            <div className="h-full overflow-auto rounded-xl bg-black/10 p-3 shadow-[0_0_0_1px_rgba(148,163,184,0.14)]">
              <Markdown
                value={value || "（空）"}
                interactiveTasks
                onToggleTask={(idx, checked) => onChange(toggleMarkdownTaskAtIndex(value, idx, checked))}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
