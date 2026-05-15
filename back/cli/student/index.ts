import { confirm, input, password as passwordPrompt, select } from "@inquirer/prompts";
import {
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from "@opentui/core";
import { Group, User } from "../../src/class";
import { readLoginEnv } from "../env-login";
import { updateSession } from "../session";
import type { ActiveUser } from "../shared";
import { twoPaneLayout } from "../tui";

export async function studentConsole() {
  const student = await studentLogin();
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

  const menu = new SelectRenderable(renderer, {
    id: "student-menu",
    position: "absolute",
    ...layout.menu,
    wrapSelection: true,
    showDescription: false,
    options: [
      { name: "My groups", description: "", value: "groups" },
      { name: "Join group", description: "", value: "join" },
      { name: "Help", description: "", value: "help" },
      { name: "Exit", description: "", value: "exit" },
    ],
  });

  const content = new TextRenderable(renderer, {
    id: "content",
    content: studentGroupsText(student.id),
    position: "absolute",
    ...layout.content,
    wrapMode: "word",
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
  renderer.root.add(joinInput);

  function showPreview(value: string) {
    joinInput.visible = false;

    if (value === "groups") content.content = studentGroupsText(student.id);
    if (value === "join") content.content = "Join a group\n\nPress Enter, type the join code, then press Enter again.";
    if (value === "help") content.content = "Use ↑/↓ to move through the left menu.\n\nThe right side updates automatically based on the selected item.\n\nPress Enter only when you need to perform an action, like joining a group.";
    if (value === "exit") content.content = "Press Enter to exit.";

    renderer.requestRender();
  }

  menu.on(SelectRenderableEvents.SELECTION_CHANGED, (_index, option) => {
    showPreview(option.value);
  });

  menu.on(SelectRenderableEvents.ITEM_SELECTED, (_index, option) => {
    if (option.value === "groups" || option.value === "help") showPreview(option.value);

    if (option.value === "join") {
      content.content = "Enter the group join code below:";
      joinInput.value = "";
      joinInput.visible = true;
      renderer.focusRenderable(joinInput);
      joinInput.focus();
      renderer.requestRender();
    }

    if (option.value === "exit") renderer.destroy();
  });

  joinInput.on(InputRenderableEvents.ENTER, () => {
    const code = joinInput.value.trim().toUpperCase();

    try {
      if (code.length === 0) throw new Error("Join code cannot be empty.");
      const member = Group.assignStudent(code, student.id);
      const group = Group.findByJoinCode(code);
      content.content = `Joined ${group?.name ?? "group"} as ${member.role}.\n\n${studentGroupsText(student.id)}`;
    } catch (error) {
      content.content = error instanceof Error ? error.message : "Could not join group.";
    }

    joinInput.visible = false;
    renderer.focusRenderable(menu);
    menu.focus();
    renderer.requestRender();
  });

  renderer.start();
  renderer.focusRenderable(menu);
  menu.focus();
  showPreview("groups");
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
