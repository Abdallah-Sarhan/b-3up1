import * as XLSX from "xlsx";
import type { Patient } from "@/lib/db";
import {
  createCloudPatient,
  createCloudRecord,
  fetchAllCloudRecords,
  type CloudTableKey,
} from "@/lib/cloud-direct";
import { fetchAllCloudPatients, type CloudClinicalTable, type CloudClinicalRecord } from "@/lib/cloud-queries";

const HEADERS: Array<{ key: keyof Patient; label: string }> = [
  { key: "fileNo", label: "FILE NO" },
  { key: "name", label: "NAME" },
  { key: "nationality", label: "NAT" },
  { key: "diagnosis", label: "DIAG" },
  { key: "folderNo", label: "FOLDER NO" },
  { key: "age", label: "AGE" },
  { key: "doctor", label: "TR DOCTOR" },
  { key: "cid", label: "CID" },
  { key: "doa", label: "DOA" },
  { key: "unit", label: "UNIT" },
];

const TABLES: Array<{ key: CloudTableKey; remote: CloudClinicalTable; backupKey: string }> = [
  { key: "vitals", remote: "patient_vitals", backupKey: "vitals" },
  { key: "notes", remote: "patient_nurse_notes", backupKey: "notes" },
  { key: "sbar", remote: "patient_sbar", backupKey: "sbar" },
  { key: "careplan", remote: "patient_care_plans", backupKey: "careplan" },
  { key: "rounds", remote: "patient_rounds", backupKey: "rounds" },
  { key: "tranq", remote: "patient_tranquilizer_events", backupKey: "tranq" },
  { key: "assignments", remote: "staff_assignments", backupKey: "assignments" },
  { key: "admissions", remote: "patient_admissions", backupKey: "admissions" },
  { key: "meds", remote: "medication_register", backupKey: "meds" },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportPatientsToExcel() {
  const patients = await fetchAllCloudPatients();
  const rows = patients.map((p) => {
    const row: Record<string, string> = {};
    for (const h of HEADERS) row[h.label] = String(p[h.key] ?? "");
    row["SEX"] = p.sex;
    row["ROOM"] = p.room;
    row["BED"] = p.bed;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PATIENT DETAILS");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  downloadBlob(
    new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "ward39-patients-" + new Date().toISOString().slice(0, 10) + ".xlsx",
  );
}

export async function importPatientsFromExcel(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.includes("PATIENT DETAILS") ? "PATIENT DETAILS" : wb.SheetNames[0]!;
  const ws = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (rows.length === 0) throw new Error("empty sheet");

  const existing = await fetchAllCloudPatients();
  const seen = new Set(existing.map((p) => String(p.fileNo) + "||" + p.name));
  const now = Date.now();
  let added = 0;
  const toAdd: Array<Omit<Patient, "id">> = [];

  const get = (r: Record<string, unknown>, ...names: string[]) => {
    for (const n of names) {
      const key = Object.keys(r).find((k) => k.trim().toUpperCase() === n);
      if (key !== undefined) return String(r[key] ?? "").trim();
    }
    return "";
  };

  for (const r of rows) {
    const fileNo = get(r, "FILE NO", "FILENO", "FILE#");
    const name = get(r, "NAME", "PATIENT NAME", "PATIENTS NAME");
    if (!fileNo && !name) continue;
    const key = fileNo + "||" + name;
    if (seen.has(key)) continue;
    seen.add(key);
    toAdd.push({
      fileNo,
      name,
      nationality: get(r, "NAT", "NATIONALITY"),
      diagnosis: get(r, "DIAG", "DIAGNOSIS"),
      folderNo: get(r, "FOLDER NO", "FOLDER"),
      age: get(r, "AGE"),
      doctor: get(r, "TR DOCTOR", "DOCTOR"),
      cid: get(r, "CID", "CIVIL ID", "C.I.D"),
      doa: get(r, "DOA", "DATE OF ADMISSION"),
      dob: "",
      sex: get(r, "SEX"),
      room: get(r, "ROOM"),
      bed: get(r, "BED"),
      unit: get(r, "UNIT", "WARD", "UNIT NO"),
      maritalStatus: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    });
    added++;
  }

  for (const patient of toAdd) await createCloudPatient(patient as unknown as Record<string, unknown>);
  return added;
}

/** Backup is assembled by explicit cloud export queries, never from IndexedDB. */
export async function backupToJson() {
  const patients = await fetchAllCloudPatients();
  const records = await Promise.all(TABLES.map(async (table) => [
    table.backupKey,
    await fetchAllCloudRecords(table.remote),
  ] as const));
  const payload: Record<string, unknown> = {
    app: "ward39-registry",
    version: 2,
    exportedAt: new Date().toISOString(),
    patients,
    ...Object.fromEntries(records),
  };
  downloadBlob(
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
    "ward39-backup-" + new Date().toISOString().slice(0, 10) + ".json",
  );
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map((key) => JSON.stringify(key) + ":" + stable(object[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function comparableRecord(value: Record<string, unknown>) {
  const result = { ...value };
  delete result["id"];
  delete result["version"];
  delete result["changedAt"];
  return result;
}

export async function restoreFromJson(file: File): Promise<void> {
  const raw = await file.text();
  const data = JSON.parse(raw) as {
    app?: string;
    patients?: Array<Partial<Patient> & { id?: string | number }>;
    vitals?: Array<Record<string, unknown>>;
    notes?: Array<Record<string, unknown>>;
    sbar?: Array<Record<string, unknown>>;
    careplan?: Array<Record<string, unknown>>;
    rounds?: Array<Record<string, unknown>>;
    tranq?: Array<Record<string, unknown>>;
    assignments?: Array<Record<string, unknown>>;
    admissions?: Array<Record<string, unknown>>;
    meds?: Array<Record<string, unknown>>;
  };
  if (data.app !== "ward39-registry" || !Array.isArray(data.patients)) {
    throw new Error("ملف النسخة الاحتياطية غير صالح.");
  }

  // Match and create directly against Supabase, never against a local database.
  const patients = await fetchAllCloudPatients();
  const patientIdMap = new Map<string, string>();
  for (const candidate of data.patients) {
    const fileNo = String(candidate.fileNo ?? "").trim();
    const cid = String(candidate.cid ?? "").trim();
    const name = String(candidate.name ?? "").trim();
    let existing = fileNo ? patients.find((p) => p.fileNo.trim() === fileNo) : undefined;
    if (!existing && cid) existing = patients.find((p) => p.cid.trim() === cid);
    if (!existing && name && !fileNo && !cid) {
      existing = patients.find((p) => p.name.trim() === name && !p.fileNo.trim() && !p.cid.trim());
    }

    let destination;
    if (existing) {
      destination = existing;
    } else {
      destination = await createCloudPatient({
        fileNo: candidate.fileNo ?? "",
        name: candidate.name ?? "",
        nationality: candidate.nationality ?? "",
        diagnosis: candidate.diagnosis ?? "",
        folderNo: candidate.folderNo ?? "",
        age: candidate.age ?? "",
        doctor: candidate.doctor ?? "",
        cid: candidate.cid ?? "",
        doa: candidate.doa ?? "",
        dob: candidate.dob ?? "",
        sex: candidate.sex ?? "",
        room: candidate.room ?? "",
        bed: candidate.bed ?? "",
        unit: candidate.unit ?? "",
        maritalStatus: candidate.maritalStatus ?? "",
        notes: candidate.notes ?? "",
        dischargedAt: candidate.dischargedAt ?? null,
        dischargeNote: candidate.dischargeNote ?? null,
        createdAt: candidate.createdAt ?? Date.now(),
        updatedAt: candidate.updatedAt ?? Date.now(),
      });
      patients.push(destination);
    }
    if (candidate["id"] != null) patientIdMap.set(String(candidate["id"]), destination["id"]);
  }

  const importRows: Record<string, Array<Record<string, unknown>>> = {
    vitals: data.vitals ?? [],
    notes: data.notes ?? [],
    sbar: data.sbar ?? [],
    careplan: data.careplan ?? [],
    rounds: data.rounds ?? [],
    tranq: data.tranq ?? [],
    assignments: data.assignments ?? [],
    admissions: data.admissions ?? [],
    meds: data.meds ?? [],
  };

  for (const table of TABLES) {
    const existingRows = await fetchAllCloudRecords(table.remote);
    const sourceRows = importRows[table.backupKey] ?? [];
    for (const source of sourceRows) {
      const parentSource = source["patientId"] == null ? null : String(source["patientId"]);
      const parent = parentSource == null ? null : (patientIdMap.get(parentSource) ?? patients.find((p) => p["id"] === parentSource)?.["id"] ?? null);
      if (table.key !== "meds" && !parent) continue;
      const { id: _oldId, version: _oldVersion, changedAt: _oldChangedAt, ...fields } = source;
      const candidate = { ...fields, patientId: parent };
      const duplicate = existingRows.some((row) =>
        stable(comparableRecord(row as unknown as Record<string, unknown>)) === stable(comparableRecord(candidate)),
      );
      if (duplicate) continue;
      const saved = await createCloudRecord(table.key, parent, candidate);
      existingRows.push(saved);
    }
  }
}
