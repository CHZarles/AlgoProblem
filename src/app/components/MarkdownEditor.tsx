import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "../../lib/cn";
import { toggleMarkdownTaskAtIndex } from "../../lib/markdownTasks";
import { applyTextareaMarkdownEnter, applyTextareaTabIndent } from "../../lib/textareaIndent";
import { uploadPastedImage } from "../../api/client";
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
  enableImagePaste = false,
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
  enableImagePaste?: boolean;
}) {
  const [internalMode, setInternalMode] = useState<Mode>(defaultMode);
  const mode = modeProp ?? internalMode;
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const [uploading, setUploading] = useState(0);

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
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium text-slate-300">Markdown</div>
          {enableImagePaste ? <div className="text-[11px] text-slate-500">支持粘贴图片</div> : null}
          {uploading > 0 ? <div className="text-[11px] text-sky-300">图片上传中…</div> : null}
        </div>
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
              onPaste={(e) => {
                if (!enableImagePaste) return;
                const dt = e.clipboardData;
                if (!dt) return;
                const items = Array.from(dt.items ?? []);
                const images = items.filter((it) => it.kind === "file" && it.type.startsWith("image/"));
                if (!images.length) return;

                e.preventDefault();
                e.stopPropagation();

                const el = e.currentTarget;
                const insertAtCursor = (text: string) => {
                  const cur = valueRef.current ?? "";
                  const start = el.selectionStart ?? cur.length;
                  const end = el.selectionEnd ?? cur.length;
                  const next = cur.slice(0, start) + text + cur.slice(end);
                  valueRef.current = next;
                  onChange(next);
                  requestAnimationFrame(() => {
                    const pos = start + text.length;
                    el.selectionStart = pos;
                    el.selectionEnd = pos;
                  });
                };

                const jobs = images
                  .map((it) => it.getAsFile())
                  .filter((f): f is File => Boolean(f))
                  .map((file) => ({ file, id: `upload_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}` }));
                if (!jobs.length) return;

                const insertion = jobs.map((j) => `![image](asset:uploading:${j.id})`).join("\n\n");
                insertAtCursor(insertion);
                setUploading((n) => n + jobs.length);

                for (const j of jobs) {
                  void uploadPastedImage(j.file)
                    .then((r) => {
                      const cur = valueRef.current ?? "";
                      const next = cur.replaceAll(`asset:uploading:${j.id}`, r.url);
                      valueRef.current = next;
                      onChange(next);
                    })
                    .catch(() => {
                      const cur = valueRef.current ?? "";
                      const next = cur.replaceAll(`![image](asset:uploading:${j.id})`, "");
                      valueRef.current = next;
                      onChange(next);
                      toast.error("图片上传失败");
                    })
                    .finally(() => {
                      setUploading((n) => Math.max(0, n - 1));
                    });
                }
              }}
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
