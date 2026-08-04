import { useRef, useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../api'
import type { Assignment } from '../../types'
import { Button, Textarea } from '../../components/ui'
import { Field, Modal } from '../../components/system'

export function ImportRepositories({ assignment, onClose, onImported }: { assignment: Assignment; onClose: () => void; onImported: () => Promise<void> }) {
  const [repositoriesText, setRepositoriesText] = useState('')
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.txt')) { setError('Choose a .txt file.'); return }
    setFilename(file.name); setRepositoriesText(await file.text()); setError('')
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const normalized = repositoriesText.trim()
    if (!normalized) { setError('Add at least one repository.'); return }
    setBusy(true); setError('')
    try {
      const result = await api<{ importedRepositories: number }>(`/assignments/${assignment.id}/import-repositories`, { method: 'POST', body: JSON.stringify({ repositoriesText: normalized }) })
      toast.success(`${result.importedRepositories} ${result.importedRepositories === 1 ? 'repository' : 'repositories'} imported`)
      await onImported(); onClose()
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not import repositories') } finally { setBusy(false) }
  }

  return <Modal title="Import repositories" description={`Add GitHub repository URLs to ${assignment.name}, one link per line.`} onClose={onClose}><form className="l-form" onSubmit={submit}><button type="button" className="l-file-drop" onClick={() => inputRef.current?.click()}><FileText /><span><strong>{filename || 'Choose a text file'}</strong><small>Upload a .txt file with one GitHub repository URL per line</small></span><Upload /></button><input ref={inputRef} className="l-visually-hidden" type="file" accept=".txt,text/plain" onChange={chooseFile} /><Field label="GitHub repository URLs" hint="Paste one complete public GitHub repository URL per line." error={error}><Textarea className="l-repository-import-list" value={repositoriesText} onChange={(event) => setRepositoriesText(event.target.value)} placeholder={'https://github.com/student/project-one\nhttps://github.com/student/project-two\nhttps://github.com/student/project-three'} spellCheck={false} /></Field><a className="l-template-link" href="/repositories.example.txt" download>Download example text file</a><div className="l-form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}><Upload /> {busy ? 'Importing…' : 'Import repositories'}</Button></div></form></Modal>
}
