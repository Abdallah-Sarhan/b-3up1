import type Dexie from "dexie";
import { supabase } from "@/integrations/supabase/client";
import type { Patient } from "@/lib/db";

/**
 * Cloud mirror of the patient registry.
 *
 * The app keeps working entirely on the local database (so it stays usable
 * offline on the ward laptop), but every patient change is also mirrored to the
 * shared cloud table. On start-up the cloud copy is pulled back in, so the
 * published link and every device show the same patients.
 */

type Row = {
  file_no: string;
  name: string;
  nationality: string;
  diagnosis: string;
  folder_no: string;
  age: string;
  doctor: string;
  cid: string;
  doa: string;
  dob: string;
  sex: string;
  room: string;
  bed: string;
  marital_status: string;
  notes: string;
  discharged_at: string | null;
  discharge_note: string | null;
  updated_at: number;
  created_at: number;
};

function toRow(p: Patient): Row {
  return {
    file_no: p.fileNo.trim(),
    name: p.name ?? "",
    nationality: p.nationality ?? "",
    diagnosis: p.diagnosis ?? "",
    folder_no: p.folderNo ?? "",
    age: p.age ?? "",
    doctor: p.doctor ?? "",
    cid: p.cid ?? "",
    doa: p.doa ?? "",
    dob: p.dob ?? "",
    sex: p.sex ?? "",
    room: p.room ?? "",
    bed: p.bed ?? "",
    marital_status: p.maritalStatus ?? "",
    notes: p.notes ?? "",
    discharged_at: p.dischargedAt ?? null,
    discharge_note: p.dischargeNote ?? null,
    updated_at: p.updatedAt ?? 0,
    created_at: p.createdAt ?? 0,
  };
}

function fromRow(r: Row): Omit<Patient, "id"> {
  return {
    fileNo: r.file_no,
    name: r.name ?? "",
    nationality: r.nationality ?? "",
    diagnosis: r.diagnosis ?? "",
    folderNo: r.folder_no ?? "",
    age: r.age ?? "",
    doctor: r.doctor ?? "",
    cid: r.cid ?? "",
    doa: r.doa ?? "",
    dob: r.dob ?? "",
    sex: r.sex ?? "",
    room: r.room ?? "",
    bed: r.bed ?? "",
    maritalStatus: r.marital_status ?? "",
    notes: r.notes ?? "",
    ...(r.discharged_at ? { dischargedAt: r.discharged_at } : {}),
    ...(r.discharge_note ? { dischargeNote: r.discharge_note } : {}),
    createdAt: r.created_at || Date.now(),
    updatedAt: r.updated_at || 0,
  };
}

/** Bring the cloud copy into the local database (newest wins per file number). */
export async function pullPatientsFromCloud(db: Dexie): Promise<void> {
  const { data, error } = await supabase.from("patients").select("*");
  if (error || !data) return;
  const rows = data as unknown as Row[];
  if (!rows.length) return;

  const table = db.table("patients");
  const local = (await table.toArray()) as Patient[];
  const byFileNo = new Map<string, Patient>();
  for (const p of local) byFileNo.set(p.fileNo.trim(), p);

  for (const row of rows) {
    const incoming = fromRow(row);
    const existing = byFileNo.get(row.file_no);
    if (!existing) {
      await table.add(incoming);
    } else if (existing.id != null && (row.updated_at ?? 0) > (existing.updatedAt ?? 0)) {
      await table.update(existing.id, incoming);
    }
  }
}

/** Send every local patient to the cloud and remove rows deleted locally. */
export async function pushPatientsToCloud(db: Dexie): Promise<void> {
  const local = ((await db.table("patients").toArray()) as Patient[]).filter(
    (p) => p.fileNo?.trim(),
  );
  // One row per file number: the registry can hold repeats, and the cloud table
  // rejects a batch that touches the same file number twice.
  const byFileNo = new Map<string, Row>();
  for (const p of local) {
    const row = toRow(p);
    const seen = byFileNo.get(row.file_no);
    if (!seen || (row.updated_at ?? 0) >= (seen.updated_at ?? 0)) byFileNo.set(row.file_no, row);
  }
  const rows = [...byFileNo.values()];
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supabase
      .from("patients")
      .upsert(chunk as never[], { onConflict: "file_no" });
    if (error) {
      console.error("cloud sync push failed", error);
      return;
    }
  }
  const keep = rows.map((r) => r.file_no);
  if (keep.length) {
    const { data } = await supabase.from("patients").select("file_no");
    const stale = ((data ?? []) as Array<{ file_no: string }>)
      .map((r) => r.file_no)
      .filter((f) => !keep.includes(f));
    if (stale.length) await supabase.from("patients").delete().in("file_no", stale);
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let queued = false;

async function run(db: Dexie) {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    await pushPatientsToCloud(db);
  } catch {
    // Never let a sync failure break data entry.
  } finally {
    running = false;
    if (queued) {
      queued = false;
      void run(db);
    }
  }
}

function schedule(db: Dexie) {
  clearTimeout(timer);
  timer = setTimeout(() => void run(db), 800);
}

/** Mirror every patient change to the cloud (debounced). */
export function startCloudSync(db: Dexie) {
  const table = db.table("patients");
  table.hook("creating", () => schedule(db));
  table.hook("updating", () => schedule(db));
  table.hook("deleting", () => schedule(db));
  schedule(db);
}
