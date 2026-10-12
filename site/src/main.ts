import "./styles/tokens.css";
import "./styles/landing.css";
import "./styles/demo.css";
import { mountDemo } from "./demo/render.js";

/**
 * Landing page behavior: the mobile menu, the tab lists, the copy button and the demo mount.
 * Everything else on the page is static HTML.
 */

const COPY_CONFIRM_MS = 1600;

const INSTALL_COMMANDS: Readonly<Record<string, string>> = {
  browser: "npm install @cylayo/weaver-core @cylayo/weaver-web",
  core: "npm install @cylayo/weaver-core",
  mcp: "npm install @cylayo/weaver-core @cylayo/weaver-mcp",
};

function requireElement<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

/**
 * Connects a WAI-ARIA tab list: arrow keys, Home and End move between tabs, and only the
 * selected tab sits in the tab order. onSelect runs for each selection.
 */
function wireTabs(list: HTMLElement, onSelect: (tab: HTMLElement) => void): void {
  const tabs = Array.from(list.querySelectorAll<HTMLElement>('[role="tab"]'));

  const select = (tab: HTMLElement): void => {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    }
    onSelect(tab);
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(tab);
      let next: number | undefined;
      if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      const target = tabs[next];
      if (!target) return;
      target.focus();
      select(target);
    });
  }
}

function setupMenu(): void {
  const toggle = requireElement<HTMLButtonElement>("menu-toggle");
  const menu = requireElement<HTMLElement>("main-menu");

  const setOpen = (open: boolean): void => {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    toggle.classList.toggle("is-open", open);
  };

  const isOpen = (): boolean => !menu.hidden;
  toggle.addEventListener("click", () => setOpen(!isOpen()));
  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });
}

function setupStreamTabs(): void {
  const list = requireElement<HTMLElement>("stream-tabs");
  wireTabs(list, (tab) => {
    const paneId = tab.dataset.pane;
    document.querySelectorAll<HTMLElement>(".stream-panes .pane").forEach((pane) => {
      pane.classList.toggle("is-active", pane.id === paneId);
    });
  });
}

function setupInstallPicker(): void {
  const list = requireElement<HTMLElement>("install-tabs");
  const pill = requireElement<HTMLButtonElement>("command-pill");
  const args = requireElement<HTMLElement>("command-args");
  const status = requireElement<HTMLElement>("copy-status");

  let command = INSTALL_COMMANDS.browser ?? "";
  let timer: number | undefined;

  const showCommand = (text: string): void => {
    command = text;
    const space = text.indexOf(" ");
    args.textContent = space < 0 ? "" : text.slice(space);
    pill.setAttribute("aria-label", "Copy command: " + text);
  };

  wireTabs(list, (tab) => {
    const next = INSTALL_COMMANDS[tab.dataset.install ?? ""];
    if (next) showCommand(next);
  });

  pill.addEventListener("click", () => {
    const text = command;
    const copied = (): void => {
      pill.classList.add("is-copied");
      pill.setAttribute("aria-label", "Copied to clipboard");
      status.textContent = "Copied to clipboard";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        pill.classList.remove("is-copied");
        pill.setAttribute("aria-label", "Copy command: " + command);
        status.textContent = "";
      }, COPY_CONFIRM_MS);
    };
    // Clipboard access can be refused (for example in an insecure context). The button still
    // confirms the click, because the command stays visible on the page.
    try {
      const write = navigator.clipboard?.writeText(text);
      if (write) {
        write.then(copied, copied);
      } else {
        copied();
      }
    } catch {
      copied();
    }
  });
}

setupMenu();
setupStreamTabs();
setupInstallPicker();
mountDemo(requireElement<HTMLElement>("demo-root"), { baseUrl: import.meta.env.BASE_URL });
