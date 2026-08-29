import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  BoxedDigits,
  OverlayPrintPage,
  makeField,
  usePrintPatientData,
} from "@/components/OverlayPrint";
import template from "@/assets/progress-notes-template.jpg.asset.json";

export const Route = createFileRoute("/print/$patientId/progress")({
  head: () => ({
    meta: [
      { title: "Clinical Progress Notes (MR 8) — Ward 39" },
      { name: "description", content: "Overlay printing of doctor round notes onto the official MOH MR 8 clinical progress notes form." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProgressPrint,
});

const IW = 1112;
const IH = 1576;
const F = makeField(IW, IH);

const ROW_TOP = 425;
const ROW_H = 38.7;
const ROWS = 28;

function ProgressPrint() {
  const { id } = usePrintPatientData();
  const entries = useLiveQuery(
    () => db.rounds.where("patientId").equals(id).sortBy("date"),
    [id],
  );
  const list = (entries ?? []).slice(-ROWS);

  return (
    <OverlayPrintPage formKey="progress" template={template.url}>
      {(patient) => {
        const cid = (patient.cid || "").replace(/\D/g, "");
        const fileNo = (patient.fileNo || "").replace(/\D/g, "");
        return (
          <>
            <F left={295} top={52} width={250}>KCMH</F>
            <BoxedDigits value={fileNo} cells={6} left={700} width={300} top={50} iw={IW} ih={IH} />

            <F left={175} top={138} width={65} align="center">M</F>
            <F left={245} top={138} width={65} align="center">4</F>
            <F left={320} top={138} width={65} align="center">39</F>
            <F left={395} top={138} width={65} align="center">{patient.room}</F>
            <F left={470} top={138} width={60} align="center">{patient.bed}</F>

            <F left={655} top={128} width={330} size={14}>{patient.name}</F>
            <BoxedDigits value={cid} cells={12} left={662} width={325} top={168} iw={IW} ih={IH} size={12} />

            <F left={645} top={222} width={70}>{patient.sex}</F>
            <F left={850} top={222} width={130}>{patient.age}</F>

            <F left={175} top={212} width={135} align="center" size={12}>{patient.doa}</F>
            <F left={330} top={212} width={205} align="center" size={11}>{patient.doctor}</F>

            <F left={310} top={305} width={720} size={12}>{patient.diagnosis}</F>

            {list.map((r, i) => {
              const top = ROW_TOP + i * ROW_H + 7;
              return (
                <div key={r.id}>
                  <F left={170} top={top} width={145} align="center" size={11}>
                    {r.date}
                  </F>
                  <F left={330} top={top} width={725} size={11}>
                    {[r.findings, r.orders, r.doctor].filter(Boolean).join(" — ")}
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
