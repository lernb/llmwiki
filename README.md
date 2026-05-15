# 📚 LLM Wiki

**Persistent knowledge base compiled by an LLM** — inspired by [Andrej Karpathy's LLM Wiki](https://github.com/karpathy) concept.

原始资料 → LLM 编译 → 结构化 Markdown Wiki → 浏览 / 搜索 / 问答

## 快速开始

### 前置条件
- **Node.js** ≥ 18
- **DeepSeek API Key** — 从 [platform.deepseek.com/api_keys](https://platform.deepseek.com/api_keys) 获取

### 安装与运行

```bash
# 1. 安装依赖
npm --prefix backend install
npm --prefix frontend install

# 2. 设置 API Key
set DEEPSEEK_API_KEY=sk-xxxxxxxx  # Windows
# export DEEPSEEK_API_KEY=sk-xxxxxxxx  # macOS/Linux

# 3. 启动后端 (端口 8000)
npm --prefix backend run dev

# 4. 启动前端 (端口 3000)
npm --prefix frontend run dev
```

打开 http://localhost:3000

## 使用流程

1. **上传源文件** — 在 📄 源文件 页面上传 .txt / .md 文档
2. **LLM 消化** — 点击 🧠 消化 按钮，LLM 读取源文件并自动创建 Wiki 页面
3. **浏览 Wiki** — 点击侧边栏页面查看，支持 `[[Wiki 链接]]` 跳转
4. **知识图谱** — 可视化所有页面的连接关系
5. **全文搜索** — 中英文搜索所有 Wiki 内容
6. **问 Wiki** — 基于已编译知识回答复杂问题

## 项目结构

```
llmwiki-0/
├── backend/                 # Node.js 后端 (Hono + TypeScript)
│   └── src/
│       ├── index.ts         # 入口
│       ├── config.ts        # 配置
│       ├── core/
│       │   ├── engine.ts    # Wiki 引擎（链接解析、图谱）
│       │   ├── search.ts    # 全文搜索（倒排索引）
│       │   ├── llm.ts       # DeepSeek API 客户端
│       │   └── ingester.ts  # LLM 消化管道
│       ├── routes/           # API 路由
│       └── storage/          # 文件系统读写
├── frontend/                # React 前端 (Vite + TypeScript)
│   └── src/
│       ├── pages/           # 页面组件
│       ├── components/      # 通用组件
│       └── api/             # API 客户端
├── wiki/                    # LLM 生成的 Wiki 页面（Markdown）
├── sources/                 # 上传的原始源文件
└── agents.md                # LLM 行为指令（控制消化质量）
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/pages` | 页面列表 |
| GET | `/api/pages/:slug` | 页面详情 |
| PUT | `/api/pages/:slug` | 创建/更新页面 |
| DELETE | `/api/pages/:slug` | 删除页面 |
| GET | `/api/sources` | 源文件列表 |
| POST | `/api/sources/upload` | 上传源文件 |
| DELETE | `/api/sources/:filename` | 删除源文件 |
| GET | `/api/search?q=` | 全文搜索 |
| GET | `/api/graph` | 知识图谱数据 |
| POST | `/api/ingest` | 触发 LLM 消化 |
| POST | `/api/query` | 问答 |
| GET | `/api/health` | 健康检查 |

## 配置

通过 `agents.md` 控制 LLM 的行为：
- 页面命名规则
- 何时创建新页面 vs 更新已有页面
- 链接密度要求
- 输出语言（默认中文）

环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | （必填） | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | API 地址 |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名称 |
| `PORT` | `8000` | 后端端口 |
