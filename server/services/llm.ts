import { z } from "zod";

export type LlmConfig = {
  baseUrl: string;
  model: string;
  apiKey?: string;
};

export type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

export type LlmChatResult = {
  content: string;
  requestId?: string;
  id?: string;
  model?: string;
};

class LlmHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`${message} (HTTP ${status})`);
    this.status = status;
    this.name = "LlmHttpError";
  }
}

function errorMessageFromPayload(json: unknown, fallbackText: string) {
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;

    const direct = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const path = direct(obj.path);

    const err = obj.error;
    if (direct(err)) return path ? `${direct(err)} path:${path}` : direct(err);
    if (err && typeof err === "object") {
      const eobj = err as Record<string, unknown>;
      const msg = direct(eobj.message) || direct(eobj.msg) || direct(eobj.detail);
      if (msg) return path ? `${msg} path:${path}` : msg;
      const code = direct(eobj.code);
      if (code) return `error_code:${code}`;
    }

    const msg = direct(obj.message) || direct(obj.msg) || direct(obj.detail);
    if (msg) return path ? `${msg} path:${path}` : msg;

    const code = direct(obj.code);
    if (code) return `error_code:${code}`;
  }

  const t = fallbackText.trim();
  if (!t) return null;
  return t.length > 260 ? `${t.slice(0, 260)}…` : t;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function chatCompletionsUrls(baseUrl: string) {
  const b = baseUrl.trim().replace(/\/+$/, "");
  if (!b) return [];
  if (b.endsWith("/chat/completions")) return [b];
  const urls = [`${b}/chat/completions`, `${b}/v1/chat/completions`];
  return Array.from(new Set(urls));
}

async function postChatCompletions(config: LlmConfig, body: unknown) {
  const urls = chatCompletionsUrls(config.baseUrl);
  if (!urls.length) throw new Error("invalid_base_url");

  let lastError: Error | null = null;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    let attempt = 0;
    while (attempt < 2) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 60_000);
      try {
        const resp = await fetch(url, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify(body),
        });

        const raw = await resp.text().catch(() => "");
        let json: unknown = null;
        try {
          json = raw ? (JSON.parse(raw) as unknown) : null;
        } catch {
          json = null;
        }

        if (!resp.ok && attempt === 0 && (resp.status === 429 || resp.status === 502 || resp.status === 503 || resp.status === 504)) {
          const retryAfter = Number(resp.headers.get("retry-after") ?? "");
          const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 900;
          await sleep(delay);
          attempt++;
          continue;
        }

        if (!resp.ok) {
          const message = errorMessageFromPayload(json, raw) ?? "llm_error";

          // If the user provided an API root (instead of the exact chat endpoint),
          // try the alternative path on "not found / method not allowed".
          if ((resp.status === 404 || resp.status === 405) && i < urls.length - 1) {
            lastError = new LlmHttpError(resp.status, message);
            break;
          }
          throw new LlmHttpError(resp.status, message);
        }
        if (!json) throw new Error("invalid_llm_response");
        return json;
      } catch (e) {
        const err = e instanceof Error ? e : new Error("llm_error");
        lastError = err;

        // Don't "retry" or try alternative endpoints for HTTP errors other than 404/405 (handled above).
        // Otherwise we may mask the real provider error (e.g. 429) as a misleading 404.
        if (err instanceof LlmHttpError) throw err;

        if (attempt < 1) {
          attempt++;
          continue;
        }
        throw err;
      } finally {
        clearTimeout(t);
      }
    }
  }

  throw lastError ?? new Error("llm_error");
}

function extractAssistantContent(payload: unknown) {
  const Schema = z.object({
    choices: z
      .array(
        z.object({
          message: z.object({ content: z.string().nullable().optional() }).optional(),
          text: z.string().optional(),
        }),
      )
      .min(1),
  });
  const parsed = Schema.parse(payload);
  const first = parsed.choices[0];
  return (first.message?.content ?? first.text ?? "").trim();
}

function extractMeta(payload: unknown): Pick<LlmChatResult, "requestId" | "id" | "model"> {
  const Schema = z
    .object({
      request_id: z.string().optional(),
      requestId: z.string().optional(),
      id: z.string().optional(),
      model: z.string().optional(),
    })
    .passthrough();
  const parsed = Schema.safeParse(payload);
  if (!parsed.success) return {};
  return {
    requestId: parsed.data.request_id ?? parsed.data.requestId,
    id: parsed.data.id,
    model: parsed.data.model,
  };
}

export async function llmChat(config: LlmConfig, messages: LlmMessage[]) {
  const r = await llmChatWithMeta(config, messages);
  return r.content;
}

export async function llmChatWithMeta(config: LlmConfig, messages: LlmMessage[]): Promise<LlmChatResult> {
  // Prefer JSON mode when supported; fallback to plain if unsupported.
  const baseBody = {
    model: config.model,
    temperature: 0.2,
    messages,
  };

  try {
    const json = await postChatCompletions(config, { ...baseBody, response_format: { type: "json_object" } });
    return { content: extractAssistantContent(json), ...extractMeta(json) };
  } catch (e) {
    // Don't attempt a second request on transient/provider errors (429/5xx/etc) — that only increases load
    // and can trigger rate/concurrency limits. Only fallback when JSON mode is rejected (commonly 400).
    if (e instanceof LlmHttpError && e.status !== 400) throw e;
    const json = await postChatCompletions(config, baseBody);
    return { content: extractAssistantContent(json), ...extractMeta(json) };
  }
}
