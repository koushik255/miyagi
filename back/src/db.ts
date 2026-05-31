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
      email TEXT UNIQUE,
      student_id TEXT UNIQUE,
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

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      due_date TEXT,
      professor_id TEXT NOT NULL,
      repository_mode TEXT NOT NULL DEFAULT 'local',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      course_id TEXT,
      assignment_id TEXT,
      name TEXT NOT NULL,
      join_code TEXT NOT NULL UNIQUE,
      workspace_path TEXT,
      repo_path TEXT,
      clone_url TEXT,
      repository_provider TEXT NOT NULL DEFAULT 'local',
      github_repo_url TEXT,
      github_owner TEXT,
      github_repo TEXT,
      professor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      github_username TEXT,
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
      github_username TEXT,
      message TEXT NOT NULL,
      branch TEXT NOT NULL,
      additions INTEGER NOT NULL DEFAULT 0,
      deletions INTEGER NOT NULL DEFAULT 0,
      changed_files INTEGER NOT NULL DEFAULT 0,
      html_url TEXT,
      committed_at TEXT NOT NULL,
      UNIQUE (repository_id, hash),
      FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `);

  const userColumns = sqlite.query(`PRAGMA table_info(users)`).all() as { name: string }[];
  const hasPassword = userColumns.some((column) => column.name === "password");
  if (!hasPassword) sqlite.exec(`ALTER TABLE users ADD COLUMN password TEXT`);
  if (!userColumns.some((column) => column.name === "email")) sqlite.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
  if (!userColumns.some((column) => column.name === "student_id")) sqlite.exec(`ALTER TABLE users ADD COLUMN student_id TEXT`);

  const assignmentColumns = sqlite.query(`PRAGMA table_info(assignments)`).all() as { name: string }[];
  if (!assignmentColumns.some((column) => column.name === "repository_mode")) sqlite.exec(`ALTER TABLE assignments ADD COLUMN repository_mode TEXT NOT NULL DEFAULT 'local'`);

  const groupColumns = sqlite.query(`PRAGMA table_info(groups)`).all() as { name: string }[];
  const hasCourseId = groupColumns.some((column) => column.name === "course_id");
  if (!hasCourseId) sqlite.exec(`ALTER TABLE groups ADD COLUMN course_id TEXT REFERENCES courses(id) ON DELETE CASCADE`);
  const hasAssignmentId = groupColumns.some((column) => column.name === "assignment_id");
  if (!hasAssignmentId) sqlite.exec(`ALTER TABLE groups ADD COLUMN assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE`);
  const hasWorkspacePath = groupColumns.some((column) => column.name === "workspace_path");
  if (!hasWorkspacePath) sqlite.exec(`ALTER TABLE groups ADD COLUMN workspace_path TEXT`);
  const hasRepoPath = groupColumns.some((column) => column.name === "repo_path");
  if (!hasRepoPath) sqlite.exec(`ALTER TABLE groups ADD COLUMN repo_path TEXT`);
  const hasCloneUrl = groupColumns.some((column) => column.name === "clone_url");
  if (!hasCloneUrl) sqlite.exec(`ALTER TABLE groups ADD COLUMN clone_url TEXT`);
  if (!groupColumns.some((column) => column.name === "repository_provider")) sqlite.exec(`ALTER TABLE groups ADD COLUMN repository_provider TEXT NOT NULL DEFAULT 'local'`);
  if (!groupColumns.some((column) => column.name === "github_repo_url")) sqlite.exec(`ALTER TABLE groups ADD COLUMN github_repo_url TEXT`);
  if (!groupColumns.some((column) => column.name === "github_owner")) sqlite.exec(`ALTER TABLE groups ADD COLUMN github_owner TEXT`);
  if (!groupColumns.some((column) => column.name === "github_repo")) sqlite.exec(`ALTER TABLE groups ADD COLUMN github_repo TEXT`);

  const groupMemberColumns = sqlite.query(`PRAGMA table_info(group_members)`).all() as { name: string }[];
  if (!groupMemberColumns.some((column) => column.name === "github_username")) sqlite.exec(`ALTER TABLE group_members ADD COLUMN github_username TEXT`);

  const commitColumns = sqlite.query(`PRAGMA table_info(commit_activities)`).all() as { name: string }[];
  if (!commitColumns.some((column) => column.name === "github_username")) sqlite.exec(`ALTER TABLE commit_activities ADD COLUMN github_username TEXT`);
  if (!commitColumns.some((column) => column.name === "additions")) sqlite.exec(`ALTER TABLE commit_activities ADD COLUMN additions INTEGER NOT NULL DEFAULT 0`);
  if (!commitColumns.some((column) => column.name === "deletions")) sqlite.exec(`ALTER TABLE commit_activities ADD COLUMN deletions INTEGER NOT NULL DEFAULT 0`);
  if (!commitColumns.some((column) => column.name === "changed_files")) sqlite.exec(`ALTER TABLE commit_activities ADD COLUMN changed_files INTEGER NOT NULL DEFAULT 0`);
  if (!commitColumns.some((column) => column.name === "html_url")) sqlite.exec(`ALTER TABLE commit_activities ADD COLUMN html_url TEXT`);
}

export function nowIso() {
  return new Date().toISOString();
}
