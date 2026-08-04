import { useEffect, useId, useRef, type ReactNode } from 'react'
import { AlertTriangle, Inbox, LoaderCircle, X } from 'lucide-react'
import { Button } from './ui'

export function PageState({ loading, error, empty, onRetry, children }: { loading?: boolean; error?: string | null; empty?: boolean; onRetry?: () => void; children: ReactNode }) {
  if (loading) return <div className="l-state" aria-live="polite"><LoaderCircle className="l-spin" /> Loading…</div>
  if (error) return <div className="l-state l-error" role="alert"><AlertTriangle /><div><strong>Couldn’t load this view</strong><span>{error}</span></div>{onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}</div>
  if (empty) return <div className="l-empty"><Inbox /><strong>Nothing here yet</strong><span>Create the first item to get started.</span></div>
  return children
}

export function Modal({ title, description, children, actions, onClose, className = '' }: { title: string; description?: string; children: ReactNode; actions?: ReactNode; onClose: () => void; className?: string }) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { closeRef.current?.focus() }, [])
  return <div className="l-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`l-modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><Button ref={closeRef} variant="ghost" size="icon" aria-label="Close dialog" onClick={onClose}><X /></Button></header>
      <div className="l-modal-body">{children}</div>{actions && <footer>{actions}</footer>}
    </section>
  </div>
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="l-field"><span>{label}</span>{children}{error ? <small className="l-field-error">{error}</small> : hint ? <small>{hint}</small> : null}</label>
}
