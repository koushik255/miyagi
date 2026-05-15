import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { confirm, input, password as passwordPrompt, select } from "@inquirer/prompts";
import {
  addDefaultParsers,
  CodeRenderable,
  createCliRenderer,
  getTreeSitterClient,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
  RGBA,
  SyntaxStyle,
} from "@opentui/core";
import { Group, User } from "../../src/class";
import { readLoginEnv } from "../env-login";
import { updateSession } from "../session";
import type { ActiveUser } from "../shared";
import { twoPaneLayout } from "../tui";

type StudentGroup = ReturnType<typeof Group.listByUser>[number];
type View = "home" | "groups" | "files";

export async function studentConsole() {
  const student = await studentLogin();
  const treeSitterClient = await createWorkspaceTreeSitterClient();
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
    clearOnShutdown: true,
    autoFocus: true,
  });

  const layout = twoPaneLayout(renderer);

  const title = new TextRenderable(renderer, {
    id: "title",
    content: `Miyagi Student Console — ${student.displayName}`,
    position: "absolute",
    ...layout.title,
    fg: "cyan",
  });

  const menuTitle = new TextRenderable(renderer, {
    id: "menu-title",
    content: "Controls",
    position: "absolute",
    ...layout.menuTitle,
    fg: "yellow",
  });

  const panelTitle = new TextRenderable(renderer, {
    id: "panel-title",
    content: "Preview",
    position: "absolute",
    ...layout.contentTitle,
    fg: "yellow",
  });

  let view: View = "home";
  let selectedGroup: StudentGroup | undefined;

  const menu = new SelectRenderable(renderer, {
    id: "student-menu",
    position: "absolute",
    ...layout.menu,
    wrapSelection: true,
    showDescription: false,
    options: [],
  });

  const content = new TextRenderable(renderer, {
    id: "content",
    content: studentGroupsText(student.id),
    position: "absolute",
    ...layout.content,
    wrapMode: "word",
  });

  const codePreview = new CodeRenderable(renderer, {
    id: "code-preview",
    position: "absolute",
    ...layout.content,
    content: "",
    filetype: "text",
    syntaxStyle: createCodeSyntaxStyle(),
    treeSitterClient,
    wrapMode: "none",
    selectable: true,
    visible: false,
  });

  const joinInput = new InputRenderable(renderer, {
    id: "join-input",
    position: "absolute",
    ...layout.input,
    placeholder: "Join code + Enter",
    visible: false,
  });

  renderer.root.add(title);
  renderer.root.add(menuTitle);
  renderer.root.add(panelTitle);
  renderer.root.add(menu);
  renderer.root.add(content);
  renderer.root.add(codePreview);
  renderer.root.add(joinInput);

  function showText(text: string) {
    codePreview.visible = false;
    content.visible = true;
    content.content = text;
  }

  function showCode(filePath: string, source: string) {
    content.visible = false;
    codePreview.visible = true;
    codePreview.filetype = filetypeForPath(filePath);
    codePreview.content = source;
  }

  function setMenu(nextView: View) {
    view = nextView;
    joinInput.visible = false;
    codePreview.visible = false;
    content.visible = true;

    if (view === "home") {
      menu.options = [
        { name: "My groups", description: "", value: "groups" },
        { name: "Read workspace files", description: "", value: "files" },
        { name: "Join group", description: "", value: "join" },
        { name: "Help", description: "", value: "help" },
        { name: "Exit", description: "", value: "exit" },
      ];
      showText(studentGroupsText(student.id));
    }

    if (view === "groups") {
      const groups = Group.listByUser(student.id);
      menu.options = [
        ...groups.map((group) => ({ name: group.name, description: "", value: group.id })),
        { name: "Back", description: "", value: "back" },
      ];
      showText(groups.length ? "Select a group to view its workspace files." : "You have not joined any groups yet.");
    }

    if (view === "files") {
      const files = selectedGroup ? listWorkspaceFiles(selectedGroup) : [];
      menu.options = [
        ...files.map((file) => ({ name: file, description: "", value: file })),
        { name: "Back", description: "", value: "back-groups" },
      ];
      showText(selectedGroup ? workspaceFilesText(selectedGroup) : "No group selected.");
    }

    renderer.focusRenderable(menu);
    menu.focus();
    renderer.requestRender();
  }

  menu.on(SelectRenderableEvents.SELECTION_CHANGED, (_index, option) => {
    if (!option) return;

    if (view === "home") {
      if (option.value === "groups") showText(studentGroupsText(student.id));
      if (option.value === "files") showText("Pick a group, then select a workspace file to read.");
      if (option.value === "join") showText("Join a group\n\nPress Enter, type the join code, then press Enter again.");
      if (option.value === "help") showText("Use ↑/↓ to move through the left menu.\n\nThe right side updates automatically based on the selected item.\n\nPress Enter only when you need to perform an action, like joining a group or reading files.");
      if (option.value === "exit") showText("Press Enter to exit.");
    }

    if (view === "groups") {
      const group = Group.listByUser(student.id).find((group) => group.id === option.value);
      showText(group ? workspaceFilesText(group) : "Go back.");
    }

    if (view === "files") {
      if (!selectedGroup) return;
      if (option.value === "back-groups") showText("Go back to groups.");
      else showWorkspaceFile(selectedGroup, option.value);
    }

    renderer.requestRender();
  });

  menu.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
    if (!option) return;

    if (view === "home") {
      if (option.value === "groups") setMenu("groups");
      if (option.value === "files") setMenu("groups");
      if (option.value === "join") {
        showText("Enter the group join code below:");
        joinInput.value = "";
        joinInput.visible = true;
        renderer.focusRenderable(joinInput);
        joinInput.focus();
        renderer.requestRender();
      }
      if (option.value === "help") showText("Use ↑/↓ to move through the left menu.\n\nPress Enter for actions.");
      if (option.value === "exit") renderer.destroy();
      return;
    }

    if (view === "groups") {
      if (option.value === "back") setMenu("home");
      else {
        selectedGroup = Group.listByUser(student.id).find((group) => group.id === option.value);
        setMenu("files");
      }
      return;
    }

    if (view === "files") {
      if (option.value === "back-groups") setMenu("groups");
      else if (selectedGroup) showWorkspaceFile(selectedGroup, option.value);
      renderer.requestRender();
    }
  });

  joinInput.on(InputRenderableEvents.ENTER, () => {
    const code = joinInput.value.trim().toUpperCase();

    try {
      if (code.length === 0) throw new Error("Join code cannot be empty.");
      const member = Group.assignStudent(code, student.id);
      const group = Group.findByJoinCode(code);
      showText(`Joined ${group?.name ?? "group"} as ${member.role}.\n\n${studentGroupsText(student.id)}`);
    } catch (error) {
      showText(error instanceof Error ? error.message : "Could not join group.");
    }

    joinInput.visible = false;
    renderer.focusRenderable(menu);
    menu.focus();
    renderer.requestRender();
  });

  function showWorkspaceFile(group: StudentGroup, filePath: string) {
    const result = readWorkspaceFile(group, filePath);
    if (result.kind === "code") showCode(filePath, result.content);
    else showText(result.content);
  }

  renderer.start();
  setMenu("home");
}

async function studentLogin(): Promise<ActiveUser> {
  let printedEnvLoginWarning = false;
  const envLogin = await readLoginEnv("./cli/student.env");
  if (envLogin) {
    const user = User.login(envLogin.username, envLogin.password);

    if (user) {
      console.clear();
      const useEnvLogin = await confirm({
        message: `Logging in with student.env as ${user.displayName}. Is this you? Press Enter for yes.`,
        default: true,
      });

      if (useEnvLogin) {
        await updateSession({ studentId: user.id });
        return { id: user.id, displayName: user.displayName };
      }
    } else {
      console.clear();
      console.log("student.env credentials did not work. Continuing with normal login.\n");
      printedEnvLoginWarning = true;
    }
  }

  if (!printedEnvLoginWarning) console.clear();
  console.log("Miyagi Student Login\n");

  const action = await select({
    message: "What do you want to do?",
    choices: [
      { name: "Login", value: "login" },
      { name: "Create student", value: "create" },
    ],
  });

  const deviceHash = await input({ message: "Student username/device key:", default: "spencer" });
  const password = await passwordPrompt({ message: "Password:" });

  if (action === "login") {
    const user = User.login(deviceHash, password);
    if (!user) throw new Error("Invalid student username or password");

    await updateSession({ studentId: user.id });
    return { id: user.id, displayName: user.displayName };
  }

  const displayName = await input({ message: "Display name:", default: "Spencer" });
  const user = User.createOrGet(deviceHash, displayName, password);

  await updateSession({ studentId: user.id });
  return { id: user.id, displayName: user.displayName };
}

function studentGroupsText(userId: string) {
  const groups = Group.listByUser(userId);

  if (groups.length === 0) return "My groups\n\nYou have not joined any groups yet.";

  return `My groups\n\n${groups
    .map((group) => {
      const members = Group.listMembers(group.id);
      const studentList = members
        .map((member) => {
          const label = member.userId === userId ? "you" : member.role;
          return `    - ${member.displayName} (${label})`;
        })
        .join("\n");

      return `${group.name}\n  role: ${group.role}\n  workspace: ${group.workspacePath ?? "not set"}\n  joined: ${group.joinedAt}\n  students:\n${studentList}`;
    })
    .join("\n\n")}`;
}

function listWorkspaceFiles(group: StudentGroup): string[] {
  if (!group.workspacePath) return [];

  const root = resolve(group.workspacePath);

  try {
    if (!statSync(root).isDirectory()) return [];
  } catch {
    return [];
  }

  const files: string[] = [];

  function walk(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;

      const fullPath = resolve(directory, entry.name);
      if (fullPath !== root && !fullPath.startsWith(root + sep)) continue;

      if (entry.isDirectory()) walk(fullPath);
      if (entry.isFile()) files.push(relative(root, fullPath));
    }
  }

  walk(root);
  return files.sort();
}

function workspaceFilesText(group: StudentGroup) {
  const files = listWorkspaceFiles(group);

  if (!group.workspacePath) return `${group.name} workspace\n\nNo workspace path has been set for this group.`;
  if (files.length === 0) return `${group.name} workspace\n  ${group.workspacePath}\n\nNo files found.`;

  return `${group.name} workspace\n  ${group.workspacePath}\n\nSelect a file on the left and press Enter to read it.\n\nFiles:\n${files.map((file) => `  - ${file}`).join("\n")}`;
}

function readWorkspaceFile(group: StudentGroup, filePath: string): { kind: "code" | "text"; content: string } {
  if (!group.workspacePath) return { kind: "text", content: "No workspace path has been set for this group." };

  const root = resolve(group.workspacePath);
  const fullPath = resolve(root, filePath);

  if (fullPath !== root && !fullPath.startsWith(root + sep)) {
    return { kind: "text", content: "Cannot read files outside the group workspace." };
  }

  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) return { kind: "text", content: `${filePath} is not a file.` };
    if (stat.size > 100_000) return { kind: "text", content: `${filePath} is too large to preview in the terminal.` };

    const fileText = readFileSync(fullPath, "utf8");
    if (isCodeFile(filePath)) return { kind: "code", content: fileText };

    return { kind: "text", content: `${filePath}\n${"─".repeat(Math.min(filePath.length, 60))}\n${fileText}` };
  } catch (error) {
    return { kind: "text", content: error instanceof Error ? error.message : `Could not read ${filePath}.` };
  }
}

function isCodeFile(filePath: string) {
  return filetypeForPath(filePath) !== "text";
}

function filetypeForPath(filePath: string) {
  const extension = filePath.split(".").pop()?.toLowerCase();

  const filetypes: Record<string, string> = {
    c: "c",
    cpp: "cpp",
    css: "css",
    go: "go",
    h: "c",
    hpp: "cpp",
    html: "html",
    java: "java",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    py: "python",
    rb: "ruby",
    rs: "rust",
    sh: "bash",
    sql: "sql",
    ts: "typescript",
    tsx: "typescript",
    yaml: "yaml",
    yml: "yaml",
    zig: "zig",
  };

  return extension ? filetypes[extension] ?? "text" : "text";
}

async function createWorkspaceTreeSitterClient() {
  addDefaultParsers([
    {
      filetype: "python",
      aliases: ["py"],
      wasm: "https://github.com/tree-sitter/tree-sitter-python/releases/download/v0.23.6/tree-sitter-python.wasm",
      queries: {
        highlights: ["https://raw.githubusercontent.com/tree-sitter/tree-sitter-python/master/queries/highlights.scm"],
      },
    },
  ]);

  const client = getTreeSitterClient();
  await client.initialize();
  return client;
}

function createCodeSyntaxStyle() {
  return SyntaxStyle.fromStyles({
    keyword: { fg: RGBA.fromHex("#FF7B72"), bold: true },
    "keyword.function": { fg: RGBA.fromHex("#FF7B72"), bold: true },
    "keyword.import": { fg: RGBA.fromHex("#FF7B72"), bold: true },
    string: { fg: RGBA.fromHex("#A5D6FF") },
    comment: { fg: RGBA.fromHex("#8B949E"), italic: true },
    number: { fg: RGBA.fromHex("#79C0FF") },
    boolean: { fg: RGBA.fromHex("#79C0FF") },
    constant: { fg: RGBA.fromHex("#79C0FF") },
    function: { fg: RGBA.fromHex("#D2A8FF") },
    "function.call": { fg: RGBA.fromHex("#D2A8FF") },
    "function.builtin": { fg: RGBA.fromHex("#D2A8FF") },
    type: { fg: RGBA.fromHex("#FFA657") },
    variable: { fg: RGBA.fromHex("#E6EDF3") },
    "variable.parameter": { fg: RGBA.fromHex("#FFA657") },
    property: { fg: RGBA.fromHex("#79C0FF") },
    operator: { fg: RGBA.fromHex("#FF7B72") },
    punctuation: { fg: RGBA.fromHex("#F0F6FC") },
    "markup.heading": { fg: RGBA.fromHex("#58A6FF"), bold: true },
    "markup.bold": { fg: RGBA.fromHex("#F0F6FC"), bold: true },
    "markup.italic": { fg: RGBA.fromHex("#F0F6FC"), italic: true },
    "markup.raw": { fg: RGBA.fromHex("#A5D6FF") },
    default: { fg: RGBA.fromHex("#E6EDF3") },
  });
}
