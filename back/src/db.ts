import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { Effect } from "effect";
import { appError } from "./errors";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  deviceHash: text("device_hash").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").unique(),
  githubUserId: text("github_user_id").unique(),
  githubUsername: text("github_username"),
  avatarColor: text("avatar_color"),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

// Retained for compatibility with existing databases; public professor pages
// are no longer part of the application.
export const professors = sqliteTable("professors", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  pageSlug: text("page_slug").notNull().unique(),
  pageTitle: text("page_title").notNull(),
  createdAt: text("created_at").notNull(),
});

export const professorGithubAccounts = sqliteTable("professor_github_accounts", {
  professorId: text("professor_id").primaryKey().references(() => professors.id, { onDelete: "cascade" }),
  githubUserId: text("github_user_id").notNull().unique(),
  githubUsername: text("github_username").notNull(),
  accessToken: text("access_token").notNull(),
  tokenType: text("token_type"),
  scope: text("scope"),
  connectedAt: text("connected_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(),
  professorId: text("professor_id").notNull().references(() => professors.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull(),
});

export const courseMembers = sqliteTable(
  "course_members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("student"),
    joinedAt: text("joined_at").notNull(),
  },
  (table) => [uniqueIndex("course_members_user_course_unique").on(table.userId, table.courseId)],
);

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  dueDate: text("due_date"),
  professorId: text("professor_id").notNull().references(() => professors.id, { onDelete: "cascade" }),
  repositoryMode: text("repository_mode").notNull().default("github"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const courseCalendarItems = sqliteTable("course_calendar_items", {
  id: text("id").primaryKey(),
  courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  professorId: text("professor_id").notNull().references(() => professors.id, { onDelete: "cascade" }),
  assignmentId: text("assignment_id").references(() => assignments.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueAt: text("due_at").notNull(),
  kind: text("kind", { enum: ["event", "deadline"] }).notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const assignmentRepositories = sqliteTable(
  "assignment_repositories",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    assignmentId: text("assignment_id").notNull().references(() => assignments.id, { onDelete: "cascade" }),
    professorId: text("professor_id").notNull().references(() => professors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    repoPath: text("repo_path"),
    cloneUrl: text("clone_url"),
    repositoryProvider: text("repository_provider").notNull().default("github"),
    githubRepoUrl: text("github_repo_url").notNull(),
    githubOwner: text("github_owner").notNull(),
    githubRepo: text("github_repo").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("assignment_repositories_assignment_url_unique").on(table.assignmentId, table.githubRepoUrl)],
);

export const courseMembershipSuggestions = sqliteTable(
  "course_membership_suggestions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    repositoryId: text("repository_id").references(() => assignmentRepositories.id, { onDelete: "set null" }),
    githubUsername: text("github_username").notNull(),
    status: text("status", { enum: ["pending", "accepted", "rejected"] }).notNull().default("pending"),
    discoveredAt: text("discovered_at").notNull(),
    respondedAt: text("responded_at"),
  },
  (table) => [uniqueIndex("course_suggestions_user_course_unique").on(table.userId, table.courseId)],
);

const schema = {
  users,
  professors,
  professorGithubAccounts,
  courses,
  courseMembers,
  assignments,
  courseCalendarItems,
  assignmentRepositories,
  courseMembershipSuggestions,
};

function connect(database: Database) {
  return drizzle(database, { schema });
}

export let sqlite: Database;
export let db: ReturnType<typeof connect>;

export function nowIso() {
  return new Date().toISOString();
}

const CREATE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, device_hash TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, email TEXT UNIQUE, github_user_id TEXT UNIQUE, github_username TEXT, avatar_color TEXT, created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS professors (id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, page_slug TEXT NOT NULL UNIQUE, page_title TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS professor_github_accounts (professor_id TEXT PRIMARY KEY, github_user_id TEXT NOT NULL UNIQUE, github_username TEXT NOT NULL, access_token TEXT NOT NULL, token_type TEXT, scope TEXT, connected_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS courses (id TEXT PRIMARY KEY, name TEXT NOT NULL, join_code TEXT NOT NULL UNIQUE, professor_id TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS course_members (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, course_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'student', joined_at TEXT NOT NULL, UNIQUE (user_id, course_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', due_date TEXT, professor_id TEXT NOT NULL, repository_mode TEXT NOT NULL DEFAULT 'github', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE, FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS course_calendar_items (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, professor_id TEXT NOT NULL, assignment_id TEXT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', due_at TEXT NOT NULL, kind TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE, FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE, FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL)`,
  `CREATE TABLE IF NOT EXISTS assignment_repositories (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, assignment_id TEXT NOT NULL, professor_id TEXT NOT NULL, name TEXT NOT NULL, repo_path TEXT, clone_url TEXT, repository_provider TEXT NOT NULL DEFAULT 'github', github_repo_url TEXT NOT NULL, github_owner TEXT NOT NULL, github_repo TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (assignment_id, github_repo_url), FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE, FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE, FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS course_membership_suggestions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, course_id TEXT NOT NULL, repository_id TEXT, github_username TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', discovered_at TEXT NOT NULL, responded_at TEXT, UNIQUE (user_id, course_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE, FOREIGN KEY (repository_id) REFERENCES assignment_repositories(id) ON DELETE SET NULL)`,
];

const MIGRATIONS: Record<string, Record<string, string>> = {
  users: {
    email: "ALTER TABLE users ADD COLUMN email TEXT",
    github_user_id: "ALTER TABLE users ADD COLUMN github_user_id TEXT",
    github_username: "ALTER TABLE users ADD COLUMN github_username TEXT",
    avatar_color: "ALTER TABLE users ADD COLUMN avatar_color TEXT",
  },
  professors: {
    page_slug: "ALTER TABLE professors ADD COLUMN page_slug TEXT",
    page_title: "ALTER TABLE professors ADD COLUMN page_title TEXT",
  },
  assignments: { repository_mode: "ALTER TABLE assignments ADD COLUMN repository_mode TEXT NOT NULL DEFAULT 'github'" },
  course_calendar_items: { assignment_id: "ALTER TABLE course_calendar_items ADD COLUMN assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL" },
};

export const initDatabase = Effect.try({
  try: () => {
    const dataRoot = process.env.MIYAGI_DATA_ROOT;
    if (!process.env.DB_PATH && dataRoot) mkdirSync(dataRoot, { recursive: true });
    const path = process.env.DB_PATH ?? (dataRoot ? join(dataRoot, "app.sqlite") : "./app.sqlite");
    sqlite = new Database(path);
    sqlite.run("PRAGMA foreign_keys = ON");
    db = connect(sqlite);
    for (const statement of CREATE_TABLE_STATEMENTS) sqlite.run(statement);
    for (const [table, migrations] of Object.entries(MIGRATIONS)) {
      const columns = new Set((sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(({ name }) => name));
      for (const [column, statement] of Object.entries(migrations)) {
        if (!columns.has(column)) sqlite.run(statement);
      }
    }
    hydrateProfessorPages();
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS professors_page_slug_unique ON professors(page_slug)");
    sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS users_github_user_id_unique ON users(github_user_id)");
  },
  catch: (cause) => appError(500, "Could not initialize the database", cause),
});

function hydrateProfessorPages() {
  const rows = sqlite.query(`SELECT professors.id, professors.page_slug AS pageSlug, professors.page_title AS pageTitle, users.display_name AS displayName, users.device_hash AS username FROM professors INNER JOIN users ON users.id = professors.user_id`).all() as Array<{ id: string; pageSlug: string | null; pageTitle: string | null; displayName: string; username: string }>;
  const used = new Set<string>();
  for (const row of rows) {
    const pageTitle = row.pageTitle || `${row.displayName}'s courses`;
    const pageSlug = row.pageSlug || uniqueSlug(row.displayName || row.username, used);
    used.add(pageSlug);
    sqlite.run("UPDATE professors SET page_slug = ?, page_title = ? WHERE id = ?", [pageSlug, pageTitle, row.id]);
  }
}

function uniqueSlug(value: string, used: Set<string>) {
  const base = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "professor";
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  return slug;
}
