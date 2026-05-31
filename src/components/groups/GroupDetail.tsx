import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { BookOpen, Users, FileText, GitCommit, PanelLeftClose, ClipboardList, UserPlus, Copy, Check, BarChart3 } from 'lucide-react'
import { api } from '../../api'
import { initials, relativeTime } from '../../format'
import { CodeViewer } from '../workspace/CodeViewer'
import { DiffViewer } from '../workspace/DiffViewer'
import { WorkspaceTree } from '../workspace/WorkspaceTree'
import type { Assignment, Course, Group, GroupDiff, HistoryEntry, Member, Role, WorkspaceFile } from '../../types'
import { PerformanceDashboard } from './PerformanceDashboard'

function showError(err: unknown, fallback = 'Something went wrong') {
  toast.error(err instanceof Error ? err.message : fallback)
}

type GroupDetailTab = 'dashboard' | 'files' | 'history' | 'students' | 'group'

export function GroupDetail({
  course,
  assignment,
  group,
  role,
  professorId,
  onSidebarContentChange,
}: {
  course: Course
  assignment: Assignment
  group: Group
  role: Role
  professorId?: string
  onSidebarContentChange?: (content: ReactNode | null) => void
}) {
  const [files, setFiles] = useState<WorkspaceFile[] | null>(null)
  const [activeFile, setActiveFile] = useState<WorkspaceFile | null>(null)
  const [content, setContent] = useState<string>('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[] | null>(null)
  const [activeHistoryEntry, setActiveHistoryEntry] = useState<HistoryEntry | null>(null)
  const [diffPatch, setDiffPatch] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [courseMembers, setCourseMembers] = useState<Member[] | null>(null)
  const [tab, setTab] = useState<GroupDetailTab>('dashboard')
  const [filesCollapsed, setFilesCollapsed] = useState(false)
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)

  const refreshMembers = useCallback(() => {
    return api<Member[]>(`/groups/${group.id}/members`).then(setMembers).catch(() => setMembers([]))
  }, [group.id])

  const openFile = useCallback(async (file: WorkspaceFile) => {
    setActiveFile(file)
    setLoadingContent(true)
    try {
      const result = await api<{ content: string }>(`/groups/${group.id}/files/content?path=${encodeURIComponent(file.path)}`)
      setContent(result.content)
    } catch (err) {
      showError(err)
      setContent('')
    } finally {
      setLoadingContent(false)
    }
  }, [group.id])

  const openDiff = useCallback(async (entry: HistoryEntry) => {
    setActiveHistoryEntry(entry)
    setLoadingDiff(true)
    try {
      const result = await api<GroupDiff>(`/groups/${group.id}/diff?commit=${encodeURIComponent(entry.hash)}`)
      setDiffPatch(result.patch)
    } catch (err) {
      showError(err, 'Could not read diff')
      setDiffPatch('')
    } finally {
      setLoadingDiff(false)
    }
  }, [group.id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiles(null); setHistory(null); setCourseMembers(null); setActiveFile(null); setActiveHistoryEntry(null); setContent(''); setDiffPatch(''); setLoadingDiff(false)
    api<WorkspaceFile[]>(`/groups/${group.id}/files`).then((fs) => {
      setFiles(fs)
      if (fs.length > 0) openFile(fs[0])
    }).catch((e) => { showError(e); setFiles([]) })
    api<HistoryEntry[]>(`/groups/${group.id}/history`).then((entries) => {
      setHistory(entries)
      if (entries.length > 0) openDiff(entries[0])
    }).catch(() => setHistory([]))
    refreshMembers()
    if (role === 'professor') {
      api<Member[]>(`/courses/${course.id}/members`).then(setCourseMembers).catch(() => setCourseMembers([]))
    }
  }, [course.id, group.id, openDiff, openFile, refreshMembers, role])

  const lastCommit = history && history.length > 0 ? history[0] : null
  const assignedUserIds = useMemo(() => new Set(members.map((member) => member.userId)), [members])
  const availableStudents = useMemo(
    () => (courseMembers ?? []).filter((member) => !assignedUserIds.has(member.userId)),
    [assignedUserIds, courseMembers],
  )

  const historySidebarContent = useMemo(() => {
    if (tab !== 'history') return null
    return (
      <HistoryCommitList
        entries={history}
        selectedHash={activeHistoryEntry?.hash ?? null}
        onSelect={openDiff}
      />
    )
  }, [activeHistoryEntry?.hash, history, openDiff, tab])

  useEffect(() => {
    onSidebarContentChange?.(historySidebarContent)
    return () => onSidebarContentChange?.(null)
  }, [historySidebarContent, onSidebarContentChange])

  const connectGithub = async () => {
    if (!professorId) return
    const githubRepoUrl = window.prompt('GitHub repository URL for this group', group.githubRepoUrl ?? '')
    if (!githubRepoUrl) return
    try {
      await api<Group>(`/groups/${group.id}/github`, {
        method: 'PATCH',
        body: JSON.stringify({ professorId, githubRepoUrl }),
      })
      toast.success('GitHub repository connected. Reopen the group or switch periods to refresh stats.')
    } catch (err) {
      showError(err, 'Could not connect GitHub repository')
    }
  }

  const assignStudent = async (student: Member) => {
    if (!professorId) return
    setAssigningUserId(student.userId)
    try {
      await api<Member>(`/groups/${group.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ professorId, userId: student.userId }),
      })
      toast.success(`${student.displayName} added to ${group.name}`)
      await refreshMembers()
    } catch (err) {
      showError(err, 'Could not add student')
    } finally {
      setAssigningUserId(null)
    }
  }

  return (
    <>
      <div className="detail-header compact">
        <div className="detail-title-row">
          <div className="title-block">
            <span className="course-tag" title={course.name}><BookOpen size={11} /> {course.name}</span>
            <span className="course-tag" title={assignment.name}><ClipboardList size={11} /> {assignment.name}</span>
            <h2>{group.name}</h2>
            <span className="meta-inline">
              <Users size={11} /> {members.length}
              {lastCommit && (
                <>
                  <span className="dot-sep" />
                  <GitCommit size={11} /> {relativeTime(lastCommit.when)}
                </>
              )}
            </span>
          </div>
          <div className="detail-actions">
            <div className="tabs" aria-label="Group workspace tabs">
              <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>
                <BarChart3 size={13} /> Dashboard
              </button>
              {role === 'professor' && (
                <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>
                  <UserPlus size={13} /> Add Students
                </button>
              )}
              {role === 'student' && (
                <button className={tab === 'group' ? 'active' : ''} onClick={() => setTab('group')}>
                  <Users size={13} /> Group
                  <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--muted)' }}>{members.length}</span>
                </button>
              )}
              <button className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}>
                <FileText size={13} /> Files
              </button>
              <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
                <GitCommit size={13} /> History
                {history && history.length > 0 && (
                  <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--muted)' }}>{history.length}</span>
                )}
              </button>
            </div>
            {role === 'professor' && (
              <button className="btn btn-sm" onClick={connectGithub}>Connect GitHub</button>
            )}
            {group.cloneUrl && <CloneUrlButton url={group.cloneUrl} />}
          </div>
        </div>
      </div>

      <div className="group-workspace">
        <div className="tab-body">
          {tab === 'dashboard' ? (
            <PerformanceDashboard kind="group" id={group.id} />
          ) : tab === 'files' ? (
            <div className={`file-layout ${filesCollapsed ? 'files-collapsed' : ''}`}>
              <div className="file-list-pane">
                <button
                  className="file-collapse-button"
                  onClick={() => setFilesCollapsed((collapsed) => !collapsed)}
                  title={filesCollapsed ? 'Show files' : 'Collapse files'}
                  aria-label={filesCollapsed ? 'Show files' : 'Collapse files'}
                >
                  {filesCollapsed ? <FileText size={15} /> : <PanelLeftClose size={15} />}
                </button>
                <div className="file-list">
                  {files === null ? (
                    <>
                      <div className="skeleton-row" />
                      <div className="skeleton-row" style={{ width: '60%' }} />
                      <div className="skeleton-row" style={{ width: '80%' }} />
                    </>
                  ) : files.length === 0 ? (
                    <div style={{ padding: 16, fontSize: 12.5, color: 'var(--muted)', textAlign: 'center' }}>
                      No files yet.
                    </div>
                  ) : (
                    <WorkspaceTree files={files} activePath={activeFile?.path ?? null} onOpenFile={openFile} />
                  )}
                </div>
              </div>
              <CodeViewer file={activeFile} content={content} loading={loadingContent} />
            </div>
          ) : tab === 'history' ? (
            <HistoryView
              entries={history}
              diff={<DiffViewer entry={activeHistoryEntry} loading={loadingDiff} patch={diffPatch} />}
            />
          ) : tab === 'group' ? (
            <GroupMembersView groupMembers={members} />
          ) : (
            <AddStudentsView
              courseMembers={courseMembers}
              groupMembers={members}
              availableStudents={availableStudents}
              assigningUserId={assigningUserId}
              onAssign={assignStudent}
            />
          )}
        </div>
      </div>
    </>
  )
}

function GroupMembersView({ groupMembers }: { groupMembers: Member[] }) {
  return (
    <div className="students-panel">
      <section className="student-section">
        <div className="student-section-header">
          <h3>Group members</h3>
          <span>{groupMembers.length}</span>
        </div>
        {groupMembers.length === 0 ? (
          <div className="student-empty">No students have been added to this group yet.</div>
        ) : (
          <div className="student-list compact">
            {groupMembers.map((student) => (
              <div className="student-row" key={student.userId}>
                <div className="student-avatar">{initials(student.displayName)}</div>
                <div className="student-main">
                  <span className="student-name">{student.displayName}</span>
                  <span className="student-meta">Added {relativeTime(student.joinedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function AddStudentsView({
  courseMembers,
  groupMembers,
  availableStudents,
  assigningUserId,
  onAssign,
}: {
  courseMembers: Member[] | null
  groupMembers: Member[]
  availableStudents: Member[]
  assigningUserId: string | null
  onAssign: (student: Member) => void
}) {
  if (courseMembers === null) {
    return (
      <div className="students-panel">
        <div className="skeleton-row" />
        <div className="skeleton-row" style={{ width: '70%' }} />
        <div className="skeleton-row" style={{ width: '85%' }} />
      </div>
    )
  }

  if (courseMembers.length === 0) {
    return (
      <div className="detail-empty">
        <div className="icon-circle"><Users size={22} /></div>
        <h3>No students in this course</h3>
        <p>Students will appear here after they join the course with the course code.</p>
      </div>
    )
  }

  return (
    <div className="students-panel">
      <section className="student-section">
        <div className="student-section-header">
          <h3>Available students</h3>
          <span>{availableStudents.length}</span>
        </div>
        {availableStudents.length === 0 ? (
          <div className="student-empty">Every course student is already in this group.</div>
        ) : (
          <div className="student-list">
            {availableStudents.map((student) => (
              <div className="student-row" key={student.userId}>
                <div className="student-avatar">{initials(student.displayName)}</div>
                <div className="student-main">
                  <span className="student-name">{student.displayName}</span>
                  <span className="student-meta">Joined course {relativeTime(student.joinedAt)}</span>
                </div>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={assigningUserId === student.userId}
                  onClick={() => onAssign(student)}
                >
                  <UserPlus size={12} />
                  {assigningUserId === student.userId ? 'Adding' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="student-section">
        <div className="student-section-header">
          <h3>Current group</h3>
          <span>{groupMembers.length}</span>
        </div>
        {groupMembers.length === 0 ? (
          <div className="student-empty">No students have been added to this group yet.</div>
        ) : (
          <div className="student-list compact">
            {groupMembers.map((student) => (
              <div className="student-row" key={student.userId}>
                <div className="student-avatar">{initials(student.displayName)}</div>
                <div className="student-main">
                  <span className="student-name">{student.displayName}</span>
                  <span className="student-meta">Added {relativeTime(student.joinedAt)}</span>
                </div>
                <span className="student-status">Assigned</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function CloneUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Clone URL copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed')
    }
  }
  return (
    <button className={`clone-url ${copied ? 'copied' : ''}`} onClick={copy} title={url}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      <span>{copied ? 'Copied' : 'Clone URL'}</span>
    </button>
  )
}


/* ============ History ============ */

function HistoryView({
  entries,
  diff,
}: {
  entries: HistoryEntry[] | null
  diff: ReactNode
}) {
  if (entries === null) {
    return (
      <div style={{ padding: 16 }}>
        <div className="skeleton-row" />
        <div className="skeleton-row" style={{ width: '70%' }} />
        <div className="skeleton-row" style={{ width: '85%' }} />
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="detail-empty">
        <div className="icon-circle"><GitCommit size={22} /></div>
        <h3>No commits yet</h3>
        <p>Commits will appear here once team members push to the repository.</p>
      </div>
    )
  }
  return (
    <div className="history-layout">
      {diff}
    </div>
  )
}

function HistoryCommitList({
  entries,
  selectedHash,
  onSelect,
}: {
  entries: HistoryEntry[] | null
  selectedHash: string | null
  onSelect: (entry: HistoryEntry) => void
}) {
  if (entries === null) {
    return (
      <div className="history-list">
        <div className="skeleton-row" />
        <div className="skeleton-row" style={{ width: '70%' }} />
        <div className="skeleton-row" style={{ width: '85%' }} />
      </div>
    )
  }

  if (entries.length === 0) {
    return <div className="sidebar-empty">No commits yet.</div>
  }

  return (
    <div className="history-list">
      {entries.map((entry) => (
        <button
          className={`history-row ${selectedHash === entry.hash ? 'active' : ''}`}
          key={entry.hash}
          title={entry.message}
          onClick={() => onSelect(entry)}
        >
          <span className="commit-dot" />
          <span className="message">{entry.message}</span>
          <span className="hash">{entry.hash.slice(0, 7)}</span>
          <span className="meta-line">
            {entry.pushedBy && <span>Pushed by: {entry.pushedBy}</span>}
            {entry.pushedBy && <span>·</span>}
            <span className="when" title={entry.when}>{relativeTime(entry.when)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
