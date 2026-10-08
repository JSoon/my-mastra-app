import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai'
import { ArrowUpIcon, MessageSquareIcon, PlusIcon, SquareIcon } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import './App.css'

const transport = new DefaultChatTransport({
  api: import.meta.env.VITE_MASTRA_CHAT_API || '/chat/agent',
  // Mastra Memory owns history: sending it again would duplicate context.
  // These anonymous IDs are for local development, never business credentials.
  prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
    body: {
      messages: messages.slice(-1),
      trigger,
      memory: { thread: id, resource: anonymousResourceId },
    },
  }),
})
const anonymousResourceId = crypto.randomUUID()

const suggestions = ['介绍一下你能帮我做什么', '解释 Agent 和 Workflow 的区别', '帮我整理一份项目启动清单']

function Chat() {
  const [input, setInput] = useState('')
  const [threadId] = useState(() => crypto.randomUUID())
  const {
    messages, sendMessage, status, error, stop, regenerate, clearError,
    addToolApprovalResponse,
  } = useChat({
    id: threadId,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })
  const busy = status === 'submitted' || status === 'streaming'
  const awaitingApproval = messages.at(-1)?.parts.some(
    (part) => isToolUIPart(part) && part.state === 'approval-requested',
  ) ?? false

  function submit(text: string) {
    if (!text.trim() || busy || awaitingApproval) return
    clearError()
    setInput('')
    void sendMessage({ text: text.trim() })
  }

  return (
    <>
      <Conversation className="min-h-0" aria-label="聊天消息">
        <ConversationContent className="chat-content">
          {messages.length === 0 ? (
            <ConversationEmptyState className="welcome">
              <div className="welcome-icon"><MessageSquareIcon size={28} /></div>
              <h1>有什么可以帮你？</h1>
              <p>从一个问题开始，一起把想法变成行动。</p>
              <div className="suggestions">
                {suggestions.map((text) => (
                  <button key={text} onClick={() => submit(text)} type="button">{text}</button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : messages.map((message) => (
            <Message key={message.id} from={message.role}>
              <span className="message-label">{message.role === 'user' ? '你' : 'Mastra'}</span>
              <MessageContent className="w-full">
                {message.parts.map((part, index) => {
                  const key = `${message.id}-${index}`
                  if (part.type === 'text') {
                    return message.role === 'user'
                      ? <p className="user-text" key={key}>{part.text}</p>
                      : <MessageResponse key={key} isAnimating={busy && message.id === messages.at(-1)?.id}>{part.text}</MessageResponse>
                  }
                  if (isToolUIPart(part)) {
                    return (
                      <Tool key={key} defaultOpen={part.state === 'approval-requested'}>
                        {part.type === 'dynamic-tool'
                          ? <ToolHeader type={part.type} toolName={part.toolName} state={part.state} />
                          : <ToolHeader type={part.type} state={part.state} />}
                        <ToolContent>
                          {part.input !== undefined && <ToolInput input={part.input} />}
                          <ToolOutput output={part.output} errorText={part.errorText} />
                          {part.state === 'approval-requested' && (
                            <div className="approval-actions">
                              <p>此操作需要你的确认。</p>
                              <Button disabled={busy} onClick={() => { void addToolApprovalResponse({ id: part.approval.id, approved: false }) }} variant="outline">拒绝</Button>
                              <Button disabled={busy} onClick={() => { void addToolApprovalResponse({ id: part.approval.id, approved: true }) }}>允许执行</Button>
                            </div>
                          )}
                        </ToolContent>
                      </Tool>
                    )
                  }
                  if (part.type === 'source-url') {
                    return <a className="source-link" key={key} href={part.url} target="_blank" rel="noopener noreferrer">{part.title || part.url}</a>
                  }
                  if (part.type === 'step-start') return null
                  return <p className="text-muted-foreground text-xs" key={key}>收到 {part.type} 消息，暂不支持展示。</p>
                })}
              </MessageContent>
            </Message>
          ))}
          {busy && <p className="status-text" role="status">{status === 'submitted' ? '正在连接…' : '正在回复…'}</p>}
        </ConversationContent>
        <ConversationScrollButton aria-label="滚动到最新消息" />
      </Conversation>

      <div className="composer-area">
        {error && (
          <div className="chat-error" role="alert">
            <span>回复失败，请检查 Mastra 服务和网络后重试。</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { clearError(); void regenerate() }}>重试</Button>
          </div>
        )}
        <form className="composer" onSubmit={(event) => { event.preventDefault(); submit(input) }}>
          <label className="sr-only" htmlFor="chat-input">消息</label>
          <Textarea
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit(input)
              }
            }}
            placeholder={awaitingApproval ? '请先允许或拒绝上方操作' : '输入消息…'}
            disabled={awaitingApproval}
            rows={2}
          />
          <div className="composer-footer">
            <span>{awaitingApproval ? '等待操作确认' : 'Enter 发送 · Shift + Enter 换行'}</span>
            {busy ? (
              <Button type="button" size="icon" onClick={() => { void stop() }} aria-label="停止生成"><SquareIcon size={16} /></Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim() || awaitingApproval} aria-label="发送消息"><ArrowUpIcon size={18} /></Button>
            )}
          </div>
        </form>
        <p className="composer-note">AI 的回答可能有误，请核实重要信息。</p>
      </div>
    </>
  )
}

function App() {
  const [conversationKey, setConversationKey] = useState(0)

  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div className="brand"><span className="brand-mark">M</span><div><strong>Mastra</strong><span>你的 AI 助手</span></div></div>
        <Button variant="outline" onClick={() => setConversationKey((key) => key + 1)}><PlusIcon size={16} />新对话</Button>
      </header>
      <Chat key={conversationKey} />
    </main>
  )
}

export default App
