import { sqlite } from "./db";

const CREATE_TABLE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    device_hash TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    email TEXT UNIQUE,
    student_id TEXT UNIQUE,
    github_username TEXT,
    avatar_color TEXT,
    password TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS professors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    page_slug TEXT NOT NULL UNIQUE,
    page_title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS professor_github_accounts (
    professor_id TEXT PRIMARY KEY,
    github_user_id TEXT NOT NULL UNIQUE,
    github_username TEXT NOT NULL,
    access_token TEXT NOT NULL,
    token_type TEXT,
    scope TEXT,
    connected_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS courses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    professor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS course_members (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    joined_at TEXT NOT NULL,
    UNIQUE (user_id, course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_date TEXT,
    professor_id TEXT NOT NULL,
    repository_mode TEXT NOT NULL DEFAULT 'github',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS course_calendar_items (
    id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL,
    professor_id TEXT NOT NULL,
    assignment_id TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    due_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    course_id TEXT,
    assignment_id TEXT,
    name TEXT NOT NULL,
    join_code TEXT NOT NULL UNIQUE,
    workspace_path TEXT,
    repo_path TEXT,
    clone_url TEXT,
    repository_provider TEXT NOT NULL DEFAULT 'github',
    github_repo_url TEXT,
    github_owner TEXT,
    github_repo TEXT,
    professor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (professor_id) REFERENCES professors(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    github_username TEXT,
    moved_from_group_id TEXT,
    joined_at TEXT NOT NULL,
    UNIQUE (user_id, group_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS projects (
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
  )`,
  `CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    remote_url TEXT NOT NULL,
    default_branch TEXT NOT NULL,
    initialized_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS file_nodes (
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
  )`,
  `CREATE TABLE IF NOT EXISTS pushed_commits (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    hash TEXT NOT NULL,
    pushed_by_user_id TEXT NOT NULL,
    pushed_by_username TEXT NOT NULL,
    pushed_at TEXT NOT NULL,
    UNIQUE (group_id, hash),
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    FOREIGN KEY (pushed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS commit_activities (
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
  )`,
];

const MIGRATIONS: Record<string, Record<string, string>> = {
  users: {
    password: "ALTER TABLE users ADD COLUMN password TEXT",
    email: "ALTER TABLE users ADD COLUMN email TEXT",
    student_id: "ALTER TABLE users ADD COLUMN student_id TEXT",
    github_username: "ALTER TABLE users ADD COLUMN github_username TEXT",
    avatar_color: "ALTER TABLE users ADD COLUMN avatar_color TEXT",
  },
  professors: {
    page_slug: "ALTER TABLE professors ADD COLUMN page_slug TEXT",
    page_title: "ALTER TABLE professors ADD COLUMN page_title TEXT",
  },
  assignments: {
    repository_mode: "ALTER TABLE assignments ADD COLUMN repository_mode TEXT NOT NULL DEFAULT 'github'",
  },
  course_calendar_items: {
    assignment_id: "ALTER TABLE course_calendar_items ADD COLUMN assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL",
  },
  groups: {
    course_id: "ALTER TABLE groups ADD COLUMN course_id TEXT REFERENCES courses(id) ON DELETE CASCADE",
    assignment_id: "ALTER TABLE groups ADD COLUMN assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE",
    workspace_path: "ALTER TABLE groups ADD COLUMN workspace_path TEXT",
    repo_path: "ALTER TABLE groups ADD COLUMN repo_path TEXT",
    clone_url: "ALTER TABLE groups ADD COLUMN clone_url TEXT",
    repository_provider: "ALTER TABLE groups ADD COLUMN repository_provider TEXT NOT NULL DEFAULT 'github'",
    github_repo_url: "ALTER TABLE groups ADD COLUMN github_repo_url TEXT",
    github_owner: "ALTER TABLE groups ADD COLUMN github_owner TEXT",
    github_repo: "ALTER TABLE groups ADD COLUMN github_repo TEXT",
  },
  group_members: {
    github_username: "ALTER TABLE group_members ADD COLUMN github_username TEXT",
    moved_from_group_id: "ALTER TABLE group_members ADD COLUMN moved_from_group_id TEXT",
  },
  commit_activities: {
    github_username: "ALTER TABLE commit_activities ADD COLUMN github_username TEXT",
    additions: "ALTER TABLE commit_activities ADD COLUMN additions INTEGER NOT NULL DEFAULT 0",
    deletions: "ALTER TABLE commit_activities ADD COLUMN deletions INTEGER NOT NULL DEFAULT 0",
    changed_files: "ALTER TABLE commit_activities ADD COLUMN changed_files INTEGER NOT NULL DEFAULT 0",
    html_url: "ALTER TABLE commit_activities ADD COLUMN html_url TEXT",
  },
};

export function initDatabase() {
  for (const statement of CREATE_TABLE_STATEMENTS) sqlite.run(statement);

  for (const [table, migrations] of Object.entries(MIGRATIONS)) {
    const existingColumns = new Set((sqlite.query(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name));
    for (const [column, statement] of Object.entries(migrations)) {
      if (!existingColumns.has(column)) sqlite.run(statement);
    }
  }

  hydrateProfessorPages();
  sqlite.run("CREATE UNIQUE INDEX IF NOT EXISTS professors_page_slug_unique ON professors(page_slug)");
}

function hydrateProfessorPages() {
  const rows = sqlite.query(`
    SELECT professors.id, professors.page_slug AS pageSlug, professors.page_title AS pageTitle, users.display_name AS displayName, users.device_hash AS username
    FROM professors
    INNER JOIN users ON users.id = professors.user_id
  `).all() as Array<{ id: string; pageSlug: string | null; pageTitle: string | null; displayName: string; username: string }>;

  const used = new Set<string>();
  for (const row of rows) {
    const pageTitle = row.pageTitle || `${row.displayName}'s courses`;
    const pageSlug = row.pageSlug || uniqueSlug(row.displayName || row.username, used);
    used.add(pageSlug);
    sqlite.run("UPDATE professors SET page_slug = ?, page_title = ? WHERE id = ?", [pageSlug, pageTitle, row.id]);
  }
}

function uniqueSlug(value: string, used: Set<string>) {
  const base = slugify(value) || "professor";
  let slug = base;
  let suffix = 2;
  while (used.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
