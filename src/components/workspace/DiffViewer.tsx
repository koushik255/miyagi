import { useMemo } from 'react'
import { AlertCircle, GitCommit, FileText } from 'lucide-react'
import { parsePatchFiles, type FileDiffMetadata } from '@pierre/diffs'
import { FileDiff, Virtualizer } from '@pierre/diffs/react'
import type { HistoryEntry } from '../../types'

export function DiffViewer({
  entry,
  loading,
  patch,
}: {
  entry: HistoryEntry | null
  loading: boolean
  patch: string
}) {
  const entryHash = entry?.hash
  const parsedDiff = useMemo(() => {
    if (!patch.trim()) return { files: [] as FileDiffMetadata[], error: null as string | null }

    try {
      return {
        files: parsePatchFiles(patch, entryHash, false).flatMap((parsedPatch) => parsedPatch.files),
        error: null,
      }
    } catch (error) {
      return {
        files: [] as FileDiffMetadata[],
        error: error instanceof Error ? error.message : 'Could not parse diff',
      }
    }
  }, [entryHash, patch])

  if (!entry) {
    return (
      <div className="diff-pane">
        <div className="diff-header">
          <span><GitCommit size={13} /> No commit selected</span>
        </div>
        <div className="code-empty">
          <div className="icon-circle"><GitCommit size={20} /></div>
          <div>Select a commit to view its changes.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="diff-pane">
      <div className="diff-header">
        <span title={entry.message}>
          <GitCommit size={13} />
          <strong>{entry.hash.slice(0, 7)}</strong>
          <span>{entry.message}</span>
        </span>
      </div>
      <div className="diff-body">
        {loading ? (
          <div style={{ padding: 16, color: 'var(--muted)' }}>Loading diff...</div>
        ) : parsedDiff.error ? (
          <div className="code-empty">
            <div className="icon-circle"><AlertCircle size={20} /></div>
            <div>{parsedDiff.error}</div>
          </div>
        ) : parsedDiff.files.length > 0 ? (
          <Virtualizer className="pierre-diff-virtualizer">
            <div className="pierre-diff-stack">
              {parsedDiff.files.map((fileDiff, index) => (
                <FileDiff
                  className="pierre-diff"
                  fileDiff={fileDiff}
                  key={`${fileDiff.prevName ?? fileDiff.name}-${index}`}
                  options={{
                    diffStyle: 'split',
                    theme: 'pierre-light',
                  }}
                />
              ))}
            </div>
          </Virtualizer>
        ) : (
          <div className="code-empty">
            <div className="icon-circle"><FileText size={20} /></div>
            <div>No file changes in this commit.</div>
          </div>
        )}
      </div>
    </div>
  )
}
