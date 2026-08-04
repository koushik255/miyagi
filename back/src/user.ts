import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { db, nowIso, professors, users } from "./db";
import { badRequest, conflict, trySync } from "./errors";
import type { GithubOAuthProfile } from "./professor";

export type User = typeof users.$inferSelect;
export type PublicUser = User;

const STUDENT_AVATAR_COLORS = ["#3b82f6", "#ef4444", "#facc15", "#f97316", "#22c55e", "#ec4899"] as const;

function defaultAvatarColor(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return STUDENT_AVATAR_COLORS[hash % STUDENT_AVATAR_COLORS.length];
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export const User = {
  toPublicUser: (user: User) => user,

  createWithGithub(profile: GithubOAuthProfile) {
    return trySync(() => {
      const githubUserId = String(profile.id);
      const githubLogin = normalizeUsername(profile.login);
      const timestamp = nowIso();
      return db.insert(users).values({
        id: crypto.randomUUID(),
        deviceHash: githubLogin || `github:${githubUserId}`,
        displayName: profile.name?.trim() || profile.login,
        email: profile.email?.trim().toLowerCase() || null,
        githubUserId,
        githubUsername: profile.login,
        avatarColor: defaultAvatarColor(githubLogin),
        createdAt: timestamp,
        lastSeenAt: timestamp,
      }).returning().get();
    }, "Could not create user");
  },

  connectGithubAccount(id: string, profile: GithubOAuthProfile) {
    return Effect.gen(function* () {
      const existing = yield* User.findByGithubUserId(String(profile.id));
      if (existing && existing.id !== id) return yield* conflict("This GitHub account is already connected to another user");
      return yield* trySync(() => db.update(users).set({
        githubUserId: String(profile.id),
        githubUsername: profile.login,
        lastSeenAt: nowIso(),
      }).where(eq(users.id, id)).returning().get(), "Could not connect GitHub account");
    });
  },

  loginOrCreateWithGithub(profile: GithubOAuthProfile) {
    return Effect.gen(function* () {
      const githubLogin = normalizeUsername(profile.login);
      const email = profile.email?.trim().toLowerCase();
      const candidates = yield* Effect.all([
        User.findByGithubUserId(String(profile.id)),
        User.findByDeviceHash(githubLogin),
        email ? User.findByEmail(email) : Effect.succeed(undefined),
      ]);
      const existing = yield* trySync(() => candidates.find((candidate) => candidate
        && !db.select().from(professors).where(eq(professors.userId, candidate.id)).get()));
      return yield* (existing ? User.connectGithubAccount(existing.id, profile) : User.createWithGithub(profile));
    });
  },

  findByDeviceHash(deviceHash: string) {
    return trySync(() => db.select().from(users).where(sql`lower(${users.deviceHash}) = ${normalizeUsername(deviceHash)}`).get());
  },

  findByEmail(email: string) {
    return trySync(() => db.select().from(users).where(eq(users.email, email)).get());
  },

  findByGithubUserId(githubUserId: string) {
    return trySync(() => db.select().from(users).where(eq(users.githubUserId, githubUserId)).get());
  },

  findById(id: string) {
    return trySync(() => db.select().from(users).where(eq(users.id, id)).get());
  },

  deleteStudentAccount(id: string) {
    return Effect.gen(function* () {
      const user = yield* User.findById(id);
      if (!user) return yield* badRequest("Student account not found");
      const professor = yield* trySync(() => db.select().from(professors).where(eq(professors.userId, id)).get());
      if (professor) return yield* badRequest("Professor accounts cannot be deleted from student settings");
      yield* trySync(() => db.delete(users).where(eq(users.id, id)).run(), "Could not delete account");
    });
  },

  updatePresence(id: string) {
    return trySync(() => db.update(users).set({ lastSeenAt: nowIso() }).where(eq(users.id, id)).returning().get());
  },
};
