import { eq, notInArray } from "drizzle-orm";
import { db, nowIso } from "./db";
import { professors, users } from "./schema";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const User = {
  createAnonymousUser(deviceHash: string, displayName = "Anonymous", password?: string): User {
    const timestamp = nowIso();
    const user: NewUser = {
      id: crypto.randomUUID(),
      deviceHash,
      displayName,
      password: password ?? null,
      createdAt: timestamp,
      lastSeenAt: timestamp,
    };

    return db.insert(users).values(user).returning().get();
  },

  createOrGet(deviceHash: string, displayName = "Anonymous", password?: string): User {
    const existing = this.findByDeviceHash(deviceHash);
    if (existing) {
      if (password && !existing.password) this.setPassword(existing.id, password);
      return this.updatePresence(existing.id);
    }

    return this.createAnonymousUser(deviceHash, displayName, password);
  },

  login(deviceHash: string, password: string): User | undefined {
    const user = this.findByDeviceHash(deviceHash);
    if (!user || user.password !== password) return undefined;
    return this.updatePresence(user.id);
  },

  setPassword(id: string, password: string): User {
    return db.update(users).set({ password }).where(eq(users.id, id)).returning().get();
  },

  findByDeviceHash(deviceHash: string): User | undefined {
    return db.select().from(users).where(eq(users.deviceHash, deviceHash)).get();
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
