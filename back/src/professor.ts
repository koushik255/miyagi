import { eq } from "drizzle-orm";
import { db, nowIso } from "./db";
import { professors } from "./schema";
import { User } from "./user";

export type Professor = typeof professors.$inferSelect;
export type NewProfessor = typeof professors.$inferInsert;

export const Professor = {
  createForUser(userId: string): Professor {
    const existing = this.findByUserId(userId);
    if (existing) return existing;

    const professor: NewProfessor = {
      id: crypto.randomUUID(),
      userId,
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

  findByUserId(userId: string): Professor | undefined {
    return db.select().from(professors).where(eq(professors.userId, userId)).get();
  },

  findById(id: string): Professor | undefined {
    return db.select().from(professors).where(eq(professors.id, id)).get();
  },
};
