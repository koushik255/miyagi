import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const DB_PATH = process.env.DB_PATH ?? "./app.sqlite";
const sqlite = new Database(DB_PATH);

sqlite.exec("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function initDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      device_hash TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS professors (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      join_code TEXT NOT NULL UNIQUE,
      professor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      course_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      joined_at TEXT NOT NULL,
      UNIQUE (user_id, course_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      course_id TEXT,
      name TEXT NOT NULL,
      join_code TEXT NOT NULL UNIQUE,
      workspace_path TEXT,
      repo_path TEXT,
      clone_url TEXT,
      professor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      joined_at TEXT NOT NULL,
      UNIQUE (user_id, group_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      assigned_student_id TEXT,
      assigned_by_professor_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      root_path_hint TEXT,
      due_date TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_student_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_by_professor_id) REFERENCES professors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repositories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      remote_url TEXT NOT NULL,
      default_branch TEXT NOT NULL,
      initialized_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_nodes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      path TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parent_id TEXT,
      indexed_at TEXT NOT NULL,
      UNIQUE (project_id, path),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES file_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pushed_commits (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      hash TEXT NOT NULL,
      pushed_by_user_id TEXT NOT NULL,
      pushed_by_username TEXT NOT NULL,
      pushed_at TEXT NOT NULL,
      UNIQUE (group_id, hash),
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
      FOREIGN KEY (pushed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commit_activities (
      id TEXT PRIMARY KEY,
      repository_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      hash TEXT NOT NULL,
      author_name TEXT NOT NULL,
      message TEXT NOT NULL,
      branch TEXT NOT NULL,
      committed_at TEXT NOT NULL,
      UNIQUE (repository_id, hash),
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  const userColumns = sqlite.query(`PRAGMA table_info(users)`).all() as { name: string }[];
  const hasPassword = userColumns.some((column) => column.name === "password");
  if (!hasPassword) sqlite.exec(`ALTER TABLE users ADD COLUMN password TEXT`);

  const groupColumns = sqlite.query(`PRAGMA table_info(groups)`).all() as { name: string }[];
  const hasCourseId = groupColumns.some((column) => column.name === "course_id");
  if (!hasCourseId) sqlite.exec(`ALTER TABLE groups ADD COLUMN course_id TEXT REFERENCES courses(id) ON DELETE CASCADE`);
  const hasWorkspacePath = groupColumns.some((column) => column.name === "workspace_path");
  if (!hasWorkspacePath) sqlite.exec(`ALTER TABLE groups ADD COLUMN workspace_path TEXT`);
  const hasRepoPath = groupColumns.some((column) => column.name === "repo_path");
  if (!hasRepoPath) sqlite.exec(`ALTER TABLE groups ADD COLUMN repo_path TEXT`);
  const hasCloneUrl = groupColumns.some((column) => column.name === "clone_url");
  if (!hasCloneUrl) sqlite.exec(`ALTER TABLE groups ADD COLUMN clone_url TEXT`);
}

export function nowIso() {
  return new Date().toISOString();
}
