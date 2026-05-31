import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, Copy, FileCode, FileText } from 'lucide-react'
import { detectLanguage, highlight } from '../../highlight'
import type { WorkspaceFile } from '../../types'

export function CodeViewer({ file, content, loading }: { file: WorkspaceFile | null; content: string; loading: boolean }) {
  const lang = file ? detectLanguage(file.name) : 'plaintext'
  const isBinary = content.startsWith('Binary file') || content === 'File is too large to preview.'
  const lineCount = content ? content.split('\n').length : 0
  const [renderedCode, setRenderedCode] = useState<{ source: string; html: string } | null>(null)

  useEffect(() => {
    if (!file || isBinary || !content) return

    let cancelled = false
    highlight(content, lang).then((html) => {
      if (!cancelled) setRenderedCode({ source: content, html })
    }).catch(() => {
      if (!cancelled) setRenderedCode(null)
    })

    return () => {
      cancelled = true
    }
  }, [content, file, isBinary, lang])

  if (!file) {
    return (
      <div className="code-pane">
        <div className="code-header"><span className="file-info"><FileText size={13} /> <span style={{ color: 'var(--muted)' }}>No file selected</span></span></div>
        <div className="code-empty">
          <div className="icon-circle"><FileCode size={20} /></div>
          <div>Select a file from the list to preview it.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="code-pane">
      <div className="code-header">
        <div className="file-info">
          <FileCode size={13} className="icon" />
          <span className="name">{file.name}</span>
          <span className="meta">· {file.path}</span>
        </div>
        <div className="meta">
          {!isBinary && lineCount > 0 && <span>{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>}
          <span className="lang-badge">{lang}</span>
          <CopyButton text={content} disabled={isBinary || !content} />
        </div>
      </div>
      <div className={`code-body ${isBinary ? '' : 'with-gutter'}`}>
        {loading ? (
          <div style={{ padding: 16, color: 'var(--muted)' }}>Loading...</div>
        ) : isBinary || !content ? (
          <div className="code-empty">
            <div className="icon-circle"><FileText size={20} /></div>
            <div>{isBinary ? content : 'Empty file.'}</div>
          </div>
        ) : renderedCode?.source === content ? (
          <div dangerouslySetInnerHTML={{ __html: renderedCode.html }} />
        ) : (
          <pre className="plain-code"><code>{content}</code></pre>
        )}
      </div>
    </div>
  )
}

function CopyButton({ text, disabled }: { text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy} disabled={disabled} title="Copy contents">
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
