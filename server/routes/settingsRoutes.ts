import { Router } from "express";
import { z } from "zod";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { db } from "../db";
import { llmChatWithMeta } from "../services/llm";

type SettingsResponse = {
  llmBaseUrl: string;
  llmModel: string;
  llmApiKeySet: boolean;
  llmApiKeyLast4?: string;
  acwingCookieSet: boolean;
  acwingCookieLast4?: string;
  workspaceLastBackupAt?: string;
};

function normalizeBaseUrl(input: string) {
  const u = new URL(input.trim());
  u.hash = "";
  return u.toString().replace(/\/+$/, "");
}

export function settingsRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.get("/", (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const rows = d
      .prepare("SELECT key, value FROM settings WHERE workspace_id = ?")
      .all(workspaceId) as Array<{ key: string; value: string }>;

    const out: SettingsResponse = { llmBaseUrl: "", llmModel: "", llmApiKeySet: false, acwingCookieSet: false };
    for (const row of rows) {
      if (row.key === "llm_base_url") out.llmBaseUrl = row.value;
      if (row.key === "llm_model") out.llmModel = row.value;
      if (row.key === "llm_api_key") {
        const v = row.value.trim();
        if (v) {
          out.llmApiKeySet = true;
          out.llmApiKeyLast4 = v.length >= 4 ? v.slice(-4) : v;
        }
      }
      if (row.key === "acwing_cookie") {
        const v = row.value.trim();
        if (v) {
          out.acwingCookieSet = true;
          out.acwingCookieLast4 = v.length >= 4 ? v.slice(-4) : v;
        }
      }
      if (row.key === "workspace_last_backup_at") {
        const v = row.value.trim();
        if (v) out.workspaceLastBackupAt = v;
      }
    }
    return res.json(out);
  });

  r.patch("/", (req, res) => {
    const Body = z.object({
      llmBaseUrl: z.string().optional(),
      llmModel: z.string().optional(),
      llmApiKey: z.string().optional(),
      acwingCookie: z.string().optional(),
    });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });

    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const updates: Array<{ key: string; value?: string }> = [];

    if (body.data.llmBaseUrl !== undefined) {
      const raw = body.data.llmBaseUrl.trim();
      if (!raw) updates.push({ key: "llm_base_url", value: undefined });
      else {
        try {
          updates.push({ key: "llm_base_url", value: normalizeBaseUrl(raw) });
        } catch {
          return res.status(400).json({ error: "invalid_base_url" });
        }
      }
    }
    if (body.data.llmModel !== undefined) {
      const raw = body.data.llmModel.trim();
      if (!raw) updates.push({ key: "llm_model", value: undefined });
      else updates.push({ key: "llm_model", value: raw });
    }
    if (body.data.llmApiKey !== undefined) {
      const raw = body.data.llmApiKey.trim();
      if (!raw) updates.push({ key: "llm_api_key", value: undefined });
      else updates.push({ key: "llm_api_key", value: raw });
    }
    if (body.data.acwingCookie !== undefined) {
      const raw = body.data.acwingCookie.trim();
      if (!raw) updates.push({ key: "acwing_cookie", value: undefined });
      else updates.push({ key: "acwing_cookie", value: raw });
    }

    const tx = d.transaction(() => {
      for (const u of updates) {
        if (u.value === undefined) {
          d.prepare("DELETE FROM settings WHERE workspace_id = ? AND key = ?").run(workspaceId, u.key);
        } else {
          d.prepare(
            `INSERT INTO settings (workspace_id, key, value)
             VALUES (?, ?, ?)
             ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value`,
          ).run(workspaceId, u.key, u.value);
        }
      }
    });
    tx();

    return res.json({ ok: true });
  });

  r.post("/test-acwing", async (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const Body = z.object({ url: z.string().min(1) });
    const body = Body.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "invalid_request" });

    const d = db();
    const cookie = (
      d.prepare("SELECT value FROM settings WHERE workspace_id = ? AND key = 'acwing_cookie'")
        .get(workspaceId) as { value: string } | undefined
    )?.value?.trim();

    try {
      const resp = await fetch(body.data.url.trim(), {
        headers: {
          "user-agent": "AlgoWorkspace/1.0",
          ...(cookie ? { cookie } : {}),
        },
      });
      if (!resp.ok) return res.status(400).json({ ok: false, error: `http_${resp.status}` });
      const html = await resp.text();
      const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
      return res.json({ ok: true, title: title.slice(0, 120) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown_error";
      return res.status(400).json({ ok: false, error: msg });
    }
  });

  r.post("/test-llm", async (req, res) => {
    const workspaceId = (req as WorkspaceRequest).workspaceId;
    const d = db();
    const rows = d
      .prepare(
        "SELECT key, value FROM settings WHERE workspace_id = ? AND key IN ('llm_base_url', 'llm_model', 'llm_api_key')",
      )
      .all(workspaceId) as Array<{ key: string; value: string }>;

    const baseUrl = rows.find((r) => r.key === "llm_base_url")?.value?.trim() ?? "";
    const model = rows.find((r) => r.key === "llm_model")?.value?.trim() ?? "";
    const storedKey = rows.find((r) => r.key === "llm_api_key")?.value?.trim() ?? "";
    const envKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
    const apiKey = storedKey || envKey || undefined;

    if (!baseUrl || !model) return res.status(400).json({ error: "llm_not_configured" });

    try {
      const r = await llmChatWithMeta(
        { baseUrl, model, apiKey },
        [
          {
            role: "system",
            content: '你是一个连通性测试助手。只输出 JSON：{"ok": true, "provider": string }',
          },
          { role: "user", content: "ping" },
        ],
      );
      return res.json({ ok: true, content: r.content, requestId: r.requestId, model: r.model, id: r.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown_error";
      return res.status(400).json({ error: "llm_call_failed", detail: msg });
    }
  });

  return r;
}
