import { relations } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  deviceHash: text("device_hash").notNull().unique(),
  displayName: text("display_name").notNull(),
  password: text("password"),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const professors = sqliteTable("professors", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
});

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  professorId: text("professor_id")
    .notNull()
    .references(() => professors.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
});

export const courseMembers = sqliteTable(
  "course_members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("student"),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [uniqueIndex("course_members_user_course_unique").on(table.userId, table.courseId)],
);

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  courseId: text("course_id").references(() => courses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  workspacePath: text("workspace_path"),
  repoPath: text("repo_path"),
  cloneUrl: text("clone_url"),
  professorId: text("professor_id")
    .notNull()
    .references(() => professors.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
});

export const groupMembers = sqliteTable(
  "group_members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("student"),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [uniqueIndex("group_members_user_group_unique").on(table.userId, table.groupId)],
);

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  groupId: text("group_id")
    .notNull()
    .references(() => groups.id, { onDelete: "cascade" }),
  assignedStudentId: text("assigned_student_id").references(() => users.id, { onDelete: "set null" }),
  assignedByProfessorId: text("assigned_by_professor_id")
    .notNull()
    .references(() => professors.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  rootPathHint: text("root_path_hint"),
  dueDate: text("due_date"),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const repositories = sqliteTable("repositories", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  remoteUrl: text("remote_url").notNull(),
  defaultBranch: text("default_branch").notNull(),
  initializedAt: text("initialized_at").notNull(),
});

export const fileNodes = sqliteTable(
  "file_nodes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    parentId: text("parent_id"),
    indexedAt: text("indexed_at").notNull(),
  },
  (table) => [uniqueIndex("file_nodes_project_path_unique").on(table.projectId, table.path)],
);

export const pushedCommits = sqliteTable(
  "pushed_commits",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    pushedByUserId: text("pushed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pushedByUsername: text("pushed_by_username").notNull(),
    pushedAt: text("pushed_at").notNull(),
  },
  (table) => [uniqueIndex("pushed_commits_group_hash_unique").on(table.groupId, table.hash)],
);

export const commitActivities = sqliteTable(
  "commit_activities",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    authorName: text("author_name").notNull(),
    message: text("message").notNull(),
    branch: text("branch").notNull(),
    committedAt: text("committed_at").notNull(),
  },
  (table) => [uniqueIndex("commit_activities_repo_hash_unique").on(table.repositoryId, table.hash)],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  professor: one(professors),
  groupMemberships: many(groupMembers),
  assignedProjects: many(projects),
}));
