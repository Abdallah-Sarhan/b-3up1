import { supabase } from "@/integrations/supabase/client";

/**
 * Direct, read-only cloud queries for clinical screens.
 * These functions intentionally do not mirror results into IndexedDB/localStorage.
 */
export type CloudPatient = {
  id: string;
  version: number;
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
  unit: string;
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
  unit: string | null;
  marital_status: string | null;
  notes: string | null;
  discharged_at: string | null;
  discharge_note: string | null;
  created_at: number | null;
  updated_at: number | null;
  deleted_at: string | null;
  version: number | null;
};

function mapPatient(row: PatientRow): CloudPatient {
  return {
    id: row.id,
    version: Number(row.version ?? 0),
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
    unit: row.unit ?? "",
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
    .select("id,file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,unit,marital_status,notes,discharged_at,discharge_note,created_at,updated_at,deleted_at,version")
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
    .select("id,file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,unit,marital_status,notes,discharged_at,discharge_note,created_at,updated_at,deleted_at,version")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error("تعذر تحميل بيانات المريض من السحابة: " + error.message);
  }
  return data ? mapPatient(data as PatientRow) : null;
}

export type CloudClinicalTable =
  | "patient_vitals"
  | "patient_nurse_notes"
  | "patient_sbar"
  | "patient_care_plans"
  | "patient_rounds"
  | "patient_tranquilizer_events"
  | "staff_assignments"
  | "patient_admissions"
  | "medication_register";

export type CloudClinicalRecord = {
  id: string;
  patientId: string | null;
  version: number;
  createdAt: number | string;
  changedAt: number;
} & Record<string, any>;

/** Fetch a bounded set of clinical records directly from Supabase. */
export async function fetchCloudClinicalRecords(
  table: CloudClinicalTable,
  patientId?: string,
  limit = 100,
): Promise<CloudClinicalRecord[]> {
  let query = (supabase.from(table) as any)
    .select("id,patient_id,data,deleted_at,version,created_at,changed_at")
    .is("deleted_at", null)
    .order("changed_at", { ascending: false })
    .limit(Math.max(1, Math.min(500, limit)));

  if (patientId) query = query.eq("patient_id", patientId);

  const { data, error } = await query;
  if (error) {
    throw new Error("تعذر تحميل السجلات من السحابة: " + error.message);
  }

  return (data ?? []).map((row: {
    id: string;
    patient_id: string | null;
    data: Record<string, unknown> | null;
    version: number | null;
    created_at: number | string | null;
    changed_at: number | null;
  }) => ({
    ...(row.data ?? {}),
    id: row.id,
    patientId: row.patient_id,
    version: Number(row.version ?? 0),
    createdAt: row.created_at ?? 0,
    changedAt: Number(row.changed_at ?? 0),
  }));
}

/** Fetch the full patient register only for explicit export/backup/restore tasks. */
export async function fetchAllCloudPatients(): Promise<CloudPatient[]> {
  const all: PatientRow[] = [];
  for (let start = 0; ; start += 500) {
    const { data, error } = await supabase
      .from("patients")
      .select("id,file_no,name,nationality,diagnosis,folder_no,age,doctor,cid,doa,dob,sex,room,bed,unit,marital_status,notes,discharged_at,discharge_note,created_at,updated_at,deleted_at,version")
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .range(start, start + 499);
    if (error) throw new Error("تعذر تصدير قائمة المرضى من السحابة: " + error.message);
    const page = (data ?? []) as PatientRow[];
    all.push(...page);
    if (page.length < 500) return all.map(mapPatient);
  }
}
