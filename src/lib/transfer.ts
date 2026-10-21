import * as XLSX from "xlsx";
import { db, type Patient } from "@/lib/db";
import { createClinicalRecordCloudFirst, createPatientCloudFirst, type ClinicalTable } from "@/lib/clinical-cloud";

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
  const patients = await db.patients.orderBy("name").toArray();
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
    `ward39-patients-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

export async function importPatientsFromExcel(file: File): Promise<number> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.includes("PATIENT DETAILS")
    ? "PATIENT DETAILS"
    : wb.SheetNames[0]!;
  const ws = wb.Sheets[sheetName]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (rows.length === 0) throw new Error("empty sheet");

  const existing = await db.patients.toArray();
  const seen = new Set(existing.map((p) => `${p.fileNo}||${p.name}`));
  const now = Date.now();
  let added = 0;
  const toAdd: Patient[] = [];

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
    const key = `${fileNo}||${name}`;
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
      maritalStatus: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    });
    added++;
  }
  for (const patient of toAdd) await createPatientCloudFirst(patient);
  return added;
}

export async function backupToJson() {
  const [patients, vitals, notes, sbar, careplan] = await Promise.all([
    db.patients.toArray(),
    db.vitals.toArray(),
    db.notes.toArray(),
    db.sbar.toArray(),
    db.careplan.toArray(),
  ]);
  const payload = {
    app: "ward39-registry",
    version: 1,
    exportedAt: new Date().toISOString(),
    patients,
    vitals,
    notes,
    sbar,
    careplan,
  };
  downloadBlob(
    new Blob([JSON.stringify(payload)], { type: "application/json" }),
    `ward39-backup-${new Date().toISOString().slice(0, 10)}.json`,
  );
}

export async function restoreFromJson(file: File): Promise<void> {
  const raw = await file.text();
  const data = JSON.parse(raw) as {
    app?: string;
    patients?: Array<Patient & { id?: number }>;
    vitals?: Array<Record<string, unknown>>;
    notes?: Array<Record<string, unknown>>;
    sbar?: Array<Record<string, unknown>>;
    careplan?: Array<Record<string, unknown>>;
  };
  if (data.app !== "ward39-registry" || !Array.isArray(data.patients)) {
    throw new Error("ملف النسخة الاحتياطية غير صالح.");
  }

  // Merge into the cloud rather than clearing live patient records. Existing
  // records win; only missing patients and clinical rows are imported.
  const patientIdMap = new Map<number, number>();
  for (const candidate of data.patients) {
    const fileNo = String(candidate.fileNo ?? "").trim();
    const cid = String(candidate.cid ?? "").trim();
    const name = String(candidate.name ?? "").trim();
    let existing: Patient | undefined;
    if (fileNo) existing = await db.patients.where("fileNo").equals(fileNo).first();
    if (!existing && cid) existing = await db.patients.where("cid").equals(cid).first();
    if (!existing && name && !fileNo && !cid) {
      existing = await db.patients.filter((p) => p.name.trim() === name && !p.fileNo.trim() && !p.cid.trim()).first();
    }
    const sourceId = Number(candidate.id);
    let destinationId: number;
    if (existing?.id != null) {
      destinationId = existing.id;
    } else {
      destinationId = await createPatientCloudFirst({
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
        maritalStatus: candidate.maritalStatus ?? "",
        notes: candidate.notes ?? "",
        ...(candidate.dischargedAt ? { dischargedAt: candidate.dischargedAt } : {}),
        ...(candidate.dischargeNote ? { dischargeNote: candidate.dischargeNote } : {}),
        createdAt: candidate.createdAt ?? Date.now(),
        updatedAt: candidate.updatedAt ?? Date.now(),
      });
    }
    if (Number.isFinite(sourceId)) patientIdMap.set(sourceId, Number(destinationId));
  }

  const imports: Array<[ClinicalTable, Array<Record<string, unknown>>]> = [
    ["vitals", data.vitals ?? []],
    ["notes", data.notes ?? []],
    ["sbar", data.sbar ?? []],
    ["careplan", data.careplan ?? []],
  ];
  const stable = (value: unknown): string => {
    if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stable(item))));
    if (value && typeof value === "object") {
      const object = value as Record<string, unknown>;
      return JSON.stringify(Object.keys(object).sort().map((key) => [key, object[key]]));
    }
    return JSON.stringify(value);
  };

  for (const [table, rows] of imports) {
    const local = await db.table(table).toArray() as Array<Record<string, unknown>>;
    for (const source of rows) {
      const sourcePatientId = Number(source.patientId);
      const patientId = patientIdMap.get(sourcePatientId);
      if (patientId == null) continue;
      const { id: _sourceId, ...fields } = source;
      const candidate = { ...fields, patientId };
      const duplicate = local.some((entry) => {
        const { id: _id, ...rest } = entry;
        return stable(rest) === stable(candidate);
      });
      if (duplicate) continue;
      const newId = await createClinicalRecordCloudFirst(table, candidate);
      local.push({ ...candidate, id: newId });
    }
  }
}
