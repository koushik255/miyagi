import { Effect, Schema } from "effect";
import type { Context, Hono } from "hono";
import { authSecret, clearAuthSession, readToken, requireAuthSession, setAuthSession, signToken, type AuthRole } from "../auth";
import { appError, forbidden, notFound, requestBody, runJson, runResponse, tryPromise, unauthorized } from "../errors";
import { Professor, type GithubOAuthProfile, type Professor as ProfessorRecord } from "../professor";
import { User, type PublicUser } from "../user";

type Role = AuthRole;
type ProfessorSession = ProfessorRecord & { user: PublicUser };
type GithubOAuthState = { role: Role; professorId?: string; returnTo: string; expiresAt: number; nonce: string };
type GithubLoginToken = { role: Role; userId: string; expiresAt: number; nonce: string };
type GithubTokenResponse = { access_token?: string; token_type?: string; scope?: string; error?: string };
type GithubOAuthFailure =
  | "denied"
  | "missing_config"
  | "missing_code"
  | "missing_professor"
  | "missing_state"
  | "invalid_state"
  | "redirect_origin_mismatch"
  | "token_exchange_failed"
  | "profile_fetch_failed"
  | "github_account_in_use"
  | "professor_account_conflict"
  | "failed";

const DeleteAccountInput = Schema.Struct({ confirmGithubUsername: Schema.optional(Schema.String) });
const OAUTH_FAILURES = new Set<GithubOAuthFailure>([
  "denied", "missing_config", "missing_code", "missing_professor", "missing_state", "invalid_state",
  "redirect_origin_mismatch", "token_exchange_failed", "profile_fetch_failed", "github_account_in_use",
  "professor_account_conflict", "failed",
]);

function githubOAuthConfig() {
  return {
    clientId: process.env.GITHUB_OAUTH_CLIENT_ID,
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,
    redirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI,
    stateSecret: authSecret(),
  };
}

const createGithubState = (role: Role, professorId: string | undefined, returnTo: string, secret: string) => signToken({
  role, professorId, returnTo, expiresAt: Date.now() + 10 * 60_000, nonce: crypto.randomUUID(),
}, secret);

function verifyGithubState(state: string, secret: string) {
  const payload = readToken<GithubOAuthState>(state, secret);
  return payload && (payload.role === "student" || payload.role === "professor")
    && payload.returnTo && payload.expiresAt >= Date.now() ? payload : undefined;
}

const createGithubLoginToken = (role: Role, userId: string, secret: string) => signToken({
  role, userId, expiresAt: Date.now() + 5 * 60_000, nonce: crypto.randomUUID(),
}, secret);

function verifyGithubLoginToken(token: string, secret: string, role: Role) {
  const payload = readToken<GithubLoginToken>(token, secret);
  return payload?.role === role && payload.userId && payload.expiresAt >= Date.now() ? payload : undefined;
}

const safeReturnPath = (value?: string) => value?.startsWith("/") && !value.startsWith("//") ? value : "/";

function withOauthParams(returnTo: string, params: Record<string, string>) {
  const hashIndex = returnTo.indexOf("#");
  const pathAndQuery = hashIndex === -1 ? returnTo : returnTo.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : returnTo.slice(hashIndex);
  return `${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}${new URLSearchParams(params)}${hash}`;
}

const oauthFailure = (returnTo: string, reason: GithubOAuthFailure) => withOauthParams(returnTo, { github_oauth: reason });

function requestOrigin(c: Context) {
  const url = new URL(c.req.url);
  const protocol = c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  const host = c.req.header("x-forwarded-host")?.split(",")[0]?.trim() || c.req.header("host") || url.host;
  return `${protocol}://${host}`;
}

function redirectOriginMatchesRequest(c: Context, redirectUri: string) {
  try {
    const redirect = new URL(redirectUri);
    const current = new URL(requestOrigin(c));
    if (redirect.origin === current.origin) return true;
    const localHosts = new Set(["localhost", "127.0.0.1"]);
    return redirect.protocol === current.protocol && localHosts.has(redirect.hostname) && localHosts.has(current.hostname);
  } catch {
    return false;
  }
}

function oauthError(reason: GithubOAuthFailure) {
  return Effect.fail(appError(502, reason));
}

function exchangeGithubCodeForProfile(input: { code: string; state: string; redirectUri: string; clientId: string; clientSecret: string }) {
  return Effect.gen(function* () {
    const tokenResponse = yield* tryPromise((signal) => fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: input.clientId,
        client_secret: input.clientSecret,
        code: input.code,
        redirect_uri: input.redirectUri,
        state: input.state,
      }),
      signal,
    }), "GitHub token exchange failed");
    const token = yield* tryPromise(() => tokenResponse.json() as Promise<GithubTokenResponse>, "GitHub token response was invalid");
    if (!tokenResponse.ok || token.error || !token.access_token) return yield* oauthError("token_exchange_failed");

    const profileResponse = yield* tryPromise((signal) => fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal,
    }), "GitHub profile request failed");
    if (!profileResponse.ok) return yield* oauthError("profile_fetch_failed");
    const profile = yield* tryPromise(() => profileResponse.json() as Promise<GithubOAuthProfile>, "GitHub profile response was invalid");
    return { token, profile };
  });
}

function startGithubOauth(c: Context, role: Role) {
  return Effect.gen(function* () {
    const returnTo = safeReturnPath(c.req.query("returnTo"));
    const professorId = role === "professor" ? c.req.query("professorId") : undefined;
    if (professorId) {
      const session = yield* requireAuthSession(c, "professor");
      if (session.professorId !== professorId || !(yield* Professor.findById(professorId))) {
        return yield* forbidden("Cannot connect GitHub for another professor");
      }
    }

    const config = githubOAuthConfig();
    if (!config.clientId || !config.clientSecret || !config.redirectUri) return c.redirect(oauthFailure(returnTo, "missing_config"));
    if (!redirectOriginMatchesRequest(c, config.redirectUri)) return c.redirect(oauthFailure(returnTo, "redirect_origin_mismatch"));

    const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
    authorizeUrl.searchParams.set("client_id", config.clientId);
    authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
    authorizeUrl.searchParams.set("scope", "read:user");
    authorizeUrl.searchParams.set("state", createGithubState(role, professorId, returnTo, config.stateSecret));
    return c.redirect(authorizeUrl.toString());
  });
}

function completeProfessorOauth(c: Context, payload: GithubOAuthState, github: {
  token: GithubTokenResponse;
  profile: GithubOAuthProfile;
}, secret: string) {
  return Effect.gen(function* () {
    const token = {
      accessToken: github.token.access_token!,
      tokenType: github.token.token_type ?? null,
      scope: github.token.scope ?? null,
    };
    if (payload.professorId) {
      if (!(yield* Professor.findById(payload.professorId))) return c.redirect(oauthFailure(payload.returnTo, "missing_professor"));
      yield* Professor.connectGithubAccount(payload.professorId, github.profile, token);
      return c.redirect(withOauthParams(payload.returnTo, { github_oauth: "connected" }));
    }

    const githubUserId = String(github.profile.id);
    const linkedProfessor = yield* Professor.findByGithubUserId(githubUserId);
    const linkedUser = linkedProfessor ? yield* User.findById(linkedProfessor.userId) : undefined;
    if (linkedProfessor && linkedUser) yield* User.connectGithubAccount(linkedUser.id, github.profile);
    const existingUser = linkedUser ?? (yield* User.findByGithubUserId(githubUserId));
    if (existingUser && (yield* Professor.findByUserId(existingUser.id))) {
      return c.redirect(oauthFailure(payload.returnTo, "professor_account_conflict"));
    }
    const user = existingUser ?? (yield* User.loginOrCreateWithGithub(github.profile));
    const professor = yield* Professor.createForUser(user.id);
    yield* Professor.connectGithubAccount(professor.id, github.profile, token);
    return c.redirect(withOauthParams(payload.returnTo, {
      github_oauth: "professor_connected",
      github_login_token: createGithubLoginToken("professor", user.id, secret),
    }));
  });
}

function completeStudentOauth(c: Context, payload: GithubOAuthState, github: { profile: GithubOAuthProfile }, secret: string) {
  return Effect.gen(function* () {
    const targetUser = yield* User.findByGithubUserId(String(github.profile.id));
    if (targetUser && (yield* Professor.findByUserId(targetUser.id))) {
      return c.redirect(oauthFailure(payload.returnTo, "professor_account_conflict"));
    }
    const user = yield* User.loginOrCreateWithGithub(github.profile);
    if (yield* Professor.findByUserId(user.id)) return c.redirect(oauthFailure(payload.returnTo, "professor_account_conflict"));
    return c.redirect(withOauthParams(payload.returnTo, {
      github_oauth: "student_connected",
      github_login_token: createGithubLoginToken("student", user.id, secret),
    }));
  });
}

function oauthReason(error: { message: string }): GithubOAuthFailure {
  if (OAUTH_FAILURES.has(error.message as GithubOAuthFailure)) return error.message as GithubOAuthFailure;
  return error.message.includes("already connected") ? "github_account_in_use" : "failed";
}

function completeGithubOauthCallback(c: Context) {
  const state = c.req.query("state");
  const config = githubOAuthConfig();
  const payload = state ? verifyGithubState(state, config.stateSecret) : undefined;
  const returnTo = safeReturnPath(payload?.returnTo);
  const program = Effect.gen(function* () {
    if (c.req.query("error")) return c.redirect(oauthFailure(returnTo, "denied"));
    if (!state) return c.redirect(oauthFailure(returnTo, "missing_state"));
    if (!payload) return c.redirect(oauthFailure(returnTo, "invalid_state"));
    const code = c.req.query("code");
    if (!code) return c.redirect(oauthFailure(returnTo, "missing_code"));
    if (!config.clientId || !config.clientSecret || !config.redirectUri) return c.redirect(oauthFailure(returnTo, "missing_config"));

    const github = yield* exchangeGithubCodeForProfile({
      code, state, redirectUri: config.redirectUri, clientId: config.clientId, clientSecret: config.clientSecret,
    });
    return yield* (payload.role === "professor"
      ? completeProfessorOauth(c, payload, github, config.stateSecret)
      : completeStudentOauth(c, payload, github, config.stateSecret));
  }).pipe(Effect.catchAll((error) => Effect.succeed(c.redirect(oauthFailure(returnTo, oauthReason(error))))));
  return runResponse(c, program);
}

export function registerUserRoutes(app: Hono) {
  app.delete("/users/:userId/account", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "student");
    if (c.req.param("userId") !== session.userId) return yield* forbidden("Cannot delete another user's account");
    const user = yield* User.findById(session.userId);
    if (!user) return yield* notFound("User not found");
    if (yield* Professor.findByUserId(user.id)) return yield* forbidden("Professor accounts cannot be deleted here");
    const { confirmGithubUsername } = yield* requestBody(c, DeleteAccountInput);
    if (!user.githubUsername || confirmGithubUsername?.trim().toLowerCase() !== user.githubUsername.trim().toLowerCase()) {
      return yield* forbidden("Enter your GitHub username to confirm account deletion");
    }
    yield* User.deleteStudentAccount(user.id);
    return { ok: true } as const;
  })));

  app.get("/professors/:professorId/github", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c, "professor");
    if (c.req.param("professorId") !== session.professorId) return yield* forbidden("Cannot access another professor's GitHub connection");
    const professor = yield* Professor.findById(session.professorId!);
    if (!professor) return yield* notFound("Professor not found");
    const connection = yield* Professor.githubConnection(professor.id);
    return { connected: Boolean(connection), githubUsername: connection?.githubUsername ?? null, scope: connection?.scope ?? null };
  })));

  app.get("/auth/professor/github/start", (c) => runResponse(c, startGithubOauth(c, "professor")));
  app.get("/auth/student/github/start", (c) => runResponse(c, startGithubOauth(c, "student")));
  app.get("/auth/github/callback", completeGithubOauthCallback);
  app.get("/auth/professor/github/callback", completeGithubOauthCallback);
  app.get("/auth/student/github/callback", completeGithubOauthCallback);

  app.get("/auth/professor/github/session", (c) => runJson(c, Effect.gen(function* () {
    const payload = verifyGithubLoginToken(c.req.query("token") ?? "", githubOAuthConfig().stateSecret, "professor");
    if (!payload) return yield* unauthorized("Invalid GitHub login token");
    const user = yield* User.findById(payload.userId);
    const professor = user ? yield* Professor.findByUserId(user.id) : undefined;
    if (!user || !professor) return yield* unauthorized("Invalid GitHub login token");
    const presentUser = yield* User.updatePresence(user.id);
    yield* setAuthSession(c, { role: "professor", userId: user.id, professorId: professor.id });
    return { ...professor, user: User.toPublicUser(presentUser) } satisfies ProfessorSession;
  })));

  app.get("/auth/student/github/session", (c) => runJson(c, Effect.gen(function* () {
    const payload = verifyGithubLoginToken(c.req.query("token") ?? "", githubOAuthConfig().stateSecret, "student");
    if (!payload) return yield* unauthorized("Invalid GitHub login token");
    const user = yield* User.findById(payload.userId);
    if (!user || (yield* Professor.findByUserId(user.id))) return yield* unauthorized("Invalid GitHub login token");
    const presentUser = yield* User.updatePresence(user.id);
    yield* setAuthSession(c, { role: "student", userId: user.id });
    return User.toPublicUser(presentUser);
  })));

  app.get("/auth/session", (c) => runJson(c, Effect.gen(function* () {
    const session = yield* requireAuthSession(c);
    const user = yield* User.findById(session.userId);
    if (!user) return yield* unauthorized("Session user no longer exists");
    if (session.role === "student") return { role: "student" as const, user: User.toPublicUser(user) };
    const professor = yield* Professor.findById(session.professorId!);
    if (!professor || professor.userId !== user.id) return yield* unauthorized("Professor session is no longer valid");
    return {
      role: "professor" as const,
      professor: { ...professor, user: User.toPublicUser(user) },
      displayName: user.displayName,
    };
  })));

  app.post("/auth/logout", (c) => runJson(c, clearAuthSession(c).pipe(Effect.as({ ok: true as const }))));
}
