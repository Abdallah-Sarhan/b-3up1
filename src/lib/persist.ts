import type Dexie from "dexie";

/**
 * File-backed mirror of the whole registry for the Windows desktop app.
 *
 * Chromium's IndexedDB store can be evicted, reset by a profile change, or lose
 * the very last writes when the machine is shut down abruptly — which is why a
 * newly added patient or a discharge could disappear after a restart. Every
 * change is therefore also written to a plain JSON file in the app's data
 * folder, and that file is restored on start-up whenever it is newer than what
 * IndexedDB holds.
 */

const SNAPSHOT_KEY = "snapshotAt";

type Snapshot = { savedAt: number; tables: Record<string, unknown[]> };

function api() {
  return typeof window === "undefined" ? undefined : window.ward39Desktop;
}

export function hasFileBackup(): boolean {
  const a = api();
  return Boolean(a?.loadData && a?.saveData);
}

async function localSnapshotAt(db: Dexie): Promise<number> {
  try {
    const row = await db.table("meta").get(SNAPSHOT_KEY);
    return Number(row?.value ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Restore from disk when the file copy is newer than the local database. */
export async function restoreFromFileIfNewer(db: Dexie): Promise<boolean> {
  const a = api();
  if (!a?.loadData) return false;
  let snapshot: Snapshot | null = null;
  try {
    const raw = await a.loadData();
    if (!raw) return false;
    snapshot = JSON.parse(raw) as Snapshot;
  } catch {
    return false;
  }
  if (!snapshot?.tables || typeof snapshot.savedAt !== "number") return false;
  if (snapshot.savedAt <= (await localSnapshotAt(db))) return false;

  const names = db.tables.map((t) => t.name);
  await db.transaction("rw", db.tables, async () => {
    for (const name of names) {
      const rows = snapshot.tables[name];
      if (!Array.isArray(rows)) continue;
      await db.table(name).clear();
      if (rows.length) await db.table(name).bulkPut(rows as never[]);
    }
    await db.table("meta").put({ key: SNAPSHOT_KEY, value: String(snapshot.savedAt) });
  });
  return true;
}

let saving = false;
let queued = false;
let timer: ReturnType<typeof setTimeout> | undefined;

async function writeSnapshot(db: Dexie) {
  const a = api();
  if (!a?.saveData) return;
  if (saving) {
    queued = true;
    return;
  }
  saving = true;
  try {
    const savedAt = Date.now();
    const tables: Record<string, unknown[]> = {};
    for (const table of db.tables) {
      if (table.name === "meta") continue;
      tables[table.name] = await table.toArray();
    }
    const meta = (await db.table("meta").toArray()).filter(
      (r: { key: string }) => r.key !== SNAPSHOT_KEY,
    );
    tables["meta"] = [...meta, { key: SNAPSHOT_KEY, value: String(savedAt) }];
    await a.saveData(JSON.stringify({ savedAt, tables }));
    await db.table("meta").put({ key: SNAPSHOT_KEY, value: String(savedAt) });
  } catch {
    // Never let a backup failure break data entry.
  } finally {
    saving = false;
    if (queued) {
      queued = false;
      void writeSnapshot(db);
    }
  }
}

function scheduleSave(db: Dexie) {
  clearTimeout(timer);
  timer = setTimeout(() => void writeSnapshot(db), 600);
}

/** Mirror every write to disk (debounced) and flush when the window closes. */
export function startFileBackup(db: Dexie) {
  if (!hasFileBackup()) return;
  for (const table of db.tables) {
    if (table.name === "meta") continue;
    table.hook("creating", () => scheduleSave(db));
    table.hook("updating", () => scheduleSave(db));
    table.hook("deleting", () => scheduleSave(db));
  }
  window.addEventListener("pagehide", () => {
    clearTimeout(timer);
    void writeSnapshot(db);
  });
  window.addEventListener("beforeunload", () => {
    clearTimeout(timer);
    void writeSnapshot(db);
  });
  // A first snapshot so the file exists even before the first edit.
  scheduleSave(db);
}
