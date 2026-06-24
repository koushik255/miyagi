import { createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { notFound, unauthorized } from "../errors";
import { Course } from "../course";
import { Professor, type GithubOAuthProfile } from "../professor";
import { User, type PublicUser } from "../user";

type ProfessorSession = ReturnType<typeof Professor.createForUser> & { user: PublicUser };

function professorSession(professor: ReturnType<typeof Professor.createForUser>, user: PublicUser): ProfessorSession {
  return { ...professor, user };
}

type GithubOAuthState = {
  professorId: string;
  returnTo: string;
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
    redirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI,
    scopes: process.env.GITHUB_OAUTH_SCOPES ?? "read:user repo",
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

function createGithubState(input: Pick<GithubOAuthState, "professorId" | "returnTo">, secret: string) {
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
  if (!payload.professorId || !payload.returnTo || !payload.expiresAt || payload.expiresAt < Date.now()) return undefined;
  return payload;
}

function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function withOauthResult(returnTo: string, result: string) {
  const separator = returnTo.includes("?") ? "&" : "?";
  return `${returnTo}${separator}github_oauth=${encodeURIComponent(result)}`;
}

function githubConnectionResponse(professorId: string): GithubConnectionResponse {
  const connection = Professor.githubConnection(professorId);
  return {
    connected: Boolean(connection),
    githubUsername: connection?.githubUsername ?? null,
    scope: connection?.scope ?? null,
  };
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
    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      return c.redirect(withOauthResult(returnTo, "missing_config"));
    }

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizeUrl.searchParams.set("scope", config.scopes);
    authorizeUrl.searchParams.set("state", createGithubState({ professorId: professor.id, returnTo }, config.stateSecret));
    return c.redirect(authorizeUrl.toString());
  });

  app.get("/auth/professor/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const config = githubOAuthConfig();
    const payload = state ? verifyGithubState(state, config.stateSecret) : undefined;
    const returnTo = safeReturnPath(payload?.returnTo);

    if (!code || !payload || !config.clientId || !config.clientSecret || !config.redirectUri) {
      return c.redirect(withOauthResult(returnTo, "failed"));
    }

    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.redirectUri,
        state,
      }),
    });
    const token = await tokenResponse.json() as GithubTokenResponse;
    if (!tokenResponse.ok || token.error || !token.access_token) return c.redirect(withOauthResult(returnTo, "failed"));

    const profileResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!profileResponse.ok) return c.redirect(withOauthResult(returnTo, "failed"));
    const profile = await profileResponse.json() as GithubOAuthProfile;
    try {
      Professor.connectGithubAccount(payload.professorId, profile, {
        accessToken: token.access_token,
        tokenType: token.token_type ?? null,
        scope: token.scope ?? null,
      });
    } catch {
      return c.redirect(withOauthResult(returnTo, "failed"));
    }

    return c.redirect(withOauthResult(returnTo, "connected"));
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
