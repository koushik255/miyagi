import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
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
import { professorLoginFlow } from "../shared";
import { twoPaneLayout } from "../tui";

type ProfessorGroup = ReturnType<typeof Group.listByProfessor>[number];
type View = "home" | "groups" | "group" | "students" | "files";

export async function professorConsole() {
  const professor = await professorLoginFlow();
  const treeSitterClient = await createWorkspaceTreeSitterClient();
  const renderer = await createCliRenderer({ exitOnCtrlC: true, clearOnShutdown: true, autoFocus: true });
  const layout = twoPaneLayout(renderer);

  let view: View = "home";
  let selectedGroup: ProfessorGroup | undefined;

  const title = new TextRenderable(renderer, {
    content: `Miyagi Professor Console — ${professor.displayName}`,
    position: "absolute",
    ...layout.title,
    fg: "cyan",
  });

  const leftTitle = new TextRenderable(renderer, {
    content: "Controls",
    position: "absolute",
    ...layout.menuTitle,
    fg: "yellow",
  });

  const rightTitle = new TextRenderable(renderer, {
    content: "Preview",
    position: "absolute",
    ...layout.contentTitle,
    fg: "yellow",
  });

  const menu = new SelectRenderable(renderer, {
    position: "absolute",
    ...layout.menu,
    wrapSelection: true,
    showDescription: false,
    options: [],
  });

  const content = new TextRenderable(renderer, {
    position: "absolute",
    ...layout.content,
    wrapMode: "word",
    content: "",
  });

  const codePreview = new CodeRenderable(renderer, {
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

  const inputBox = new InputRenderable(renderer, {
    position: "absolute",
    ...layout.input,
    placeholder: "Type here + Enter",
    visible: false,
  });

  renderer.root.add(title);
  renderer.root.add(leftTitle);
  renderer.root.add(rightTitle);
  renderer.root.add(menu);
  renderer.root.add(content);
  renderer.root.add(codePreview);
  renderer.root.add(inputBox);

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
    inputBox.visible = false;
    codePreview.visible = false;
    content.visible = true;

    if (view === "home") {
      menu.options = [
        { name: "View groups", description: "", value: "groups" },
        { name: "Create group", description: "", value: "create" },
        { name: "Exit", description: "", value: "exit" },
      ];
      content.content = professorGroupsText(professor.id);
    }

    if (view === "groups") {
      const groups = Group.listByProfessor(professor.id);
      menu.options = [
        ...groups.map((group) => ({ name: group.name, description: "", value: group.id })),
        { name: "Back", description: "", value: "back" },
      ];
      content.content = groups.length ? "Hover a group to preview it. Press Enter to manage it." : "No groups yet.";
    }

    if (view === "group") {
      menu.options = [
        { name: "Overview", description: "", value: "overview" },
        { name: "Add students", description: "", value: "students" },
        { name: "Read workspace files", description: "", value: "files" },
        { name: "Back to groups", description: "", value: "back-groups" },
      ];
      content.content = selectedGroup ? groupDetailsText(selectedGroup) : "No group selected.";
    }

    if (view === "students") {
      menu.options = studentOptions();
      content.content = selectedGroup ? studentsPreviewText(selectedGroup) : "No group selected.";
    }

    if (view === "files") {
      const files = selectedGroup ? listWorkspaceFiles(selectedGroup) : [];
      menu.options = [
        ...files.map((file) => ({ name: file, description: "", value: file })),
        { name: "Back", description: "", value: "back-group" },
      ];
      content.content = selectedGroup ? workspaceFilesText(selectedGroup) : "No group selected.";
    }

    renderer.focusRenderable(menu);
    menu.focus();
    renderer.requestRender();
  }

  function studentOptions() {
    if (!selectedGroup) return [{ name: "Back", description: "", value: "back-group" }];

    const members = Group.listMembers(selectedGroup.id).map((member) => member.userId);
    const students = User.listStudents();

    return [
      ...students.map((student) => ({
        name: `${student.displayName} ${members.includes(student.id) ? "(added)" : "(not added)"}`,
        description: "",
        value: student.id,
      })),
      { name: "Back", description: "", value: "back-group" },
    ];
  }

  function startCreateGroup() {
    content.content = "Create group\n\nType the group name below and press Enter.";
    inputBox.value = "";
    inputBox.placeholder = "Group name";
    inputBox.visible = true;
    renderer.focusRenderable(inputBox);
    inputBox.focus();
    renderer.requestRender();

    inputBox.removeAllListeners(InputRenderableEvents.ENTER);
    inputBox.on(InputRenderableEvents.ENTER, () => {
      const name = inputBox.value.trim();
      if (name) selectedGroup = Group.create(professor.id, name);
      inputBox.visible = false;
      setMenu(selectedGroup ? "group" : "home");
    });
  }

  menu.on(SelectRenderableEvents.SELECTION_CHANGED, (_index, option) => {
    if (!option) return;

    if (view === "home") {
      if (option.value === "groups") content.content = professorGroupsText(professor.id);
      if (option.value === "create") content.content = "Create a new group.";
      if (option.value === "exit") content.content = "Press Enter to exit.";
    }

    if (view === "groups") {
      const group = Group.listByProfessor(professor.id).find((group) => group.id === option.value);
      content.content = group ? groupDetailsText(group) : "Go back.";
    }

    if (view === "group") {
      if (!selectedGroup) return;
      if (option.value === "overview") content.content = groupDetailsText(selectedGroup);
      if (option.value === "students") content.content = studentsPreviewText(selectedGroup);
      if (option.value === "files") content.content = workspaceFilesText(selectedGroup);
      if (option.value === "back-groups") content.content = "Go back to group list.";
    }

    if (view === "students") {
      if (!selectedGroup) return;
      if (option.value === "back-group") content.content = groupDetailsText(selectedGroup);
      else {
        const student = User.findById(option.value);
        const added = !!Group.findMember(option.value, selectedGroup.id);
        content.content = `${student?.displayName ?? "Student"}\n\nStatus: ${added ? "added" : "not added"}\n\nPress Enter ${added ? "to leave unchanged" : "to add to this group"}.`;
      }
    }

    if (view === "files") {
      if (!selectedGroup) return;
      if (option.value === "back-group") showText(groupDetailsText(selectedGroup));
      else showWorkspaceFile(selectedGroup, option.value);
    }

    renderer.requestRender();
  });

  menu.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
    if (!option) return;

    if (view === "home") {
      if (option.value === "groups") setMenu("groups");
      if (option.value === "create") startCreateGroup();
      if (option.value === "exit") renderer.destroy();
      return;
    }

    if (view === "groups") {
      if (option.value === "back") setMenu("home");
      else {
        selectedGroup = Group.listByProfessor(professor.id).find((group) => group.id === option.value);
        setMenu("group");
      }
      return;
    }

    if (view === "group") {
      if (option.value === "overview") content.content = selectedGroup ? groupDetailsText(selectedGroup) : "No group selected.";
      if (option.value === "students") setMenu("students");
      if (option.value === "files") setMenu("files");
      if (option.value === "back-groups") setMenu("groups");
      renderer.requestRender();
      return;
    }

    if (view === "students") {
      if (option.value === "back-group") setMenu("group");
      else if (selectedGroup && !Group.findMember(option.value, selectedGroup.id)) {
        Group.assignStudent(selectedGroup.joinCode, option.value);
        setMenu("students");
      }
    }

    if (view === "files") {
      if (option.value === "back-group") setMenu("group");
      else if (selectedGroup) showWorkspaceFile(selectedGroup, option.value);
      renderer.requestRender();
    }
  });

  function showWorkspaceFile(group: ProfessorGroup, filePath: string) {
    const result = readWorkspaceFile(group, filePath);
    if (result.kind === "code") showCode(filePath, result.content);
    else showText(result.content);
  }

  renderer.start();
  setMenu("home");
}

function professorGroupsText(professorId: string) {
  const groups = Group.listByProfessor(professorId);
  if (groups.length === 0) return "Groups\n\nNo groups yet.";

  return `Groups\n\n${groups
    .map((group) => `${group.name}\n  join code: ${group.joinCode}\n  workspace: ${group.workspacePath ?? "not set"}\n  students: ${Group.listMembers(group.id).length}`)
    .join("\n\n")}`;
}

function groupDetailsText(group: ProfessorGroup) {
  const members = Group.listMembers(group.id);
  const studentList = members.length ? members.map((member) => `    - ${member.displayName}`).join("\n") : "    No students yet.";

  return `${group.name}\n  join code: ${group.joinCode}\n  workspace: ${group.workspacePath ?? "not set"}\n  students: ${members.length}\n\n${studentList}`;
}

function studentsPreviewText(group: ProfessorGroup) {
  const members = Group.listMembers(group.id).map((member) => member.userId);
  const students = User.listStudents();

  if (students.length === 0) return "Registered students\n\nNo registered students yet.";

  return `Registered students\n\n${students
    .map((student) => `- ${student.displayName} ${members.includes(student.id) ? "(added)" : "(not added)"}`)
    .join("\n")}`;
}

function listWorkspaceFiles(group: ProfessorGroup): string[] {
  if (!group.workspacePath) return [];

  const root = resolve(group.workspacePath);

  try {
    const rootStat = statSync(root);
    if (!rootStat.isDirectory()) return [];
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

function workspaceFilesText(group: ProfessorGroup) {
  const files = listWorkspaceFiles(group);

  if (!group.workspacePath) return `${group.name} workspace\n\nNo workspace path has been set for this group.`;
  if (files.length === 0) return `${group.name} workspace\n  ${group.workspacePath}\n\nNo files found.`;

  return `${group.name} workspace\n  ${group.workspacePath}\n\nSelect a file on the left and press Enter to read it.\n\nFiles:\n${files.map((file) => `  - ${file}`).join("\n")}`;
}

function readWorkspaceFile(group: ProfessorGroup, filePath: string): { kind: "code" | "text"; content: string } {
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
