import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  BoxedDigits,
  OverlayPrintPage,
  makeField,
  usePrintPatientData,
} from "@/components/OverlayPrint";
import template from "@/assets/treatment-sheet-template.jpg.asset.json";

export const Route = createFileRoute("/print/$patientId/treatment")({
  head: () => ({
    meta: [
      { title: "Treatment Sheet (MR 12) — Ward 39" },
      { name: "description", content: "Overlay printing of medication and treatment data onto the official MOH MR 12 treatment sheet." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TreatmentPrint,
});

const IW = 1172;
const IH = 1676;
const F = makeField(IW, IH);

const ROW_TOP = 412;
const ROW_H = 38.6;
const ROWS = 30;

function TreatmentPrint() {
  const { id } = usePrintPatientData();
  const entries = useLiveQuery(
    () => db.tranq.where("patientId").equals(id).sortBy("date"),
    [id],
  );
  const list = (entries ?? []).slice(-ROWS);

  return (
    <OverlayPrintPage formKey="treatment" template={template.url}>
      {(patient) => {
        const cid = (patient.cid || "").replace(/\D/g, "");
        const fileNo = (patient.fileNo || "").replace(/\D/g, "");
        return (
          <>
            <F left={300} top={88} width={280}>KCMH</F>
            <BoxedDigits value={fileNo} cells={6} left={740} width={325} top={90} iw={IW} ih={IH} />

            <F left={190} top={158} width={72} align="center">M</F>
            <F left={273} top={158} width={72} align="center">4</F>
            <F left={350} top={158} width={72} align="center">39</F>
            <F left={432} top={158} width={65} align="center">{patient.room}</F>
            <F left={517} top={158} width={55} align="center">{patient.bed}</F>

            <F left={705} top={158} width={330} size={14}>{patient.name}</F>
            <BoxedDigits value={cid} cells={12} left={708} width={332} top={205} iw={IW} ih={IH} size={12} />

            <F left={735} top={248} width={70}>{patient.sex}</F>
            <F left={900} top={248} width={130}>{patient.age}</F>

            <F left={190} top={248} width={140} align="center" size={12}>{patient.doa}</F>
            <F left={380} top={248} width={205} align="center" size={11}>{patient.doctor}</F>

            <F left={310} top={312} width={730} size={12}>{patient.diagnosis}</F>

            {list.map((e, i) => {
              const top = ROW_TOP + i * ROW_H + 7;
              return (
                <div key={e.id}>
                  <F left={178} top={top} width={116} align="center" size={11}>
                    {[e.date, e.time].filter(Boolean).join(" ")}
                  </F>
                  <F left={306} top={top} width={478} size={11}>
                    {[e.drug, e.dose, e.route, e.indication].filter(Boolean).join(" — ")}
                  </F>
                  <F left={798} top={top} width={308} size={11}>
                    {e.effect}
                  </F>
                </div>
              );
            })}
          </>
        );
      }}
    </OverlayPrintPage>
  );
}
