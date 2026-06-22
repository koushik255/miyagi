import { eq, notInArray, or } from "drizzle-orm";
import { db, nowIso } from "./db";
import { badRequest } from "./errors";
import { professors, users } from "./schema";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const User = {
  createAnonymousUser(
    deviceHash: string,
    displayName = "Anonymous",
    password?: string,
    email?: string,
    studentId?: string,
    githubUsername?: string,
  ): User {
    const timestamp = nowIso();
    const user: NewUser = {
      id: crypto.randomUUID(),
      deviceHash,
      displayName,
      email: email ?? null,
      studentId: studentId ?? null,
      githubUsername: githubUsername ?? null,
      password: password ?? null,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    };

    return db.insert(users).values(user).returning().get();
  },

  createOrGet(deviceHash: string, displayName = "Anonymous", password?: string): User {
    const existing = this.findByDeviceHash(deviceHash);
    if (existing) {
      if (password && existing.password !== password) this.setPassword(existing.id, password);
      return this.updatePresence(existing.id);
    }

    return this.createAnonymousUser(deviceHash, displayName, password);
  },

  createOrUpdateStudent(input: { studentId?: string; name: string; email?: string; username?: string; password?: string }): User {
    const username = input.username?.trim() || undefined;
    const email = input.email?.trim() || (username ? `${username}@example.edu` : undefined);
    const password = username ?? email;
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
          githubUsername: existing.githubUsername,
          password: password ?? existing.password,
          lastSeenAt: nowIso(),
        })
        .where(eq(users.id, existing.id))
        .returning()
        .get();
    }

    return this.createAnonymousUser(deviceHash, input.name, password, email, input.studentId);
  },

  login(deviceHash: string, password: string): User | undefined {
    const user = this.findByDeviceHash(deviceHash);
    if (!user || user.password !== password) return undefined;
    return this.updatePresence(user.id);
  },

  setPassword(id: string, password: string): User {
    return db.update(users).set({ password }).where(eq(users.id, id)).returning().get();
  },

  setGithubUsername(id: string, githubUsername?: string): User {
    return db.update(users).set({ githubUsername: githubUsername?.trim() || null }).where(eq(users.id, id)).returning().get();
  },

  findByDeviceHash(deviceHash: string): User | undefined {
    return db.select().from(users).where(eq(users.deviceHash, deviceHash)).get();
  },

  findByEmail(email: string): User | undefined {
    return db.select().from(users).where(eq(users.email, email)).get();
  },

  findByStudentId(studentId: string): User | undefined {
    return db.select().from(users).where(eq(users.studentId, studentId)).get();
  },

  findByEmailOrStudentId(value: string): User | undefined {
    return db.select().from(users).where(or(eq(users.email, value), eq(users.studentId, value))).get();
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
