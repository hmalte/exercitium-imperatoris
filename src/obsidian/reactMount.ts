// Tiny helper for mounting React into an Obsidian view.
//
// Usage inside an ItemView:
//   onOpen()  → call mountReact(this.containerEl, <App/>) and keep the handle
//   onClose() → call handle.unmount()
//
// Keeping the React concern tucked behind this function means our view
// classes don't need to know about react-dom/client directly.
//
// The handle also exposes `render`, so a view can push fresh props into the
// SAME React root. Obsidian keeps leaves alive once opened, so a dashboard
// that only loads on mount goes stale the moment something else writes to
// the vault — re-rendering with a changed nonce is how the views re-read.

import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

export type ReactMountHandle = {
  /** Re-render the existing root with a new element. */
  render: (node: ReactNode) => void;
  unmount: () => void;
};

export function mountReact(host: HTMLElement, node: ReactNode): ReactMountHandle {
  // Obsidian gives us a containerEl with header + content children. We render
  // into the content child (index 1) and leave the header alone so the tab
  // title/icon keep working.
  const content = (host.children[1] as HTMLElement) ?? host;
  content.empty();

  const mountPoint = content.createDiv({ cls: "exercitium-react-root" });
  const root: Root = createRoot(mountPoint);
  root.render(node);

  return {
    render: (next: ReactNode) => root.render(next),
    unmount: () => {
      root.unmount();
      mountPoint.remove();
    },
  };
}
