# AlgoWorkspace（UI Demo）

面向算法竞赛/校招刷题人群的单体 Workspace（网页端 + 登录形态），包含前端 UI + 本地后端（SQLite）业务逻辑。

## Features（已实现）
- 题库：跨平台收集入口（LeetCode/AcWing URL → 标准 Markdown 题面 → 入库）、列表检索与快捷筛选
- 题目详情：题面 / 笔记 / 题解 / 活动四分区，支持编辑与站内活动记录
- 笔记库：题目笔记 + 知识笔记（可独立沉淀模板）
- 题解库：结构化题解编辑（多语言、草稿/完成）
- 统计：站内 Commit 热力图（综合 / 仅题解+完成 / 仅题解）
- 全局搜索：`Cmd/Ctrl + K` 打开 Command Palette

## Run
```bash
npm install
npm run dev
```

## Notes
- 后端：Express + SQLite（路径默认 `.data/algoworkspace.sqlite`）
- 登录：Cookie Session，Demo 账号：`demo@workspace` / `demo`
- 收集题目：支持 LeetCode/AcWing URL 抓取题面 → 转 Markdown → 入库（后端实现见 `server/services/ingest.ts`）

## Production（可选）
```bash
npm run build
npm run start
```
