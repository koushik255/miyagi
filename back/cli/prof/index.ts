import {
  createCliRenderer,
  InputRenderable,
  InputRenderableEvents,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from "@opentui/core";
import { Group, User } from "../../src/class";
import { professorLoginFlow } from "../shared";
import { twoPaneLayout } from "../tui";

type ProfessorGroup = ReturnType<typeof Group.listByProfessor>[number];
type View = "home" | "groups" | "group" | "students";

export async function professorConsole() {
  const professor = await professorLoginFlow();
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
  renderer.root.add(inputBox);

  function setMenu(nextView: View) {
    view = nextView;
    inputBox.visible = false;

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
        { name: "Back to groups", description: "", value: "back-groups" },
      ];
      content.content = selectedGroup ? groupDetailsText(selectedGroup) : "No group selected.";
    }

    if (view === "students") {
      menu.options = studentOptions();
      content.content = selectedGroup ? studentsPreviewText(selectedGroup) : "No group selected.";
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
  });

  renderer.start();
  setMenu("home");
}

function professorGroupsText(professorId: string) {
  const groups = Group.listByProfessor(professorId);
  if (groups.length === 0) return "Groups\n\nNo groups yet.";

  return `Groups\n\n${groups
    .map((group) => `${group.name}\n  join code: ${group.joinCode}\n  students: ${Group.listMembers(group.id).length}`)
    .join("\n\n")}`;
}

function groupDetailsText(group: ProfessorGroup) {
  const members = Group.listMembers(group.id);
  const studentList = members.length ? members.map((member) => `    - ${member.displayName}`).join("\n") : "    No students yet.";

  return `${group.name}\n  join code: ${group.joinCode}\n  students: ${members.length}\n\n${studentList}`;
}

function studentsPreviewText(group: ProfessorGroup) {
  const members = Group.listMembers(group.id).map((member) => member.userId);
  const students = User.listStudents();

  if (students.length === 0) return "Registered students\n\nNo registered students yet.";

  return `Registered students\n\n${students
    .map((student) => `- ${student.displayName} ${members.includes(student.id) ? "(added)" : "(not added)"}`)
    .join("\n")}`;
}
