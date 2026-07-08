import type { SyncUser } from "./models";
import { persistAuth, SupabaseApi } from "./supabaseClient";
import { clearAuth, getConfig, getSyncUsers, saveConfig, saveSyncUsers } from "./storage";
import "./styles.css";

const supabaseUrl = document.querySelector<HTMLInputElement>("#supabaseUrl")!;
const supabaseAnonKey = document.querySelector<HTMLInputElement>("#supabaseAnonKey")!;
const saveConfigButton = document.querySelector<HTMLButtonElement>("#saveConfig")!;
const accountStatus = document.querySelector<HTMLDivElement>("#accountStatus")!;
const usernameInput = document.querySelector<HTMLInputElement>("#username")!;
const passwordInput = document.querySelector<HTMLInputElement>("#password")!;
const loginButton = document.querySelector<HTMLButtonElement>("#login")!;
const signupButton = document.querySelector<HTMLButtonElement>("#signup")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout")!;
const userSearch = document.querySelector<HTMLInputElement>("#userSearch")!;
const searchButton = document.querySelector<HTMLButtonElement>("#searchButton")!;
const searchResults = document.querySelector<HTMLDivElement>("#searchResults")!;
const syncUsersEl = document.querySelector<HTMLDivElement>("#syncUsers")!;

const setStatus = (message: string, kind: "ok" | "error" | "" = "") => {
  accountStatus.textContent = message;
  accountStatus.className = `status ${kind}`.trim();
};

const renderSyncUsers = async () => {
  const users = await getSyncUsers();
  syncUsersEl.innerHTML = "";
  if (users.length === 0) {
    syncUsersEl.innerHTML = '<div class="muted">No synced users yet.</div>';
    return;
  }

  users.forEach((user, index) => {
    const row = document.createElement("div");
    row.className = "note-card row wrap";
    row.innerHTML = `<strong>${user.username}</strong><span class="spacer"></span>`;

    const up = document.createElement("button");
    up.textContent = "Up";
    up.disabled = index === 0;
    up.addEventListener("click", async () => {
      const next = [...users];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      await saveSyncUserOrder(next);
      await renderSyncUsers();
    });

    const down = document.createElement("button");
    down.textContent = "Down";
    down.disabled = index === users.length - 1;
    down.addEventListener("click", async () => {
      const next = [...users];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      await saveSyncUserOrder(next);
      await renderSyncUsers();
    });

    const remove = document.createElement("button");
    remove.textContent = "Remove";
    remove.className = "danger";
    remove.addEventListener("click", async () => {
      try {
        const api = await SupabaseApi.fromStorage();
        await api.removeSyncUser(user.id);
      } catch {
        // Local removal is still useful when offline; RLS will enforce server state later.
      }
      await saveSyncUsers(users.filter((item) => item.id !== user.id));
      await renderSyncUsers();
    });

    row.append(up, down, remove);
    syncUsersEl.append(row);
  });
};

const saveSyncUserOrder = async (users: SyncUser[]) => {
  await saveSyncUsers(users);
  try {
    const api = await SupabaseApi.fromStorage();
    await api.updateSyncPriorities(users);
  } catch {
    setStatus("Order saved locally. Server order will update after backend settings and login are valid.");
  }
};

const addSyncUser = async (user: SyncUser) => {
  const users = await getSyncUsers();
  if (users.some((item) => item.id === user.id)) return;
  const next = [...users, { ...user, priority: users.length }];
  await saveSyncUsers(next);
  try {
    const api = await SupabaseApi.fromStorage();
    await api.addSyncUser(user.id, users.length);
  } catch {
    setStatus("Added locally. Server sync will work after login/backend settings are valid.");
  }
  await renderSyncUsers();
};

const renderSearchResults = (users: SyncUser[]) => {
  searchResults.innerHTML = "";
  if (users.length === 0) {
    searchResults.innerHTML = '<div class="muted">No users found.</div>';
    return;
  }
  users.forEach((user) => {
    const row = document.createElement("div");
    row.className = "note-card row";
    row.innerHTML = `<strong>${user.username}</strong><span class="spacer"></span>`;
    const add = document.createElement("button");
    add.textContent = "Add";
    add.addEventListener("click", () => addSyncUser(user));
    row.append(add);
    searchResults.append(row);
  });
};

const loadOptions = async () => {
  const config = await getConfig();
  supabaseUrl.value = config.supabaseUrl ?? "";
  supabaseAnonKey.value = config.supabaseAnonKey ?? "";
  usernameInput.value = config.username ?? "";
  setStatus(config.username ? `Signed in as ${config.username}` : "Not signed in", config.username ? "ok" : "");
  await renderSyncUsers();
  try {
    const api = await SupabaseApi.fromStorage();
    const remoteUsers = await api.fetchSyncUsers();
    if (remoteUsers.length > 0) {
      await saveSyncUsers(remoteUsers);
      await renderSyncUsers();
    }
  } catch {
    // Settings still work without an active backend.
  }
};

saveConfigButton.addEventListener("click", async () => {
  const current = await getConfig();
  await saveConfig({
    ...current,
    supabaseUrl: supabaseUrl.value.trim(),
    supabaseAnonKey: supabaseAnonKey.value.trim()
  });
  setStatus("Backend settings saved", "ok");
});

loginButton.addEventListener("click", async () => {
  try {
    const api = await SupabaseApi.fromStorage();
    const auth = await api.login(usernameInput.value.trim(), passwordInput.value);
    await persistAuth(auth);
    setStatus(`Signed in as ${usernameInput.value.trim()}`, "ok");
    passwordInput.value = "";
    await loadOptions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Login failed", "error");
  }
});

signupButton.addEventListener("click", async () => {
  try {
    const api = await SupabaseApi.fromStorage();
    const auth = await api.signup(usernameInput.value.trim(), passwordInput.value);
    await persistAuth(auth);
    setStatus(`Created ${usernameInput.value.trim()}`, "ok");
    passwordInput.value = "";
    await loadOptions();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Signup failed", "error");
  }
});

logoutButton.addEventListener("click", async () => {
  await clearAuth();
  setStatus("Logged out");
  await loadOptions();
});

searchButton.addEventListener("click", async () => {
  const query = userSearch.value.trim();
  if (!query) return;
  searchResults.innerHTML = '<div class="muted">Searching...</div>';
  try {
    const api = await SupabaseApi.fromStorage();
    renderSearchResults(await api.searchProfiles(query));
  } catch (error) {
    searchResults.innerHTML = `<div class="status error">${error instanceof Error ? error.message : "Search failed"}</div>`;
  }
});

loadOptions().catch((error: Error) => setStatus(error.message, "error"));
