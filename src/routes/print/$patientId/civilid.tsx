import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PrintShell, usePrintPatient } from "@/components/PrintSheet";
import { getDocs, signedUrl } from "@/lib/civil-id";

export const Route = createFileRoute("/print/$patientId/civilid")({
  head: () => ({
    meta: [
      { title: "طباعة البطاقة المدنية — Ward 39" },
      { name: "description", content: "Printable Civil ID (front and back) for a Ward 39 patient." },
      { property: "og:title", content: "Civil ID Print — Ward 39" },
      { property: "og:description", content: "Printable Civil ID for Ward 39." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CivilIdPrint,
});

function CivilIdPrint() {
  const { patient } = usePrintPatient();
  const [state, setState] = useState<{ front: string | null; back: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fn = patient?.fileNo?.trim() ?? "";

  useEffect(() => {
    if (!patient) return;
    if (!fn) return setState({ front: null, back: null });
    (async () => {
      try {
        const row = await getDocs(fn);
        setState({
          front: row?.front_path ? await signedUrl(row.front_path) : null,
          back: row?.back_path ? await signedUrl(row.back_path) : null,
        });
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [patient, fn]);

  return (
    <PrintShell title="Civil ID" patient={patient}>
      {patient && (
        <div dir="rtl" className="space-y-4">
          <div className="flex justify-between border-b border-black pb-2 text-sm">
            <span className="font-bold">{patient.name}</span>
            <span dir="ltr">File No: {patient.fileNo || "—"}</span>
          </div>
          {err ? (
            <p className="text-center text-sm">{err}</p>
          ) : !state ? (
            <p className="text-center text-sm">جارٍ التحميل…</p>
          ) : !state.front && !state.back ? (
            <p className="py-10 text-center text-sm">لا توجد صورة بطاقة مدنية مرفوعة لهذا المريض.</p>
          ) : (
            <div className="flex flex-col items-center gap-6">
              {(["front", "back"] as const).map((s) => (
                <div key={s} className="text-center">
                  <div className="mb-1 text-xs">{s === "front" ? "الوجه" : "الخلف"}</div>
                  <div style={{ width: "171mm", height: "108mm" }} className="flex items-center justify-center border border-black">
                    {state[s] ? (
                      <img src={state[s]!} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                    ) : (
                      <span className="text-xs">لا توجد صورة</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PrintShell>
  );
}
