import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, LogOut, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../api'
import { Button, Input } from '../../components/ui'
import type { ProfessorAccess, Session } from '../../types'

export function AdminPage({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [professors, setProfessors] = useState<ProfessorAccess[]>([])
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api<ProfessorAccess[]>('/admin/professors')
      .then((rows) => { setProfessors(rows); setError('') })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load professor access'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  async function addProfessor(event: React.FormEvent) {
    event.preventDefault()
    try {
      await api('/admin/professors', { method: 'POST', body: JSON.stringify({ githubUsername: username }) })
      setUsername('')
      toast.success('Professor access added')
      load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Could not add professor')
    }
  }

  async function removeProfessor(githubUsername: string) {
    try {
      await api(`/admin/professors/${encodeURIComponent(githubUsername)}`, { method: 'DELETE' })
      toast.success('Professor access removed')
      load()
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Could not remove professor')
    }
  }

  return <main className="l-admin-page">
    <header className="l-admin-header"><div><span className="l-kicker">Miyagi administration</span><h1>Professor access</h1><p>Control which GitHub accounts can sign in as professors.</p></div><div><Button variant="secondary" onClick={() => { window.location.href = '/' }}><ArrowLeft /> Workspace</Button><Button variant="secondary" onClick={onLogout}><LogOut /> Sign out</Button></div></header>
    <section className="l-admin-card">
      <form className="l-admin-add" onSubmit={addProfessor}><label htmlFor="professor-username">Add a GitHub username</label><div><Input id="professor-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="octocat" required /><Button type="submit" variant="primary"><Plus /> Add professor</Button></div></form>
      {loading ? <p className="l-admin-status">Loading professor access…</p> : error ? <div className="l-error"><strong>{session.role === 'professor' ? 'Owner access required' : 'Professor access required'}</strong><p>{error}</p></div> : <div className="l-admin-list">
        {professors.map((professor) => <article key={professor.githubUsername}><span className="l-role-icon"><ShieldCheck /></span><div><strong>{professor.displayName || `@${professor.githubUsername}`}</strong><small>@{professor.githubUsername}{professor.isOwner ? ' · Owner' : professor.professorId ? ' · Active' : ' · Invited'}</small></div><time>{professor.lastLoginAt ? `Last login ${new Date(professor.lastLoginAt).toLocaleString()}` : 'Never logged in'}</time><Button aria-label={`Remove ${professor.githubUsername}`} title={professor.isOwner ? 'The owner is configured in .env' : 'Remove professor access'} variant="ghost" size="icon" disabled={professor.isOwner} onClick={() => void removeProfessor(professor.githubUsername)}><Trash2 /></Button></article>)}
      </div>}
    </section>
  </main>
}
