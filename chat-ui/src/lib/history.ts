import type { UIMessage } from 'ai'

const resourceKey = 'mastra-chat.resource-id'
const threadKey = 'mastra-chat.thread-id'
const historyApi = import.meta.env.VITE_MASTRA_HISTORY_API || '/chat/threads'

export type Thread = { id: string; title?: string; createdAt: string; updatedAt: string }
export type ConversationState = { id: string; messages: UIMessage[] }

export function getResourceId() {
  const saved = localStorage.getItem(resourceKey)
  if (saved) return saved
  const id = crypto.randomUUID()
  localStorage.setItem(resourceKey, id)
  return id
}

export function getActiveThreadId() { return localStorage.getItem(threadKey) }
export function saveActiveThreadId(id: string) { localStorage.setItem(threadKey, id) }

export async function fetchThreads(resourceId: string, page: number, signal?: AbortSignal): Promise<{ threads: Thread[]; hasMore: boolean }> {
  const params = new URLSearchParams({ resourceId, page: String(page) })
  const response = await fetch(`${historyApi}?${params}`, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('历史会话加载失败，请检查 Mastra 服务后重试。')
  return response.json()
}

export async function fetchMessages(resourceId: string, threadId: string, signal: AbortSignal, allowMissing = false): Promise<UIMessage[]> {
  const params = new URLSearchParams({ resourceId })
  const response = await fetch(`${historyApi}/${encodeURIComponent(threadId)}/messages?${params}`, { signal, cache: 'no-store' })
  // A freshly created, empty conversation has no Memory record yet.
  if (response.status === 404 && allowMissing) return []
  if (!response.ok) throw new Error('会话消息加载失败，请重试。')
  const result = await response.json()
  return result.messages
}
