import Dexie, { type Table } from "dexie";
import seedData from "@/data/seed-patients.json";

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
  const all = await db.patients.toArray();
  for (const p of all) {
    if (p.id == null || p.dischargedAt) continue;
    if (CURRENT_INPATIENT_FILE_NOS.has(p.fileNo.trim())) continue;
    const open = (
      await db.admissions.where("patientId").equals(p.id).toArray()
    ).find((a) => !a.dischargedAt);
    if (open?.id != null) {
      await db.admissions.update(open.id, { dischargedAt: today });
    } else {
      await db.admissions.add({
        patientId: p.id,
        admittedAt: p.doa || today,
        dischargedAt: today,
        createdAt: Date.now(),
      });
    }
    await db.patients.update(p.id, { dischargedAt: today, updatedAt: Date.now() });
  }
  await db.meta.put({ key: "dischargeExceptCensus2026-08-30", value: "1" });
}

// Runs only in the browser / Electron renderer (never during SSR).
export const dbReady: Promise<void> =
  typeof window === "undefined"
    ? Promise.resolve()
    : seedIfNeeded().then(dischargeNonCurrentOnce);

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
