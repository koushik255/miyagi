import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { forbidden, notFound, unauthorized } from "../errors";
import { Course } from "../course";
import { listGithubRepositories } from "../github";
import { Professor, type GithubOAuthProfile } from "../professor";
import { User, type PublicUser } from "../user";

type ProfessorSession = ReturnType<typeof Professor.createForUser> & { user: PublicUser };

function professorSession(professor: ReturnType<typeof Professor.createForUser>, user: PublicUser): ProfessorSession {
  return { ...professor, user };
}

type GithubOAuthState = {
  professorId?: string;
  userId?: string;
  returnTo: string;
  expiresAt: number;
  nonce: string;
};

type StudentGithubLoginToken = {
  role: "student";
  userId: string;
  expiresAt: number;
  nonce: string;
};

type GithubTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GithubConnectionResponse = {
  connected: boolean;
  githubUsername: string | null;
  scope: string | null;
};

function githubOAuthConfig() {
  return {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    professorRedirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI,
    studentRedirectUri: process.env.GITHUB_STUDENT_OAUTH_REDIRECT_URI
      ?? process.env.GITHUB_OAUTH_STUDENT_REDIRECT_URI
      ?? process.env.GITHUB_OAUTH_REDIRECT_URI?.replace("/auth/professor/github/callback", "/auth/student/github/callback"),
    professorScopes: process.env.GITHUB_OAUTH_SCOPES ?? "read:user repo",
    studentScopes: process.env.GITHUB_STUDENT_OAUTH_SCOPES ?? process.env.GITHUB_OAUTH_STUDENT_SCOPES ?? "read:user repo",
    stateSecret: process.env.GITHUB_OAUTH_STATE_SECRET ?? process.env.GITHUB_OAUTH_CLIENT_SECRET ?? "miyagi-dev-oauth-state",
  };
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function createGithubState(input: Pick<GithubOAuthState, "professorId" | "userId" | "returnTo">, secret: string) {
  const payload: GithubOAuthState = {
    ...input,
    expiresAt: Date.now() + 10 * 60_000,
    nonce: crypto.randomUUID(),
  };
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded, secret)}`;
}

function verifyGithubState(state: string, secret: string): GithubOAuthState | undefined {
  const [encoded, signature] = state.split(".");
  if (!encoded || !signature) return undefined;
  if (!timingSafeStringEqual(signPayload(encoded, secret), signature)) return undefined;
  const payload = JSON.parse(fromBase64Url(encoded)) as GithubOAuthState;
  if (!payload.returnTo || !payload.expiresAt || payload.expiresAt < Date.now()) return undefined;
  return payload;
}

function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function withOauthResult(returnTo: string, result: string) {
  return withOauthParams(returnTo, { github_oauth: result });
}

function withOauthParams(returnTo: string, params: Record<string, string>) {
  const hashIndex = returnTo.indexOf("#");
  const pathAndQuery = hashIndex === -1 ? returnTo : returnTo.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : returnTo.slice(hashIndex);
  const separator = pathAndQuery.includes("?") ? "&" : "?";
  const query = new URLSearchParams(params).toString();
  return `${pathAndQuery}${separator}${query}${hash}`;
}

function githubConnectionResponse(professorId: string): GithubConnectionResponse {
  const connection = Professor.githubConnection(professorId);
  return {
    connected: Boolean(connection),
    githubUsername: connection?.githubUsername ?? null,
    scope: connection?.scope ?? null,
  };
}

function createStudentGithubLoginToken(userId: string, secret: string) {
  const payload: StudentGithubLoginToken = {
    role: "student",
    userId,
    expiresAt: Date.now() + 5 * 60_000,
    nonce: crypto.randomUUID(),
  };
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded, secret)}`;
}

function verifyStudentGithubLoginToken(token: string, secret: string): StudentGithubLoginToken | undefined {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return undefined;
  if (!timingSafeStringEqual(signPayload(encoded, secret), signature)) return undefined;
  const payload = JSON.parse(fromBase64Url(encoded)) as StudentGithubLoginToken;
  if (payload.role !== "student" || !payload.userId || !payload.expiresAt || payload.expiresAt < Date.now()) return undefined;
  return payload;
}

async function exchangeGithubCodeForProfile(input: { code: string; state: string; redirectUri: string; clientId: string; clientSecret: string }) {
  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: input.redirectUri,
      state: input.state,
    }),
  });
  const token = await tokenResponse.json() as GithubTokenResponse;
  if (!tokenResponse.ok || token.error || !token.access_token) return undefined;

  const profileResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!profileResponse.ok) return undefined;
  const profile = await profileResponse.json() as GithubOAuthProfile;
  return { token, profile };
}

export function registerUserRoutes(app: Hono) {
  app.post("/users", async (c) => {
    const body = await c.req.json<{ deviceHash: string; displayName?: string }>();
    return c.json(User.toPublicUser(User.createOrGet(body.deviceHash, body.displayName)));
  });

  app.patch("/users/:userId/account", async (c) => {
    const body = await c.req.json<{ displayName?: string; githubUsername?: string; avatarColor?: string | null }>();
    const user = User.findById(c.req.param("userId"));
    if (!user) notFound("User not found");
    return c.json(User.toPublicUser(User.updateAccount(user.id, body)));
  });

  app.patch("/users/:userId/password", async (c) => {
    const body = await c.req.json<{ currentPassword: string; newPassword: string }>();
    const user = User.findById(c.req.param("userId"));
    if (!user) notFound("User not found");
    User.updatePassword(user.id, body.currentPassword, body.newPassword);
    return c.json({ ok: true });
  });

  app.patch("/users/:userId/github", async (c) => {
    const body = await c.req.json<{ githubUsername?: string }>();
    const user = User.findById(c.req.param("userId"));
    if (!user) notFound("User not found");
    return c.json(User.toPublicUser(User.setGithubUsername(user.id, body.githubUsername)));
  });

  app.get("/users/:userId/github/repositories", async (c) => {
    const user = User.findById(c.req.param("userId"));
    if (!user) notFound("User not found");
    if (Professor.findByUserId(user.id)) forbidden("Professor accounts cannot select student repositories");
    const githubAccount = User.githubConnection(user.id);
    if (!githubAccount) unauthorized("Connect GitHub before selecting repositories");
    return c.json(await listGithubRepositories(githubAccount.accessToken));
  });

  app.post("/professors", async (c) => {
    const body = await c.req.json<{ deviceHash: string; displayName?: string; password?: string }>();
    const professor = Professor.createOrGetByDevice(body.deviceHash, body.displayName, body.password ?? body.deviceHash);
    const user = User.findById(professor.userId);
    if (!user) notFound("Professor account not found");
    return c.json(professorSession(professor, User.toPublicUser(user)));
  });

  app.get("/professor-pages/:pageSlug", (c) => {
    const professor = Professor.findByPageSlug(c.req.param("pageSlug"));
    if (!professor) notFound("Professor page not found");
    const user = User.findById(professor.userId);
    if (!user) notFound("Professor account not found");
    return c.json({
      professor,
      user: User.toPublicUser(user),
      courses: Course.listByProfessor(professor.id),
    });
  });

  app.patch("/professors/:professorId/page", async (c) => {
    const professor = Professor.findById(c.req.param("professorId"));
    if (!professor) notFound("Professor not found");
    const body = await c.req.json<{ pageSlug?: string; pageTitle?: string }>();
    return c.json(Professor.updatePage(professor.id, body));
  });

  app.get("/professors/:professorId/github", (c) => {
    const professor = Professor.findById(c.req.param("professorId"));
    if (!professor) notFound("Professor not found");
    return c.json(githubConnectionResponse(professor.id));
  });

  app.delete("/professors/:professorId/github", (c) => {
    const professor = Professor.findById(c.req.param("professorId"));
    if (!professor) notFound("Professor not found");
    Professor.disconnectGithubAccount(professor.id);
    return c.json(githubConnectionResponse(professor.id));
  });

  app.get("/auth/professor/github/start", (c) => {
    const professorId = c.req.query("professorId");
    const returnTo = safeReturnPath(c.req.query("returnTo"));
    const professor = professorId ? Professor.findById(professorId) : undefined;
    if (!professor) return c.redirect(withOauthResult(returnTo, "missing_professor"));

    const config = githubOAuthConfig();
    if (!config.clientId || !config.clientSecret || !config.professorRedirectUri) {
      return c.redirect(withOauthResult(returnTo, "missing_config"));
    }

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", config.professorRedirectUri);
    authorizeUrl.searchParams.set("scope", config.professorScopes);
    authorizeUrl.searchParams.set("state", createGithubState({ professorId: professor.id, returnTo }, config.stateSecret));
    return c.redirect(authorizeUrl.toString());
  });

  app.get("/auth/professor/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const config = githubOAuthConfig();
    const payload = state ? verifyGithubState(state, config.stateSecret) : undefined;
    const returnTo = safeReturnPath(payload?.returnTo);

    if (!code || !payload?.professorId || !config.clientId || !config.clientSecret || !config.professorRedirectUri) {
      return c.redirect(withOauthResult(returnTo, "failed"));
    }

    const github = await exchangeGithubCodeForProfile({
      code,
      state,
      redirectUri: config.professorRedirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    if (!github) return c.redirect(withOauthResult(returnTo, "failed"));

    try {
      Professor.connectGithubAccount(payload.professorId, github.profile, {
        accessToken: github.token.access_token!,
        tokenType: github.token.token_type ?? null,
        scope: github.token.scope ?? null,
      });
    } catch {
      return c.redirect(withOauthResult(returnTo, "failed"));
    }

    return c.redirect(withOauthResult(returnTo, "connected"));
  });

  app.get("/auth/student/github/start", (c) => {
    const returnTo = safeReturnPath(c.req.query("returnTo"));
    const userId = c.req.query("userId");
    const user = userId ? User.findById(userId) : undefined;
    if (userId && (!user || Professor.findByUserId(user.id))) {
      return c.redirect(withOauthResult(returnTo, "missing_student"));
    }

    const config = githubOAuthConfig();
    if (!config.clientId || !config.clientSecret || !config.studentRedirectUri) {
      return c.redirect(withOauthResult(returnTo, "missing_config"));
    }

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", config.studentRedirectUri);
    authorizeUrl.searchParams.set("scope", config.studentScopes);
    authorizeUrl.searchParams.set("state", createGithubState({ userId: user?.id, returnTo }, config.stateSecret));
    return c.redirect(authorizeUrl.toString());
  });

  app.get("/auth/student/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const config = githubOAuthConfig();
    const payload = state ? verifyGithubState(state, config.stateSecret) : undefined;
    const returnTo = safeReturnPath(payload?.returnTo);

    if (!code || !payload || !config.clientId || !config.clientSecret || !config.studentRedirectUri) {
      return c.redirect(withOauthResult(returnTo, "failed"));
    }

    const github = await exchangeGithubCodeForProfile({
      code,
      state,
      redirectUri: config.studentRedirectUri,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    if (!github) return c.redirect(withOauthResult(returnTo, "failed"));
    const targetUser = payload.userId ? User.findById(payload.userId) : User.findByGithubUserId(String(github.profile.id));
    if (payload.userId && !targetUser) return c.redirect(withOauthResult(returnTo, "failed"));
    if (targetUser && Professor.findByUserId(targetUser.id)) return c.redirect(withOauthResult(returnTo, "failed"));

    try {
      const studentToken = {
        accessToken: github.token.access_token!,
        tokenType: github.token.token_type ?? null,
        scope: github.token.scope ?? null,
      };
      const user = payload.userId
        ? User.connectGithubAccount(payload.userId, github.profile, studentToken)
        : User.loginOrCreateWithGithub(github.profile, studentToken);
      if (Professor.findByUserId(user.id)) return c.redirect(withOauthResult(returnTo, "failed"));

      return c.redirect(withOauthParams(returnTo, {
        github_oauth: "student_connected",
        github_login_token: createStudentGithubLoginToken(user.id, config.stateSecret),
      }));
    } catch {
      return c.redirect(withOauthResult(returnTo, "failed"));
    }
  });

  app.get("/auth/student/github/session", (c) => {
    const token = c.req.query("token");
    const config = githubOAuthConfig();
    const payload = token ? verifyStudentGithubLoginToken(token, config.stateSecret) : undefined;
    if (!payload) unauthorized("Invalid GitHub login token");

    const user = User.findById(payload.userId);
    if (!user || Professor.findByUserId(user.id)) unauthorized("Invalid GitHub login token");
    return c.json(User.toPublicUser(User.updatePresence(user.id)));
  });

  app.post("/auth/student/login", async (c) => {
    const body = await c.req.json<{ username: string; password: string }>();
    const user = User.login(body.username, body.password);
    if (!user) unauthorized("Invalid student credentials");
    if (Professor.findByUserId(user.id)) unauthorized("Invalid student credentials");
    return c.json(User.toPublicUser(user));
  });

  app.post("/auth/student/register", async (c) => {
    const body = await c.req.json<{ username: string; password: string; displayName?: string }>();
    return c.json(User.toPublicUser(User.createAccount(body)));
  });

  app.post("/auth/professor/login", async (c) => {
    const body = await c.req.json<{ username: string; password: string }>();
    const user = User.login(body.username, body.password);
    if (!user) unauthorized("Invalid professor credentials");
    const professor = Professor.findByUserId(user.id);
    if (!professor) unauthorized("Invalid professor credentials");
    return c.json(professorSession(professor, User.toPublicUser(user)));
  });

  app.post("/auth/professor/register", async (c) => {
    const body = await c.req.json<{ username: string; password: string; displayName?: string }>();
    const user = User.createAccount(body);
    const professor = Professor.createForUser(user.id);
    return c.json(professorSession(professor, User.toPublicUser(user)));
  });
}
