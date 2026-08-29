import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  BoxedDigits,
  OverlayPrintPage,
  makeField,
  usePrintPatientData,
} from "@/components/OverlayPrint";
import template from "@/assets/nurses-notes-template.jpg.asset.json";

export const Route = createFileRoute("/print/$patientId/notes")({
  head: () => ({
    meta: [
      { title: "Nurses Notes — Ward 39" },
      { name: "description", content: "Overlay printing of nurses notes data onto the official MOH NURS.1 form." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotesPrint,
});

// Reference scan geometry (px).
const IW = 1343;
const IH = 1920;
const F = makeField(IW, IH);

const ROW_TOP = 400;
const ROW_H = 47.2;
const ROWS = 29;

const COL = { date: 240, time: 388, notes: 515, sign: 1112 };

function NotesPrint() {
  const { id } = usePrintPatientData();
  const entries = useLiveQuery(
    () => db.notes.where("patientId").equals(id).sortBy("date"),
    [id],
  );
  const list = (entries ?? []).slice(-ROWS);

  return (
    <OverlayPrintPage formKey="notes" template={template.url}>
      {(patient) => {
        const cid = (patient.cid || "").replace(/\D/g, "");
        const fileNo = (patient.fileNo || "").replace(/\D/g, "");
        return (
          <>
            <F left={400} top={90} width={330}>KCMH</F>
            <BoxedDigits value={fileNo} cells={6} left={903} width={288} top={76} iw={IW} ih={IH} />

            <F left={258} top={172} width={78} align="center">M</F>
            <F left={355} top={172} width={78} align="center">4</F>
            <F left={452} top={172} width={78} align="center">39</F>
            <F left={548} top={172} width={78} align="center">{patient.room}</F>
            <F left={645} top={172} width={78} align="center">{patient.bed}</F>

            <F left={862} top={166} width={378} size={14}>{patient.name}</F>
            <F left={866} top={220} width={370} size={14} spacing={17.5}>{cid}</F>

            <F left={262} top={266} width={170} align="center">{patient.doa}</F>
            <F left={488} top={266} width={236} align="center" size={11}>{patient.doctor}</F>

            <F left={880} top={278} width={120}>{patient.sex}</F>
            <F left={1085} top={278} width={150}>{patient.age}</F>
            <F left={905} top={315} width={335} size={12}>{patient.diagnosis}</F>

            {list.map((n, i) => {
              const top = ROW_TOP + i * ROW_H + 8;
              return (
                <div key={n.id}>
                  <F left={COL.date} top={top} width={COL.time - COL.date} align="center" size={12}>
                    {n.date}
                  </F>
                  <F left={COL.time} top={top} width={COL.notes - COL.time} align="center" size={12}>
                    {n.time}
                  </F>
                  <F left={COL.notes + 8} top={top} width={COL.sign - COL.notes - 16} size={12}>
                    {n.note}
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
