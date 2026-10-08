# Mastra 聊天界面

独立的 Vite + React 前端，通过 AI SDK 7 `useChat()` / `DefaultChatTransport` 调用当前 Mastra Agent。支持流式 Markdown、代码高亮及复制/下载、Mermaid、KaTeX 数学公式、文件消息、文档来源、折叠思考过程、历史会话恢复、多轮对话、停止生成、错误重试、工具结果展示及 AI SDK 原生工具审批。

## 本地运行

使用 Node.js >=22.13.0，分别在两个终端启动：

```sh
# 仓库根目录：Mastra，默认端口 4111
npm ci
npm run dev
```

```sh
# chat-ui 目录：聊天前端，默认端口 5173
cd chat-ui
npm ci
npm run dev
```

打开 http://localhost:5173 。现有根目录 `.env` 配置的百炼模型由 Mastra 服务端调用；模型密钥不能放入前端 `VITE_*` 变量。

可复制 `.env.example` 到 `.env.local`：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `MASTRA_PROXY_TARGET` | `http://127.0.0.1:4111` | Vite dev/preview 的后端代理目标，仅服务端读取 |
| `VITE_MASTRA_CHAT_API` | `/chat/agent` | 浏览器请求路径 |
| `VITE_MASTRA_HISTORY_API` | `/chat/threads` | 历史列表及消息恢复接口的基础路径 |

## 请求与会话

`src/mastra/index.ts` 注册 `POST /chat/agent`，固定调用现有 `agent`，显式设置 `version: 'v7'`。Vite 同源代理转发 `/chat`，浏览器无需跨域直连 4111。

现有 Agent 启用了 Observational Memory，必须提供 thread/resource。首次访问生成匿名 resource ID，保存在当前浏览器的 localStorage；每次新对话生成随机 thread ID，当前 thread 同样保存。刷新后通过 `GET /chat/threads?resourceId=…` 加载历史列表，通过 `GET /chat/threads/:threadId/messages?resourceId=…` 恢复当前消息。列表每页 30 条，支持加载更多；开启 `generateTitle.emitEvent`，生成的标题通过 `data-thread-title` 事件更新列表（首次生成标题会延后流结束）；服务端先检查 thread 的 resource 归属，再把完整消息转换为 UIMessage 返回。每轮只发送最新 UIMessage，历史上下文由 Mastra Memory 加载，避免重复提交。生成和待审批期间禁用会话切换，停止生成后可以切换。

这些随机 ID **不是身份凭据，不提供用户鉴权**。历史查询仅按匿名 resource 筛选，不能代替服务端身份校验。清除浏览器存储或换浏览器后不会自动找到旧 resource；本次升级前已丢失的随机 resource ID 也不会自动恢复。停止生成前已保存的消息可能保留在 Memory 中。

Markdown 使用 Streamdown，并在 `src/index.css` 中显式扫描 Streamdown 及已安装插件的 Tailwind 样式。代码操作栏依赖 `pointer-events-auto`，缺少扫描会导致复制/下载无法点击。数学插件默认使用 `$$...$$` 行内语法及独立行的 `$$` 块公式，保留普通货币 `$` 的含义；KaTeX 字体及 CSS 随构建打包。Mermaid 使用标记为 `mermaid` 的代码块。`file` 支持图片、音视频预览及附件链接；`source-document` 协议不提供 URL，只展示文档元信息。后端聊天路由开启 `sendReasoning`，模型实际返回推理内容时才会出现思考过程。

工具返回通过 AI Elements 展示。原生 `approval-requested` 显示允许/拒绝按钮，响应由 Mastra 的 v7 适配器恢复执行；`ask_user` 等自定义工具交互及业务组件注册表仍需另行接入。

## 构建与部署

```sh
npm run build
npm run lint
npm run preview
```

`dist/` 是静态产物；Vite 代理只在 dev/preview 生效。生产反向代理需将 `/chat/agent` 和 `/chat/threads`（包含子路径）转发到 Mastra，关闭流式响应缓冲并设置合适超时。业务部署前还需接入登录、在服务端绑定 resource 并校验 thread 归属；现有 Agent 含工作区和命令工具，当前未鉴权的开发接口只适合可信本地环境。

技术架构与后续身份接入范围见 [统一聊天界面技术架构](../docs/chat-ui-architecture.html)。
