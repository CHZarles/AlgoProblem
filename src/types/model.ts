export type OJPlatform = string;
export type Difficulty = "easy" | "medium" | "hard" | "unknown";
export type ProblemStatus =
  | "todo"
  | "done"
  | "reviewing"
  | "classic"
  | "abandoned";

export type ActivityType =
  | "problem_created"
  | "problem_completed"
  | "review_completed"
  | "note_created"
  | "note_updated"
  | "note_deleted"
  | "note_linked"
  | "note_unlinked"
  | "solution_created"
  | "solution_updated"
  | "solution_deleted"
  | "solution_published"
  | "solution_unpublished";

export type Problem = {
  id: string;
  platform: OJPlatform;
  canonicalUrl: string;
  sourceUrl: string;
  sourceUrls?: string[];
  title: string;
  externalId?: string; // e.g. leetcode slug / acwing numeric id
  difficulty: Difficulty;
  difficultyScore?: number;
  status: ProblemStatus;
  completedAt?: string;
  tags: string[];
  collections: string[];
  markdown: string; // normalized problem statement markdown (required)
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  reviewNextAt?: string;
  reviewIntervalDays?: number;
  reviewEase?: number;
  reviewCount?: number;
  reviewLastAt?: string;
  reviewMistakeTags?: string[];
};

export type Note = {
  id: string;
  kind: "problem" | "knowledge";
  problemIds: string[];
  title: string;
  body: string;
  tags: string[]; // includes "错因" tags etc.
  createdAt: string;
  updatedAt: string;
};

export type Solution = {
  id: string;
  problemId: string;
  title: string;
  language: string; // "cpp" | "java" | "python" etc.
  version: "first" | "second" | "optimal";
  status: "draft" | "done";
  publishedAt?: string;
  timeComplexity?: string;
  spaceComplexity?: string;
  body: string; // markdown with code blocks
  createdAt: string;
  updatedAt: string;
};

export type Collection = {
  id: string;
  name: string;
  description?: string;
  planDueAt?: string;
  planGoalProblemsWeek?: number;
  planGoalPublishesWeek?: number;
  problemIds: string[];
  problemCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type Activity = {
  id: string;
  type: ActivityType;
  at: string; // ISO timestamp
  problemId?: string;
  objectId?: string;
};

export type WorkspaceDb = {
  problems: Problem[];
  notes: Note[];
  solutions: Solution[];
  collections: Collection[];
  activities: Activity[];
};
