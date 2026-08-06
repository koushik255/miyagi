import { Activity, GitCommit, GitPullRequestArrow, Users } from 'lucide-react'
import { studentAvatarStyle } from '../../avatar'
import { initials } from '../../format'
import type { ActivityDashboard } from '../../types'
import { Avatar } from '../../components/ui'

export function ContributorDetails({ data }: { data: ActivityDashboard }) {
  return <div className="l-contributor-details">
      <ContributionOverview people={data.byStudent} />
      <div className="l-contributor-table">
        <div className="l-contributor-head" aria-hidden="true"><span>Contributor</span><span>Commits</span><span>Changes</span><span>Files</span></div>
        {data.byStudent.map((person) => {
          const name = person.githubUsername ?? person.username ?? person.displayName
          return <article key={person.userId}>
            <div className="l-contributor-person"><Avatar fallback={initials(name)} style={studentAvatarStyle(person)} /><span><strong>{name}</strong>{name !== person.displayName && <small>{person.displayName}</small>}</span></div>
            <span className="l-contributor-stat"><GitCommit /><strong>{person.commits}</strong><small>commits</small></span>
            <span className="l-contributor-stat changes"><GitPullRequestArrow /><strong><i>+{person.additions}</i> <em>−{person.deletions}</em></strong><small>lines</small></span>
            <span className="l-contributor-stat"><Users /><strong>{person.changedFiles}</strong><small>files</small></span>
          </article>
        })}
      </div>
    </div>
}

function ContributionOverview({ people }: { people: ActivityDashboard['byStudent'] }) {
  const maxCommits = Math.max(...people.map((person) => person.commits), 1)
  const totalCommits = people.reduce((sum, person) => sum + person.commits, 0)
  const totalChanges = people.reduce((sum, person) => sum + person.additions + person.deletions, 0)

  return <section className="l-contribution-overview">
    <header><div><h3>Contribution overview</h3><p>Relative activity for the selected period.</p></div><div className="l-overview-totals"><span><strong>{totalCommits}</strong> commits</span><span><strong>{totalChanges}</strong> lines changed</span></div></header>
    {totalCommits === 0 ? <div className="l-contribution-empty"><Activity /><span><strong>No contribution activity</strong><small>No commits were recorded in the selected period.</small></span></div> : <div className="l-contribution-chart" role="img" aria-label={`Vertical chart comparing commit counts for ${people.length} contributors`}>
      <div className="l-chart-y-label" aria-hidden="true">Commits</div>
      <div className="l-chart-columns">
      {people.map((person) => {
        const name = person.githubUsername ?? person.username ?? person.displayName
        return <div className="l-chart-column" key={person.userId} aria-label={`${name}: ${person.commits} commits`}>
          <div className="l-column-value">{person.commits}</div>
          <div className="l-column-plot"><i style={{ height: `${person.commits / maxCommits * 100}%` }} /></div>
          <strong>{name}</strong>
        </div>
      })}
      </div>
    </div>}
  </section>
}
