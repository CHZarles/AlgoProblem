export type IngestFailureCode =
  | "need_cookie"
  | "anti_bot"
  | "timeout"
  | "empty"
  | "http_403"
  | "http_404"
  | "http_429"
  | "http_other"
  | "network"
  | "unknown";

function parseHttpStatus(message: string): number | null {
  // e.g. "抓取失败（403）" / "LeetCode 抓取失败（404）" / "AcWing 抓取失败（403）"
  const m = message.match(/（\s*(\d{3})\s*）/) ?? message.match(/\bHTTP\s+(\d{3})\b/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function hostnameFromUrl(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function classifyIngestError(
  err: unknown,
  ctx?: { url?: string; acwingCookie?: string },
): { code: IngestFailureCode; httpStatus?: number; detail: string } {
  const message = err instanceof Error ? err.message : String(err ?? "unknown_error");
  const name = err instanceof Error ? err.name : "";
  const lower = message.toLowerCase();
  const httpStatus = parseHttpStatus(message) ?? undefined;

  const host = ctx?.url ? hostnameFromUrl(ctx.url) : null;
  const isAcwing = host?.endsWith("acwing.com") ?? false;

  if (httpStatus) {
    if ((httpStatus === 401 || httpStatus === 403) && isAcwing && !ctx?.acwingCookie) {
      return { code: "need_cookie", httpStatus, detail: "抓取失败（需要 Cookie）" };
    }
    if (httpStatus === 403) return { code: "http_403", httpStatus, detail: "抓取失败（403）" };
    if (httpStatus === 404) return { code: "http_404", httpStatus, detail: "抓取失败（404）" };
    if (httpStatus === 429) return { code: "http_429", httpStatus, detail: "抓取失败（429）" };
    return { code: "http_other", httpStatus, detail: `抓取失败（${httpStatus}）` };
  }

  if (name === "AbortError" || lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return { code: "timeout", detail: "抓取失败（超时）" };
  }
  if (
    lower.includes("captcha") ||
    lower.includes("cloudflare") ||
    lower.includes("anti-bot") ||
    lower.includes("robot") ||
    message.includes("反爬") ||
    message.includes("验证码")
  ) {
    return { code: "anti_bot", detail: "抓取失败（可能被反爬/验证码）" };
  }
  if (lower.includes("题面为空") || lower.includes("空内容") || lower.includes("未找到内容区域") || lower.includes("解析为空")) {
    return { code: "empty", detail: "解析失败（内容为空）" };
  }
  if (lower.includes("fetch failed") || lower.includes("enotfound") || lower.includes("econnreset") || lower.includes("network")) {
    return { code: "network", detail: "抓取失败（网络错误）" };
  }

  return { code: "unknown", detail: message || "解析失败" };
}
