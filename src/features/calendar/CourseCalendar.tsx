import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../api'
import type { Assignment, Course, CourseCalendarItem, Session } from '../../types'
import { Badge, Button, Input, Select, Textarea } from '../../components/ui'
import { Field, Modal, PageState } from '../../components/system'
import { useAsync } from '../../lib/useAsync'

type Entry = { id: string; title: string; description: string; dueAt: string; kind: 'event' | 'deadline'; custom: boolean }

export function CourseCalendar({ session, course, assignments = [], readOnly = false }: { session: Session; course: Course; assignments?: Assignment[]; readOnly?: boolean }) {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [now] = useState(() => Date.now())
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Entry | null>(null)
  const state = useAsync(() => api<CourseCalendarItem[]>(`/courses/${course.id}/calendar-items`), [course.id])
  const professorId = session.role === 'professor' && !readOnly ? session.professor.id : null
  const entries = useMemo<Entry[]>(() => [
    ...(state.data ?? []).map((item) => ({ id: item.id, title: item.title, description: item.description, dueAt: item.dueAt, kind: item.kind, custom: true as const })),
    ...assignments.filter((item) => item.dueDate).map((item) => ({ id: `assignment-${item.id}`, title: item.name, description: item.description, dueAt: item.dueDate!, kind: 'deadline' as const, custom: false as const })),
  ].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt)), [assignments, state.data])
  const days = calendarDays(month)
  const monthName = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(month)

  async function remove() {
    if (!professorId || !deleting) return
    try {
      await api(`/courses/${course.id}/calendar-items/${deleting.id}`, { method: 'DELETE' })
      toast.success('Calendar item deleted'); setDeleting(null); state.retry()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not delete calendar item') }
  }

  return <section className="l-calendar">
    <header className="l-section-head"><div><span className="l-kicker">Schedule</span><h2>Calendar</h2><p>Assignment deadlines and course events.</p></div><div className="l-actions"><div className="l-month-nav"><Button variant="secondary" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonth(month, -1))}><ChevronLeft /></Button><strong>{monthName}</strong><Button variant="secondary" size="icon" aria-label="Next month" onClick={() => setMonth(addMonth(month, 1))}><ChevronRight /></Button></div>{professorId && <Button variant="primary" onClick={() => setCreating(true)}><Plus /> Add event</Button>}</div></header>
    <PageState loading={state.loading} error={state.error} onRetry={state.retry}>
      <div className="l-calendar-grid" role="grid" aria-label={monthName}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span className="l-weekday" key={day}>{day}</span>)}
        {days.map((day, index) => day ? <div className="l-day" role="gridcell" key={day.toISOString()}><span>{day.getDate()}</span><div>{entries.filter((entry) => sameDay(new Date(entry.dueAt), day)).map((entry) => <button key={entry.id} className={`l-calendar-event ${entry.kind}`} onClick={() => entry.custom && professorId && setDeleting(entry)} title={entry.description || entry.title}><i />{entry.title}{entry.custom && professorId && <Trash2 />}</button>)}</div></div> : <div className="l-day outside" key={`empty-${index}`} />)}
      </div>
      <div className="l-agenda"><div className="l-section-head compact"><div><h3>Upcoming</h3><p>The next scheduled items across this course.</p></div></div>{entries.filter((entry) => Date.parse(entry.dueAt) >= now).slice(0, 6).map((entry) => <article key={entry.id}><CalendarDays /><div><strong>{entry.title}</strong><span>{formatDate(entry.dueAt)}</span></div><Badge variant={entry.kind === 'deadline' ? 'accent' : 'muted'}>{entry.kind}</Badge></article>)}</div>
    </PageState>
    {creating && professorId && <CreateCalendarItem course={course} assignments={assignments} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); state.retry() }} />}
    {deleting && <Modal title="Delete calendar item?" description={deleting.title} onClose={() => setDeleting(null)} actions={<><Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete item</Button></>}><p className="l-confirm-copy">This removes the event from the course calendar. Assignment deadlines must be changed from the assignment itself.</p></Modal>}
  </section>
}

function CreateCalendarItem({ course, assignments, onClose, onCreated }: { course: Course; assignments: Assignment[]; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [dueAt, setDueAt] = useState(''); const [kind, setKind] = useState<'event' | 'deadline'>('event'); const [assignmentId, setAssignmentId] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  async function submit(event: React.FormEvent) { event.preventDefault(); if (title.trim().length < 2 || !dueAt) { setError('Add a title and a valid date and time.'); return } setBusy(true); setError(''); try { await api(`/courses/${course.id}/calendar-items`, { method: 'POST', body: JSON.stringify({ title: title.trim(), description: description.trim(), dueAt: new Date(dueAt).toISOString(), kind, assignmentId: kind === 'deadline' && assignmentId ? assignmentId : null }) }); toast.success('Calendar item created'); onCreated() } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create calendar item') } finally { setBusy(false) } }
  return <Modal title="Add calendar item" description={`Schedule an event for ${course.name}.`} onClose={onClose}><form className="l-form" onSubmit={submit}><Field label="Title" error={error}><Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field label="Date and time"><Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field><Field label="Type"><Select value={kind} onChange={(event) => setKind(event.target.value as 'event' | 'deadline')}><option value="event">Course event</option><option value="deadline">Deadline</option></Select></Field>{kind === 'deadline' && <Field label="Related assignment" hint="Optional"><Select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}><option value="">No assignment</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.name}</option>)}</Select></Field>}<Field label="Details" hint="Optional"><Textarea value={description} onChange={(event) => setDescription(event.target.value)} /></Field><div className="l-form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</Button></div></form></Modal>
}

function calendarDays(month: Date) { const blanks = Array.from<null>({ length: month.getDay() }).fill(null); const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(); const values = Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)); const tail = Array.from<null>({ length: (7 - ((blanks.length + values.length) % 7)) % 7 }).fill(null); return [...blanks, ...values, ...tail] }
function addMonth(value: Date, amount: number) { return new Date(value.getFullYear(), value.getMonth() + amount, 1) }
function sameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function formatDate(value: string) { return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
