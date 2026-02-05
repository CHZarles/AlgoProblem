import express, { Router } from "express";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import type { WorkspaceRequest } from "../http";
import { requireWorkspace } from "../http";
import { env } from "../env";

type CachedImageMeta = {
  version: 1;
  url: string;
  contentType: string;
  filename: string;
  createdAt: string;
};

const inFlight = new Map<string, Promise<CachedImageMeta>>();

function queryString(v: unknown) {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function sha256HexBytes(input: Buffer) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function extFromContentType(raw: string) {
  const ct = raw.split(";")[0]?.trim().toLowerCase() ?? "";
  if (ct === "image/png") return "png";
  if (ct === "image/jpeg") return "jpg";
  if (ct === "image/jpg") return "jpg";
  if (ct === "image/gif") return "gif";
  if (ct === "image/webp") return "webp";
  if (ct === "image/avif") return "avif";
  if (ct === "image/svg+xml") return "svg";
  if (ct === "image/bmp") return "bmp";
  if (ct === "image/x-icon") return "ico";
  return "bin";
}

function sniffImageContentType(bytes: Buffer): string | null {
  if (bytes.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png";
    }

    // GIF: GIF87a / GIF89a
    const gifSig = bytes.subarray(0, 6).toString("ascii");
    if (gifSig === "GIF87a" || gifSig === "GIF89a") return "image/gif";
  }

  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";

  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  // BMP: BM
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";

  // ICO/CUR: 00 00 01 00 / 00 00 02 00
  if (bytes.length >= 4 && bytes[0] === 0x00 && bytes[1] === 0x00 && (bytes[2] === 0x01 || bytes[2] === 0x02) && bytes[3] === 0x00) {
    return "image/x-icon";
  }

  // SVG: best-effort sniff (clipboard might provide text/xml or octet-stream)
  try {
    const head = bytes.subarray(0, 512).toString("utf8").trimStart();
    if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  } catch {
    // ignore
  }

  return null;
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((x) => !Number.isFinite(x))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isPrivateIpv6(ip: string) {
  const v = ip.toLowerCase();
  if (v === "::1") return true;
  if (v === "::") return true;
  if (v.startsWith("fe80:")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  return false;
}

async function isPrivateHost(hostname: string) {
  const h = hostname.trim().toLowerCase();
  if (!h) return true;
  if (h === "localhost") return true;

  const ipKind = net.isIP(h);
  if (ipKind === 4) return isPrivateIpv4(h);
  if (ipKind === 6) return isPrivateIpv6(h);

  try {
    const addrs = await dns.lookup(h, { all: true });
    if (!addrs.length) return true;
    // Block if ALL resolved IPs are private/local.
    return addrs.every((a) => (net.isIP(a.address) === 6 ? isPrivateIpv6(a.address) : isPrivateIpv4(a.address)));
  } catch {
    return true;
  }
}

function requestBinary(url: URL, referer?: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; data: Buffer }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          accept: "image/*,*/*;q=0.8",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "accept-encoding": "identity",
          // Some CDNs block requests without UA.
          "user-agent": "AlgoWorkspace/1.0",
          ...(referer ? { referer, origin: new URL(referer).origin } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, data: Buffer.concat(chunks) }));
      },
    );

    req.setTimeout(20_000, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function downloadImage(url: URL, referer?: string) {
  let current = url;
  for (let i = 0; i < 4; i++) {
    const r = await requestBinary(current, referer);
    const location = typeof r.headers.location === "string" ? r.headers.location : "";
    if ([301, 302, 303, 307, 308].includes(r.status) && location) {
      current = new URL(location, current);
      continue;
    }

    const contentType = String(r.headers["content-type"] ?? "").trim();
    const bytes = r.data;

    if (r.status < 200 || r.status >= 300) {
      throw new Error(`upstream_${r.status || "error"}`);
    }
    if (!bytes.length) throw new Error("empty");
    if (bytes.length > 10 * 1024 * 1024) throw new Error("too_large");
    if (!contentType.toLowerCase().startsWith("image/")) throw new Error("not_image");
    return { contentType, bytes };
  }
  throw new Error("too_many_redirects");
}

function assetsRootDir(workspaceId: string) {
  const e = env();
  const dataDir = path.resolve(path.dirname(e.DATABASE_PATH));
  return path.join(dataDir, "assets", "images", workspaceId);
}

function contentTypeFromExt(ext: string) {
  const e = ext.trim().toLowerCase();
  if (e === "png") return "image/png";
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "gif") return "image/gif";
  if (e === "webp") return "image/webp";
  if (e === "avif") return "image/avif";
  if (e === "svg") return "image/svg+xml";
  if (e === "bmp") return "image/bmp";
  if (e === "ico") return "image/x-icon";
  return "application/octet-stream";
}

export function assetsRoutes() {
  const r = Router();
  r.use(requireWorkspace);

  r.post(
    "/paste",
    express.raw({
      type: () => true,
      limit: "10mb",
    }),
    (req, res) => {
      const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
      const bytes = req.body;
      if (!Buffer.isBuffer(bytes)) return res.status(400).json({ error: "invalid_body" });
      if (!bytes.length) return res.status(400).json({ error: "empty" });

      let contentType = String(req.headers["content-type"] ?? "").trim().toLowerCase();
      if (!contentType.startsWith("image/")) {
        const sniffed = sniffImageContentType(bytes);
        if (!sniffed) return res.status(400).json({ error: "invalid_content_type" });
        contentType = sniffed;
      }

      const dir = assetsRootDir(workspaceId);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const ext = extFromContentType(contentType);
      const hash = sha256HexBytes(bytes);
      const key = `p-${hash}`;
      const filename = `${key}.${ext}`;
      const filePath = path.join(dir, filename);
      if (!fs.existsSync(filePath)) {
        const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
        fs.writeFileSync(tmpPath, bytes);
        fs.renameSync(tmpPath, filePath);
      }
      return res.json({ ok: true, filename, url: `/api/assets/local/${filename}` });
    },
  );

  r.get("/local/:filename", (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const filename = String(req.params.filename ?? "").trim();
    if (!/^p-[a-f0-9]{64}\.[a-z0-9]{1,8}$/i.test(filename)) return res.status(400).json({ error: "invalid_filename" });

    const dir = assetsRootDir(workspaceId);
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: "not_found" });

    const ext = filename.split(".").pop() ?? "";
    res.setHeader("content-type", contentTypeFromExt(ext));
    res.setHeader("cache-control", "public, max-age=31536000, immutable");
    fs.createReadStream(filePath)
      .on("error", () => {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      })
      .pipe(res);
  });

  r.get("/proxy", async (req, res) => {
    const workspaceId = (req as unknown as WorkspaceRequest).workspaceId;
    const rawUrl = queryString(req.query.url);
    const referer = queryString(req.query.referer) || undefined;
    if (!rawUrl || rawUrl.length > 4096) return res.status(400).json({ error: "invalid_url" });

    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: "invalid_url" });
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") return res.status(400).json({ error: "invalid_url" });
    if (await isPrivateHost(url.hostname)) return res.status(400).json({ error: "blocked_host" });

    const dir = assetsRootDir(workspaceId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const key = sha256Hex(url.toString());
    const metaPath = path.join(dir, `${key}.json`);

    const serveFile = (meta: CachedImageMeta) => {
      const filePath = path.join(dir, meta.filename);
      if (!fs.existsSync(filePath)) return false;

      res.setHeader("content-type", meta.contentType || "application/octet-stream");
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
      res.setHeader("etag", `W/"${key}"`);
      fs.createReadStream(filePath)
        .on("error", () => {
          if (!res.headersSent) res.status(500).end();
          else res.end();
        })
        .pipe(res);
      return true;
    };

    // Serve from cache when possible.
    try {
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as CachedImageMeta;
        if (meta && meta.version === 1 && meta.filename && meta.contentType) {
          if (serveFile(meta)) return;
        }
      }
    } catch {
      // ignore cache read errors and refetch
    }

    // Deduplicate concurrent fetches per image key.
    if (!inFlight.has(key)) {
      inFlight.set(
        key,
        (async () => {
          const downloaded = await downloadImage(url, referer);
          const ext = extFromContentType(downloaded.contentType);
          const filename = `${key}.${ext}`;
          const filePath = path.join(dir, filename);
          const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
          fs.writeFileSync(tmpPath, downloaded.bytes);
          fs.renameSync(tmpPath, filePath);

          const meta: CachedImageMeta = {
            version: 1,
            url: url.toString(),
            contentType: downloaded.contentType,
            filename,
            createdAt: new Date().toISOString(),
          };
          fs.writeFileSync(metaPath, JSON.stringify(meta));
          return meta;
        })().finally(() => {
          inFlight.delete(key);
        }),
      );
    }

    try {
      const meta = await inFlight.get(key)!;
      if (!serveFile(meta)) return res.status(404).json({ error: "not_found" });
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "download_failed";
      return res.status(502).json({ error: "download_failed", message: msg });
    }
  });

  return r;
}
