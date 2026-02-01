import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "../app/components/Input";
import { Button } from "../app/components/Button";
import { cn } from "../lib/cn";
import { getSettings, patchSettings, testLlm } from "../api/client";
import { useApiQuery } from "../api/hooks";
import { ApiError } from "../api/http";
import { useTheme, type ThemePreference } from "../app/theme";
import { Check, Leaf, Moon, Sun } from "lucide-react";

export default function SettingsPage() {
  const theme = useTheme();
  const q = useApiQuery(() => getSettings(), []);
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setLlmBaseUrl(q.data.llmBaseUrl ?? "");
    setLlmModel(q.data.llmModel ?? "");
  }, [q.data]);

  const save = async () => {
    setSaving(true);
    try {
      await patchSettings({
        llmBaseUrl,
        llmModel,
        ...(llmApiKey.trim() ? { llmApiKey: llmApiKey.trim() } : {}),
      });
      toast.success("已保存设置");
      setLlmApiKey("");
      q.reload();
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.status === 404) {
        toast.error("后端缺少 /api/settings 接口，请重启服务端后再试");
      } else if (err?.message === "invalid_base_url") {
        toast.error("Base URL 不合法，请以 http:// 或 https:// 开头");
      } else {
        toast.error("保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="text-lg font-semibold text-slate-50">设置</div>
        <div className="mt-1 text-sm text-slate-500">配置 Workspace 行为（例如：LLM 抽取题面）。</div>
      </div>

      <div
        className={cn(
          "rounded-2xl bg-white/3 p-4 shadow-panel",
          "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
        )}
      >
        <div className="text-sm font-semibold text-slate-200">外观</div>
        <div className="mt-1 text-sm text-slate-500">主题切换：浅色 / 秋天 / 深色（偏好存储在本地浏览器）。</div>

        <div className="mt-4 grid gap-3">
          <div>
            <div className="text-xs font-medium text-slate-300">Theme</div>
            <div className="mt-1">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Theme">
                {(
                  [
                    {
                      value: "light",
                      label: "浅色",
                      hint: "清爽",
                      Icon: Sun,
                      iconClass: "text-amber-400",
                      iconWrap: "bg-amber-500/14 shadow-[0_0_0_1px_rgba(245,158,11,0.22)]",
                    },
                    {
                      value: "autumn",
                      label: "秋天",
                      hint: "暖色",
                      Icon: Leaf,
                      iconClass: "text-[#B45309]",
                      iconWrap: "bg-[#F4D6B0]/45 shadow-[0_0_0_1px_rgba(180,83,9,0.26)]",
                    },
                    {
                      value: "dark",
                      label: "深色",
                      hint: "专注",
                      Icon: Moon,
                      iconClass: "text-indigo-300",
                      iconWrap: "bg-indigo-500/14 shadow-[0_0_0_1px_rgba(99,102,241,0.22)]",
                    },
                  ] as const
                ).map((item) => {
                  const selected = theme.preference === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => theme.setPreference(item.value as ThemePreference)}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition",
                        "shadow-[0_0_0_1px_rgba(148,163,184,0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
                        selected ? "bg-white/8" : "bg-white/4 hover:bg-white/7",
                      )}
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", item.iconWrap)}>
                          <item.Icon className={cn("h-4 w-4", item.iconClass)} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-200">{item.label}</span>
                          <span className="block truncate text-[11px] text-slate-500">{item.hint}</span>
                        </span>
                      </span>
                      {selected ? <Check className="h-4 w-4 shrink-0 text-sky-500" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              当前生效：
              {theme.preference === "autumn"
                ? "秋天"
                : theme.resolved === "light"
                  ? "浅色"
                  : "深色"}
            </div>
          </div>
        </div>
      </div>

      <div
        className={cn(
          "rounded-2xl bg-white/3 p-4 shadow-panel",
          "shadow-[0_0_0_1px_rgba(148,163,184,0.14)]",
        )}
      >
        <div className="text-sm font-semibold text-slate-200">LLM</div>
        <div className="mt-1 text-sm text-slate-500">
          用于从非 LeetCode 链接抽取题面 Markdown（收集时优先调用 LLM；LeetCode 仍优先结构化抓取以减少数字/公式/样例误改）。
        </div>

        <div className="mt-4 grid gap-3">
          <div>
            <div className="text-xs font-medium text-slate-300">Base URL</div>
            <div className="mt-1">
              <Input
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                placeholder="https://open.bigmodel.cn/api/paas/v4 或 https://api.openai.com/v1"
                spellCheck={false}
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">示例：智谱 `https://open.bigmodel.cn/api/paas/v4`；OpenAI `https://api.openai.com/v1`。</div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-300">Model</div>
            <div className="mt-1">
              <Input
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                placeholder="例如：gpt-4o-mini"
                spellCheck={false}
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">模型名称（取决于你配置的 LLM 服务）。</div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-slate-300">API Key</div>
              {q.data?.llmApiKeySet ? (
                <div className="text-[11px] text-slate-500">已设置（••••{q.data.llmApiKeyLast4 ?? "****"}）</div>
              ) : (
                <div className="text-[11px] text-slate-500">未设置</div>
              )}
            </div>
            <div className="mt-1">
              <Input
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder="粘贴你的 API Key（存储在本地 DB）"
                type="password"
                spellCheck={false}
              />
            </div>
            <div className="mt-1 text-xs text-slate-500">留空不会覆盖已保存的 Key；如需清除请使用「清除」按钮。</div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button variant="primary" disabled={q.loading || saving} onClick={save}>
            {saving ? "保存中…" : "保存"}
          </Button>
          <Button
            variant="secondary"
            disabled={q.loading || saving}
            onClick={async () => {
              setSaving(true);
              try {
                const r = await testLlm();
                toast.success("LLM 连接正常");
                toast.message(`${r.content}${r.requestId ? `（request_id: ${r.requestId}）` : ""}`);
              } catch (e) {
                const err = e instanceof ApiError ? e : null;
                const detail =
                  typeof err?.body === "object" && err?.body && "detail" in err.body
                    ? String((err.body as { detail?: unknown }).detail ?? "")
                    : "";
                if (err?.message === "llm_not_configured") toast.error("请先填写 Base URL / Model 并保存");
                else if (err?.message === "llm_call_failed") toast.error(detail ? `LLM 调用失败：${detail}` : "LLM 调用失败");
                else toast.error("LLM 调用失败");
              } finally {
                setSaving(false);
              }
            }}
          >
            测试连接
          </Button>
          <Button
            variant="secondary"
            disabled={q.loading || saving}
            onClick={() => {
              setLlmBaseUrl(q.data?.llmBaseUrl ?? "");
              setLlmModel(q.data?.llmModel ?? "");
              setLlmApiKey("");
            }}
          >
            重置
          </Button>
          <Button
            variant="ghost"
            disabled={q.loading || saving || !q.data?.llmApiKeySet}
            onClick={async () => {
              const ok = window.confirm("确认清除已保存的 API Key？");
              if (!ok) return;
              setSaving(true);
              try {
                await patchSettings({ llmApiKey: "" });
                toast.success("已清除 API Key");
                setLlmApiKey("");
                q.reload();
              } catch {
                toast.error("清除失败");
              } finally {
                setSaving(false);
              }
            }}
          >
            清除 API Key
          </Button>
          {q.loading ? <div className="ml-auto text-xs text-slate-500">加载中…</div> : null}
          {q.error ? <div className="ml-auto text-xs text-rose-300">加载失败：{q.error.message}</div> : null}
        </div>
      </div>
    </div>
  );
}
