import { supabase } from "@/integrations/supabase/client";

/**
 * Direct, read-only cloud queries for clinical screens.
 * These functions intentionally do not mirror results into IndexedDB/localStorage.
 */
export type CloudPatient = {
  id: string;
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
  dischargedAt: string;
  dischargeNote: string;
  createdAt: number;
  updatedAt: number;
};

type PatientRow = {
  id: string;
  file_no: string | null;
  name: string | null;
  nationality: string | null;
  diagnosis: string | null;
  folder_no: string | null;
  age: string | null;
  doctor: string | null;
  cid: string | null;
  doa: string | null;
  dob: string | null;
  sex: string | null;
  room: string | null;
  bed: string | null;
  marital_status: string | null;
  notes: string | null;
  discharged_at: string | null;
  discharge_note: string | null;
  created_at: number | null;
  updated_at: number | null;
  deleted_at: string | null;
};

function mapPatient(row: PatientRow): CloudPatient {
  return {
    id: row.id,
    fileNo: row.file_no && !row.file_no.startsWith("~") ? row.file_no : "",
    name: row.name ?? "",
    nationality: row.nationality ?? "",
    diagnosis: row.diagnosis ?? "",
    folderNo: row.folder_no ?? "",
    age: row.age ?? "",
    doctor: row.doctor ?? "",
    cid: row.cid ?? "",
    doa: row.doa ?? "",
    dob: row.dob ?? "",
    sex: row.sex ?? "",
    room: row.room ?? "",
    bed: row.bed ?? "",
    maritalStatus: row.marital_status ?? "",
    notes: row.notes ?? "",
    dischargedAt: row.discharged_at ?? "",
    dischargeNote: row.discharge_note ?? "",
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  };
}

/** Fetch active patient rows directly from Supabase; never reads or writes Dexie. */
export async function fetchActiveCloudPatients(): Promise<CloudPatient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("id,file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,marital_status,notes,discharged_at,discharge_note,created_at,updated_at,deleted_at")
    .is("deleted_at", null)
    .is("discharged_at", null)
    .order("name", { ascending: true })
    .limit(1000);

  if (error) {
    throw new Error("تعذر تحميل قائمة المرضى مباشرة من السحابة: " + error.message);
  }
  return ((data ?? []) as PatientRow[]).map(mapPatient);
}

/** Fetch one patient by its authoritative cloud UUID. */
export async function fetchCloudPatientById(id: string): Promise<CloudPatient | null> {
  const { data, error } = await supabase
    .from("patients")
    .select("id,file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,marital_status,notes,discharged_at,discharge_note,created_at,updated_at,deleted_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error("تعذر تحميل بيانات المريض من السحابة: " + error.message);
  }
  return data ? mapPatient(data as PatientRow) : null;
}
