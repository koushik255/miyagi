import { eq } from "drizzle-orm";
import { db } from "./db";
import { runGitDir } from "./git-command";
import { pushedCommits } from "./schema";
import type { Group } from "./group";

const COMMIT_SEPARATOR = "\u001e";
const FIELD_SEPARATOR = "\u001f";

export type GroupDiff =
  | { mode: "commit"; commit: string; patch: string }
  | { mode: "range"; base: string; head: string; patch: string }
  | { mode: "working-tree"; patch: string };

export type GitCommitActivity = {
  hash: string;
  authorName: string;
  authorEmail: string;
  committedAt: string;
  message: string;
  additions: number;
  deletions: number;
  changedFiles: number;
};

export function getGroupCommitActivity(group: Group): GitCommitActivity[] {
  if (!group.repoPath) return [];

  const text = runGitDir(group.repoPath, [
    "log",
    "HEAD",
    "--no-merges",
    "--date=iso-strict",
    `--pretty=format:${COMMIT_SEPARATOR}%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%ae${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%s`,
    "--numstat",
  ]);
  if (!text.trim()) return [];

  return text
    .split(COMMIT_SEPARATOR)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n").filter(Boolean);
      const [hash, authorName, authorEmail, committedAt, ...messageParts] = (lines.shift() ?? "").split(FIELD_SEPARATOR);
      let additions = 0;
      let deletions = 0;
      let changedFiles = 0;

      for (const line of lines) {
        const [added, removed] = line.split("\t");
        if (!added || !removed) continue;
        changedFiles += 1;
        if (added !== "-") additions += Number(added) || 0;
        if (removed !== "-") deletions += Number(removed) || 0;
      }

      return {
        hash,
        authorName,
        authorEmail,
        committedAt,
        message: messageParts.join(FIELD_SEPARATOR),
        additions,
        deletions,
        changedFiles,
      };
    });
}

export function getGroupHistory(group: Group) {
  const pushRows = db.select().from(pushedCommits).where(eq(pushedCommits.groupId, group.id)).all();
  const pushedByByHash = new Map(pushRows.map((push) => [push.hash, push.pushedByUsername]));

  return getGroupCommitActivity(group)
    .slice(0, 25)
    .map((commit) => ({
      hash: commit.hash,
      author: commit.authorName,
      pushedBy: pushedByByHash.get(commit.hash) ?? null,
      when: commit.committedAt,
      message: commit.message,
    }));
}

export function getGroupDiff(group: Group, options: { base?: string; commit?: string; head?: string }): GroupDiff {
  if (!group.repoPath) throw new Error("No repository path");

  const commit = normalizeRevision(options.commit, "commit");
  const base = normalizeRevision(options.base, "base");
  const head = normalizeRevision(options.head, "head");

  if (commit && (base || head)) throw new Error("Use either commit or base/head, not both");
  if ((base && !head) || (!base && head)) throw new Error("Both base and head are required for a range diff");

  if (commit) {
    verifyCommit(group.repoPath, commit);
    return {
      mode: "commit",
      commit,
      patch: runGitDir(group.repoPath, ["show", "--format=", "--find-renames", "--patch", commit, "--"]),
    };
  }

  if (base && head) {
    verifyCommit(group.repoPath, base);
    verifyCommit(group.repoPath, head);
    return {
      mode: "range",
      base,
      head,
      patch: runGitDir(group.repoPath, ["diff", "--find-renames", "--patch", `${base}..${head}`, "--"]),
    };
  }

  if (!group.workspacePath) throw new Error("No workspace path");

  return {
    mode: "working-tree",
    patch: runGitDir(group.repoPath, ["--work-tree", group.workspacePath, "diff", "--find-renames", "--patch", "HEAD", "--"]),
  };
}

function verifyCommit(repoPath: string, revision: string): void {
  runGitDir(repoPath, ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]);
}

function normalizeRevision(value: string | undefined, name: string): string | undefined {
  if (!value) return undefined;

  const revision = value.trim();
  if (!revision) return undefined;
  if (revision.startsWith("-")) throw new Error(`Invalid ${name} revision`);
  if (/[\s\0]/.test(revision)) throw new Error(`Invalid ${name} revision`);
  if (!/^[A-Za-z0-9_./~^-]+$/.test(revision)) throw new Error(`Invalid ${name} revision`);

  return revision;
}
