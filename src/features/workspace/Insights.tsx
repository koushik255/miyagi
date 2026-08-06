import { useState } from 'react'
import { Activity, ExternalLink, GitCommit } from 'lucide-react'
import { api } from '../../api'
import type { ActivityDashboard, Period } from '../../types'
import { PageState } from '../../components/system'
import { useAsync } from '../../lib/useAsync'
import { ContributorDetails } from '../repositories/Contributors'

export function Insights({ id }: { id: string }) {
  const [period, setPeriod] = useState<Period>('weekly')
  const state = useAsync(() => api<ActivityDashboard>(`/assignment-repositories/${id}/dashboard?period=${period}`), [id, period])
  const data = state.data

  return <section className="l-insights">
    <header className="l-section-head"><div><h2>Activity overview</h2><p>Contributions and recent changes for the selected period.</p></div><div className="l-actions">
      <div className="l-segment" aria-label="Activity period">{(['weekly', 'monthly', 'semester'] as Period[]).map((value) => <button key={value} className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>{value === 'weekly' ? 'Week' : value === 'monthly' ? 'Month' : 'Term'}</button>)}</div>
    </div></header>
    <PageState loading={state.loading} error={state.error} onRetry={state.retry}>
      {data && <>
        {data.byStudent.length > 0 && <ContributorDetails data={data} />}
        <div className="l-activity-list">
          <div className="l-section-head compact"><div><h3>Recent changes</h3><p>The latest repository events in this period.</p></div></div>
          {data.recentActivity.length === 0 ? <div className="l-empty compact"><Activity /><span>No activity in this period.</span></div> : data.recentActivity.slice(0, 8).map((commit) => commit.htmlUrl ? <a className="l-commit-row" key={commit.hash} href={commit.htmlUrl} target="_blank" rel="noreferrer" aria-label={`Open commit ${commit.hash.slice(0, 7)} on GitHub`}><GitCommit /><div><strong>{commit.message.split('\n')[0]}</strong><span>{commit.matchedStudent?.displayName ?? commit.githubUsername ?? commit.authorName} · {formatTime(commit.when)}</span></div><code>{commit.hash.slice(0, 7)}</code><ExternalLink /></a> : <article key={commit.hash}><GitCommit /><div><strong>{commit.message.split('\n')[0]}</strong><span>{commit.matchedStudent?.displayName ?? commit.githubUsername ?? commit.authorName} · {formatTime(commit.when)}</span></div><code>{commit.hash.slice(0, 7)}</code></article>)}
        </div>
      </>}
    </PageState>
  </section>
}

function formatTime(value: string | null) {
  if (!value) return 'Unknown time'
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
