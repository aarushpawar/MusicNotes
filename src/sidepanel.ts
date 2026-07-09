import type { ForumNote, PanelAction, SharedNote, StoredNote, SyncUser, TrackMetadata } from "./models";
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
const viewNav = document.querySelector<HTMLElement>("#viewNav")!;
const forumButton = document.querySelector<HTMLButtonElement>("#forumButton")!;
const myNotesButton = document.querySelector<HTMLButtonElement>("#myNotesButton")!;
const forumView = document.querySelector<HTMLElement>("#forumView")!;
const forumTitle = document.querySelector<HTMLElement>("#forumTitle")!;
const forumSubtitle = document.querySelector<HTMLElement>("#forumSubtitle")!;
const forumList = document.querySelector<HTMLDivElement>("#forumList")!;
const forumStatus = document.querySelector<HTMLSpanElement>("#forumStatus")!;
const forumSentinel = document.querySelector<HTMLDivElement>("#forumSentinel")!;
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

// "forum" and "mine" both render in the #forumView section — same list, mine is scoped
// to the signed-in user and always shows an Edit button.
type View = "note" | "shared" | "forum" | "mine";

const showView = (view: View) => {
  const list = view === "forum" || view === "mine";
  const shared = view === "shared";
  // The list views are track-independent: they hide both tab panels and the tab nav.
  editorView.classList.toggle("hidden", list || shared);
  sharedView.classList.toggle("hidden", list || !shared);
  forumView.classList.toggle("hidden", !list);
  viewNav.classList.toggle("hidden", list);
  editorView.setAttribute("aria-hidden", String(list || shared));
  sharedView.setAttribute("aria-hidden", String(list || !shared));
  forumView.setAttribute("aria-hidden", String(!list));
  tabNote.setAttribute("aria-selected", String(view === "note"));
  tabShared.setAttribute("aria-selected", String(shared));
  // A header button reads "Back" while its own view is open, else its normal label.
  forumButton.setAttribute("aria-pressed", String(view === "forum"));
  forumButton.textContent = view === "forum" ? "Back" : "Forum";
  myNotesButton.setAttribute("aria-pressed", String(view === "mine"));
  myNotesButton.textContent = view === "mine" ? "Back" : "My Notes";
  if (shared) void showSharedNotes();
  if (view === "forum") void showForum("forum");
  if (view === "mine") void showForum("mine");
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

const setForumStatus = (message: string, kind: "ok" | "error" | "" = "") => {
  forumStatus.textContent = message;
  forumStatus.className = `status ${kind}`.trim();
};

type ForumMode = "forum" | "mine";
let forumMode: ForumMode = "forum";
let myProfileId: string | undefined;

// Save an edited note back to Supabase, preserving its shared state (editing a private
// note in My Notes must not silently publish it to the forum).
const saveForumEdit = async (note: ForumNote, body: string): Promise<void> => {
  const stored: StoredNote = {
    trackId: note.trackId,
    body,
    shared: note.shared,
    updatedAt: new Date().toISOString()
  };
  const api = await SupabaseApi.fromStorage();
  await api.upsertNote(stored);
  // Keep the local cache in step so the editor view shows the same text.
  await saveLocalNote(stored);
  note.body = body;
};

// Swap a card's <pre> for an editable textarea with Save/Cancel. Clicking the card no
// longer opens the song while editing; Save writes through, Cancel restores the text.
const beginEdit = (item: HTMLElement, note: ForumNote) => {
  if (item.classList.contains("editing")) return;
  item.classList.add("editing");
  const pre = item.querySelector("pre")!;
  const editRow = item.querySelector<HTMLElement>(".card-actions")!;

  const textarea = document.createElement("textarea");
  textarea.className = "edit-body";
  textarea.value = note.body;
  pre.replaceWith(textarea);

  editRow.innerHTML = "";
  const status = document.createElement("span");
  status.className = "status";
  const save = document.createElement("button");
  save.className = "small primary";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.className = "small";
  cancel.textContent = "Cancel";

  const finish = (body: string) => {
    const newPre = document.createElement("pre");
    newPre.textContent = body;
    textarea.replaceWith(newPre);
    item.classList.remove("editing");
    renderCardActions(item, note); // rebuild the Edit button
  };

  save.addEventListener("click", async () => {
    save.disabled = cancel.disabled = true;
    status.textContent = "Saving…";
    try {
      await saveForumEdit(note, textarea.value);
      finish(textarea.value);
    } catch (error) {
      save.disabled = cancel.disabled = false;
      status.textContent = error instanceof Error ? error.message : "Save failed";
      status.className = "status error";
    }
  });
  cancel.addEventListener("click", () => finish(note.body));

  editRow.append(status, cancel, save);
  textarea.focus();
};

// Flip a note's shared flag and persist it, keeping the local cache in step.
const setNoteShared = async (note: ForumNote, shared: boolean): Promise<void> => {
  const stored: StoredNote = {
    trackId: note.trackId,
    body: note.body,
    shared,
    updatedAt: new Date().toISOString()
  };
  const api = await SupabaseApi.fromStorage();
  await api.upsertNote(stored);
  await saveLocalNote(stored);
  note.shared = shared;
};

const renderCardActions = (item: HTMLElement, note: ForumNote) => {
  const row = item.querySelector<HTMLElement>(".card-actions")!;
  row.innerHTML = "";
  if (note.profileId !== myProfileId) return; // only your own notes get controls

  const edit = document.createElement("button");
  edit.className = "small";
  edit.textContent = "Edit…";
  edit.addEventListener("click", (event) => {
    event.stopPropagation();
    beginEdit(item, note);
  });
  row.append(edit);

  // Push the share control to the right edge, away from Edit.
  const spacer = document.createElement("span");
  spacer.className = "spacer";
  row.append(spacer);

  // Share control: an "Unshare" button in the forum (every card there is shared); a
  // visual Share toggle in My Notes reflecting the note's current state.
  if (forumMode === "mine") {
    const label = document.createElement("label");
    label.className = "row toggle share-toggle";
    const text = document.createElement("span");
    text.textContent = "Share";
    // Custom sliding switch: the native checkbox is visually hidden; the .slider span is
    // the track+knob. Avoids native checkbox UA rendering quirks entirely.
    const sw = document.createElement("span");
    sw.className = "switch";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = note.shared;
    const slider = document.createElement("span");
    slider.className = "slider";
    sw.append(checkbox, slider);
    label.append(text, sw);
    label.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", async () => {
      const want = checkbox.checked;
      checkbox.disabled = true;
      try {
        await setNoteShared(note, want);
      } catch (error) {
        checkbox.checked = !want; // revert on failure
        setForumStatus(error instanceof Error ? error.message : "Could not update", "error");
      } finally {
        checkbox.disabled = false;
      }
    });
    row.append(label);
    return;
  }

  const unshare = document.createElement("button");
  unshare.className = "small";
  unshare.textContent = "Unshare";
  unshare.addEventListener("click", async (event) => {
    event.stopPropagation();
    unshare.disabled = true;
    try {
      await setNoteShared(note, false);
      item.remove(); // no longer shared → doesn't belong in the forum
    } catch (error) {
      unshare.disabled = false;
      setForumStatus(error instanceof Error ? error.message : "Could not update", "error");
    }
  });
  row.append(unshare);
};

const appendForumNotes = (notes: ForumNote[]) => {
  for (const note of notes) {
    const item = document.createElement("article");
    item.className = "note-card forum-card";
    // Only the song name links to the track — a button-styled-as-link, so it's keyboard
    // reachable and opens the album/song tab.
    item.innerHTML =
      '<div class="head"><button class="song-name link"></button><span class="spacer"></span>' +
      '<span class="muted"></span></div><div class="muted forum-artist"></div><pre></pre>' +
      '<div class="row card-actions"></div>';
    const songLink = item.querySelector<HTMLButtonElement>(".song-name")!;
    songLink.textContent = note.title;
    songLink.addEventListener("click", () => void chrome.tabs.create({ url: note.spotifyUrl }));
    item.querySelector(".head .muted")!.textContent = `@${note.username}`;
    item.querySelector(".forum-artist")!.textContent = note.artists.length
      ? note.artists.join(", ")
      : "Artist unknown";
    item.querySelector("pre")!.textContent = note.body;
    renderCardActions(item, note);

    // Insert before the sentinel so it always stays at the bottom of the scroll area.
    forumList.insertBefore(item, forumSentinel);
  }
};

let forumCursor: string | undefined;
let forumLoading = false;

// Remove every child except the sentinel (which must persist for the observer).
const clearForumList = () => {
  for (const child of Array.from(forumList.children)) {
    if (child !== forumSentinel) child.remove();
  }
};

const setForumEmpty = (message: string) => {
  const empty = document.createElement("div");
  empty.className = "muted";
  empty.textContent = message;
  forumList.insertBefore(empty, forumSentinel);
};

const showForum = async (mode: ForumMode) => {
  forumMode = mode;
  clearForumList();
  forumCursor = undefined;
  const config = await getConfig();
  myProfileId = config.profileId;
  const mine = mode === "mine";
  forumTitle.textContent = mine ? "My Notes" : "Forum";
  forumSubtitle.textContent = mine ? "All the notes you've written" : "Shared notes from everyone";
  if (!config.username) {
    setForumStatus(`Sign in from Options to ${mine ? "see your notes" : "browse the forum"}.`);
    return;
  }
  setForumStatus("Loading…");
  try {
    const api = await SupabaseApi.fromStorage();
    const { notes, nextCursor } = await api.fetchForumNotes(undefined, mine ? config.profileId : undefined);
    if (notes.length === 0) {
      setForumEmpty(mine ? "You haven't written any notes yet." : "No shared notes yet.");
    } else {
      appendForumNotes(notes);
    }
    forumCursor = nextCursor;
    setForumStatus("");
  } catch (error) {
    setForumStatus(error instanceof Error ? error.message : "Could not load notes", "error");
  }
};

const loadMoreForum = async () => {
  if (forumLoading || !forumCursor) return;
  forumLoading = true;
  try {
    const config = await getConfig();
    const api = await SupabaseApi.fromStorage();
    const { notes, nextCursor } = await api.fetchForumNotes(
      forumCursor,
      forumMode === "mine" ? config.profileId : undefined
    );
    appendForumNotes(notes);
    forumCursor = nextCursor;
  } catch (error) {
    setForumStatus(error instanceof Error ? error.message : "Could not load more", "error");
  } finally {
    forumLoading = false;
  }
};

// Auto-load the next page when the sentinel scrolls into the forum list's viewport.
const forumObserver = new IntersectionObserver(
  (entries) => {
    if (entries.some((entry) => entry.isIntersecting)) void loadMoreForum();
  },
  { root: forumList, rootMargin: "200px" }
);
forumObserver.observe(forumSentinel);

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
forumButton.addEventListener("click", () =>
  showView(forumButton.getAttribute("aria-pressed") === "true" ? "note" : "forum")
);
myNotesButton.addEventListener("click", () =>
  showView(myNotesButton.getAttribute("aria-pressed") === "true" ? "note" : "mine")
);

getConfig().then((config) => {
  if (!config.username) setStatus("Sign in from Options to sync notes.");
});
refreshPanelState().catch((error: Error) => setStatus(error.message, "error"));
