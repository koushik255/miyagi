import { eq } from "drizzle-orm";
import { db } from "./db";
import { pushedCommits } from "./schema";
import type { Group } from "./group";

const decoder = new TextDecoder();

export type GroupDiff =
  | { mode: "commit"; commit: string; patch: string }
  | { mode: "range"; base: string; head: string; patch: string }
  | { mode: "working-tree"; patch: string };

export function getGroupHistory(group: Group) {
  if (!group.repoPath) return [];

  const result = Bun.spawnSync(
    ["git", "--git-dir", group.repoPath, "log", "--all", "--max-count=25", "--pretty=format:%H%x09%an%x09%ar%x09%s"],
    { stdout: "pipe", stderr: "pipe" },
  );

  if (!result.success) throw new Error(decoder.decode(result.stderr).trim());

  const pushRows = db.select().from(pushedCommits).where(eq(pushedCommits.groupId, group.id)).all();
  const pushedByByHash = new Map(pushRows.map((push) => [push.hash, push.pushedByUsername]));
  const text = decoder.decode(result.stdout).trim();

  return text ? text.split("\n").map((line) => parseHistoryLine(line, pushedByByHash)) : [];
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
      patch: runGit(group.repoPath, ["show", "--format=", "--find-renames", "--patch", commit, "--"]),
    };
  }

  if (base && head) {
    verifyCommit(group.repoPath, base);
    verifyCommit(group.repoPath, head);
    return {
      mode: "range",
      base,
      head,
      patch: runGit(group.repoPath, ["diff", "--find-renames", "--patch", `${base}..${head}`, "--"]),
    };
  }

  if (!group.workspacePath) throw new Error("No workspace path");

  return {
    mode: "working-tree",
    patch: runGit(group.repoPath, ["--work-tree", group.workspacePath, "diff", "--find-renames", "--patch", "HEAD", "--"]),
  };
}

function parseHistoryLine(line: string, pushedByByHash: Map<string, string>) {
  const [hash, author, when, ...message] = line.split("\t");
  return { hash, author, pushedBy: pushedByByHash.get(hash) ?? null, when, message: message.join("\t") };
}

function verifyCommit(repoPath: string, revision: string): void {
  runGit(repoPath, ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]);
}

function runGit(repoPath: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "--git-dir", repoPath, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.success) return decoder.decode(result.stdout);

  const stderr = decoder.decode(result.stderr).trim();
  throw new Error(stderr || `git ${args.join(" ")} failed`);
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
