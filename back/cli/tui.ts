import type { CliRenderer } from "@opentui/core";

export function twoPaneLayout(renderer: CliRenderer) {
  const menuLeft = 2;
  const menuWidth = 30;
  const gap = 6;
  const contentLeft = menuLeft + menuWidth + gap;
  const contentWidth = Math.max(60, renderer.terminalWidth - contentLeft - 4);
  const contentHeight = Math.max(18, renderer.terminalHeight - 8);

  return {
    title: { left: 2, top: 1, width: Math.max(80, renderer.terminalWidth - 4), height: 1 },
    menuTitle: { left: menuLeft, top: 3, width: menuWidth, height: 1 },
    menu: { left: menuLeft, top: 5, width: menuWidth, height: Math.max(10, renderer.terminalHeight - 8) },
    contentTitle: { left: contentLeft, top: 3, width: contentWidth, height: 1 },
    content: { left: contentLeft, top: 5, width: contentWidth, height: contentHeight },
    input: { left: contentLeft, top: Math.max(30, renderer.terminalHeight - 3), width: 40, height: 1 },
  };
}
