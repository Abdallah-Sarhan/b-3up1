import { Link, useParams } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Printer } from "lucide-react";
import { db, type Patient } from "@/lib/db";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui-kit";

export function usePrintPatient() {
  const { patientId } = useParams({ strict: false }) as { patientId: string };
  const id = Number(patientId);
  const patient = useLiveQuery(() => db.patients.get(id), [id]);
  return { id, patientId, patient };
}

export function PrintShell({
  title,
  patient,
  landscape,
  children,
}: {
  title: string;
  patient: Patient | null | undefined;
  landscape?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useLang();
  const { patientId } = useParams({ strict: false }) as { patientId: string };

  if (patient === undefined) {
    return <p className="p-10 text-center text-muted-foreground">{t("loading")}</p>;
  }
  if (!patient) {
    return (
      <p className="p-10 text-center">
        <Link to="/" className="text-primary underline">← {t("back")}</Link>
      </p>
    );
  }

  return (
    <div className="min-h-screen bg-muted py-6 print:bg-white print:py-0">
      {landscape ? (
        <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>
      ) : null}
      <div
        className={`mx-auto mb-4 flex items-center justify-between px-4 print:hidden ${
          landscape ? "max-w-[297mm]" : "max-w-[210mm]"
        }`}
      >
        <Link to="/patients/$patientId" params={{ patientId }}>
          <Button variant="outline" size="sm">
            <ArrowRight className="rtl:rotate-180 ltr:rotate-180" />
            {t("back")}
          </Button>
        </Link>
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <Button size="sm" onClick={() => window.print()}>
          <Printer />
          {t("print")}
        </Button>
      </div>
      <div
        dir="ltr"
        className={`mx-auto w-full bg-white p-[12mm] text-black shadow-md print:max-w-none print:p-0 print:shadow-none ${
          landscape ? "max-w-[297mm] print:w-full" : "max-w-[210mm]"
        }`}
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {children}
      </div>
    </div>
  );
}


export function KcmhHeader({ right }: { right?: string }) {
  return (
    <div className="mb-3 flex items-start justify-between border-b-2 border-black pb-2">
      <div>
        <div className="text-base font-bold">KUWAIT CENTER FOR MENTAL HEALTH</div>
        <div className="text-sm">(WARD-39)</div>
      </div>
      {right ? <div className="text-sm font-bold">{right}</div> : null}
    </div>
  );
}

export function PatientHeaderGrid({ patient }: { patient: Patient }) {
  const cells: Array<[string, string]> = [
    ["Name", patient.name],
    ["File #", patient.fileNo],
    ["CID", patient.cid],
    ["DOB / Age", [patient.dob, patient.age].filter(Boolean).join(" / ")],
    ["Diagnosis", patient.diagnosis],
    ["Ward", "39"],
    ["D.O.A", patient.doa],
    ["Nationality", patient.nationality],
    ["Tr. Doctor", patient.doctor],
    ["Sex", patient.sex],
    ["Room / Bed", [patient.room, patient.bed].filter(Boolean).join(" / ")],
    ["Marital Status", patient.maritalStatus],
  ];
  return (
    <table className="mb-3 w-full border-collapse text-sm">
      <tbody>
        {Array.from({ length: Math.ceil(cells.length / 3) }, (_, r) => (
          <tr key={r}>
            {cells.slice(r * 3, r * 3 + 3).map(([label, value], i) => (
              <td key={i} className="border border-black px-2 py-1">
                <span className="font-bold">{label}: </span>
                {value || "—"}
              </td>
            ))}
            {cells.slice(r * 3, r * 3 + 3).length < 3
              ? Array.from({ length: 3 - cells.slice(r * 3, r * 3 + 3).length }, (_, i) => (
                  <td key={`e${i}`} className="border border-black px-2 py-1" />
                ))
              : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrintTitle({ children }: { children: React.ReactNode }) {
  return <h1 className="mb-3 text-center text-lg font-bold underline">{children}</h1>;
}
