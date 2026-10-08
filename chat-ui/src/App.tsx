import { useCallback, useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from 'ai'
import type { UIMessage } from 'ai'
import { ArrowUpIcon, HistoryIcon, MessageSquareIcon, PlusIcon, RefreshCwIcon, SquareIcon } from 'lucide-react'
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
import { DocumentSourcePart, FilePart, ReasoningPart, SandboxExitPart } from '@/components/message-parts'
import { fetchMessages, fetchThreads, getActiveThreadId, getResourceId, saveActiveThreadId } from '@/lib/history'
import type { ConversationState, Thread } from '@/lib/history'
import './App.css'

function createTransport(resourceId: string) {
  return new DefaultChatTransport({
    api: import.meta.env.VITE_MASTRA_CHAT_API || '/chat/agent',
    // Mastra Memory owns history: sending it again would duplicate context.
    // These anonymous IDs are for local development, never business credentials.
    prepareSendMessagesRequest: ({ id, messages, trigger }) => ({
      body: {
        messages: messages.slice(-1),
        trigger,
        memory: { thread: id, resource: resourceId },
      },
    }),
  })
}

const suggestions = ['介绍一下你能帮我做什么', '解释 Agent 和 Workflow 的区别', '帮我整理一份项目启动清单']

function Chat({ conversation, resourceId, onBusyChange, onSent, onFinish, onThreadTitle }: {
  conversation: ConversationState
  resourceId: string
  onBusyChange: (busy: boolean) => void
  onSent: (text: string) => void
  onFinish: () => void
  onThreadTitle: (id: string, title: string) => void
}) {
  const [input, setInput] = useState('')
  const [transport] = useState(() => createTransport(resourceId))
  const {
    messages, sendMessage, status, error, stop, regenerate, clearError,
    addToolApprovalResponse,
  } = useChat({
    id: conversation.id,
    messages: conversation.messages,
    transport,
    onFinish,
    onData: part => {
      if (part.type !== 'data-thread-title') return
      const data = part.data as { threadId?: unknown; title?: unknown }
      if (typeof data?.threadId === 'string' && typeof data.title === 'string') {
        onThreadTitle(data.threadId, data.title)
      }
    },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })
  const busy = status === 'submitted' || status === 'streaming'
  const awaitingApproval = messages.at(-1)?.parts.some(
    (part) => isToolUIPart(part) && part.state === 'approval-requested',
  ) ?? false

  useEffect(() => { onBusyChange(busy || awaitingApproval) }, [busy, awaitingApproval, onBusyChange])
  useEffect(() => () => { void stop() }, [stop])

  function submit(text: string) {
    if (!text.trim() || busy || awaitingApproval) return
    clearError()
    setInput('')
    onSent(text.trim())
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
          ) : messages.map((message) => {
            // Workspace metadata describes tool context, not chat content.
            const visibleParts = message.parts.filter(
              (part) => part.type !== 'step-start' && part.type !== 'data-workspace-metadata' && part.type !== 'data-thread-title',
            )
            if (visibleParts.length === 0) return null

            return (
              <Message key={message.id} from={message.role}>
                <span className="message-label">{message.role === 'user' ? '你' : 'Mastra'}</span>
                <MessageContent className="w-full">
                  {visibleParts.map((part, index) => {
                    const key = `${message.id}-${index}`
                    if (part.type === 'text') {
                      return message.role === 'user'
                        ? <p className="user-text" key={key}>{part.text}</p>
                        : <MessageResponse key={key} isAnimating={part.state === 'streaming' && busy}>{part.text}</MessageResponse>
                    }
                    if (part.type === 'file') return <FilePart key={key} part={part} />
                    if (part.type === 'source-document') return <DocumentSourcePart key={key} part={part} />
                    if (part.type === 'reasoning') return <ReasoningPart key={key} part={part} />
                    if (part.type === 'data-sandbox-exit') return <SandboxExitPart key={key} data={part.data} />
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
                    return <p className="text-muted-foreground text-xs" key={key}>收到 {part.type} 消息，暂不支持展示。</p>
                  })}
                </MessageContent>
              </Message>
            )
          })}
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
  const [resourceId] = useState(getResourceId)
  const [initialSession] = useState(() => {
    const saved = getActiveThreadId()
    const id = saved || crypto.randomUUID()
    saveActiveThreadId(id)
    return { id, restore: Boolean(saved) }
  })
  const [selectedId, setSelectedId] = useState(initialSession.id)
  const [conversation, setConversation] = useState<ConversationState | null>(() => initialSession.restore ? null : { id: initialSession.id, messages: [] })
  const [threads, setThreads] = useState<Thread[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [messageError, setMessageError] = useState('')
  const [busy, setBusy] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const historyRequest = useRef(0)
  const messageRequest = useRef<AbortController | null>(null)

  const loadHistory = useCallback(async (nextPage = 0) => {
    const request = ++historyRequest.current
    try {
      const result = await fetchThreads(resourceId, nextPage)
      if (request !== historyRequest.current) return
      setThreads(previous => nextPage === 0 ? result.threads : [...previous, ...result.threads.filter(thread => !previous.some(item => item.id === thread.id))])
      setPage(nextPage)
      setHasMore(result.hasMore)
    } catch (error) {
      if (request === historyRequest.current) setHistoryError((error as Error).message)
    } finally {
      if (request === historyRequest.current) setHistoryLoading(false)
    }
  }, [resourceId])

  function reloadHistory(nextPage = 0) {
    setHistoryLoading(true)
    setHistoryError('')
    void loadHistory(nextPage)
  }

  const selectThread = useCallback(async (id: string, allowMissing = false) => {
    messageRequest.current?.abort()
    const controller = new AbortController()
    messageRequest.current = controller
    setSelectedId(id)
    saveActiveThreadId(id)
    setConversation(null)
    setMessageError('')
    setHistoryOpen(false)
    try {
      const messages: UIMessage[] = await fetchMessages(resourceId, id, controller.signal, allowMissing)
      if (!controller.signal.aborted) setConversation({ id, messages })
    } catch (error) {
      if (!controller.signal.aborted) setMessageError((error as Error).message)
    }
  }, [resourceId])

  useEffect(() => {
    void loadHistory()
    if (initialSession.restore) void selectThread(initialSession.id, true)
    return () => { messageRequest.current?.abort(); historyRequest.current += 1 }
  }, [initialSession, loadHistory, selectThread])

  function newConversation() {
    messageRequest.current?.abort()
    const id = crypto.randomUUID()
    saveActiveThreadId(id)
    setSelectedId(id)
    setConversation({ id, messages: [] })
    setMessageError('')
    setHistoryOpen(false)
  }

  function markSent(text: string) {
    const now = new Date().toISOString()
    setThreads(previous => {
      const existing = previous.find(thread => thread.id === selectedId)
      return [{ id: selectedId, title: existing?.title || text.slice(0, 60), createdAt: existing?.createdAt || now, updatedAt: now }, ...previous.filter(thread => thread.id !== selectedId)]
    })
  }

  function updateThreadTitle(id: string, title: string) {
    setThreads(previous => previous.map(thread => thread.id === id ? { ...thread, title } : thread))
  }

  return (
    <div className="chat-layout">
      <aside className={`history-panel ${historyOpen ? 'history-open' : ''}`} aria-label="会话历史" id="chat-history">
        <div className="history-heading"><h2><HistoryIcon size={18} />会话历史</h2><Button variant="ghost" size="icon" disabled={historyLoading} aria-label="刷新会话历史" onClick={() => reloadHistory()}><RefreshCwIcon size={16} /></Button></div>
        <Button variant="outline" disabled={busy} onClick={newConversation}><PlusIcon size={16} />新对话</Button>
        <nav aria-label="历史会话列表">
          {threads.map(thread => (
            <button
              key={thread.id}
              type="button"
              className="history-item"
              aria-current={thread.id === selectedId ? 'page' : undefined}
              disabled={busy}
              onClick={() => { if (thread.id !== selectedId) void selectThread(thread.id) }}
            >
              <span>{thread.title || '未命名会话'}</span>
              <time dateTime={thread.updatedAt}>
                {new Date(thread.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </time>
            </button>
          ))}
          {!historyLoading && !historyError && threads.length === 0 && <p className="history-note">暂无历史会话</p>}
          {historyLoading && <p className="history-note" role="status">正在加载历史…</p>}
          {hasMore && <Button variant="ghost" disabled={historyLoading} onClick={() => reloadHistory(page + 1)}>加载更多</Button>}
        </nav>
        {historyError && <div className="history-error" role="alert"><p>{historyError}</p><Button variant="outline" size="sm" onClick={() => reloadHistory()}>重试</Button></div>}
      </aside>
      <main className="chat-shell">
        <header className="chat-header">
          <div className="brand"><span className="brand-mark">M</span><div><strong>Mastra</strong><span>你的 AI 助手</span></div></div>
          <div className="header-actions">
            <Button className="history-toggle" variant="outline" aria-controls="chat-history" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)}><HistoryIcon size={16} />历史</Button>
            <Button variant="outline" disabled={busy} onClick={newConversation}><PlusIcon size={16} />新对话</Button>
          </div>
        </header>
        {conversation ? (
          <Chat
            key={conversation.id}
            conversation={conversation}
            resourceId={resourceId}
            onBusyChange={setBusy}
            onSent={markSent}
            onThreadTitle={updateThreadTitle}
            onFinish={() => reloadHistory()}
          />
        ) : (
          <div className="history-loading" role={messageError ? 'alert' : 'status'}>
            {messageError || '正在加载会话…'}
            {messageError && <Button variant="outline" onClick={() => { void selectThread(selectedId) }}>重试</Button>}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
