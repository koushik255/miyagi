import { eq } from "drizzle-orm";
import { db } from "./db";
import { pushedCommits } from "./schema";
import type { Group } from "./group";

const decoder = new TextDecoder();

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

function parseHistoryLine(line: string, pushedByByHash: Map<string, string>) {
  const [hash, author, when, ...message] = line.split("\t");
  return { hash, author, pushedBy: pushedByByHash.get(hash) ?? null, when, message: message.join("\t") };
}
