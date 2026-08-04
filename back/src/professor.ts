import { and, eq, ne } from "drizzle-orm";
import { Effect } from "effect";
import { db, nowIso, professorGithubAccounts, professors } from "./db";
import { conflict, notFound, trySync } from "./errors";
import { User } from "./user";

export type Professor = typeof professors.$inferSelect;
export type ProfessorGithubAccount = typeof professorGithubAccounts.$inferSelect;
export type GithubOAuthProfile = { id: number | string; login: string; name?: string | null; email?: string | null };
export type GithubOAuthToken = { accessToken: string; tokenType?: string | null; scope?: string | null };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const Professor = {
  createForUser(userId: string) {
    return Effect.gen(function* () {
      const existing = yield* Professor.findByUserId(userId);
      if (existing) return existing;
      const user = yield* User.findById(userId);
      const displayName = user?.displayName ?? "Professor";
      const pageSlug = yield* Professor.uniquePageSlug(displayName);
      return yield* trySync(() => db.insert(professors).values({
        id: crypto.randomUUID(),
        userId,
        pageSlug,
        pageTitle: `${displayName}'s courses`,
        createdAt: nowIso(),
      }).returning().get(), "Could not create professor");
    });
  },

  connectGithubAccount(professorId: string, profile: GithubOAuthProfile, token: GithubOAuthToken) {
    return Effect.gen(function* () {
      const professor = yield* Professor.findById(professorId);
      if (!professor) return yield* notFound("Professor not found");
      const existing = yield* trySync(() => db.select().from(professorGithubAccounts).where(and(
        eq(professorGithubAccounts.githubUserId, String(profile.id)),
        ne(professorGithubAccounts.professorId, professorId),
      )).get());
      if (existing) return yield* conflict("This GitHub account is already connected to another professor");

      const timestamp = nowIso();
      const connected = yield* trySync(() => db.insert(professorGithubAccounts).values({
        professorId,
        githubUserId: String(profile.id),
        githubUsername: profile.login,
        accessToken: token.accessToken,
        tokenType: token.tokenType ?? null,
        scope: token.scope ?? null,
        connectedAt: timestamp,
        updatedAt: timestamp,
      }).onConflictDoUpdate({
        target: professorGithubAccounts.professorId,
        set: {
          githubUserId: String(profile.id),
          githubUsername: profile.login,
          accessToken: token.accessToken,
          tokenType: token.tokenType ?? null,
          scope: token.scope ?? null,
          updatedAt: timestamp,
        },
      }).returning().get(), "Could not connect professor GitHub account");
      yield* User.connectGithubAccount(professor.userId, profile);
      return connected;
    });
  },

  githubConnection(professorId: string) {
    return trySync(() => db.select().from(professorGithubAccounts).where(eq(professorGithubAccounts.professorId, professorId)).get());
  },

  findByGithubUserId(githubUserId: string) {
    return Effect.gen(function* () {
      const account = yield* trySync(() => db.select().from(professorGithubAccounts).where(eq(professorGithubAccounts.githubUserId, githubUserId)).get());
      if (!account) return undefined;
      return yield* Professor.findById(account.professorId);
    });
  },

  uniquePageSlug(value: string) {
    return trySync(() => {
      const base = slugify(value) || "professor";
      let slug = base;
      let suffix = 2;
      while (db.select().from(professors).where(eq(professors.pageSlug, slug)).get()) slug = `${base}-${suffix++}`;
      return slug;
    });
  },

  findByUserId(userId: string) {
    return trySync(() => db.select().from(professors).where(eq(professors.userId, userId)).get());
  },

  findById(id: string) {
    return trySync(() => db.select().from(professors).where(eq(professors.id, id)).get());
  },
};
