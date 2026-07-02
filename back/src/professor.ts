import { and, eq, ne } from "drizzle-orm";
import { db, nowIso } from "./db";
import { professorGithubAccounts, professors } from "./schema";
import { User } from "./user";
import { conflict } from "./errors";

export type Professor = typeof professors.$inferSelect;
export type NewProfessor = typeof professors.$inferInsert;


export type ProfessorGithubAccount = typeof professorGithubAccounts.$inferSelect;
export type NewProfessorGithubAccount = typeof professorGithubAccounts.$inferInsert;

export type GithubOAuthProfile = {
  id: number | string;
  login: string;
  name?: string | null;
  email?: string | null;
}

export type GithubOAuthToken = {
  accessToken: string;
  tokenType?: string | null;
  scope?: string | null;
}
function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const Professor = {
  createForUser(userId: string): Professor {
    const existing = this.findByUserId(userId);
    if (existing) return existing;

    const user = User.findById(userId);
    const displayName = user?.displayName ?? "Professor";
    const professor: NewProfessor = {
      id: crypto.randomUUID(),
      userId,
      pageSlug: this.uniquePageSlug(displayName),
      pageTitle: `${displayName}'s courses`,
      createdAt: nowIso(),
    };

    return db.insert(professors).values(professor).returning().get();
  },

  createOrGetByDevice(deviceHash: string, displayName = "Professor", password?: string): Professor {
    const user = User.createOrGet(deviceHash, displayName, password);
    return this.createForUser(user.id);
  },

  login(deviceHash: string, password: string): Professor | undefined {
    const user = User.login(deviceHash, password);
    if (!user) return undefined;
    return this.findByUserId(user.id);
  },

  updatePage(professorId: string, input: { pageSlug?: string; pageTitle?: string }): Professor {
    const update: Partial<Pick<Professor, "pageSlug" | "pageTitle">> = {};
    if (input.pageSlug !== undefined) update.pageSlug = this.uniquePageSlug(input.pageSlug, professorId);
    if (input.pageTitle !== undefined) update.pageTitle = input.pageTitle.trim() || "Course page";
    return db.update(professors).set(update).where(eq(professors.id, professorId)).returning().get();
  },

  connectGithubAccount(professorId: string, profile: GithubOAuthProfile, token: GithubOAuthToken): ProfessorGithubAccount {
    const professor = this.findById(professorId);
    if (!professor) throw new Error("Professor not found");

    const existingGithubAccount = db
      .select()
      .from(professorGithubAccounts)
      .where(and(
        eq(professorGithubAccounts.githubUserId, String(profile.id)),
        ne(professorGithubAccounts.professorId, professorId),
      ))
      .get();
    if (existingGithubAccount) conflict("This GitHub account is already connected to another professor");

    const timestamp = nowIso();
    const account: NewProfessorGithubAccount = {
      professorId,
      githubUserId: String(profile.id),
      githubUsername: profile.login,
      accessToken: token.accessToken,
      tokenType: token.tokenType ?? null,
      scope: token.scope ?? null,
      connectedAt: timestamp,
      updatedAt: timestamp,
    };

    const connected = db
      .insert(professorGithubAccounts)
      .values(account)
      .onConflictDoUpdate({
        target: professorGithubAccounts.professorId,
        set: {
          githubUserId: account.githubUserId,
          githubUsername: account.githubUsername,
          accessToken: account.accessToken,
          tokenType: account.tokenType,
          scope: account.scope,
          updatedAt: account.updatedAt,
        },
      })
      .returning()
      .get();
    User.setGithubUsername(professor.userId, profile.login);
    return connected;
  },

  disconnectGithubAccount(professorId: string): void {
    const professor = this.findById(professorId);
    if (!professor) throw new Error("Professor not found");
    db.delete(professorGithubAccounts).where(eq(professorGithubAccounts.professorId, professorId)).run();
    User.setGithubUsername(professor.userId, undefined);
  },

  githubConnection(professorId: string): ProfessorGithubAccount | undefined {
    return db.select().from(professorGithubAccounts).where(eq(professorGithubAccounts.professorId, professorId)).get();
  },

  uniquePageSlug(value: string, currentProfessorId?: string): string {
    const base = slugify(value) || "professor";
    let slug = base;
    let suffix = 2;
    while (true) {
      const existing = this.findByPageSlug(slug);
      if (!existing || existing.id === currentProfessorId) return slug;
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
  },

  findByPageSlug(pageSlug: string): Professor | undefined {
    return db.select().from(professors).where(eq(professors.pageSlug, slugify(pageSlug))).get();
  },

  findByUserId(userId: string): Professor | undefined {
    return db.select().from(professors).where(eq(professors.userId, userId)).get();
  },

  findById(id: string): Professor | undefined {
    return db.select().from(professors).where(eq(professors.id, id)).get();
  },
};
