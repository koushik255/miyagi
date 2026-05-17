import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

export type WorkspaceFile = { path: string; name: string };

export function listWorkspaceFiles(workspacePath: string): WorkspaceFile[] {
  const root = resolve(workspacePath);
  const files: WorkspaceFile[] = [];

  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = resolve(directory, entry.name);
      if (!isInsideRoot(root, fullPath)) continue;

      if (entry.isDirectory()) walk(fullPath);
      if (entry.isFile()) files.push({ path: relative(root, fullPath), name: entry.name });
    }
  }

  try {
    if (statSync(root).isDirectory()) walk(root);
  } catch {
    return [];
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function readWorkspaceFile(workspacePath: string, filePath: string) {
  const root = resolve(workspacePath);
  const fullPath = resolve(root, filePath);

  if (!isInsideRoot(root, fullPath)) throw new Error("Invalid file path");

  const stat = statSync(fullPath);
  if (!stat.isFile()) throw new Error("Not a file");
  if (stat.size > 1_000_000) return { path: filePath, content: "File is too large to preview." };

  return { path: filePath, content: readFileSync(fullPath, "utf8") };
}

function isInsideRoot(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}
