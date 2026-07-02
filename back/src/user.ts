import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, notInArray, or, sql } from "drizzle-orm";
import { db, nowIso } from "./db";
import { badRequest, conflict, unauthorized } from "./errors";
import { professors, userGithubAccounts, users } from "./schema";
import type { GithubOAuthProfile, GithubOAuthToken } from "./professor";

const PASSWORD_PREFIX = "pbkdf2";
const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type PublicUser = Omit<User, "password">;
const STUDENT_AVATAR_COLORS = ["#3b82f6", "#ef4444", "#facc15", "#f97316", "#22c55e", "#ec4899"] as const;
const AVATAR_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function defaultAvatarColor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return STUDENT_AVATAR_COLORS[hash % STUDENT_AVATAR_COLORS.length];
}

function normalizeAvatarColor(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const color = value.trim();
  if (!color) return null;
  if (!AVATAR_COLOR_PATTERN.test(color)) badRequest("Avatar color must be a hex color");
  return color.toLowerCase();
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function requirePassword(password: string) {
  if (password.length < 8) badRequest("Password must be at least 8 characters");
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString("hex");
  return `${PASSWORD_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(storedPassword: string | null, password: string): boolean {
  if (!storedPassword) return false;
  if (!storedPassword.startsWith(`${PASSWORD_PREFIX}$`)) return storedPassword === password;

  const [, iterationsValue, salt, hash] = storedPassword.split("$");
  const iterations = Number(iterationsValue);
  if (!iterations || !salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  const actual = pbkdf2Sync(password, salt, iterations, expected.length, PASSWORD_DIGEST);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isHashedPassword(password: string | null): boolean {
  return Boolean(password?.startsWith(`${PASSWORD_PREFIX}$`));
}

export const User = {
  toPublicUser(user: User): PublicUser {
    const publicUser = { ...user };
    delete publicUser.password;
    return publicUser;
  },

  createAnonymousUser(
    deviceHash: string,
    displayName = "Anonymous",
    password?: string,
    email?: string,
    studentId?: string,
    githubUsername?: string,
    githubUserId?: string,
  ): User {
    const timestamp = nowIso();
    const user: NewUser = {
      id: crypto.randomUUID(),
      deviceHash,
      displayName,
      email: email ?? null,
      studentId: studentId ?? null,
      githubUserId: githubUserId ?? null,
      githubUsername: githubUsername ?? null,
      avatarColor: defaultAvatarColor(deviceHash),
      password: password ? hashPassword(password) : null,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    };

    return db.insert(users).values(user).returning().get();
  },

  createOrGet(deviceHash: string, displayName = "Anonymous", password?: string): User {
    const username = normalizeUsername(deviceHash);
    const existing = this.findByDeviceHash(username);
    if (existing) return this.updatePresence(existing.id);

    return this.createAnonymousUser(username, displayName, password);
  },

  createAccount(input: { username: string; password: string; displayName?: string; email?: string }): User {
    const username = normalizeUsername(input.username);
    if (!username) badRequest("Username is required");
    requirePassword(input.password);
    if (this.findByDeviceHash(username)) conflict("An account already exists for that username");

    const email = input.email?.trim().toLowerCase() || (username.includes("@") ? username : undefined);
    if (email && this.findByEmail(email)) conflict("An account already exists for that email");

    return this.createAnonymousUser(username, input.displayName?.trim() || username, input.password, email);
  },

  createOrUpdateStudent(input: { studentId?: string; name: string; email?: string; username?: string; password?: string; temporaryPassword?: string }): User {
    const username = input.username?.trim() || undefined;
    const email = input.email?.trim() || (username ? `${username}@example.edu` : undefined);
    const password = input.password?.trim() || input.temporaryPassword?.trim() || username || email;
    if (!username && !email) badRequest("Student requires a username or email");
    const deviceHash = username ?? email!;
    const existing = this.findByDeviceHash(deviceHash)
      ?? (email ? this.findByEmail(email) : undefined)
      ?? (input.studentId ? this.findByStudentId(input.studentId) : undefined);
    if (existing) {
      return db
        .update(users)
        .set({
          deviceHash,
          displayName: input.name,
          email: email ?? existing.email,
          studentId: input.studentId ?? existing.studentId,
          githubUserId: existing.githubUserId,
          githubUsername: existing.githubUsername,
          password: input.password ? hashPassword(input.password) : existing.password,
          lastSeenAt: nowIso(),
        })
        .where(eq(users.id, existing.id))
        .returning()
        .get();
    }

    return this.createAnonymousUser(deviceHash, input.name, password, email, input.studentId);
  },

  login(deviceHash: string, password: string): User | undefined {
    const user = this.findByDeviceHash(normalizeUsername(deviceHash));
    if (!user || !verifyPassword(user.password, password)) return undefined;
    if (!isHashedPassword(user.password)) this.setPassword(user.id, password);
    return this.updatePresence(user.id);
  },

  setPassword(id: string, password: string): User {
    return db.update(users).set({ password: hashPassword(password) }).where(eq(users.id, id)).returning().get();
  },

  updatePassword(id: string, currentPassword: string, nextPassword: string): User {
    requirePassword(nextPassword);
    const user = this.findById(id);
    if (!user) badRequest("User not found");
    if (!verifyPassword(user.password, currentPassword)) unauthorized("Current password is incorrect");
    return this.setPassword(id, nextPassword);
  },

  updateAccount(id: string, input: { displayName?: string; githubUsername?: string; avatarColor?: string | null }): User {
    const displayName = input.displayName?.trim();
    if (input.displayName !== undefined && !displayName) badRequest("Display name is required");
    const update: Partial<Pick<User, "displayName" | "githubUsername" | "avatarColor" | "lastSeenAt">> = { lastSeenAt: nowIso() };
    if (displayName) update.displayName = displayName;
    if (input.githubUsername !== undefined) update.githubUsername = input.githubUsername.trim() || null;
    const avatarColor = normalizeAvatarColor(input.avatarColor);
    if (avatarColor !== undefined) update.avatarColor = avatarColor;
    return db.update(users).set(update).where(eq(users.id, id)).returning().get();
  },

  setGithubUsername(id: string, githubUsername?: string): User {
    return this.updateAccount(id, { githubUsername });
  },

  upsertGithubAccount(id: string, profile: GithubOAuthProfile, token: GithubOAuthToken): void {
    const timestamp = nowIso();
    db
      .insert(userGithubAccounts)
      .values({
        userId: id,
        githubUserId: String(profile.id),
        githubUsername: profile.login,
        accessToken: token.accessToken,
        tokenType: token.tokenType ?? null,
        scope: token.scope ?? null,
        connectedAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: userGithubAccounts.userId,
        set: {
          githubUserId: String(profile.id),
          githubUsername: profile.login,
          accessToken: token.accessToken,
          tokenType: token.tokenType ?? null,
          scope: token.scope ?? null,
          updatedAt: timestamp,
        },
      })
      .run();
  },

  connectGithubAccount(id: string, profile: GithubOAuthProfile, token?: GithubOAuthToken): User {
    const githubUserId = String(profile.id);
    const existing = this.findByGithubUserId(githubUserId);
    if (existing && existing.id !== id) conflict("This GitHub account is already connected to another user");

    const user = db
      .update(users)
      .set({
        githubUserId,
        githubUsername: profile.login,
        lastSeenAt: nowIso(),
      })
      .where(eq(users.id, id))
      .returning()
      .get();
    if (token) this.upsertGithubAccount(user.id, profile, token);
    return user;
  },

  githubConnection(userId: string) {
    return db.select().from(userGithubAccounts).where(eq(userGithubAccounts.userId, userId)).get();
  },

  loginOrCreateWithGithub(profile: GithubOAuthProfile, token?: GithubOAuthToken): User {
    const githubUserId = String(profile.id);
    const githubLogin = normalizeUsername(profile.login);
    const email = profile.email?.trim().toLowerCase() || undefined;
    const existing = this.findByGithubUserId(githubUserId)
      ?? this.findByDeviceHash(githubLogin)
      ?? (email ? this.findByEmail(email) : undefined);
    if (existing) {
      return this.connectGithubAccount(existing.id, profile, token);
    }

    const deviceHash = githubLogin || `github:${githubUserId}`;
    const user = this.createAnonymousUser(
      deviceHash,
      profile.name?.trim() || profile.login,
      undefined,
      email,
      undefined,
      profile.login,
      githubUserId,
    );
    if (token) this.upsertGithubAccount(user.id, profile, token);
    return user;
  },

  findByDeviceHash(deviceHash: string): User | undefined {
    return db.select().from(users).where(sql`lower(${users.deviceHash}) = ${normalizeUsername(deviceHash)}`).get();
  },

  findByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  },

  findByStudentId(studentId: string): User | undefined {
    return db.select().from(users).where(eq(users.studentId, studentId)).get();
  },

  findByGithubUserId(githubUserId: string): User | undefined {
    return db.select().from(users).where(eq(users.githubUserId, githubUserId)).get();
  },

  findByEmailOrStudentId(value: string): User | undefined {
    const normalized = normalizeUsername(value);
    return db.select().from(users).where(or(eq(users.email, normalized), eq(users.studentId, value), sql`lower(${users.deviceHash}) = ${normalized}`)).get();
  },

  findById(id: string): User | undefined {
    return db.select().from(users).where(eq(users.id, id)).get();
  },

  listStudents(): User[] {
    const professorUserIds = db.select({ id: professors.userId }).from(professors).all().map((professor) => professor.id);
    if (professorUserIds.length === 0) return db.select().from(users).all();
    return db.select().from(users).where(notInArray(users.id, professorUserIds)).all();
  },

  searchStudents(query: string): User[] {
    return this.listStudents().filter((user) => user.displayName.toLowerCase().includes(query.toLowerCase()));
  },

  updatePresence(id: string): User {
    return db.update(users).set({ lastSeenAt: nowIso() }).where(eq(users.id, id)).returning().get();
  },
};
