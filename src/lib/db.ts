import Dexie, { type Table } from "dexie";
import seedData from "@/data/seed-patients.json";
import { restoreFromFileIfNewer, startFileBackup } from "@/lib/persist";

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

const SEED_VERSION = "1";

async function seedIfNeeded() {
  const seeded = await db.meta.get("seedVersion");
  if (seeded?.value === SEED_VERSION) return;
  const now = Date.now();
  const patients: Patient[] = (seedData as Array<Record<string, string>>).map(
    (p) => ({
      fileNo: p["fileNo"] ?? "",
      name: p["name"] ?? "",
      nationality: p["nationality"] ?? "",
      diagnosis: p["diagnosis"] ?? "",
      folderNo: p["folderNo"] ?? "",
      age: p["age"] ?? "",
      doctor: p["doctor"] ?? "",
      cid: p["cid"] ?? "",
      doa: p["doa"] ?? "",
      dob: "",
      sex: "",
      room: "",
      bed: "",
      maritalStatus: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    }),
  );
  await db.patients.bulkAdd(patients);
  await db.meta.put({ key: "seedVersion", value: SEED_VERSION });
}

// File numbers of the patients currently admitted (per the ward census sheet).
// Everyone else gets discharged once, keeping their full history.
const CURRENT_INPATIENT_FILE_NOS = new Set([
  "33547", "49990", "91000", "81274", "43351", "71781", "98960", "44691",
  "79923", "46844", "87688", "93087", "61977", "71345", "94301", "59032",
  "56376", "17851", "66049", "72938", "90923", "54708", "49166", "94316",
  "87747", "76208", "78981", "94285", "80562", "94406", "71756",
  // file numbers as stored in the registry (differ slightly from the sheet)
  "93960", "46644", "87683", "78881",
]);

async function dischargeNonCurrentOnce() {
  const done = await db.meta.get("dischargeExceptCensus2026-08-30");
  if (done) return;
  const today = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  // One atomic transaction: if the app is closed mid-way nothing is half-done,
  // and the whole migration is a handful of bulk operations instead of two or
  // three separate IndexedDB round trips per patient (which froze the UI).
  await db.transaction("rw", [db.patients, db.admissions, db.meta], async () => {
    const [all, admissions] = await Promise.all([
      db.patients.toArray(),
      db.admissions.toArray(),
    ]);

    const openByPatient = new Map<number, Admission>();
    for (const a of admissions) {
      if (!a.dischargedAt && !openByPatient.has(a.patientId)) {
        openByPatient.set(a.patientId, a);
      }
    }

    const admissionUpdates: Array<{ key: number; changes: Partial<Admission> }> = [];
    const admissionInserts: Admission[] = [];
    const patientUpdates: Array<{ key: number; changes: Partial<Patient> }> = [];

    for (const p of all) {
      if (p.id == null || p.dischargedAt) continue;
      if (CURRENT_INPATIENT_FILE_NOS.has(p.fileNo.trim())) continue;
      const open = openByPatient.get(p.id);
      if (open?.id != null) {
        admissionUpdates.push({ key: open.id, changes: { dischargedAt: today } });
      } else {
        admissionInserts.push({
          patientId: p.id,
          admittedAt: p.doa || today,
          dischargedAt: today,
          createdAt: now,
        });
      }
      patientUpdates.push({ key: p.id, changes: { dischargedAt: today, updatedAt: now } });
    }

    if (admissionUpdates.length) await db.admissions.bulkUpdate(admissionUpdates);
    if (admissionInserts.length) await db.admissions.bulkAdd(admissionInserts);
    if (patientUpdates.length) await db.patients.bulkUpdate(patientUpdates);
    await db.meta.put({ key: "dischargeExceptCensus2026-08-30", value: "1" });
  });
}


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
export const dbReady: Promise<void> =
  typeof window === "undefined"
    ? Promise.resolve()
    : (async () => {
        void requestPersistence();
        try {
          // Desktop: bring back the file-backed copy first, so a wiped or stale
          // IndexedDB store never loses new patients or discharges.
          await restoreFromFileIfNewer(db);
          await seedIfNeeded();
          await dischargeNonCurrentOnce();
        } catch (err) {
          console.error("db init failed", err);
        }
        try {
          startFileBackup(db);
        } catch (err) {
          console.error("file backup unavailable", err);
        }
        // Shared cloud copy: pull what other devices saved, then mirror local
        // changes so the published link always shows the same registry.
        try {
          const { pullPatientsFromCloud, startCloudSync } = await import("@/lib/cloud-sync");
          await pullPatientsFromCloud(db);
          startCloudSync(db);
        } catch (err) {
          console.error("cloud sync unavailable", err);
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
