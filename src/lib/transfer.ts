import * as XLSX from "xlsx";
import { db, type Patient } from "@/lib/db";

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
  if (toAdd.length > 0) await db.patients.bulkAdd(toAdd);
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
  const text = await file.text();
  const data = JSON.parse(text) as {
    app?: string;
    patients?: Patient[];
    vitals?: unknown[];
    notes?: unknown[];
    sbar?: unknown[];
    careplan?: unknown[];
  };
  if (data.app !== "ward39-registry" || !Array.isArray(data.patients)) {
    throw new Error("invalid backup");
  }
  await db.transaction(
    "rw",
    [db.patients, db.vitals, db.notes, db.sbar, db.careplan],
    async () => {
      await Promise.all([
        db.patients.clear(),
        db.vitals.clear(),
        db.notes.clear(),
        db.sbar.clear(),
        db.careplan.clear(),
      ]);
      await db.patients.bulkAdd(data.patients!);
      if (data.vitals?.length) await db.vitals.bulkAdd(data.vitals as never[]);
      if (data.notes?.length) await db.notes.bulkAdd(data.notes as never[]);
      if (data.sbar?.length) await db.sbar.bulkAdd(data.sbar as never[]);
      if (data.careplan?.length) await db.careplan.bulkAdd(data.careplan as never[]);
    },
  );
}
