// Floating note window injected onto the Spotify page. The window frame (title
// bar, drag, minimize/close) lives here in the content-script DOM; the note UI
// itself is an extension-origin iframe of sidepanel.html, so its theming,
// Supabase calls, and querySelectors all work exactly as in the side panel.

const HOST_ID = "spotify-song-notes-overlay";
const POS_KEY = "overlayState";

interface OverlayState {
  x: number;
  y: number;
  minimized: boolean;
  open: boolean;
}

const DEFAULT_STATE: OverlayState = { x: 24, y: 96, minimized: false, open: false };

let host: HTMLDivElement | undefined;
let state: OverlayState = { ...DEFAULT_STATE };

const loadState = async (): Promise<OverlayState> => {
  const stored = await chrome.storage.local.get(POS_KEY);
  return { ...DEFAULT_STATE, ...(stored[POS_KEY] as Partial<OverlayState> | undefined) };
};

const saveState = () => {
  void chrome.storage.local.set({ [POS_KEY]: state });
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Keep the window on-screen after drags and viewport resizes.
const applyPosition = () => {
  if (!host) return;
  const width = host.offsetWidth || 360;
  const height = host.offsetHeight || 60;
  state.x = clamp(state.x, 0, Math.max(0, window.innerWidth - width));
  state.y = clamp(state.y, 0, Math.max(0, window.innerHeight - height));
  host.style.left = `${state.x}px`;
  host.style.top = `${state.y}px`;
};

const injectStyles = () => {
  if (document.getElementById(`${HOST_ID}-style`)) return;
  const style = document.createElement("style");
  style.id = `${HOST_ID}-style`;
  // All rules scoped under #HOST_ID so nothing leaks into Spotify's page.
  style.textContent = `
    #${HOST_ID} {
      position: fixed;
      z-index: 2147483646;
      width: 360px;
      background: #20252a;
      border: 1px solid #3a424b;
      border-radius: 10px;
      box-shadow: 0 16px 48px rgb(0 0 0 / 0.4);
      overflow: hidden;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    #${HOST_ID} .ssn-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 8px 0 12px;
      background: #1a1e22;
      border-bottom: 1px solid #3a424b;
      cursor: grab;
      user-select: none;
    }
    #${HOST_ID} .ssn-bar:active { cursor: grabbing; }
    #${HOST_ID} .ssn-title {
      font-size: 13px;
      font-weight: 600;
      color: #f1f3f5;
      flex: 1;
    }
    #${HOST_ID} .ssn-btn {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #c3ccd5;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 0;
    }
    #${HOST_ID} .ssn-btn:hover { background: #2b3138; color: #f1f3f5; }
    #${HOST_ID} .ssn-frame {
      display: block;
      width: 360px;
      height: 520px;
      border: 0;
      background: #14171a;
    }
    #${HOST_ID} .ssn-fallback {
      display: none;
      padding: 20px;
      font-size: 13px;
      line-height: 1.5;
      color: #c3ccd5;
    }
    #${HOST_ID}.ssn-blocked .ssn-frame { display: none; }
    #${HOST_ID}.ssn-blocked .ssn-fallback { display: block; }
    #${HOST_ID}.ssn-min .ssn-frame,
    #${HOST_ID}.ssn-min .ssn-fallback { display: none; }
  `;
  document.documentElement.appendChild(style);
};

const startDrag = (event: PointerEvent) => {
  if (!host) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const originX = state.x;
  const originY = state.y;
  // Block iframe from swallowing pointer events mid-drag.
  const frame = host.querySelector<HTMLIFrameElement>(".ssn-frame");
  if (frame) frame.style.pointerEvents = "none";

  const move = (e: PointerEvent) => {
    state.x = originX + (e.clientX - startX);
    state.y = originY + (e.clientY - startY);
    applyPosition();
  };
  const up = () => {
    if (frame) frame.style.pointerEvents = "";
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    saveState();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
};

const applyMinimized = () => {
  if (!host) return;
  host.classList.toggle("ssn-min", state.minimized);
  const btn = host.querySelector<HTMLButtonElement>(".ssn-min-btn");
  if (btn) btn.textContent = state.minimized ? "▢" : "—";
};

const build = () => {
  injectStyles();
  host = document.createElement("div");
  host.id = HOST_ID;

  const bar = document.createElement("div");
  bar.className = "ssn-bar";
  bar.addEventListener("pointerdown", startDrag);

  const title = document.createElement("span");
  title.className = "ssn-title";
  title.textContent = "Song Notes";

  const minBtn = document.createElement("button");
  minBtn.className = "ssn-btn ssn-min-btn";
  minBtn.title = "Minimize";
  minBtn.textContent = "—";
  minBtn.addEventListener("click", () => {
    state.minimized = !state.minimized;
    applyMinimized();
    applyPosition();
    saveState();
  });

  const closeBtn = document.createElement("button");
  closeBtn.className = "ssn-btn";
  closeBtn.title = "Close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => hide());

  bar.append(title, minBtn, closeBtn);

  const frame = document.createElement("iframe");
  frame.className = "ssn-frame";
  frame.src = chrome.runtime.getURL("sidepanel.html");

  // If Spotify's CSP blocks our extension iframe, it never fires `load`. Fall
  // back to a message pointing at the side panel (an extension surface CSP can't
  // touch) instead of showing a blank window.
  const fallback = document.createElement("div");
  fallback.className = "ssn-fallback";
  fallback.textContent =
    "This page blocked the floating window. Open the side panel instead (extension icon → Open side panel).";
  let loaded = false;
  frame.addEventListener("load", () => {
    loaded = true;
  });
  window.setTimeout(() => {
    if (!loaded && host) host.classList.add("ssn-blocked");
  }, 2500);

  host.append(bar, frame, fallback);
  document.documentElement.appendChild(host);
  applyMinimized();
  applyPosition();
};

const show = () => {
  if (!host) build();
  else host.style.display = "";
  state.open = true;
  applyPosition();
  saveState();
};

const hide = () => {
  if (host) host.style.display = "none";
  state.open = false;
  saveState();
};

export const toggleOverlay = () => {
  if (host && host.style.display !== "none") hide();
  else show();
};

// Restore a window the user had open before a reload.
export const initOverlay = async () => {
  state = await loadState();
  if (state.open) show();
  window.addEventListener("resize", applyPosition);
};
