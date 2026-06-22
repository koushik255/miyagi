import { eq } from "drizzle-orm";
import { db } from "./db";
import { groupMembers, users } from "./schema";

export type GroupMemberSummary = {
  memberId: string;
  userId: string;
  username: string;
  displayName: string;
  role: string;
  githubUsername: string | null;
  joinedAt: string;
};

export type DashboardMemberRow = {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  userGithubUsername: string | null;
  groupGithubUsername: string | null;
};

export function listGroupMembers(groupId: string): GroupMemberSummary[] {
  return db
    .select({
      memberId: groupMembers.id,
      userId: users.id,
      username: users.deviceHash,
      displayName: users.displayName,
      role: groupMembers.role,
      githubUsername: groupMembers.githubUsername,
      joinedAt: groupMembers.joinedAt,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId))
    .all();
}

export function listDashboardMembers(groupId: string): DashboardMemberRow[] {
  return db
    .select({
      userId: users.id,
      username: users.deviceHash,
      displayName: users.displayName,
      email: users.email,
      userGithubUsername: users.githubUsername,
      groupGithubUsername: groupMembers.githubUsername,
    })
    .from(groupMembers)
    .innerJoin(users, eq(groupMembers.userId, users.id))
    .where(eq(groupMembers.groupId, groupId))
    .all();
}
