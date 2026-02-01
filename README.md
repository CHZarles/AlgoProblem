# AlgoWorkspace

本地优先的算法题 Workspace：跨平台收集题面（URL → Markdown）、做题笔记、题解沉淀、题集计划、复习队列、统计热力图。单体应用，无需登录。

## 适用人群
- 在校算法竞赛 / 校招刷题
- 想把“题面 / 笔记 / 题解”分维度沉淀，并且可检索/可统计

## 主要功能
- **题库**：收集题目（URL 抓取或手动粘贴 Markdown）、标签/状态/题集筛选、全局搜索
- **题目详情**：题面（Markdown + LaTeX）、笔记、题解（多语言 + 草稿/发布）、活动记录
- **题集（计划）**：题单目标（本周 N 题/题解 N 篇）、截止日期、进度条、拖拽排序、自动生成每日任务
- **复习系统**：间隔重复生成“今日复习队列”，支持错因标签、打卡自动安排下次复习（未到期/当天重复打卡会被忽略，避免误操作推远间隔）
- **统计**：GitHub 风格贡献热力图（口径可切换：综合 / 复习 / 发布）
- **主题**：深色 / 浅色 / 秋天

## 关键交互
- “标记已做”支持撤销
- “复习完成/打卡”只在题目到期时推进间隔（未到期/当天重复会忽略）

## 题面收集规则（重要）
- **入库必须有 Markdown 题面**（支持 LaTeX）
- **LeetCode 优先结构化抓取**（减少数字/公式/样例被误改的风险）
- **其他链接**：若已配置 LLM，则优先用 LLM 抽取题面 Markdown（失败回退通用抓取）
- 也支持**手动粘贴 Markdown** 直接入库

## 快速开始
```bash
npm install
npm run dev
```

默认：
- Web：`http://localhost:5173`
- API：`http://localhost:8787`
- 数据库：`.data/algoworkspace.sqlite`

## Production（可选）
```bash
npm run build
npm run start
```

## LLM 配置（可选）
设置页支持配置 `Base URL / Model / API Key`，用于从“非 LeetCode 链接”抽取题面 Markdown。

说明：
- 后端按 OpenAI 风格的 `chat/completions` 调用（会尝试 `.../chat/completions` 与 `.../v1/chat/completions`）
- 示例 Base URL：
  - 智谱：`https://open.bigmodel.cn/api/paas/v4`
  - OpenAI：`https://api.openai.com/v1`

## 数据与备份
- 本项目为**单体本地 Workspace**：数据默认存储在 `.data/`（已在 `.gitignore` 排除）
- 备份建议：直接复制 `.data/` 目录即可

## 可选环境变量
- `PORT`：API 端口（默认 `8787`）
- `DATABASE_PATH`：数据库路径（默认 `.data/algoworkspace.sqlite`）
- `CORS_ORIGIN`：开发时允许跨域的前端地址（默认 `http://localhost:5173`）

## 技术栈
- 前端：Vite + React + Tailwind + Radix UI
- Markdown：`react-markdown` + `remark-math` + `rehype-katex`（公式渲染）+ `rehype-highlight`（代码高亮）
- 后端：Express + SQLite（better-sqlite3）

## 注意事项
- 题面抓取涉及第三方站点内容，请自行遵守对应站点的条款与版权要求。
