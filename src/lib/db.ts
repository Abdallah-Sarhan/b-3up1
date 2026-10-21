import Dexie, { type Table } from "dexie";

export interface Patient {
  id?: number;
  fileNo: string;
  name: string;
  nationality: string;
  diagnosis: string;
  folderNo: string;
  age: string;
  doctor: string;
  cid: string;
  doa: string; // date of admission
  dob: string;
  sex: string; // "M" | "F" | ""
  room: string;
  bed: string;
  maritalStatus: string;
  notes: string;
  dischargedAt?: string;
  dischargeNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RoundEntry {
  id?: number;
  patientId: number;
  date: string;
  doctor: string;
  findings: string;
  orders: string;
  nurse: string;
}

export interface TranqEntry {
  id?: number;
  patientId: number;
  date: string;
  time: string;
  drug: string;
  dose: string;
  route: string;
  indication: string;
  givenBy: string;
  effect: string;
}

export interface AssignmentEntry {
  id?: number;
  patientId: number;
  date: string;
  shift: string;
  nurse: string;
  remarks: string;
}

export interface VitalEntry {
  id?: number;
  patientId: number;
  date: string;
  time: string;
  bp: string;
  pulse: string;
  resp: string;
  temp: string;
  spo2: string;
  weight: string;
}

export interface NurseNote {
  id?: number;
  patientId: number;
  date: string;
  time: string;
  note: string;
}

export interface SbarEntry {
  id?: number;
  patientId: number;
  date: string;
  shift: string; // "morning" | "evening" | "night"
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
  signature: string;
}

export interface CarePlanEntry {
  id?: number;
  patientId: number;
  dateIdentified: string;
  problemNo: string;
  problem: string;
  objective: string;
  intervention: string;
  dateResolved: string;
  nurseSign: string;
}

export interface Admission {
  id?: number;
  patientId: number;
  admittedAt: string;
  dischargedAt?: string;
  dischargeNote?: string;
  createdAt: number;
}

export type MedCategory = "major" | "control";

export interface MedEntry {
  id?: number;
  category: MedCategory;
  drug: string;
  dose: string;
  rxNo: string;
  patient: string;
  duration: string;
  createdAt: number;
}

interface MetaRow {
  key: string;
  value: string;
}

class WardDB extends Dexie {
  patients!: Table<Patient, number>;
  vitals!: Table<VitalEntry, number>;
  notes!: Table<NurseNote, number>;
  sbar!: Table<SbarEntry, number>;
  careplan!: Table<CarePlanEntry, number>;
  rounds!: Table<RoundEntry, number>;
  tranq!: Table<TranqEntry, number>;
  assignments!: Table<AssignmentEntry, number>;
  admissions!: Table<Admission, number>;
  meds!: Table<MedEntry, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("ward39-registry");
    this.version(1).stores({
      patients: "++id, fileNo, name, cid",
      vitals: "++id, patientId, date",
      notes: "++id, patientId, date",
      sbar: "++id, patientId, date",
      careplan: "++id, patientId",
      meta: "key",
    });
    this.version(2).stores({
      patients: "++id, fileNo, name, cid, dischargedAt",
      rounds: "++id, patientId, date",
      tranq: "++id, patientId, date",
      assignments: "++id, patientId, date",
    });
    this.version(3).stores({
      admissions: "++id, patientId, admittedAt, dischargedAt",
    });
    this.version(4).stores({
      meds: "++id, category, drug, patient",
    });
  }
}

export const db = new WardDB();

// Ask the browser/Electron to keep the data instead of evicting it.
// In Electron the persistent-storage permission prompt can hang forever, so the
// call is time-boxed and never allowed to block database startup.
function requestPersistence(): Promise<void> {
  try {
    const p = navigator.storage?.persist?.();
    if (!p) return Promise.resolve();
    return Promise.race([
      p.then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

// Runs only in the browser / Electron renderer (never during SSR).
// Any failure here must still resolve, otherwise every screen stays stuck on
// "loading" and the app looks frozen.
// Online-only guard: reject clinical writes while the device has no network.
// This prevents offline edits from being queued in IndexedDB for later sync.
function requireOnlineWrite() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("لا يمكن حفظ التغييرات دون اتصال بالإنترنت. اتصل بالإنترنت ثم حاول مرة أخرى.");
  }
}

for (const tableName of [
  "patients", "vitals", "notes", "sbar", "careplan", "rounds",
  "tranq", "assignments", "admissions", "meds",
]) {
  const table = db.table(tableName);
  table.hook("creating", () => requireOnlineWrite());
  table.hook("updating", () => requireOnlineWrite());
  table.hook("deleting", () => requireOnlineWrite());
}

// Keep local schema available for compatibility, but never seed fake patients,
// restore a file backup, or run a hard-coded census migration at startup.
export const dbReady: Promise<void> =
  typeof window === "undefined"
    ? Promise.resolve()
    : (async () => {
        try {
          const { pullPatientsFromCloud, startCloudSync } = await import("@/lib/cloud-sync");
          await pullPatientsFromCloud(db);
          startCloudSync(db);
        } catch (err) {
          console.error("cloud connection unavailable", err);
        }
      })();



export function emptyPatient(): Omit<Patient, "id"> {
  const now = Date.now();
  return {
    fileNo: "",
    name: "",
    nationality: "",
    diagnosis: "",
    folderNo: "",
    age: "",
    doctor: "",
    cid: "",
    doa: "",
    dob: "",
    sex: "",
    room: "",
    bed: "",
    maritalStatus: "",
    notes: "",
    createdAt: now,
    updatedAt: now,
  };
}

/** Close the current admission and mark the patient as discharged. */
export async function dischargePatient(patientId: number, note: string) {
  const today = new Date().toISOString().slice(0, 10);
  const patient = await db.patients.get(patientId);
  const open = (await db.admissions.where("patientId").equals(patientId).toArray()).find(
    (a) => !a.dischargedAt,
  );
  if (open?.id != null) {
    await db.admissions.update(open.id, { dischargedAt: today, dischargeNote: note });
  } else {
    await db.admissions.add({
      patientId,
      admittedAt: patient?.doa || today,
      dischargedAt: today,
      dischargeNote: note,
      createdAt: Date.now(),
    });
  }
  await db.patients.update(patientId, {
    dischargedAt: today,
    dischargeNote: note,
    updatedAt: Date.now(),
  });
}

/** Re-admit an archived patient; previous history is preserved. */
export async function readmitPatient(patientId: number, admittedAt?: string) {
  const doa = admittedAt || new Date().toISOString().slice(0, 10);
  const open = (await db.admissions.where("patientId").equals(patientId).toArray()).find(
    (a) => !a.dischargedAt,
  );
  if (!open) {
    await db.admissions.add({ patientId, admittedAt: doa, createdAt: Date.now() });
  }
  await db.patients.update(patientId, (obj) => {
    obj.doa = doa;
    obj.updatedAt = Date.now();
    delete obj.dischargedAt;
    delete obj.dischargeNote;
  });
}
