# 📚 LLM Wiki

**轻量级持久化知识库，由 LLM 从源文件编译为结构化 Markdown Wiki，支持浏览、搜索、知识图谱与问答。** — 灵感来自 [Andrej Karpathy's LLM Wiki](https://github.com/karpathy) 概念。

原始资料 → LLM 编译 → 结构化 Markdown Wiki → 浏览 / 搜索 / 问答

## 快速开始

### 前置条件
- **Node.js** ≥ 18
- **LLM API** — 支持 DeepSeek、OpenAI 或本地兼容接口

### 安装与运行

```bash
# 1. 安装所有依赖（后端 + 前端）
npm run install:all

# 2. 配置环境变量（复制示例文件并编辑）
cp .env.example .env   # macOS / Linux
# copy .env.example .env   # Windows
# 编辑 .env，填入你的 API Key 和模型配置

# 3. 一键启动（自动检测端口冲突）
npm run dev
```

打开 http://localhost:3000

> **端口冲突处理：** 启动脚本会自动检测 8000（后端）和 3000（前端）是否被占用，若被占用会交互提示：
> - `k` — 杀掉旧进程并重启
> - `o` — 使用其他端口
> - `q` — 退出

## 使用流程

1. **上传源文件** — 在 📄 源文件 页面上传 .txt / .pdf 文档
2. **LLM 消化** — 点击 🧠 消化 按钮，LLM 读取源文件并自动创建 Wiki 页面
3. **浏览 Wiki** — 点击侧边栏页面查看，支持 `[[Wiki 链接]]` 跳转
4. **知识图谱** — 可视化所有页面的连接关系
5. **全文搜索** — 中英文搜索所有 Wiki 内容
6. **问 Wiki** — 基于已编译知识回答复杂问题

## 项目结构

```
llmwiki-0/
├── backend/                   # Node.js 后端 (Hono + TypeScript)
│   └── src/
│       ├── index.ts           # 入口
│       ├── config.ts          # 配置
│       ├── core/
│       │   ├── engine.ts      # Wiki 引擎（链接解析、图谱）
│       │   ├── search.ts      # 全文搜索（倒排索引）
│       │   ├── llm.ts         # LLM API 客户端（支持多提供商）
│       │   ├── ingester.ts    # LLM 消化管道
│       │   └── secrets.ts     # 密钥解析（env / 凭据管理器）
│       ├── routes/            # API 路由
│       └── storage/           # 文件系统读写
├── frontend/                  # React 前端 (Vite + TypeScript)
│   └── src/
│       ├── pages/             # 页面组件
│       ├── components/        # 通用组件
│       └── api/               # API 客户端
├── scripts/
│   └── start.mjs              # 启动脚本（端口检测 + 交互提示）
├── wiki/                      # LLM 生成的 Wiki 页面（仅目录结构入 git）
├── sources/                   # 上传的原始源文件（仅目录结构入 git）
├── package.json               # 根目录项目配置（concurrently + cross-env）
├── agents.md                  # LLM 行为指令（控制消化质量）
└── .env.example               # 环境变量配置模板
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pages` | 页面列表 |
| GET | `/api/pages/:slug` | 页面详情 |
| PUT | `/api/pages/:slug` | 创建/更新页面 |
| DELETE | `/api/pages/:slug` | 删除页面 |
| GET | `/api/pages/resolve?ref=` | 解析链接文本到页面 slug |
| POST | `/api/pages/ensure-index` | 确保 index 页面存在 |
| GET | `/api/sources` | 源文件列表 |
| POST | `/api/sources/upload` | 上传源文件 |
| GET | `/api/sources/:filename` | 读取源文件内容 |
| GET | `/api/sources/:filename/download` | 下载源文件 |
| DELETE | `/api/sources/:filename` | 删除源文件 |
| GET | `/api/search?q=` | 全文搜索 |
| GET | `/api/graph` | 知识图谱数据 |
| POST | `/api/ingest` | 触发 LLM 消化 |
| POST | `/api/ingest/cancel/:filename` | 取消指定消化任务 |
| POST | `/api/ingest/cancel-all` | 取消全部消化任务 |
| POST | `/api/query` | 问答 |
| GET | `/api/health` | 健康检查 |

## 配置

通过 `agents.md` 控制 LLM 的行为：
- 页面命名规则
- 何时创建新页面 vs 更新已有页面
- 链接密度要求
- 输出语言（默认中文）

环境变量（复制 `.env.example` 为 `.env` 后编辑）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `deepseek` | 模型提供商：`deepseek` / `openai` / `local` |
| `DEEPSEEK_API_KEY` | — | DeepSeek API 密钥（provider 为 deepseek 时必填） |
| `LLM_API_KEY` | — | OpenAI 或本地模型 API 密钥 |
| `LLM_BASE_URL` | 自动适配 | API 地址（local 时需指定，如 `http://127.0.0.1:8080/v1`） |
| `LLM_MODEL` | 自动适配 | 模型名称 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | DeepSeek 自定义 API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | DeepSeek 模型名称 |
| `PORT` | `8000` | 后端端口 |
| `HOST` | `127.0.0.1` | 后端监听地址 |

### 模型提供商说明

**DeepSeek（默认）：** 设置 `LLM_PROVIDER=deepseek` 并配置 `DEEPSEEK_API_KEY`。

**OpenAI：** 设置 `LLM_PROVIDER=openai` 并配置 `LLM_API_KEY`，可选 `LLM_BASE_URL` 用于代理。

**本地模型：** 设置 `LLM_PROVIDER=local`，配置 `LLM_BASE_URL` 指向兼容 OpenAI 接口的本地服务（如 llama.cpp、Ollama、LM Studio），并指定 `LLM_MODEL`。
