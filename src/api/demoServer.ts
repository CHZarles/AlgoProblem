import type { Activity, Collection, Note, Problem, Solution, WorkspaceDb } from "../types/model";
import { ApiError } from "./http";
import { ensureSeeded, withDb } from "../mock/store";
import { ingestProblems as mockIngestProblems, getStats as mockGetStats } from "../mock/api";

function nowIso() {
  return new Date().toISOString();
}

function uuid(prefix: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = (globalThis as any).crypto?.randomUUID?.() as string | undefined;
  return `${prefix}_${v ?? Math.random().toString(16).slice(2)}`;
}

function json(body?: BodyInit | null) {
  if (!body) return undefined;
  if (typeof body !== "string") return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

function pick<T extends object, K extends keyof T>(o: T, keys: K[]) {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = o[k];
  return out;
}

function bytesOfUtf8(s: string) {
  return new TextEncoder().encode(s).byteLength;
}

function addActivity(type: Activity["type"], payload: Omit<Activity, "id" | "type" | "at">) {
  withDb((db) => {
    db.activities.unshift({
      id: uuid("act"),
      type,
      at: nowIso(),
      ...payload,
    });
  });
}

function parseTagsParam(sp: URLSearchParams) {
  const raw = (sp.get("tags") ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function matchPath(pathname: string, pattern: RegExp) {
  const m = pathname.match(pattern);
  return m ? m.slice(1) : null;
}

export type DemoRequest = { path: string; init?: RequestInit };

export async function demoApiFetch<T>({ path, init }: DemoRequest): Promise<T> {
  ensureSeeded();
  const method = (init?.method ?? "GET").toUpperCase();
  const url = new URL(path.startsWith("/api") ? path : `/api${path}`, "https://demo.local");
  const pathname = url.pathname.replace(/^\/api/, "") || "/";
  const sp = url.searchParams;
  const body = json(init?.body ?? null);

  // search
  if (method === "GET" && pathname === "/search") {
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    return withDb((db) => {
      const match = (blob: string) => blob.toLowerCase().includes(q);
      const problems = q
        ? db.problems.filter((p) => match(`${p.title} ${p.externalId ?? ""} ${p.tags.join(" ")} ${p.markdown}`))
        : db.problems;
      const notes = q ? db.notes.filter((n) => match(`${n.title} ${n.tags.join(" ")} ${n.body}`)) : db.notes;
      const solutions = q ? db.solutions.filter((s) => match(`${s.title} ${s.language} ${s.version} ${s.body}`)) : db.solutions;
      return {
        problems: problems.slice(0, 20).map((p) => pick(p, ["id", "platform", "externalId", "canonicalUrl", "title", "tags"])),
        notes: notes.slice(0, 20).map((n) => pick(n, ["id", "kind", "problemIds", "title", "tags"])),
        solutions: solutions
          .slice(0, 20)
          .map((s) => pick(s, ["id", "problemId", "title", "language", "version", "status"])),
      };
    }) as unknown as T;
  }

  // problems list (paged)
  if (method === "GET" && pathname === "/problems") {
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const platform = sp.get("platform") ?? "all";
    const difficulty = sp.get("difficulty") ?? "all";
    const status = sp.get("status") ?? "all";
    const hasSolution = sp.get("hasSolution") ?? "all";
    const hasNotes = sp.get("hasNotes") ?? "all";
    const collectionId = sp.get("collectionId") ?? "all";
    const tags = parseTagsParam(sp);
    const limit = Number(sp.get("limit") ?? "50") || 50;
    const offset = Number(sp.get("offset") ?? "0") || 0;

    return withDb((db) => {
      const noteByProblem = new Set<string>();
      for (const n of db.notes) for (const pid of n.problemIds) noteByProblem.add(pid);
      const solutionByProblem = new Set(db.solutions.map((s) => s.problemId));

      const filtered = db.problems.filter((p) => {
        if (platform !== "all" && p.platform !== platform) return false;
        if (difficulty !== "all" && p.difficulty !== difficulty) return false;
        if (status !== "all" && p.status !== status) return false;
        if (hasSolution !== "all") {
          const v = solutionByProblem.has(p.id);
          if ((hasSolution === "true") !== v) return false;
        }
        if (hasNotes !== "all") {
          const v = noteByProblem.has(p.id);
          if ((hasNotes === "true") !== v) return false;
        }
        if (collectionId !== "all" && !p.collections.includes(collectionId)) return false;
        if (tags.length && !tags.every((t) => p.tags.includes(t))) return false;
        if (!q) return true;
        return `${p.title} ${p.externalId ?? ""} ${p.tags.join(" ")} ${p.markdown}`.toLowerCase().includes(q);
      });

      const total = filtered.length;
      const items = filtered
        .slice()
        .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))
        .slice(offset, offset + limit);
      return { items, total, limit, offset };
    }) as unknown as T;
  }

  if (method === "GET" && pathname === "/problems/tags") {
    const limit = Number(sp.get("limit") ?? "200") || 200;
    return withDb((db) => {
      const m = new Map<string, number>();
      for (const p of db.problems) for (const t of p.tags) m.set(t, (m.get(t) ?? 0) + 1);
      const tags = Array.from(m.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
        .slice(0, limit);
      return { tags };
    }) as unknown as T;
  }

  if (method === "GET" && pathname === "/problems/platforms") {
    const limit = Number(sp.get("limit") ?? "200") || 200;
    return withDb((db) => {
      const m = new Map<string, number>();
      for (const p of db.problems) m.set(p.platform, (m.get(p.platform) ?? 0) + 1);
      const platforms = Array.from(m.entries())
        .map(([platform, count]) => ({ platform, count }))
        .sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform))
        .slice(0, limit);
      return { platforms };
    }) as unknown as T;
  }

  if (method === "POST" && pathname === "/problems/ingest") {
    const urls = Array.isArray((body as any)?.urls) ? ((body as any).urls as string[]) : [];
    const results = await mockIngestProblems(urls);
    return { results: results.map((r) => (r.ok ? { url: r.url, ok: true as const, problem: r.problem } : { url: r.url, ok: false as const, error: r.error })) } as unknown as T;
  }

  if (method === "POST" && pathname === "/problems/manual") {
    const title = String((body as any)?.title ?? "").trim();
    const markdown = String((body as any)?.markdown ?? "").trim();
    const sourceUrl = String((body as any)?.sourceUrl ?? "").trim();
    if (!title || !markdown) throw new ApiError("invalid_request", 400);
    const ts = nowIso();
    const problem: Problem = {
      id: uuid("p"),
      platform: sourceUrl ? new URL(sourceUrl).hostname : "manual",
      canonicalUrl: sourceUrl ? `url:${sourceUrl}` : `manual:${title}`,
      sourceUrl: sourceUrl || `manual:${title}`,
      title,
      difficulty: "unknown",
      status: "todo",
      tags: [],
      collections: [],
      markdown,
      createdAt: ts,
      updatedAt: ts,
      lastActivityAt: ts,
    };
    withDb((db) => {
      db.problems.unshift(problem);
      db.activities.unshift({ id: uuid("act"), type: "problem_created", at: ts, problemId: problem.id });
    });
    return { ok: true, problem, warnings: [] } as unknown as T;
  }

  const mProblem = matchPath(pathname, /^\/problems\/([^/]+)$/);
  if (method === "GET" && mProblem) {
    const id = mProblem[0];
    const payload = withDb((db) => {
      const problem = db.problems.find((p) => p.id === id) ?? null;
      if (!problem) return null;
      const notes = db.notes.filter((n) => n.problemIds.includes(id)).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const solutions = db.solutions.filter((s) => s.problemId === id).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      const activities = db.activities.filter((a) => a.problemId === id).slice(0, 200);
      const collections = db.collections.filter((c) => c.problemIds.includes(id));
      return { problem, notes, solutions, activities, collections };
    });
    if (!payload) throw new ApiError("not_found", 404);
    return payload as unknown as T;
  }

  if (method === "PATCH" && mProblem) {
    const id = mProblem[0];
    const patch = (body ?? {}) as any;
    withDb((db) => {
      const p = db.problems.find((x) => x.id === id);
      if (!p) throw new ApiError("not_found", 404);
      if (typeof patch.title === "string") p.title = patch.title;
      if (typeof patch.platform === "string") p.platform = patch.platform;
      if (typeof patch.difficulty === "string") p.difficulty = patch.difficulty;
      if (Array.isArray(patch.tags)) p.tags = patch.tags.map((t: any) => String(t).trim()).filter(Boolean);
      if (typeof patch.markdown === "string") p.markdown = patch.markdown;
      if (patch.difficultyScore === null) delete (p as any).difficultyScore;
      if (typeof patch.difficultyScore === "number") (p as any).difficultyScore = patch.difficultyScore;
      p.updatedAt = nowIso();
      p.lastActivityAt = p.updatedAt;
    });
    return { ok: true } as unknown as T;
  }

  if (method === "DELETE" && mProblem) {
    const id = mProblem[0];
    withDb((db) => {
      const idx = db.problems.findIndex((p) => p.id === id);
      if (idx === -1) throw new ApiError("not_found", 404);
      db.problems.splice(idx, 1);
      for (const n of db.notes) n.problemIds = n.problemIds.filter((x) => x !== id);
      db.solutions = db.solutions.filter((s) => s.problemId !== id);
      db.collections = db.collections.map((c) => ({ ...c, problemIds: c.problemIds.filter((x) => x !== id) }));
      db.activities.unshift({ id: uuid("act"), type: "problem_completed", at: nowIso(), problemId: id });
    });
    return { ok: true } as unknown as T;
  }

  const mStatus = matchPath(pathname, /^\/problems\/([^/]+)\/status$/);
  if (method === "POST" && mStatus) {
    const id = mStatus[0];
    const status = String((body as any)?.status ?? "");
    withDb((db) => {
      const p = db.problems.find((x) => x.id === id);
      if (!p) throw new ApiError("not_found", 404);
      p.status = status as any;
      p.updatedAt = nowIso();
      p.lastActivityAt = p.updatedAt;
      if (status === "done") {
        p.completedAt = p.updatedAt;
        addActivity("problem_completed", { problemId: id });
      }
    });
    return { ok: true } as unknown as T;
  }

  // notes list
  if (method === "GET" && pathname === "/notes") {
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const kind = sp.get("kind") ?? "all";
    const problemId = (sp.get("problemId") ?? "").trim();
    return withDb((db) => {
      const out = db.notes
        .filter((n) => (kind === "all" ? true : n.kind === kind))
        .filter((n) => (problemId ? n.problemIds.includes(problemId) : true))
        .filter((n) => {
          if (!q) return true;
          return `${n.title} ${n.tags.join(" ")} ${n.body}`.toLowerCase().includes(q);
        })
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return out;
    }) as unknown as T;
  }

  if (method === "POST" && pathname === "/notes") {
    const kind = String((body as any)?.kind ?? "knowledge");
    const title = String((body as any)?.title ?? "").trim();
    const content = String((body as any)?.body ?? "");
    const tags = Array.isArray((body as any)?.tags) ? ((body as any).tags as any[]).map((x) => String(x)) : [];
    const problemIds = Array.isArray((body as any)?.problemIds)
      ? ((body as any).problemIds as any[]).map((x) => String(x))
      : (body as any)?.problemId
        ? [String((body as any).problemId)]
        : [];
    if (!title) throw new ApiError("invalid_request", 400);
    const ts = nowIso();
    const id = uuid("n");
    withDb((db) => {
      const note: Note = { id, kind: kind as any, title, body: content, tags, problemIds, createdAt: ts, updatedAt: ts };
      db.notes.unshift(note);
      addActivity("note_created", { problemId: problemIds[0], objectId: id });
    });
    return { id } as unknown as T;
  }

  const mNote = matchPath(pathname, /^\/notes\/([^/]+)$/);
  if (method === "GET" && mNote) {
    const id = mNote[0];
    return withDb((db) => {
      const note = db.notes.find((n) => n.id === id);
      if (!note) throw new ApiError("not_found", 404);
      const problems = db.problems
        .filter((p) => note.problemIds.includes(p.id))
        .map((p) => pick(p, ["id", "platform", "canonicalUrl", "externalId", "title", "difficulty", "status", "tags"]));
      return { note, problems };
    }) as unknown as T;
  }

  if (method === "PATCH" && mNote) {
    const id = mNote[0];
    withDb((db) => {
      const note = db.notes.find((n) => n.id === id);
      if (!note) throw new ApiError("not_found", 404);
      const patch = (body ?? {}) as any;
      if (typeof patch.title === "string") note.title = patch.title;
      if (typeof patch.body === "string") note.body = patch.body;
      if (Array.isArray(patch.tags)) note.tags = patch.tags.map((x: any) => String(x).trim()).filter(Boolean);
      note.updatedAt = nowIso();
      addActivity("note_updated", { problemId: note.problemIds[0], objectId: id });
    });
    return { ok: true } as unknown as T;
  }

  if (method === "DELETE" && mNote) {
    const id = mNote[0];
    withDb((db) => {
      const idx = db.notes.findIndex((n) => n.id === id);
      if (idx === -1) throw new ApiError("not_found", 404);
      const deleted = db.notes[idx];
      db.notes.splice(idx, 1);
      addActivity("note_deleted", { problemId: deleted.problemIds[0], objectId: id });
    });
    return { ok: true } as unknown as T;
  }

  const mNoteLink = matchPath(pathname, /^\/notes\/([^/]+)\/links$/);
  if (method === "POST" && mNoteLink) {
    const id = mNoteLink[0];
    const problemIds = Array.isArray((body as any)?.problemIds)
      ? ((body as any).problemIds as any[]).map((x) => String(x))
      : (body as any)?.problemId
        ? [String((body as any).problemId)]
        : [];
    withDb((db) => {
      const note = db.notes.find((n) => n.id === id);
      if (!note) throw new ApiError("not_found", 404);
      for (const pid of problemIds) if (!note.problemIds.includes(pid)) note.problemIds.push(pid);
      note.updatedAt = nowIso();
      addActivity("note_linked", { problemId: problemIds[0], objectId: id });
    });
    return { ok: true } as unknown as T;
  }

  const mNoteUnlink = matchPath(pathname, /^\/notes\/([^/]+)\/links\/([^/]+)$/);
  if (method === "DELETE" && mNoteUnlink) {
    const noteId = mNoteUnlink[0];
    const problemId = mNoteUnlink[1];
    withDb((db) => {
      const note = db.notes.find((n) => n.id === noteId);
      if (!note) throw new ApiError("not_found", 404);
      note.problemIds = note.problemIds.filter((x) => x !== problemId);
      note.updatedAt = nowIso();
      addActivity("note_unlinked", { problemId, objectId: noteId });
    });
    return { ok: true } as unknown as T;
  }

  // solutions
  if (method === "GET" && pathname === "/solutions") {
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const language = sp.get("language") ?? "all";
    const status = sp.get("status") ?? "all";
    return withDb((db) => {
      const out = db.solutions
        .filter((s) => (language === "all" ? true : s.language === language))
        .filter((s) => (status === "all" ? true : s.status === status))
        .filter((s) => {
          if (!q) return true;
          return `${s.title} ${s.language} ${s.version} ${s.body}`.toLowerCase().includes(q);
        })
        .slice()
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return out;
    }) as unknown as T;
  }

  if (method === "POST" && pathname === "/solutions") {
    const input = body as any;
    const ts = nowIso();
    const s: Solution = {
      id: uuid("s"),
      problemId: String(input.problemId),
      title: String(input.title ?? "题解").trim() || "题解",
      language: String(input.language ?? "cpp"),
      version: (input.version ?? "first") as any,
      status: (input.status ?? "draft") as any,
      timeComplexity: input.timeComplexity ?? undefined,
      spaceComplexity: input.spaceComplexity ?? undefined,
      body: String(input.body ?? ""),
      createdAt: ts,
      updatedAt: ts,
    };
    withDb((db) => {
      db.solutions.unshift(s);
      addActivity("solution_created", { problemId: s.problemId, objectId: s.id });
    });
    return { id: s.id } as unknown as T;
  }

  const mSolution = matchPath(pathname, /^\/solutions\/([^/]+)$/);
  if (method === "PATCH" && mSolution) {
    const id = mSolution[0];
    const patch = (body ?? {}) as any;
    withDb((db) => {
      const s = db.solutions.find((x) => x.id === id);
      if (!s) throw new ApiError("not_found", 404);
      if (typeof patch.title === "string") s.title = patch.title;
      if (typeof patch.language === "string") s.language = patch.language;
      if (typeof patch.version === "string") s.version = patch.version;
      if (typeof patch.status === "string") s.status = patch.status;
      if (typeof patch.timeComplexity === "string" || patch.timeComplexity === null) s.timeComplexity = patch.timeComplexity ?? undefined;
      if (typeof patch.spaceComplexity === "string" || patch.spaceComplexity === null) s.spaceComplexity = patch.spaceComplexity ?? undefined;
      if (typeof patch.body === "string") s.body = patch.body;
      s.updatedAt = nowIso();
      addActivity("solution_updated", { problemId: s.problemId, objectId: s.id });
    });
    return { ok: true } as unknown as T;
  }

  if (method === "DELETE" && mSolution) {
    const id = mSolution[0];
    withDb((db) => {
      const idx = db.solutions.findIndex((s) => s.id === id);
      if (idx === -1) throw new ApiError("not_found", 404);
      const s = db.solutions[idx];
      db.solutions.splice(idx, 1);
      addActivity("solution_deleted", { problemId: s.problemId, objectId: id });
    });
    return { ok: true } as unknown as T;
  }

  // collections
  if (method === "GET" && pathname === "/collections") {
    return withDb((db) => db.collections.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) as unknown as T;
  }

  const mCollection = matchPath(pathname, /^\/collections\/([^/]+)$/);
  if (method === "GET" && mCollection) {
    const id = mCollection[0];
    const c = withDb((db) => db.collections.find((x) => x.id === id) ?? null);
    if (!c) throw new ApiError("not_found", 404);
    return c as unknown as T;
  }

  if (method === "POST" && pathname === "/collections") {
    const name = String((body as any)?.name ?? "").trim();
    if (!name) throw new ApiError("invalid_request", 400);
    const ts = nowIso();
    const c: Collection = {
      id: uuid("col"),
      name,
      description: (body as any)?.description ?? undefined,
      planDueAt: (body as any)?.planDueAt ?? undefined,
      planGoalProblemsWeek: (body as any)?.planGoalProblemsWeek ?? undefined,
      planGoalPublishesWeek: (body as any)?.planGoalPublishesWeek ?? undefined,
      problemIds: [],
      createdAt: ts,
      updatedAt: ts,
    };
    withDb((db) => db.collections.unshift(c));
    return { id: c.id } as unknown as T;
  }

  if (method === "PATCH" && mCollection) {
    const id = mCollection[0];
    withDb((db) => {
      const c = db.collections.find((x) => x.id === id);
      if (!c) throw new ApiError("not_found", 404);
      const patch = (body ?? {}) as any;
      if (typeof patch.name === "string") c.name = patch.name;
      if (typeof patch.description === "string" || patch.description === null) c.description = patch.description ?? undefined;
      if (typeof patch.planGoalProblemsWeek === "number" || patch.planGoalProblemsWeek === null) c.planGoalProblemsWeek = patch.planGoalProblemsWeek ?? undefined;
      if (typeof patch.planGoalPublishesWeek === "number" || patch.planGoalPublishesWeek === null) c.planGoalPublishesWeek = patch.planGoalPublishesWeek ?? undefined;
      if (typeof patch.planDueAt === "string" || patch.planDueAt === null) c.planDueAt = patch.planDueAt ?? undefined;
      c.updatedAt = nowIso();
    });
    return { ok: true } as unknown as T;
  }

  if (method === "DELETE" && mCollection) {
    const id = mCollection[0];
    withDb((db) => {
      const idx = db.collections.findIndex((c) => c.id === id);
      if (idx === -1) throw new ApiError("not_found", 404);
      db.collections.splice(idx, 1);
      for (const p of db.problems) p.collections = p.collections.filter((x) => x !== id);
    });
    return { ok: true } as unknown as T;
  }

  const mAddToCol = matchPath(pathname, /^\/collections\/([^/]+)\/problems$/);
  if (method === "POST" && mAddToCol) {
    const colId = mAddToCol[0];
    const problemId = String((body as any)?.problemId ?? "");
    withDb((db) => {
      const c = db.collections.find((x) => x.id === colId);
      const p = db.problems.find((x) => x.id === problemId);
      if (!c || !p) throw new ApiError("not_found", 404);
      if (!c.problemIds.includes(problemId)) c.problemIds.push(problemId);
      if (!p.collections.includes(colId)) p.collections.push(colId);
      c.updatedAt = nowIso();
      p.updatedAt = nowIso();
      p.lastActivityAt = p.updatedAt;
    });
    return { ok: true } as unknown as T;
  }

  const mRemoveFromCol = matchPath(pathname, /^\/collections\/([^/]+)\/problems\/([^/]+)$/);
  if (method === "DELETE" && mRemoveFromCol) {
    const colId = mRemoveFromCol[0];
    const problemId = mRemoveFromCol[1];
    withDb((db) => {
      const c = db.collections.find((x) => x.id === colId);
      const p = db.problems.find((x) => x.id === problemId);
      if (!c || !p) throw new ApiError("not_found", 404);
      c.problemIds = c.problemIds.filter((x) => x !== problemId);
      p.collections = p.collections.filter((x) => x !== colId);
      c.updatedAt = nowIso();
      p.updatedAt = nowIso();
      p.lastActivityAt = p.updatedAt;
    });
    return { ok: true } as unknown as T;
  }

  const mReorderCol = matchPath(pathname, /^\/collections\/([^/]+)\/reorder$/);
  if (method === "POST" && mReorderCol) {
    const colId = mReorderCol[0];
    const problemIds = Array.isArray((body as any)?.problemIds) ? ((body as any).problemIds as any[]).map((x) => String(x)) : [];
    withDb((db) => {
      const c = db.collections.find((x) => x.id === colId);
      if (!c) throw new ApiError("not_found", 404);
      c.problemIds = problemIds;
      c.updatedAt = nowIso();
    });
    return { ok: true } as unknown as T;
  }

  const mPlan = matchPath(pathname, /^\/collections\/([^/]+)\/plan$/);
  if (method === "GET" && mPlan) {
    const colId = mPlan[0];
    return withDb((db) => {
      const c = db.collections.find((x) => x.id === colId);
      if (!c) throw new ApiError("not_found", 404);
      const tasks = c.problemIds.map((pid) => db.problems.find((p) => p.id === pid)).filter(Boolean) as Problem[];
      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
      return {
        collectionId: colId,
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        dueAt: c.planDueAt,
        goalProblemsWeek: c.planGoalProblemsWeek ?? 0,
        goalPublishesWeek: c.planGoalPublishesWeek ?? 0,
        doneProblemsThisWeek: 0,
        publishedSolutionsThisWeek: 0,
        daysRemaining: 7,
        solveTargetToday: 0,
        publishTargetToday: 0,
        tasks: {
          solve: tasks.map((p) => ({ ...pick(p, ["id", "title", "platform", "canonicalUrl", "externalId", "difficulty", "status", "tags"]), completedAt: p.completedAt, hasPublishedSolution: db.solutions.some((s) => s.problemId === p.id && s.status === "done") })),
          publish: tasks.map((p) => ({ ...pick(p, ["id", "title", "platform", "canonicalUrl", "externalId", "difficulty", "status", "tags"]), completedAt: undefined, hasPublishedSolution: db.solutions.some((s) => s.problemId === p.id && s.status === "done") })),
        },
      };
    }) as unknown as T;
  }

  // stats
  if (method === "GET" && pathname === "/stats") {
    const stats = mockGetStats();
    const snapshot = withDb((db) => db);
    const jsonText = JSON.stringify(snapshot);
    const dataBytes = bytesOfUtf8(jsonText);
    const reviewsTotal = stats.activities.filter((a: Activity) => a.type === "review_completed").length;
    const publishesTotal = stats.activities.filter((a: Activity) => a.type === "solution_published").length;
    const last30 = stats.activities.filter((a: Activity) => Date.now() - new Date(a.at).getTime() <= 30 * 86400000);
    const reviewsLast30 = last30.filter((a: Activity) => a.type === "review_completed").length;
    const publishesLast30 = last30.filter((a: Activity) => a.type === "solution_published").length;
    return {
      dataBytes,
      problemsTotal: stats.problems.length,
      notesTotal: snapshot.notes.length,
      solutionsTotal: snapshot.solutions.length,
      problemsDone: stats.problemsDone,
      solutionsDone: stats.solutionsDone,
      last30Activities: stats.last30Activities,
      reviewsLast30,
      publishesLast30,
      reviewsTotal,
      publishesTotal,
      activities: stats.activities,
    } as unknown as T;
  }

  // settings
  if (method === "GET" && pathname === "/settings") {
    const raw = localStorage.getItem("algoproblem.demo.settings") ?? "{}";
    const s = JSON.parse(raw) as any;
    return {
      llmBaseUrl: s.llmBaseUrl ?? "",
      llmModel: s.llmModel ?? "",
      llmApiKeySet: Boolean(s.llmApiKey),
      llmApiKeyLast4: s.llmApiKey ? String(s.llmApiKey).slice(-4) : undefined,
      acwingCookieSet: Boolean(s.acwingCookie),
      acwingCookieLast4: s.acwingCookie ? String(s.acwingCookie).slice(-4) : undefined,
      workspaceLastBackupAt: s.workspaceLastBackupAt,
    } as unknown as T;
  }

  if (method === "PATCH" && pathname === "/settings") {
    const raw = localStorage.getItem("algoproblem.demo.settings") ?? "{}";
    const s = JSON.parse(raw) as any;
    const patch = (body ?? {}) as any;
    if (typeof patch.llmBaseUrl === "string") s.llmBaseUrl = patch.llmBaseUrl;
    if (typeof patch.llmModel === "string") s.llmModel = patch.llmModel;
    if (typeof patch.llmApiKey === "string") s.llmApiKey = patch.llmApiKey;
    if (typeof patch.acwingCookie === "string") s.acwingCookie = patch.acwingCookie;
    localStorage.setItem("algoproblem.demo.settings", JSON.stringify(s));
    return { ok: true } as unknown as T;
  }

  if (method === "POST" && (pathname === "/settings/test-llm" || pathname === "/settings/test-acwing")) {
    return { ok: true, content: "demo_ok" } as unknown as T;
  }

  // workspace import/export
  if (method === "POST" && pathname === "/workspace/import") {
    const payload = body as WorkspaceDb;
    if (!payload || typeof payload !== "object") throw new ApiError("invalid_request", 400);
    withDb((db) => {
      db.problems = Array.isArray(payload.problems) ? payload.problems : [];
      db.notes = Array.isArray(payload.notes) ? payload.notes : [];
      db.solutions = Array.isArray(payload.solutions) ? payload.solutions : [];
      db.collections = Array.isArray(payload.collections) ? payload.collections : [];
      db.activities = Array.isArray(payload.activities) ? payload.activities : [];
    });
    return {
      ok: true,
      imported: {
        problems: Array.isArray(payload.problems) ? payload.problems.length : 0,
        notes: Array.isArray(payload.notes) ? payload.notes.length : 0,
        solutions: Array.isArray(payload.solutions) ? payload.solutions.length : 0,
        collections: Array.isArray(payload.collections) ? payload.collections.length : 0,
      },
    } as unknown as T;
  }

  throw new ApiError("not_found", 404);
}

export async function demoApiFetchBlob({ path }: DemoRequest): Promise<Blob> {
  ensureSeeded();
  const url = new URL(path.startsWith("/api") ? path : `/api${path}`, "https://demo.local");
  const pathname = url.pathname.replace(/^\/api/, "") || "/";
  if (pathname !== "/workspace/export") throw new ApiError("not_found", 404);
  const snapshot = withDb((db) => db);
  return new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
}

