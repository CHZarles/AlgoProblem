import type { Activity, Collection, Note, Problem, Solution } from "../types/model";
import { apiFetch } from "./http";

export type SearchResult = {
  problems: Array<Pick<Problem, "id" | "platform" | "externalId" | "canonicalUrl" | "title" | "tags">>;
  notes: Array<Pick<Note, "id" | "kind" | "problemId" | "title" | "tags">>;
  solutions: Array<Pick<Solution, "id" | "problemId" | "title" | "language" | "version" | "status">>;
};

export async function searchAll(q: string): Promise<SearchResult> {
  const sp = new URLSearchParams();
  sp.set("q", q);
  return apiFetch(`/search?${sp.toString()}`);
}

export async function listProblems(params: {
  q?: string;
  platform?: string;
  difficulty?: string;
  status?: string;
  hasSolution?: "all" | boolean;
  hasNotes?: "all" | boolean;
  collectionId?: "all" | string;
  tags?: string[];
}): Promise<Problem[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  sp.set("platform", params.platform ?? "all");
  sp.set("difficulty", params.difficulty ?? "all");
  sp.set("status", params.status ?? "all");
  if (params.hasSolution === true) sp.set("hasSolution", "true");
  if (params.hasSolution === false) sp.set("hasSolution", "false");
  if (params.hasSolution === "all" || params.hasSolution === undefined) sp.set("hasSolution", "all");
  if (params.hasNotes === true) sp.set("hasNotes", "true");
  if (params.hasNotes === false) sp.set("hasNotes", "false");
  if (params.hasNotes === "all" || params.hasNotes === undefined) sp.set("hasNotes", "all");
  if (params.collectionId && params.collectionId !== "all") sp.set("collectionId", params.collectionId);
  if (params.collectionId === "all" || params.collectionId === undefined) sp.set("collectionId", "all");
  if (params.tags?.length) sp.set("tags", params.tags.join(","));
  return apiFetch(`/problems?${sp.toString()}`);
}

export async function listProblemTags(limit?: number): Promise<{ tags: Array<{ tag: string; count: number }> }> {
  const sp = new URLSearchParams();
  if (limit) sp.set("limit", String(limit));
  return apiFetch(`/problems/tags?${sp.toString()}`);
}

export async function listProblemPlatforms(
  limit?: number,
): Promise<{ platforms: Array<{ platform: string; count: number }> }> {
  const sp = new URLSearchParams();
  if (limit) sp.set("limit", String(limit));
  return apiFetch(`/problems/platforms?${sp.toString()}`);
}

export async function ingestProblems(urls: string[]) {
  return apiFetch<{ results: Array<{ url: string; ok: boolean; problem?: Problem; warnings?: string[]; error?: string }> }>(
    "/problems/ingest",
    { method: "POST", body: JSON.stringify({ urls }) },
  );
}

export async function getProblem(problemId: string) {
  return apiFetch<{
    problem: Problem;
    notes: Note[];
    solutions: Solution[];
    activities: Activity[];
    collections: Collection[];
  }>(`/problems/${problemId}`);
}

export async function getProblemRelated(problemId: string): Promise<{
  similar: Array<
    Pick<Problem, "id" | "platform" | "canonicalUrl" | "externalId" | "title" | "difficulty" | "status" | "tags"> & {
      score: number;
    }
  >;
  classicPrev: (Pick<Problem, "id" | "platform" | "canonicalUrl" | "externalId" | "title" | "difficulty" | "status" | "tags">) | null;
  classicNext: (Pick<Problem, "id" | "platform" | "canonicalUrl" | "externalId" | "title" | "difficulty" | "status" | "tags">) | null;
}> {
  return apiFetch(`/problems/${problemId}/related`);
}

export async function setClassicNext(problemId: string, nextProblemId: string | null) {
  return apiFetch<{ ok: true }>(`/problems/${problemId}/classic-next`, {
    method: "POST",
    body: JSON.stringify({ nextProblemId }),
  });
}

export async function patchProblem(
  problemId: string,
  patch: Partial<Pick<Problem, "platform" | "difficulty" | "title" | "tags">> & { difficultyScore?: number | null },
) {
  return apiFetch<{ ok: true }>(`/problems/${problemId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function setProblemStatus(problemId: string, status: Problem["status"]) {
  return apiFetch<{ ok: true }>(`/problems/${problemId}/status`, { method: "POST", body: JSON.stringify({ status }) });
}

export async function markReviewCompleted(problemId: string) {
  return apiFetch<{ ok: true; ignored?: boolean; reason?: "not_due" | "duplicate_today"; nextReviewAt?: string; intervalDays?: number }>(
    `/problems/${problemId}/review`,
    { method: "POST", body: JSON.stringify({ result: "good" }) },
  );
}

export async function deleteProblem(problemId: string) {
  return apiFetch<{ ok: true }>(`/problems/${problemId}`, { method: "DELETE" });
}

export async function createProblemManual(input: { title: string; markdown: string; sourceUrl?: string }) {
  return apiFetch<{ ok: true; problem: Problem; warnings?: string[] }>("/problems/manual", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listNotes(params: { q?: string; kind?: "all" | Note["kind"] }): Promise<Note[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  sp.set("kind", params.kind ?? "all");
  return apiFetch(`/notes?${sp.toString()}`);
}

export async function createNote(input: Pick<Note, "kind" | "problemId" | "title" | "body" | "tags">) {
  return apiFetch<{ id: string }>("/notes", { method: "POST", body: JSON.stringify(input) });
}

export async function patchNote(noteId: string, patch: Partial<Pick<Note, "title" | "body" | "tags">>) {
  return apiFetch<{ ok: true }>(`/notes/${noteId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function listSolutions(params: { q?: string; language?: string | "all" }): Promise<Solution[]> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  sp.set("language", params.language ?? "all");
  return apiFetch(`/solutions?${sp.toString()}`);
}

export async function createSolution(
  input: Pick<
    Solution,
    | "problemId"
    | "title"
    | "language"
    | "version"
    | "status"
    | "timeComplexity"
    | "spaceComplexity"
    | "body"
  >,
) {
  return apiFetch<{ id: string }>("/solutions", { method: "POST", body: JSON.stringify(input) });
}

export async function patchSolution(
  solutionId: string,
  patch: Partial<
    Pick<
      Solution,
      "title" | "language" | "version" | "status" | "timeComplexity" | "spaceComplexity" | "body"
    >
  >,
) {
  return apiFetch<{ ok: true }>(`/solutions/${solutionId}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function listCollections(): Promise<Collection[]> {
  return apiFetch("/collections");
}

export async function getCollection(id: string): Promise<Collection> {
  return apiFetch(`/collections/${id}`);
}

export async function createCollection(
  input: Pick<Collection, "name"> &
    Partial<Pick<Collection, "description" | "planDueAt" | "planGoalProblemsWeek" | "planGoalPublishesWeek">>,
) {
  return apiFetch<{ id: string }>("/collections", { method: "POST", body: JSON.stringify(input) });
}

export async function patchCollection(
  id: string,
  patch: Partial<
    Pick<Collection, "name" | "description" | "planGoalProblemsWeek" | "planGoalPublishesWeek"> & { planDueAt?: string | null }
  >,
) {
  return apiFetch<{ ok: true }>(`/collections/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function getCollectionPlan(collectionId: string): Promise<{
  collectionId: string;
  weekStart: string;
  weekEnd: string;
  dueAt?: string;
  goalProblemsWeek: number;
  goalPublishesWeek: number;
  doneProblemsThisWeek: number;
  publishedSolutionsThisWeek: number;
  daysRemaining: number;
  solveTargetToday: number;
  publishTargetToday: number;
  tasks: {
    solve: Array<
      Pick<Problem, "id" | "title" | "platform" | "canonicalUrl" | "externalId" | "difficulty" | "status" | "tags"> & {
        completedAt?: string;
        hasPublishedSolution: boolean;
      }
    >;
    publish: Array<
      Pick<Problem, "id" | "title" | "platform" | "canonicalUrl" | "externalId" | "difficulty" | "status" | "tags"> & {
        completedAt?: string;
        hasPublishedSolution: boolean;
      }
    >;
  };
}> {
  return apiFetch(`/collections/${collectionId}/plan`);
}

export async function deleteCollection(id: string) {
  return apiFetch<{ ok: true }>(`/collections/${id}`, { method: "DELETE" });
}

export async function addProblemToCollection(collectionId: string, problemId: string) {
  return apiFetch<{ ok: true }>(`/collections/${collectionId}/problems`, { method: "POST", body: JSON.stringify({ problemId }) });
}

export async function removeProblemFromCollection(collectionId: string, problemId: string) {
  return apiFetch<{ ok: true }>(`/collections/${collectionId}/problems/${problemId}`, { method: "DELETE" });
}

export async function reorderCollection(collectionId: string, problemIds: string[]) {
  return apiFetch<{ ok: true }>(`/collections/${collectionId}/reorder`, { method: "POST", body: JSON.stringify({ problemIds }) });
}

export async function getStats(): Promise<{
  dataBytes: number;
  problemsTotal: number;
  notesTotal: number;
  solutionsTotal: number;
  problemsDone: number;
  solutionsDone: number;
  last30Activities: number;
  reviewsLast30: number;
  publishesLast30: number;
  reviewsTotal: number;
  publishesTotal: number;
  activities: Activity[];
}> {
  return apiFetch("/stats");
}

export type ReviewQueueItem = {
  id: string;
  title: string;
  platform: string;
  externalId?: string;
  canonicalUrl: string;
  difficulty: string;
  status: string;
  tags: string[];
  reviewNextAt: string;
  reviewIntervalDays: number;
  reviewCount: number;
  reviewEase: number;
  reviewLastAt?: string;
  reviewMistakeTags: string[];
  priority: number;
};

export async function getTodayReviewQueue(limit?: number): Promise<{ items: ReviewQueueItem[] }> {
  const sp = new URLSearchParams();
  if (limit) sp.set("limit", String(limit));
  return apiFetch(`/review/today?${sp.toString()}`);
}

export async function reviewCheckIn(problemId: string, input: { result: "good" | "hard" | "again"; mistakeTags?: string[] }) {
  return apiFetch<{ ok: true; nextReviewAt: string; intervalDays: number; ignored?: boolean; reason?: "not_due" | "duplicate_today" }>(
    `/review/${problemId}/checkin`,
    {
    method: "POST",
    body: JSON.stringify(input),
    },
  );
}

export type Settings = {
  llmBaseUrl: string;
  llmModel: string;
  llmApiKeySet: boolean;
  llmApiKeyLast4?: string;
  acwingCookieSet: boolean;
  acwingCookieLast4?: string;
};

export async function getSettings(): Promise<Settings> {
  return apiFetch("/settings");
}

export async function patchSettings(patch: {
  llmBaseUrl?: string;
  llmModel?: string;
  llmApiKey?: string;
  acwingCookie?: string;
}): Promise<{ ok: true }> {
  return apiFetch("/settings", { method: "PATCH", body: JSON.stringify(patch) });
}

export async function testLlm(): Promise<{ ok: true; content: string; requestId?: string; model?: string; id?: string }> {
  return apiFetch("/settings/test-llm", { method: "POST", body: JSON.stringify({}) });
}

export async function testAcwing(url: string): Promise<{ ok: true; title?: string }> {
  return apiFetch("/settings/test-acwing", { method: "POST", body: JSON.stringify({ url }) });
}
