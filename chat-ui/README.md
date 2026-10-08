# Mastra 聊天界面

独立的 Vite + React 前端，通过 AI SDK 7 `useChat()` / `DefaultChatTransport` 调用当前 Mastra Agent。支持流式 Markdown、代码块、多轮对话、停止生成、新对话、错误重试、工具结果展示及 AI SDK 原生工具审批。

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

## 请求与会话

`src/mastra/index.ts` 注册 `POST /chat/agent`，固定调用现有 `agent`，显式设置 `version: 'v7'`。Vite 同源代理转发 `/chat`，浏览器无需跨域直连 4111。

现有 Agent 启用了 Observational Memory，必须提供 thread/resource。页面加载时生成随机 resource ID，每次新对话生成随机 thread ID；每轮只发送最新 UIMessage，历史上下文由 Mastra Memory 加载，避免重复提交。客户端取消请求时，路由把 AbortSignal 传给 Agent。点击“新对话”会停止当前请求并使用新 thread。

这些随机 ID **不是身份凭据，也不提供用户鉴权或归属保护**。当前页面不保存 ID、不列出历史会话；刷新会开启新会话，但后端 Memory 数据依然按原配置保存。停止生成前已保存的消息也可能保留在 Memory 中。

工具返回通过 AI Elements 展示。原生 `approval-requested` 显示允许/拒绝按钮，响应由 Mastra 的 v7 适配器恢复执行；`ask_user` 等自定义工具交互及业务组件注册表仍需另行接入。

## 构建与部署

```sh
npm run build
npm run lint
npm run preview
```

`dist/` 是静态产物；Vite 代理只在 dev/preview 生效。生产反向代理需将 `/chat/agent` 转发到 Mastra，关闭流式响应缓冲并设置合适超时。业务部署前还需接入登录、在服务端绑定 resource 并校验 thread 归属；现有 Agent 含工作区和命令工具，当前未鉴权的开发接口只适合可信本地环境。

技术架构与后续身份接入范围见 [统一聊天界面技术架构](../docs/chat-ui-architecture.html)。
