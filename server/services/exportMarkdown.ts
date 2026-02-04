import { db } from "../db";
import { nowIso } from "../ids";

type ProblemRow = {
  id: string;
  platform: string;
  canonical_url: string;
  source_url: string;
  source_urls_json: string | null;
  external_id: string | null;
  title: string;
  difficulty: string;
  difficulty_score: number | null;
  status: string;
  completed_at: string | null;
  tags_json: string;
  markdown: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
};

type NoteRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  tags_json: string;
  created_at: string;
  updated_at: string;
};

type CollectionRow = {
  id: string;
  name: string;
  description: string | null;
  plan_due_at: string | null;
  plan_goal_problems_week: number;
  plan_goal_publishes_week: number;
  created_at: string;
  updated_at: string;
};

function parseJsonArray(raw: string | null | undefined) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? (v as unknown[]) : [];
  } catch {
    return [];
  }
}

function stripFrontmatter(markdown: string) {
  const md = (markdown ?? "").replace(/\r\n/g, "\n");
  if (!md.startsWith("---\n")) return markdown;
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return markdown;
  return md.slice(end + "\n---\n".length).trimStart();
}

function fmt(v: string | null | undefined) {
  const s = (v ?? "").trim();
  return s || "—";
}

function code(v: string) {
  return `\`${v.replace(/`/g, "\\`")}\``;
}

function mdLink(text: string, href: string) {
  const t = text.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
  return `[${t}](${href})`;
}

function anchorId(prefix: "problem" | "note" | "collection", id: string) {
  return `${prefix}-${id}`;
}

function kvTable(rows: Array<[string, string]>) {
  const out: string[] = [];
  out.push("| 字段 | 值 |");
  out.push("| --- | --- |");
  for (const [k, v] of rows) out.push(`| ${k} | ${v} |`);
  return out.join("\n");
}

export function exportWorkspaceMarkdown(workspaceId: string) {
  const d = db();
  const exportedAt = nowIso();

  const problems = d
    .prepare(
      `SELECT
         id, platform, canonical_url, source_url, source_urls_json, external_id, title, difficulty, difficulty_score,
         status, completed_at, tags_json, markdown, created_at, updated_at, last_activity_at
       FROM problems
       WHERE workspace_id = ?
       ORDER BY last_activity_at DESC`,
    )
    .all(workspaceId) as ProblemRow[];

  const notes = d
    .prepare(
      `SELECT
         id, kind, title, body, tags_json, created_at, updated_at
       FROM notes
       WHERE workspace_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(workspaceId) as NoteRow[];

  const collections = d
    .prepare(
      `SELECT
         id, name, description, plan_due_at, plan_goal_problems_week, plan_goal_publishes_week, created_at, updated_at
       FROM collections
       WHERE workspace_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(workspaceId) as CollectionRow[];

  const noteProblems = d
    .prepare(
      `SELECT np.note_id, np.problem_id
       FROM note_problems np
       JOIN notes n ON n.id = np.note_id
       WHERE n.workspace_id = ?`,
    )
    .all(workspaceId) as Array<{ note_id: string; problem_id: string }>;

  const collectionProblems = d
    .prepare(
      `SELECT cp.collection_id, cp.problem_id, cp.position
       FROM collection_problems cp
       JOIN collections c ON c.id = cp.collection_id
       WHERE c.workspace_id = ?
       ORDER BY cp.collection_id ASC, cp.position ASC`,
    )
    .all(workspaceId) as Array<{ collection_id: string; problem_id: string; position: number }>;

  const problemsById = new Map(problems.map((p) => [p.id, p]));
  const notesById = new Map(notes.map((n) => [n.id, n]));
  const collectionsById = new Map(collections.map((c) => [c.id, c]));

  const problemIdsByNoteId = new Map<string, string[]>();
  const noteIdsByProblemId = new Map<string, string[]>();
  for (const np of noteProblems) {
    if (!problemIdsByNoteId.has(np.note_id)) problemIdsByNoteId.set(np.note_id, []);
    problemIdsByNoteId.get(np.note_id)!.push(np.problem_id);

    if (!noteIdsByProblemId.has(np.problem_id)) noteIdsByProblemId.set(np.problem_id, []);
    noteIdsByProblemId.get(np.problem_id)!.push(np.note_id);
  }
  for (const [k, v] of problemIdsByNoteId) problemIdsByNoteId.set(k, Array.from(new Set(v)));
  for (const [k, v] of noteIdsByProblemId) noteIdsByProblemId.set(k, Array.from(new Set(v)));

  const problemIdsByCollectionId = new Map<string, string[]>();
  const collectionIdsByProblemId = new Map<string, string[]>();
  for (const cp of collectionProblems) {
    if (!problemIdsByCollectionId.has(cp.collection_id)) problemIdsByCollectionId.set(cp.collection_id, []);
    problemIdsByCollectionId.get(cp.collection_id)!.push(cp.problem_id);

    if (!collectionIdsByProblemId.has(cp.problem_id)) collectionIdsByProblemId.set(cp.problem_id, []);
    collectionIdsByProblemId.get(cp.problem_id)!.push(cp.collection_id);
  }
  for (const [k, v] of problemIdsByCollectionId) problemIdsByCollectionId.set(k, Array.from(new Set(v)));
  for (const [k, v] of collectionIdsByProblemId) collectionIdsByProblemId.set(k, Array.from(new Set(v)));

  const lines: string[] = [];
  lines.push("---");
  lines.push(`exported_at: ${exportedAt}`);
  lines.push(`workspace_id: ${workspaceId}`);
  lines.push("generator: AlgoWorkspace");
  lines.push("format: markdown_v1");
  lines.push("---");
  lines.push("");
  lines.push("# AlgoWorkspace 导出（Markdown）");
  lines.push("");
  lines.push(`- 导出时间：${exportedAt}`);
  lines.push(`- Workspace：${code(workspaceId)}`);
  lines.push(`- 题目：${problems.length} · 笔记：${notes.length} · 题集：${collections.length}`);
  lines.push("");
  lines.push("## 目录");
  lines.push(`- ${mdLink("题集", "#题集")}`);
  lines.push(`- ${mdLink("笔记", "#笔记")}`);
  lines.push(`- ${mdLink("题目", "#题目")}`);
  lines.push("");

  // Collections
  lines.push("## 题集");
  lines.push("");
  if (!collections.length) {
    lines.push("（无）");
    lines.push("");
  } else {
    lines.push("**快速索引**");
    for (const c of collections) {
      lines.push(`- ${mdLink(c.name, `#${anchorId("collection", c.id)}`)} ${code(c.id)}`);
    }
    lines.push("");

    for (const c of collections) {
      lines.push(`<a id="${anchorId("collection", c.id)}"></a>`);
      lines.push(`### ${c.name}`);
      lines.push("");
      lines.push(
        kvTable([
          ["id", code(c.id)],
          ["description", c.description ? c.description.trim() : "—"],
          ["plan_due_at", fmt(c.plan_due_at)],
          ["plan_goal_problems_week", String(c.plan_goal_problems_week ?? 0)],
          ["plan_goal_publishes_week", String(c.plan_goal_publishes_week ?? 0)],
          ["created_at", fmt(c.created_at)],
          ["updated_at", fmt(c.updated_at)],
        ]),
      );
      lines.push("");
      lines.push("#### 题目");
      const ids = problemIdsByCollectionId.get(c.id) ?? [];
      if (!ids.length) {
        lines.push("- （空）");
        lines.push("");
        continue;
      }
      for (const pid of ids) {
        const p = problemsById.get(pid);
        if (!p) {
          lines.push(`- [ ] ${code(pid)}`);
          continue;
        }
        const checked = p.status === "done" ? "x" : " ";
        const link = mdLink(p.title, `#${anchorId("problem", p.id)}`);
        const tags = parseJsonArray(p.tags_json)
          .map((t) => String(t).trim())
          .filter(Boolean)
          .slice(0, 6);
        const tagText = tags.length ? ` · tags: ${tags.map(code).join(" ")}` : "";
        lines.push(`- [${checked}] ${link} · ${p.platform} · ${p.difficulty}${tagText}`);
      }
      lines.push("");
    }
  }

  // Notes
  lines.push("## 笔记");
  lines.push("");
  if (!notes.length) {
    lines.push("（无）");
    lines.push("");
  } else {
    lines.push("**快速索引**");
    for (const n of notes) {
      lines.push(`- ${mdLink(n.title, `#${anchorId("note", n.id)}`)} ${code(n.id)} · ${n.kind}`);
    }
    lines.push("");

    for (const n of notes) {
      lines.push(`<a id="${anchorId("note", n.id)}"></a>`);
      lines.push(`### ${n.title}`);
      lines.push("");
      const tags = parseJsonArray(n.tags_json)
        .map((t) => String(t).trim())
        .filter(Boolean);
      const pids = (problemIdsByNoteId.get(n.id) ?? []).filter(Boolean);
      lines.push(
        kvTable([
          ["id", code(n.id)],
          ["kind", code(n.kind)],
          ["tags", tags.length ? tags.map(code).join(" ") : "—"],
          ["created_at", fmt(n.created_at)],
          ["updated_at", fmt(n.updated_at)],
        ]),
      );
      lines.push("");
      lines.push("#### 内容");
      lines.push("");
      lines.push((n.body ?? "").trim() || "（空）");
      lines.push("");
      lines.push("#### 关联题目");
      if (!pids.length) {
        lines.push("- （无）");
        lines.push("");
        continue;
      }
      for (const pid of pids) {
        const p = problemsById.get(pid);
        if (!p) {
          lines.push(`- ${code(pid)}`);
          continue;
        }
        lines.push(`- ${mdLink(p.title, `#${anchorId("problem", p.id)}`)} · ${p.platform} · ${p.difficulty}`);
      }
      lines.push("");
    }
  }

  // Problems
  lines.push("## 题目");
  lines.push("");
  if (!problems.length) {
    lines.push("（无）");
    lines.push("");
  } else {
    // Group by platform for readability.
    const platforms = Array.from(new Set(problems.map((p) => (p.platform || "unknown").trim() || "unknown"))).sort((a, b) =>
      a.localeCompare(b),
    );
    lines.push("**平台索引**");
    for (const pl of platforms) lines.push(`- ${mdLink(pl, `#platform-${pl.replace(/[^a-z0-9_-]+/gi, "").toLowerCase() || "unknown"}`)}`);
    lines.push("");

    for (const pl of platforms) {
      const plAnchor = `platform-${pl.replace(/[^a-z0-9_-]+/gi, "").toLowerCase() || "unknown"}`;
      lines.push(`<a id="${plAnchor}"></a>`);
      lines.push(`### ${pl}`);
      lines.push("");
      const list = problems.filter((p) => (p.platform || "unknown").trim() === pl);
      lines.push(`共 ${list.length} 题`);
      lines.push("");

      for (const p of list) {
        lines.push(`<a id="${anchorId("problem", p.id)}"></a>`);
        lines.push(`#### ${p.title}`);
        lines.push("");
        const tags = parseJsonArray(p.tags_json)
          .map((t) => String(t).trim())
          .filter(Boolean);
        const sources = parseJsonArray(p.source_urls_json)
          .map((x) => String(x).trim())
          .filter(Boolean);
        const collectionsForProblem = (collectionIdsByProblemId.get(p.id) ?? []).filter(Boolean);

        lines.push(
          kvTable([
            ["id", code(p.id)],
            ["platform", code(p.platform)],
            ["canonical_url", code(p.canonical_url)],
            ["source_url", p.source_url ? code(p.source_url) : "—"],
            ["external_id", p.external_id ? code(p.external_id) : "—"],
            ["difficulty", code(p.difficulty)],
            ["difficulty_score", p.difficulty_score == null ? "—" : String(p.difficulty_score)],
            ["status", code(p.status)],
            ["completed_at", fmt(p.completed_at)],
            ["tags", tags.length ? tags.map(code).join(" ") : "—"],
            ["collections", collectionsForProblem.length ? collectionsForProblem.map(code).join(" ") : "—"],
            ["created_at", fmt(p.created_at)],
            ["updated_at", fmt(p.updated_at)],
            ["last_activity_at", fmt(p.last_activity_at)],
            ["source_urls", sources.length ? sources.map(code).join(" ") : "—"],
          ]),
        );
        lines.push("");

        // Statement
        const statement = stripFrontmatter(p.markdown ?? "").trim();
        lines.push("<details>");
        lines.push("<summary>题面（Markdown）</summary>");
        lines.push("");
        lines.push(statement || "（题面为空）");
        lines.push("");
        lines.push("</details>");
        lines.push("");

        // Related notes
        const relatedNoteIds = (noteIdsByProblemId.get(p.id) ?? []).filter(Boolean);
        lines.push("**关联笔记**");
        if (!relatedNoteIds.length) {
          lines.push("- （无）");
          lines.push("");
        } else {
          for (const nid of relatedNoteIds) {
            const n = notesById.get(nid);
            if (!n) {
              lines.push(`- ${code(nid)}`);
              continue;
            }
            lines.push(`- ${mdLink(n.title, `#${anchorId("note", n.id)}`)} · ${n.kind}`);
          }
          lines.push("");
        }

        lines.push("---");
        lines.push("");
      }
    }
  }

  return { exportedAt, markdown: lines.join("\n") + "\n" };
}

