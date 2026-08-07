import { eq, sql } from "drizzle-orm";
import { Effect } from "effect";
import { db, nowIso, professorAccess, professors, users } from "./db";
import { badRequest, forbidden, notFound, trySync } from "./errors";

export type ProfessorAccessRecord = typeof professorAccess.$inferSelect;

function normalize(username: string) {
  return username.trim().replace(/^@/, "").toLowerCase();
}

function valid(username: string) {
  return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username);
}

export const ProfessorAccess = {
  find(username: string) {
    return trySync(() => db.select().from(professorAccess)
      .where(sql`lower(${professorAccess.githubUsername}) = ${normalize(username)}`).get());
  },

  requireAllowed(username: string) {
    return Effect.gen(function* () {
      const access = yield* ProfessorAccess.find(username);
      if (!access) return yield* forbidden("This GitHub account is not authorized as a professor");
      return access;
    });
  },

  requireOwner(userId: string) {
    return Effect.gen(function* () {
      const user = yield* trySync(() => db.select().from(users).where(eq(users.id, userId)).get());
      if (!user?.githubUsername) return yield* forbidden("Only the professor owner can manage access");
      const access = yield* ProfessorAccess.find(user.githubUsername);
      if (!access?.isOwner) return yield* forbidden("Only the professor owner can manage access");
      return access;
    });
  },

  list() {
    return trySync(() => db.select({
      githubUsername: professorAccess.githubUsername,
      isOwner: professorAccess.isOwner,
      addedAt: professorAccess.addedAt,
      lastLoginAt: professorAccess.lastLoginAt,
      displayName: users.displayName,
      professorId: professors.id,
    }).from(professorAccess)
      .leftJoin(users, sql`lower(${users.githubUsername}) = lower(${professorAccess.githubUsername})`)
      .leftJoin(professors, eq(professors.userId, users.id))
      .orderBy(sql`${professorAccess.isOwner} DESC, lower(${professorAccess.githubUsername})`)
      .all());
  },

  add(username: string) {
    return Effect.gen(function* () {
      const normalized = normalize(username);
      if (!valid(normalized)) return yield* badRequest("Enter a valid GitHub username");
      return yield* trySync(() => db.insert(professorAccess).values({
        githubUsername: normalized,
        isOwner: false,
        addedAt: nowIso(),
      }).onConflictDoNothing().returning().get() ?? db.select().from(professorAccess)
        .where(eq(professorAccess.githubUsername, normalized)).get(), "Could not add professor access");
    });
  },

  remove(username: string) {
    return Effect.gen(function* () {
      const access = yield* ProfessorAccess.find(username);
      if (!access) return yield* notFound("Professor access was not found");
      if (access.isOwner) return yield* badRequest("The designated owner cannot be removed");
      yield* trySync(() => db.delete(professorAccess)
        .where(eq(professorAccess.githubUsername, access.githubUsername)).run(), "Could not remove professor access");
    });
  },

  recordLogin(username: string) {
    return trySync(() => db.update(professorAccess).set({ lastLoginAt: nowIso() })
      .where(sql`lower(${professorAccess.githubUsername}) = ${normalize(username)}`).run(), "Could not record professor login");
  },
};
