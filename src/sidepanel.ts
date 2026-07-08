import type { PanelAction, SharedNote, StoredNote, SyncUser, TrackMetadata } from "./models";
import { SupabaseApi, syncPendingSaves } from "./supabaseClient";
import { getConfig, getLocalNote, getSyncUsers, queuePendingSave, saveLocalNote } from "./storage";
import { applyStoredTheme } from "./theme";
import "./styles.css";

applyStoredTheme();

const titleEl = document.querySelector<HTMLDivElement>("#songTitle")!;
const artistsEl = document.querySelector<HTMLDivElement>("#songArtists")!;
const artworkEl = document.querySelector<HTMLDivElement>("#artwork")!;
const noteBodyEl = document.querySelector<HTMLTextAreaElement>("#noteBody")!;
const sharedToggleEl = document.querySelector<HTMLInputElement>("#sharedToggle")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clearButton")!;
const syncButton = document.querySelector<HTMLButtonElement>("#syncButton")!;
const statusEl = document.querySelector<HTMLSpanElement>("#saveStatus")!;
const sharedStatusEl = document.querySelector<HTMLSpanElement>("#sharedStatus")!;
const tabNote = document.querySelector<HTMLButtonElement>("#tabNote")!;
const tabShared = document.querySelector<HTMLButtonElement>("#tabShared")!;
const editorView = document.querySelector<HTMLElement>("#editorView")!;
const sharedView = document.querySelector<HTMLElement>("#sharedView")!;
const sharedList = document.querySelector<HTMLDivElement>("#sharedList")!;
const modalBackdrop = document.querySelector<HTMLDivElement>("#modalBackdrop")!;
const modalTitle = document.querySelector<HTMLDivElement>("#modalTitle")!;
const modalBody = document.querySelector<HTMLParagraphElement>("#modalBody")!;
const modalPreview = document.querySelector<HTMLDivElement>("#modalPreview")!;
const modalPreviewPre = modalPreview.querySelector("pre")!;
const modalActions = document.querySelector<HTMLDivElement>("#modalActions")!;

let currentTrack: TrackMetadata | undefined;
let currentAction: PanelAction = "edit";

const setStatus = (message: string, kind: "ok" | "error" | "" = "") => {
  statusEl.textContent = message;
  statusEl.className = `status ${kind}`.trim();
};

const setSharedStatus = (message: string, kind: "ok" | "error" | "" = "") => {
  sharedStatusEl.textContent = message;
  sharedStatusEl.className = `status ${kind}`.trim();
};

type View = "note" | "shared";

const showView = (view: View) => {
  const shared = view === "shared";
  editorView.classList.toggle("hidden", shared);
  sharedView.classList.toggle("hidden", !shared);
  sharedView.setAttribute("aria-hidden", String(!shared));
  editorView.setAttribute("aria-hidden", String(shared));
  tabNote.setAttribute("aria-selected", String(!shared));
  tabShared.setAttribute("aria-selected", String(shared));
  if (shared) void showSharedNotes();
};

const setFormEnabled = (enabled: boolean) => {
  noteBodyEl.disabled = !enabled;
  sharedToggleEl.disabled = !enabled;
  clearButton.disabled = !enabled;
  syncButton.disabled = !enabled;
  tabShared.disabled = !enabled;
};

const renderTrack = (track?: TrackMetadata) => {
  currentTrack = track;
  if (!track) {
    titleEl.textContent = "Song not detected";
    artistsEl.textContent = "Open Spotify Web Player and start playback.";
    artworkEl.textContent = "No art";
    artworkEl.querySelector("img")?.remove();
    setFormEnabled(false);
    return;
  }
  titleEl.textContent = track.title;
  artistsEl.textContent = track.artists.length ? track.artists.join(", ") : "Artist unknown";
  artworkEl.textContent = "";
  artworkEl.innerHTML = track.artworkUrl ? `<img alt="" src="${track.artworkUrl}">` : "No art";
  setFormEnabled(true);
};

const loadNote = async () => {
  if (!currentTrack) return;
  const local = await getLocalNote(currentTrack.spotifyTrackId);
  if (local) {
    noteBodyEl.value = local.body;
    sharedToggleEl.checked = local.shared;
    setStatus(local.pending ? "Saved locally, waiting to sync" : "Loaded");
    return;
  }

  try {
    const api = await SupabaseApi.fromStorage();
    const remote = await api.fetchMyNote(currentTrack.spotifyTrackId);
    if (remote) {
      await saveLocalNote(remote);
      noteBodyEl.value = remote.body;
      sharedToggleEl.checked = remote.shared;
      setStatus("Loaded from Supabase", "ok");
    } else {
      noteBodyEl.value = "";
      sharedToggleEl.checked = false;
      setStatus("");
    }
  } catch {
    noteBodyEl.value = "";
    sharedToggleEl.checked = false;
    setStatus("");
  }
};

const buildCurrentNote = (): StoredNote | undefined => {
  if (!currentTrack) return undefined;
  return {
    trackId: currentTrack.spotifyTrackId,
    body: noteBodyEl.value,
    shared: sharedToggleEl.checked,
    updatedAt: new Date().toISOString()
  };
};

const saveNote = async () => {
  const note = buildCurrentNote();
  if (!note || !currentTrack) return;
  await saveLocalNote(note);
  try {
    const api = await SupabaseApi.fromStorage();
    await api.upsertTrack(currentTrack);
    await syncPendingSaves().catch(() => undefined);
    if (!note.body.trim() && !note.shared) {
      await api.deleteMyNote(note.trackId);
    } else {
      await api.upsertNote(note);
    }
    await saveLocalNote({ ...note, pending: false });
    setStatus("Saved", "ok");
  } catch (error) {
    await queuePendingSave(note);
    setStatus(error instanceof Error ? `Saved offline: ${error.message}` : "Saved offline, will sync later", "error");
  }
};

// Autosave: persist locally on every keystroke so work is never lost, then
// debounce the remote sync. Close is always safe — nothing waits on a button.
let syncTimer: number | undefined;
const scheduleAutosave = () => {
  const note = buildCurrentNote();
  if (!note) return;
  void saveLocalNote(note); // immediate, local, cannot fail on network
  setStatus("Saving…");
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => void saveNote(), 800);
};

const clearNote = async () => {
  if (!currentTrack) return;
  noteBodyEl.value = "";
  sharedToggleEl.checked = false;
  const note: StoredNote = {
    trackId: currentTrack.spotifyTrackId,
    body: "",
    shared: false,
    updatedAt: new Date().toISOString(),
    deleted: true
  };
  await saveLocalNote(note);
  setStatus("Cleared locally");
  try {
    const api = await SupabaseApi.fromStorage();
    await api.deleteMyNote(note.trackId);
    await saveLocalNote({ ...note, pending: false });
    setStatus("Cleared and synced", "ok");
  } catch (error) {
    await queuePendingSave(note);
    setStatus(error instanceof Error ? `Clear queued: ${error.message}` : "Clear queued", "error");
  }
};

const renderSharedNotes = (notes: SharedNote[]) => {
  sharedList.innerHTML = "";
  if (notes.length === 0) {
    sharedList.innerHTML = '<div class="muted">No shared notes found for this song.</div>';
    return;
  }
  for (const note of notes) {
    const item = document.createElement("article");
    item.className = "note-card";
    item.innerHTML = `<div class="head"><strong></strong><span class="muted">${new Date(
      note.updatedAt
    ).toLocaleString()}</span><span class="spacer"></span></div><pre></pre>`;
    item.querySelector("strong")!.textContent = note.username;
    item.querySelector("pre")!.textContent = note.body;

    const pull = document.createElement("button");
    pull.className = "small";
    pull.textContent = "Pull";
    pull.addEventListener("click", () => resolveConflict(note));
    item.querySelector(".head")!.append(pull);

    sharedList.append(item);
  }
};

const showSharedNotes = async () => {
  if (!currentTrack) return;
  setSharedStatus("");
  sharedList.innerHTML = '<div class="muted">Loading shared notes…</div>';
  try {
    const api = await SupabaseApi.fromStorage();
    renderSharedNotes(await api.fetchSharedNotes(currentTrack.spotifyTrackId));
  } catch (error) {
    sharedList.innerHTML = "";
    setSharedStatus(error instanceof Error ? error.message : "Could not load notes", "error");
  }
};

const hideModal = () => {
  modalBackdrop.classList.add("hidden");
  modalActions.innerHTML = "";
  modalPreview.classList.add("hidden");
};

const addModalButton = (label: string, onClick: () => void, className = "") => {
  const button = document.createElement("button");
  button.textContent = label;
  button.className = className;
  button.addEventListener("click", onClick);
  modalActions.append(button);
};

const mergeNotes = async (mine: string, theirs: SharedNote) => {
  const config = await getConfig();
  const me = config.username ?? "me";
  return `${mine.trim()}\n\n--- ${me} + ${theirs.username} ---\n\n${theirs.body.trim()}`.trim();
};

const chooseSharedNote = async (notes: SharedNote[], syncUsers: SyncUser[]): Promise<SharedNote | undefined> => {
  if (notes.length <= 1) return notes[0];
  return new Promise((resolve) => {
    modalTitle.textContent = "Choose a synced note";
    modalBody.textContent = "Multiple followed users have a shared note for this song.";
    modalActions.innerHTML = "";
    const ordered = [...notes].sort((a, b) => {
      const aPriority = syncUsers.find((user) => user.id === a.profileId)?.priority ?? 9999;
      const bPriority = syncUsers.find((user) => user.id === b.profileId)?.priority ?? 9999;
      return aPriority - bPriority;
    });
    for (const note of ordered) {
      addModalButton(note.username, () => {
        hideModal();
        resolve(note);
      });
    }
    addModalButton("Cancel", () => {
      hideModal();
      resolve(undefined);
    });
    modalBackdrop.classList.remove("hidden");
  });
};

const resolveConflict = async (theirs: SharedNote) => {
  const mine = noteBodyEl.value.trim();
  if (!mine) {
    noteBodyEl.value = theirs.body;
    showView("note");
    await saveNote();
    setStatus(`Pulled from ${theirs.username}`, "ok");
    return;
  }

  modalTitle.textContent = `Pull from ${theirs.username}`;
  modalBody.textContent = "You already have a note for this song. How should theirs be added?";
  modalActions.innerHTML = "";
  modalPreview.classList.add("hidden");
  addModalButton("Keep mine", () => {
    hideModal();
  });
  addModalButton("Replace mine", async () => {
    noteBodyEl.value = theirs.body;
    hideModal();
    showView("note");
    await saveNote();
  }, "primary");
  addModalButton("Add theirs to mine", async () => {
    noteBodyEl.value = await mergeNotes(mine, theirs);
    hideModal();
    showView("note");
    await saveNote();
  });
  addModalButton("View both", () => {
    modalPreviewPre.textContent = `Mine:\n${mine}\n\n${theirs.username}:\n${theirs.body}`;
    modalPreview.classList.remove("hidden");
  });
  modalBackdrop.classList.remove("hidden");
};

const syncFromFollowed = async () => {
  if (!currentTrack) return;
  try {
    const api = await SupabaseApi.fromStorage();
    const [syncUsers, notes] = await Promise.all([getSyncUsers(), api.fetchSharedNotes(currentTrack.spotifyTrackId)]);
    const followedIds = new Set(syncUsers.map((user) => user.id));
    const matches = notes.filter((note) => followedIds.has(note.profileId));
    const chosen = await chooseSharedNote(matches, syncUsers);
    if (!chosen) {
      setSharedStatus("No followed-user note for this song");
      return;
    }
    await resolveConflict(chosen);
    showView("note");
  } catch (error) {
    setSharedStatus(error instanceof Error ? error.message : "Sync failed", "error");
  }
};

const refreshPanelState = async () => {
  const response = await chrome.runtime.sendMessage({ type: "GET_PANEL_STATE" });
  currentAction = response.action ?? "edit";
  renderTrack(response.track);
  await loadNote();
  // The launch action only picks the initial view; navigation lives in the panel.
  if (currentAction === "shared") showView("shared");
  else if (currentAction === "sync") {
    showView("shared");
    await syncFromFollowed();
  }
};

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "TRACK_CHANGED") {
    renderTrack(message.track);
    loadNote().catch(() => undefined);
  }
});

noteBodyEl.addEventListener("input", () => scheduleAutosave());
sharedToggleEl.addEventListener("change", () => scheduleAutosave());
clearButton.addEventListener("click", () => clearNote());
syncButton.addEventListener("click", () => syncFromFollowed());
tabNote.addEventListener("click", () => showView("note"));
tabShared.addEventListener("click", () => showView("shared"));

getConfig().then((config) => {
  if (!config.username) setStatus("Sign in from Options to sync notes.");
});
refreshPanelState().catch((error: Error) => setStatus(error.message, "error"));
