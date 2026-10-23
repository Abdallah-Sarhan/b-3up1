/**
 * Clinical domain types only.
 *
 * Patient and clinical records are read and written directly through Supabase.
 * This module intentionally creates no IndexedDB, browser storage, or local database.
 */
export interface Patient {
  id?: number | string;
  fileNo: string;
  name: string;
  nationality: string;
  diagnosis: string;
  folderNo: string;
  age: string;
  doctor: string;
  cid: string;
  doa: string;
  dob: string;
  sex: string;
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
  id?: string | number; patientId: string | number; date: string; doctor: string; findings: string; orders: string; nurse: string;
}
export interface TranqEntry {
  id?: string | number; patientId: string | number; date: string; time: string; drug: string; dose: string; route: string; indication: string; givenBy: string; effect: string;
}
export interface AssignmentEntry {
  id?: string | number; patientId: string | number; date: string; shift: string; nurse: string; remarks: string;
}
export interface VitalEntry {
  id?: string | number; patientId: string | number; date: string; time: string; bp: string; pulse: string; resp: string; temp: string; spo2: string; weight: string;
}
export interface NurseNote {
  id?: string | number; patientId: string | number; date: string; time: string; note: string;
}
export interface SbarEntry {
  id?: string | number; patientId: string | number; date: string; shift: string; situation: string; background: string; assessment: string; recommendation: string; signature: string;
}
export interface CarePlanEntry {
  id?: string | number; patientId: string | number; dateIdentified: string; problemNo: string; problem: string; objective: string; intervention: string; dateResolved: string; nurseSign: string;
}
export interface Admission {
  id?: string | number; patientId: string | number; admittedAt: string; dischargedAt?: string; dischargeNote?: string; createdAt: number;
}
export type MedCategory = "major" | "control";
export interface MedEntry {
  id?: string | number; category: MedCategory; drug: string; dose: string; rxNo: string; patient: string; duration: string; createdAt: number;
}
export function emptyPatient(): Omit<Patient, "id"> {
  const now = Date.now();
  return {
    fileNo: "", name: "", nationality: "", diagnosis: "", folderNo: "", age: "",
    doctor: "", cid: "", doa: "", dob: "", sex: "", room: "", bed: "",
    maritalStatus: "", notes: "", createdAt: now, updatedAt: now,
  };
}
