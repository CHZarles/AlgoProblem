export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function errorFromBody(body: unknown): string {
  if (!body || typeof body !== "object") return "api_error";
  if (!("error" in body)) return "api_error";
  const v = (body as { error?: unknown }).error;
  return typeof v === "string" && v ? v : "api_error";
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const contentType = resp.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await resp.json().catch(() => undefined) : await resp.text().catch(() => undefined);

  if (!resp.ok) {
    throw new ApiError(errorFromBody(body), resp.status, body);
  }
  return body as T;
}

export async function apiFetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const resp = await fetch(path.startsWith("/api") ? path : `/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers ?? {}),
    },
  });

  if (!resp.ok) {
    const contentType = resp.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? await resp.json().catch(() => undefined) : await resp.text().catch(() => undefined);
    throw new ApiError(errorFromBody(body), resp.status, body);
  }
  return resp.blob();
}
