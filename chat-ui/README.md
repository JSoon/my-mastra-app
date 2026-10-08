# 统一聊天界面

这是独立的 Vite + React 聊天前端项目。目前已安装 React 19、AI SDK 7、AI Elements 基础组件、Tailwind CSS 4 和 shadcn/ui。页面仍是 Vite 脚手架，尚未接入业务身份、会话或 Mastra 聊天接口。

技术架构和拟定的接入顺序见 [统一聊天界面技术架构](../docs/chat-ui-architecture.html)。

## 本地命令

使用 Node.js 22 或更高版本：

```sh
npm ci
npm run dev
npm run build
```

聊天页后续应通过受保护的接入 API 调用 Mastra；AI SDK 7 的 `useChat()` 使用 `messages[].parts` 渲染 AI Elements 组件。前端不能直接持有模型密钥或目标业务系统凭据。
