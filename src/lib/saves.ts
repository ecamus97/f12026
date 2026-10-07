// Saved games: manual slots, automatic backups and a mirror of the game in progress, kept in
// IndexedDB (much more room than localStorage), plus export/import as a JSON file.

export type SaveKind = "slot" | "auto" | "current";

export interface SaveMeta {
  team: string | null;
  hex: string | null;
  season: number;
  round: number; // races completed this season
  totalRounds: number;
}

export interface SaveRecord {
  id: string;
  kind: SaveKind;
  name: string; // slot name or reason of the backup
  savedAt: number;
  meta: SaveMeta;
  data: string; // the game as JSON
}

export type SaveInfo = Omit<SaveRecord, "data"> & { bytes: number };

export const SLOT_COUNT = 3;
export const AUTO_KEEP = 6;
export const FILE_APP = "f1-manager-2026";

interface MinimalState {
  playerTeamId: string | null;
  teamsData: { id: string; name: string; hex: string }[];
  season: number;
  currentRaceIndex: number;
  calendar?: unknown[];
}

export function metaOf(state: MinimalState): SaveMeta {
  const t = state.teamsData.find((x) => x.id === state.playerTeamId);
  return {
    team: t?.name ?? null,
    hex: t?.hex ?? null,
    season: state.season,
    round: state.currentRaceIndex,
    totalRounds: Array.isArray(state.calendar) ? state.calendar.length : 24,
  };
}

// --- IndexedDB ---------------------------------------------------------------------

const DB = "f1-manager-saves";
const STORE = "saves";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB no disponible"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    let out: T | undefined;
    if (req) req.onsuccess = () => (out = req.result);
    t.oncomplete = () => {
      db.close();
      resolve(out);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
    t.onabort = () => {
      db.close();
      reject(t.error);
    };
  });
}

export async function listSaves(): Promise<SaveInfo[]> {
  const all = ((await tx<SaveRecord[]>("readonly", (s) => s.getAll() as IDBRequest<SaveRecord[]>)) ?? []) as SaveRecord[];
  return all
    .map(({ data, ...rest }) => ({ ...rest, bytes: data.length }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

export const getSave = (id: string) => tx<SaveRecord>("readonly", (s) => s.get(id) as IDBRequest<SaveRecord>);
export const deleteSave = (id: string) => tx("readwrite", (s) => void s.delete(id));

export async function putSave(rec: SaveRecord) {
  await tx("readwrite", (s) => void s.put(rec));
}

export async function saveToSlot(slot: number, state: MinimalState, name?: string) {
  const meta = metaOf(state);
  await putSave({
    id: `slot-${slot}`,
    kind: "slot",
    name: name ?? `Ranura ${slot}`,
    savedAt: Date.now(),
    meta,
    data: JSON.stringify(state),
  });
}

/** Keep a copy of the game; only the latest few automatic copies are kept. */
export async function autoBackup(state: MinimalState, reason: string) {
  if (!state.playerTeamId) return; // nothing worth keeping yet
  const now = Date.now();
  await putSave({ id: `auto-${now}`, kind: "auto", name: reason, savedAt: now, meta: metaOf(state), data: JSON.stringify(state) });
  const autos = (await listSaves()).filter((s) => s.kind === "auto");
  for (const old of autos.slice(AUTO_KEEP)) await deleteSave(old.id);
}

/** Mirror of the game in progress (used when the browser's quick storage is full). */
export async function mirrorCurrent(state: MinimalState) {
  await putSave({ id: "current", kind: "current", name: "Partida en curso", savedAt: Date.now(), meta: metaOf(state), data: JSON.stringify(state) });
}

// --- Files -------------------------------------------------------------------------

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

export function exportFileName(state: MinimalState) {
  const m = metaOf(state);
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `f1manager-${slug(m.team ?? "sin-equipo")}-${m.season}-r${m.round}-${date}.json`;
}

export function exportGame(state: MinimalState) {
  const body = JSON.stringify({ app: FILE_APP, format: 1, exportedAt: new Date().toISOString(), meta: metaOf(state), state });
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = exportFileName(state);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read an exported file (or a raw saved game). Returns the game data or an error message. */
export function parseImport(text: string): { state: unknown; meta: SaveMeta | null } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "El archivo no es un JSON válido." };
  }
  const o = json as { app?: string; state?: unknown };
  const state = o && typeof o === "object" && o.app === FILE_APP ? o.state : json;
  const st = state as MinimalState & { version?: number };
  if (!st || typeof st !== "object" || st.version !== 2 || !Array.isArray(st.teamsData)) {
    return { error: "Este archivo no es una partida de F1 Manager 2026." };
  }
  return { state, meta: metaOf(st) };
}
