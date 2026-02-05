import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { db } from "../db";
import { env } from "../env";
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

type SolutionRow = {
  id: string;
  problem_id: string;
  title: string;
  language: string;
  version: string;
  status: string;
  published_at: string | null;
  time_complexity: string | null;
  space_complexity: string | null;
  body: string;
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

function slugify(input: string, maxLen = 72) {
  const s = (input ?? "")
    .trim()
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const out = s || "untitled";
  return out.length > maxLen ? out.slice(0, maxLen).replace(/-+$/g, "") : out;
}

function mdEscapeText(text: string) {
  return (text ?? "").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function mdLink(text: string, href: string) {
  return `[${mdEscapeText(text)}](${href})`;
}

function yamlScalar(v: unknown) {
  if (v === null) return "null";
  if (v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return JSON.stringify(String(v));
}

function yamlFrontmatter(obj: Record<string, unknown>) {
  const lines: string[] = [];
  lines.push("---");
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      if (!value.length) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${yamlScalar(item)}`);
      }
      continue;
    }
    lines.push(`${key}: ${yamlScalar(value)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function rel(fromFilePath: string, toFilePath: string) {
  const fromDir = path.posix.dirname(fromFilePath);
  const r = path.posix.relative(fromDir, toFilePath) || ".";
  return r.replace(/\\/g, "/");
}

function localAssetsDir(workspaceId: string) {
  const e = env();
  const dataDir = path.resolve(path.dirname(e.DATABASE_PATH));
  return path.join(dataDir, "assets", "images", workspaceId);
}

type ExportMarkdownBundle = {
  exportedAt: string;
  filename: string;
  zip: Buffer;
};

export async function exportWorkspaceMarkdown(workspaceId: string): Promise<ExportMarkdownBundle> {
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

  const solutions = d
    .prepare(
      `SELECT
         id, problem_id, title, language, version, status, published_at, time_complexity, space_complexity, body, created_at, updated_at
       FROM solutions
       WHERE workspace_id = ?
       ORDER BY updated_at DESC`,
    )
    .all(workspaceId) as SolutionRow[];

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
  const solutionsById = new Map(solutions.map((s) => [s.id, s]));
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

  const solutionIdsByProblemId = new Map<string, string[]>();
  for (const s of solutions) {
    if (!solutionIdsByProblemId.has(s.problem_id)) solutionIdsByProblemId.set(s.problem_id, []);
    solutionIdsByProblemId.get(s.problem_id)!.push(s.id);
  }
  for (const [k, v] of solutionIdsByProblemId) solutionIdsByProblemId.set(k, Array.from(new Set(v)));

  const problemPathById = new Map<string, string>();
  for (const p of problems) {
    const pl = slugify((p.platform || "unknown").trim() || "unknown", 40);
    const t = slugify(p.title || "untitled", 80);
    problemPathById.set(p.id, `problems/${pl}/${t}__${p.id}.md`);
  }

  const notePathById = new Map<string, string>();
  for (const n of notes) {
    const t = slugify(n.title || "untitled", 90);
    notePathById.set(n.id, `notes/${n.id}__${t}.md`);
  }

  const solutionPathById = new Map<string, string>();
  for (const s of solutions) {
    const lang = slugify(s.language || "unknown", 24);
    const ver = slugify(s.version || "v1", 24);
    solutionPathById.set(s.id, `solutions/${s.problem_id}/${lang}__${ver}__${s.id}.md`);
  }

  const collectionPathById = new Map<string, string>();
  for (const c of collections) {
    const t = slugify(c.name || "untitled", 90);
    collectionPathById.set(c.id, `collections/${c.id}__${t}.md`);
  }

  const zip = new JSZip();
  const referencedLocalImages = new Set<string>();

  const rewriteLocalAssetLinks = (markdown: string, fromFilePath: string) => {
    return markdown.replace(/\/api\/assets\/local\/(p-[a-f0-9]{64}\.[a-z0-9]{1,8})/gi, (_m, filename: string) => {
      referencedLocalImages.add(filename);
      return rel(fromFilePath, `assets/images/${filename}`);
    });
  };

  const writeMarkdown = (filePath: string, content: string) => {
    const rewritten = rewriteLocalAssetLinks(content, filePath);
    zip.file(filePath, rewritten);
  };

  const manifest = {
    version: 1,
    format: "markdown_bundle_v1",
    exported_at: exportedAt,
    workspace_id: workspaceId,
    counts: {
      problems: problems.length,
      notes: notes.length,
      solutions: solutions.length,
      collections: collections.length,
    },
    paths: {
      problems: Object.fromEntries(Array.from(problemPathById.entries())),
      notes: Object.fromEntries(Array.from(notePathById.entries())),
      solutions: Object.fromEntries(Array.from(solutionPathById.entries())),
      collections: Object.fromEntries(Array.from(collectionPathById.entries())),
    },
    links: {
      note_problems: noteProblems,
      collection_problems: collectionProblems,
    },
  };

  // Root README
  {
    const lines: string[] = [];
    lines.push("# AlgoWorkspace 导出（Markdown Bundle）");
    lines.push("");
    lines.push(`- exported_at: ${exportedAt}`);
    lines.push(`- workspace_id: ${workspaceId}`);
    lines.push(`- 题目：${problems.length} · 笔记：${notes.length} · 题解：${solutions.length} · 题集：${collections.length}`);
    lines.push("");
    lines.push("## 目录");
    lines.push(`- ${mdLink("题集", "#题集")}`);
    lines.push(`- ${mdLink("笔记", "#笔记")}`);
    lines.push(`- ${mdLink("题解", "#题解")}`);
    lines.push(`- ${mdLink("题目", "#题目")}`);
    lines.push("");

    lines.push("## 题集");
    if (!collections.length) {
      lines.push("（无）");
    } else {
      for (const c of collections) {
        const p = collectionPathById.get(c.id);
        if (!p) continue;
        lines.push(`- ${mdLink(c.name, p)} (${(problemIdsByCollectionId.get(c.id) ?? []).length} 题)`);
      }
    }
    lines.push("");

    lines.push("## 笔记");
    if (!notes.length) {
      lines.push("（无）");
    } else {
      for (const n of notes) {
        const p = notePathById.get(n.id);
        if (!p) continue;
        lines.push(`- ${mdLink(n.title, p)} · ${n.kind} · 关联题目：${(problemIdsByNoteId.get(n.id) ?? []).length}`);
      }
    }
    lines.push("");

    lines.push("## 题解");
    if (!solutions.length) {
      lines.push("（无）");
    } else {
      for (const s of solutions) {
        const p = solutionPathById.get(s.id);
        if (!p) continue;
        const prob = problemsById.get(s.problem_id);
        const probText = prob ? prob.title : s.problem_id;
        lines.push(`- ${mdLink(`${s.title} · ${s.language} · ${s.version} · ${s.status}`, p)} · ${probText}`);
      }
    }
    lines.push("");

    lines.push("## 题目");
    if (!problems.length) {
      lines.push("（无）");
    } else {
      const platforms = Array.from(new Set(problems.map((p) => (p.platform || "unknown").trim() || "unknown"))).sort((a, b) =>
        a.localeCompare(b),
      );
      for (const pl of platforms) {
        const list = problems.filter((p) => (p.platform || "unknown").trim() === pl);
        lines.push(`### ${pl}（${list.length}）`);
        for (const p of list) {
          const fp = problemPathById.get(p.id);
          if (!fp) continue;
          lines.push(`- ${mdLink(p.title, fp)} · ${p.difficulty} · ${p.status}`);
        }
        lines.push("");
      }
    }
    lines.push("");

    writeMarkdown("README.md", lines.join("\n") + "\n");
  }

  // Collections
  for (const c of collections) {
    const filePath = collectionPathById.get(c.id);
    if (!filePath) continue;

    const pids = (problemIdsByCollectionId.get(c.id) ?? []).filter(Boolean);
    const fm = yamlFrontmatter({
      type: "collection",
      id: c.id,
      workspace_id: workspaceId,
      exported_at: exportedAt,
      name: c.name,
      description: c.description ?? null,
      plan_due_at: c.plan_due_at ?? null,
      plan_goal_problems_week: c.plan_goal_problems_week ?? 0,
      plan_goal_publishes_week: c.plan_goal_publishes_week ?? 0,
      problem_ids: pids,
      created_at: c.created_at,
      updated_at: c.updated_at,
    });

    const lines: string[] = [];
    lines.push(fm);
    lines.push("");
    lines.push(`# ${c.name}`);
    lines.push("");
    if (c.description?.trim()) {
      lines.push(c.description.trim());
      lines.push("");
    }
    lines.push("## 题目");
    if (!pids.length) {
      lines.push("（空）");
      lines.push("");
    } else {
      for (const pid of pids) {
        const p = problemsById.get(pid);
        const pPath = problemPathById.get(pid);
        const checked = p?.status === "done" ? "x" : " ";
        if (!p || !pPath) {
          lines.push(`- [${checked}] ${pid}`);
          continue;
        }
        const link = mdLink(p.title, rel(filePath, pPath));
        lines.push(`- [${checked}] ${link} · ${p.platform} · ${p.difficulty}`);
      }
      lines.push("");
    }
    writeMarkdown(filePath, lines.join("\n") + "\n");
  }

  // Notes
  for (const n of notes) {
    const filePath = notePathById.get(n.id);
    if (!filePath) continue;

    const tags = parseJsonArray(n.tags_json)
      .map((t) => String(t).trim())
      .filter(Boolean);
    const pids = (problemIdsByNoteId.get(n.id) ?? []).filter(Boolean);

    const fm = yamlFrontmatter({
      type: "note",
      id: n.id,
      workspace_id: workspaceId,
      exported_at: exportedAt,
      kind: n.kind,
      title: n.title,
      tags,
      problem_ids: pids,
      created_at: n.created_at,
      updated_at: n.updated_at,
    });

    const lines: string[] = [];
    lines.push(fm);
    lines.push("");
    lines.push(`# ${n.title}`);
    lines.push("");
    const body = (n.body ?? "").trim();
    lines.push(body || "（空）");
    lines.push("");
    lines.push("## 关联题目");
    if (!pids.length) {
      lines.push("（无）");
      lines.push("");
    } else {
      for (const pid of pids) {
        const p = problemsById.get(pid);
        const pPath = problemPathById.get(pid);
        if (!p || !pPath) {
          lines.push(`- ${pid}`);
          continue;
        }
        lines.push(`- ${mdLink(p.title, rel(filePath, pPath))} · ${p.platform} · ${p.difficulty} · ${p.status}`);
      }
      lines.push("");
    }
    writeMarkdown(filePath, lines.join("\n") + "\n");
  }

  // Solutions
  for (const s of solutions) {
    const filePath = solutionPathById.get(s.id);
    if (!filePath) continue;

    const fm = yamlFrontmatter({
      type: "solution",
      id: s.id,
      workspace_id: workspaceId,
      exported_at: exportedAt,
      problem_id: s.problem_id,
      title: s.title,
      language: s.language,
      version: s.version,
      status: s.status,
      published_at: s.published_at ?? null,
      time_complexity: s.time_complexity ?? null,
      space_complexity: s.space_complexity ?? null,
      created_at: s.created_at,
      updated_at: s.updated_at,
    });

    const lines: string[] = [];
    lines.push(fm);
    lines.push("");
    lines.push(`# ${s.title}`);
    lines.push("");
    const prob = problemsById.get(s.problem_id);
    const probPath = problemPathById.get(s.problem_id);
    if (prob && probPath) {
      lines.push(`关联题目：${mdLink(prob.title, rel(filePath, probPath))}`);
      lines.push("");
    }
    const body = (s.body ?? "").trim();
    lines.push(body || "（空）");
    lines.push("");
    writeMarkdown(filePath, lines.join("\n") + "\n");
  }

  // Problems
  for (const p of problems) {
    const filePath = problemPathById.get(p.id);
    if (!filePath) continue;

    const tags = parseJsonArray(p.tags_json)
      .map((t) => String(t).trim())
      .filter(Boolean);
    const sources = parseJsonArray(p.source_urls_json)
      .map((x) => String(x).trim())
      .filter(Boolean);
    const collectionsForProblem = (collectionIdsByProblemId.get(p.id) ?? []).filter(Boolean);
    const relatedNoteIds = (noteIdsByProblemId.get(p.id) ?? []).filter(Boolean);
    const relatedSolutionIds = (solutionIdsByProblemId.get(p.id) ?? []).filter(Boolean);

    const fm = yamlFrontmatter({
      type: "problem",
      id: p.id,
      workspace_id: workspaceId,
      exported_at: exportedAt,
      platform: p.platform,
      title: p.title,
      canonical_url: p.canonical_url,
      source_url: p.source_url,
      source_urls: sources,
      external_id: p.external_id ?? null,
      difficulty: p.difficulty,
      difficulty_score: p.difficulty_score ?? null,
      status: p.status,
      completed_at: p.completed_at ?? null,
      tags,
      collection_ids: collectionsForProblem,
      note_ids: relatedNoteIds,
      solution_ids: relatedSolutionIds,
      created_at: p.created_at,
      updated_at: p.updated_at,
      last_activity_at: p.last_activity_at,
    });

    const lines: string[] = [];
    lines.push(fm);
    lines.push("");
    lines.push(`# ${p.title}`);
    lines.push("");
    lines.push(`- platform: ${p.platform}`);
    lines.push(`- canonical_url: ${p.canonical_url}`);
    if (p.source_url?.trim() && p.source_url !== p.canonical_url) lines.push(`- source_url: ${p.source_url}`);
    if (p.external_id?.trim()) lines.push(`- external_id: ${p.external_id}`);
    lines.push(`- difficulty: ${p.difficulty}${p.difficulty_score == null ? "" : ` (${p.difficulty_score})`}`);
    lines.push(`- status: ${p.status}`);
    lines.push("");

    lines.push("## 题面");
    lines.push("");
    const statement = stripFrontmatter(p.markdown ?? "").trim();
    lines.push(statement || "（题面为空）");
    lines.push("");

    lines.push("## 关联题集");
    if (!collectionsForProblem.length) {
      lines.push("（无）");
      lines.push("");
    } else {
      for (const cid of collectionsForProblem) {
        const c = collectionsById.get(cid);
        const cPath = collectionPathById.get(cid);
        if (!c || !cPath) {
          lines.push(`- ${cid}`);
          continue;
        }
        lines.push(`- ${mdLink(c.name, rel(filePath, cPath))}`);
      }
      lines.push("");
    }

    lines.push("## 关联笔记");
    if (!relatedNoteIds.length) {
      lines.push("（无）");
      lines.push("");
    } else {
      for (const nid of relatedNoteIds) {
        const n = notesById.get(nid);
        const nPath = notePathById.get(nid);
        if (!n || !nPath) {
          lines.push(`- ${nid}`);
          continue;
        }
        lines.push(`- ${mdLink(n.title, rel(filePath, nPath))} · ${n.kind}`);
      }
      lines.push("");
    }

    lines.push("## 关联题解");
    if (!relatedSolutionIds.length) {
      lines.push("（无）");
      lines.push("");
    } else {
      for (const sid of relatedSolutionIds) {
        const s = solutionsById.get(sid);
        const sPath = solutionPathById.get(sid);
        if (!s || !sPath) {
          lines.push(`- ${sid}`);
          continue;
        }
        lines.push(
          `- ${mdLink(`${s.title} · ${s.language} · ${s.version} · ${s.status}`, rel(filePath, sPath))}`,
        );
      }
      lines.push("");
    }

    writeMarkdown(filePath, lines.join("\n") + "\n");
  }

  zip.file(
    "meta/manifest.json",
    JSON.stringify(
      {
        ...manifest,
        assets: {
          local_images: Array.from(referencedLocalImages.values()).sort(),
        },
      },
      null,
      2,
    ) + "\n",
  );

  // Include pasted local images referenced by markdown (best-effort).
  const localDir = localAssetsDir(workspaceId);
  for (const filename of referencedLocalImages) {
    const diskPath = path.join(localDir, filename);
    if (!fs.existsSync(diskPath)) continue;
    try {
      zip.file(`assets/images/${filename}`, fs.readFileSync(diskPath));
    } catch {
      // ignore best-effort asset read failures
    }
  }

  const zipBuf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const date = exportedAt.slice(0, 10);
  return { exportedAt, filename: `algoworkspace-${date}.zip`, zip: zipBuf };
}
