import { useLiveQuery } from "dexie-react-hooks";
import { db, dbReady, type Patient } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Select } from "@/components/ui-kit";

export function useActivePatients(): Patient[] | undefined {
  return useLiveQuery(async () => {
    await dbReady;
    const all = await db.patients.orderBy("name").toArray();
    return all.filter((p) => !p.dischargedAt);
  }, []);
}

export function PatientPicker({
  value,
  onChange,
  patients,
}: {
  value: number | "";
  onChange: (id: number | "") => void;
  patients: Patient[] | undefined;
}) {
  const { t } = useLang();
  return (
    <Select
      value={value === "" ? "" : String(value)}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : "")}
    >
      <option value="">{t("selectPatient")}</option>
      {(patients ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {(p.name || `${t("fileNo")} ${p.fileNo}`) + (p.room ? ` — ${p.room}` : "")}
        </option>
      ))}
    </Select>
  );
}
