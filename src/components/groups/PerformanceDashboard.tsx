import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, GitCommit, TrendingUp, Users, FileText } from 'lucide-react'
import { api } from '../../api'
import { initials, relativeTime } from '../../format'
import type { ActivityDashboard, Period } from '../../types'

export function PerformanceDashboard({ kind, id }: { kind: 'assignment' | 'group'; id: string }) {
  const [period, setPeriod] = useState<Period>('weekly')
  const [data, setData] = useState<ActivityDashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false

    api<ActivityDashboard>(`/${kind === 'assignment' ? 'assignments' : 'groups'}/${id}/dashboard?period=${period}`)
      .then((dashboard) => {
        if (ignore) return
        setData(dashboard)
        setError(null)
      })
      .catch((err) => {
        if (ignore) return
        setError(err instanceof Error ? err.message : 'Could not load dashboard')
      })

    return () => {
      ignore = true
    }
  }, [id, kind, period])

  const maxCommits = useMemo(() => Math.max(1, ...(data?.byStudent ?? []).map((s) => s.commits)), [data])

  if (error) return <div className="dash-empty"><AlertTriangle size={18} /> {error}</div>
  if (!data) return <div className="analytics-grid"><div className="analytics-card span-2"><div className="skeleton-row" /><div className="skeleton-row" style={{ width: '60%' }} /></div></div>

  return (
    <div className="analytics-page">
      <div className="analytics-toolbar">
        <div>
          <h3>{kind === 'assignment' ? 'Class performance dashboard' : 'Group performance dashboard'}</h3>
          <p>Contribution tracking for weekly, monthly, and semester views.</p>
        </div>
        <div className="period-tabs">
          {(['weekly', 'monthly', 'semester'] as Period[]).map((p) => (
            <button key={p} className={period === p ? 'active' : ''} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      <div className="metric-grid">
        <Metric icon={<Users size={15} />} label="Students" value={data.totals.students} />
        {'groups' in data.totals && <Metric icon={<Users size={15} />} label="Groups" value={data.totals.groups ?? 0} />}
        <Metric icon={<GitCommit size={15} />} label="Commits" value={data.totals.commits} />
        <Metric icon={<FileText size={15} />} label="Files changed" value={data.totals.changedFiles} />
      </div>

      <div className="analytics-grid">
        <section className="analytics-card span-2">
          <div className="card-head"><h4>Student contribution graph</h4><span>commits</span></div>
          <div className="bar-list">
            {data.byStudent.length === 0 ? <div className="dash-empty">No students yet.</div> : data.byStudent.map((student) => (
              <div className="bar-row" key={student.userId}>
                <span className="mini-avatar">{initials(student.displayName)}</span>
                <span className="bar-name">{student.displayName}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${(student.commits / maxCommits) * 100}%` }} /></div>
                <strong>{student.commits}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="analytics-card">
          <div className="card-head"><h4>Top performers</h4><TrendingUp size={14} /></div>
          <RankList students={data.topStudents} empty="No commits yet." />
        </section>

        <section className="analytics-card">
          <div className="card-head"><h4>May need support</h4><AlertTriangle size={14} /></div>
          <RankList students={data.lowActivityStudents} empty="No students to show." muted />
        </section>

        <section className="analytics-card span-2">
          <div className="card-head"><h4>Recent activity</h4><span>{data.recentActivity.length}</span></div>
          <div className="activity-feed">
            {data.recentActivity.length === 0 ? <div className="dash-empty">No recent activity in this period.</div> : data.recentActivity.map((commit) => (
              <div className="activity-row" key={commit.hash}>
                <GitCommit size={14} />
                <div>
                  <strong>{commit.message.split('\n')[0]}</strong>
                  <span>{commit.matchedStudent?.displayName ?? commit.githubUsername ?? commit.authorName} · {commit.groupName ?? 'repo'} · {commit.when ? relativeTime(commit.when) : 'unknown time'}</span>
                </div>
                <span className="code-chip">+{commit.additions} -{commit.deletions}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="metric-card"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>
}

function RankList({ students, empty, muted }: { students: ActivityDashboard['byStudent']; empty: string; muted?: boolean }) {
  if (students.length === 0) return <div className="dash-empty">{empty}</div>
  return <div className="rank-list">{students.map((student, index) => (
    <div className="rank-row" key={student.userId}>
      <span className={muted ? 'rank-index warn' : 'rank-index'}>{index + 1}</span>
      <div><strong>{student.displayName}</strong><span>{student.commits} commits · {student.changedFiles} files</span></div>
    </div>
  ))}</div>
}
