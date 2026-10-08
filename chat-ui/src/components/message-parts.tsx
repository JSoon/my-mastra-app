import type { FileUIPart, ReasoningUIPart, SourceDocumentUIPart } from 'ai'
import { BrainIcon, FileTextIcon } from 'lucide-react'
import { MessageResponse } from '@/components/ai-elements/message'

function fileUrl(url: string) {
  try {
    const parsed = new URL(url, window.location.href)
    return ['http:', 'https:', 'blob:', 'data:'].includes(parsed.protocol) ? parsed.href : undefined
  } catch {
    return undefined
  }
}

export function FilePart({ part }: { part: FileUIPart }) {
  const url = fileUrl(part.url)
  const name = part.filename || '附件'
  // Keep executable document types as downloads rather than embedding them.
  const image = /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(part.mediaType)
  return (
    <figure className="attachment-card">
      {url && image && <img src={url} alt={name} loading="lazy" />}
      {url && part.mediaType.startsWith('audio/') && <audio src={url} controls preload="none" aria-label={name} />}
      {url && part.mediaType.startsWith('video/') && <video src={url} controls preload="none" aria-label={name} />}
      <figcaption>
        <FileTextIcon size={18} aria-hidden="true" />
        <div><strong>{name}</strong><span>{part.mediaType}</span></div>
        {url ? <a href={url} download={name} target="_blank" rel="noopener noreferrer">打开 / 下载</a> : <span>附件地址不可用</span>}
      </figcaption>
    </figure>
  )
}

export function DocumentSourcePart({ part }: { part: SourceDocumentUIPart }) {
  // source-document carries identity and metadata, but no downloadable URL.
  return (
    <aside className="document-source" aria-label="文档来源">
      <FileTextIcon size={18} aria-hidden="true" />
      <div>
        <strong>{part.title || part.filename || '文档来源'}</strong>
        {part.filename && part.filename !== part.title && <span>{part.filename}</span>}
        <span>{part.mediaType} · 来源 {part.sourceId}</span>
      </div>
    </aside>
  )
}

export function ReasoningPart({ part }: { part: ReasoningUIPart }) {
  const streaming = part.state === 'streaming'
  return (
    <details className="reasoning-part" open={streaming ? true : undefined}>
      <summary><BrainIcon size={16} aria-hidden="true" />{streaming ? '正在思考…' : '思考过程'}</summary>
      <div>{part.text.trim()
        ? <MessageResponse isAnimating={streaming}>{part.text}</MessageResponse>
        : <p role={streaming ? 'status' : undefined}>{streaming ? '正在等待模型返回思考内容…' : '模型未返回可展示的思考内容。'}</p>}
      </div>
    </details>
  )
}
