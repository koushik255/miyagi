import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { db, nowIso } from "./db";
import { GROUP_REPOS_ROOT, Group } from "./group";
import { Professor } from "./professor";
import { groupMembers, pushedCommits } from "./schema";
import { User } from "./user";

type AuthenticatedGitUser = {
  userId: string;
  username: string;
  professorId?: string;
};

type GitBackendInput = {
  body: ArrayBuffer;
  contentType: string;
  method: string;
  pathInfo: string;
  queryString: string;
  remoteUser: string;
};

type GitBackendOutput = {
  success: boolean;
  stdout: Uint8Array;
  stderr: string;
};

type CgiResponse = {
  body: Uint8Array;
  headers: Headers;
  status: number;
};

const textDecoder = new TextDecoder();

export async function handleGitHttp(c: Context): Promise<Response> {
  const user = authenticateGitRequest(c.req.header("authorization"));
  if (!user) return unauthorizedResponse();

  const requestUrl = new URL(c.req.url);
  const pathInfo = getGitPathInfo(requestUrl);
  const repoPath = getRepoPath(pathInfo);

  if (!repoPath) return c.text("Invalid Git repository path", 400);

  const group = Group.findByRepoPath(repoPath);
  if (!group) return c.text("Repository not found", 404);
  if (!canAccessGroup(user, group.id, group.professorId)) return c.text("Forbidden", 403);

  const isPushRequest = c.req.method === "POST" && pathInfo.endsWith("/git-receive-pack");
  const commitsBeforePush = isPushRequest ? listAllCommitHashes(group.repoPath!) : new Set<string>();

  const backendOutput = runGitHttpBackend({
    body: await c.req.arrayBuffer(),
    contentType: c.req.header("content-type") ?? "",
    method: c.req.method,
    pathInfo,
    queryString: requestUrl.searchParams.toString(),
    remoteUser: user.username,
  });

  if (!backendOutput.success) {
    return c.text(backendOutput.stderr || "git http-backend failed", 500);
  }

  if (isPushRequest) recordPushedCommits(group.id, group.repoPath!, user, commitsBeforePush);

  const response = parseCgiResponse(backendOutput.stdout);
  return new Response(toArrayBuffer(response.body), {
    status: response.status,
    headers: response.headers,
  });
}

function authenticateGitRequest(authorization: string | undefined): AuthenticatedGitUser | undefined {
  if (!authorization?.startsWith("Basic ")) return undefined;

  const credentials = decodeBasicAuth(authorization);
  if (!credentials) return undefined;

  const user = User.login(credentials.username, credentials.password);
  if (!user) return undefined;

  const professor = Professor.findByUserId(user.id);
  return {
    userId: user.id,
    username: credentials.username,
    professorId: professor?.id,
  };
}

function decodeBasicAuth(authorization: string): { username: string; password: string } | undefined {
  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator === -1) return undefined;

    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return undefined;
  }
}

function getGitPathInfo(url: URL): string {
  return decodeURIComponent(url.pathname.replace(/^\/git/, "")) || "/";
}

function getRepoPath(pathInfo: string): string | undefined {
  const parts = pathInfo.split("/").filter(Boolean);
  const gitDirectoryIndex = parts.findIndex((part) => part.endsWith(".git"));
  if (gitDirectoryIndex === -1) return undefined;

  return parts.slice(0, gitDirectoryIndex + 1).join("/");
}

function canAccessGroup(user: AuthenticatedGitUser, groupId: string, professorId: string): boolean {
  if (user.professorId === professorId) return true;

  const membership = db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.userId, user.userId), eq(groupMembers.groupId, groupId)))
    .get();

  return !!membership;
}

function listAllCommitHashes(repoPath: string): Set<string> {
  const result = Bun.spawnSync(["git", "--git-dir", repoPath, "rev-list", "--all"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  if (!result.success) return new Set();

  const output = textDecoder.decode(result.stdout).trim();
  return new Set(output ? output.split("\n") : []);
}

function recordPushedCommits(groupId: string, repoPath: string, user: AuthenticatedGitUser, commitsBeforePush: Set<string>): void {
  const commitsAfterPush = listAllCommitHashes(repoPath);
  const pushedAt = nowIso();

  for (const hash of commitsAfterPush) {
    if (commitsBeforePush.has(hash)) continue;

    db.insert(pushedCommits)
      .values({
        id: crypto.randomUUID(),
        groupId,
        hash,
        pushedByUserId: user.userId,
        pushedByUsername: user.username,
        pushedAt,
      })
      .onConflictDoNothing()
      .run();
  }
}

function runGitHttpBackend(input: GitBackendInput): GitBackendOutput {
  const result = Bun.spawnSync(["git", "http-backend"], {
    stdin: new Uint8Array(input.body),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      CONTENT_LENGTH: String(input.body.byteLength),
      CONTENT_TYPE: input.contentType,
      GIT_HTTP_EXPORT_ALL: "1",
      GIT_HTTP_RECEIVE_PACK: "1",
      GIT_PROJECT_ROOT: GROUP_REPOS_ROOT,
      PATH_INFO: input.pathInfo,
      QUERY_STRING: input.queryString,
      REMOTE_USER: input.remoteUser,
      REQUEST_METHOD: input.method,
    },
  });

  return {
    success: result.success,
    stdout: new Uint8Array(result.stdout),
    stderr: textDecoder.decode(result.stderr),
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function parseCgiResponse(stdout: Uint8Array): CgiResponse {
  const headerBoundary = findHeaderBoundary(stdout);
  const headerText = textDecoder.decode(stdout.slice(0, headerBoundary.headerEnd));
  const headers = parseCgiHeaders(headerText);
  const status = Number(headers.get("Status")?.split(" ")[0] ?? 200);

  headers.delete("Status");

  return {
    body: stdout.slice(headerBoundary.bodyStart),
    headers,
    status,
  };
}

function parseCgiHeaders(headerText: string): Headers {
  const headers = new Headers();

  for (const line of headerText.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    headers.append(line.slice(0, separator), line.slice(separator + 1).trim());
  }

  return headers;
}

function findHeaderBoundary(bytes: Uint8Array): { headerEnd: number; bodyStart: number } {
  for (let i = 0; i < bytes.length - 3; i++) {
    const isCrlfBoundary = bytes[i] === 13 && bytes[i + 1] === 10 && bytes[i + 2] === 13 && bytes[i + 3] === 10;
    if (isCrlfBoundary) return { headerEnd: i, bodyStart: i + 4 };
  }

  for (let i = 0; i < bytes.length - 1; i++) {
    const isLfBoundary = bytes[i] === 10 && bytes[i + 1] === 10;
    if (isLfBoundary) return { headerEnd: i, bodyStart: i + 2 };
  }

  return { headerEnd: 0, bodyStart: 0 };
}

function unauthorizedResponse(): Response {
  return new Response("Git credentials required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Miyagi Git"' },
  });
}
