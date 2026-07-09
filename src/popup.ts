import { persistAuth, SupabaseApi } from "./supabaseClient";
import { clearAuth, getConfig } from "./storage";
import { applyStoredTheme } from "./theme";
import { checkForUpdate } from "./update";
import "./styles.css";

applyStoredTheme();

const signedIn = document.querySelector<HTMLDivElement>("#signedIn")!;
const signedOut = document.querySelector<HTMLDivElement>("#signedOut")!;
const whoami = document.querySelector<HTMLElement>("#whoami")!;
const usernameInput = document.querySelector<HTMLInputElement>("#username")!;
const passwordInput = document.querySelector<HTMLInputElement>("#password")!;
const signinButton = document.querySelector<HTMLButtonElement>("#signin")!;
const signupButton = document.querySelector<HTMLButtonElement>("#signup")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const authStatus = document.querySelector<HTMLDivElement>("#authStatus")!;
const openOverlay = document.querySelector<HTMLButtonElement>("#openOverlay")!;
const openPanel = document.querySelector<HTMLButtonElement>("#openPanel")!;
const tabHint = document.querySelector<HTMLDivElement>("#tabHint")!;
const openOptions = document.querySelector<HTMLButtonElement>("#openOptions")!;

const setStatus = (message: string, kind: "ok" | "error" | "" = "") => {
  authStatus.textContent = message;
  authStatus.className = `status ${kind}`.trim();
};

const renderAccount = async () => {
  const config = await getConfig();
  const loggedIn = Boolean(config.username && config.accessToken);
  signedIn.classList.toggle("hidden", !loggedIn);
  signedOut.classList.toggle("hidden", loggedIn);
  if (loggedIn) whoami.textContent = config.username ?? "";
};

const authenticate = async (mode: "login" | "signup") => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!username || !password) {
    setStatus("Enter a username and password.", "error");
    return;
  }
  setStatus(mode === "signup" ? "Creating account…" : "Signing in…");
  try {
    const api = await SupabaseApi.fromStorage();
    const auth = mode === "signup" ? await api.signup(username, password) : await api.login(username, password);
    await persistAuth(auth);
    passwordInput.value = "";
    setStatus(mode === "signup" ? `Created ${username}` : `Signed in as ${username}`, "ok");
    await renderAccount();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Authentication failed", "error");
  }
};

// The two "open" buttons only make sense on a Spotify tab. Find it, enable
// accordingly, and hint otherwise.
const getActiveSpotifyTab = async (): Promise<chrome.tabs.Tab | undefined> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith("https://open.spotify.com/") ? tab : undefined;
};

const wireOpenButtons = async () => {
  const tab = await getActiveSpotifyTab();
  const onSpotify = Boolean(tab?.id);
  openOverlay.disabled = !onSpotify;
  openPanel.disabled = !onSpotify;
  tabHint.classList.toggle("hidden", onSpotify);

  openOverlay.onclick = async () => {
    if (!tab?.id) return;
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" }).catch(() => undefined);
    window.close();
  };
  // sidePanel.open must run in the click's user-gesture turn — call it directly,
  // no await. The manifest's side_panel.default_path already supplies the path,
  // so open({ tabId }) alone is enough (awaiting setOptions here would break the
  // gesture, the same bug that dogged the old background handler).
  openPanel.onclick = () => {
    if (!tab?.id) return;
    chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  };
};

signinButton.addEventListener("click", () => authenticate("login"));
signupButton.addEventListener("click", () => authenticate("signup"));
logoutButton.addEventListener("click", async () => {
  await clearAuth();
  setStatus("Logged out");
  await renderAccount();
});
openOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());

const showUpdateIfAvailable = async () => {
  const banner = document.querySelector<HTMLAnchorElement>("#updateBanner")!;
  const latest = await checkForUpdate().catch(() => undefined);
  if (!latest) return;
  banner.textContent = `Update available: v${latest.version} — Download`;
  banner.href = latest.url;
  banner.classList.remove("hidden");
};

renderAccount();
wireOpenButtons();
showUpdateIfAvailable();
