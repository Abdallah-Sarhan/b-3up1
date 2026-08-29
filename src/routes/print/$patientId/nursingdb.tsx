import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  BoxedDigits,
  OverlayPrintPage,
  makeField,
  usePrintPatientData,
} from "@/components/OverlayPrint";
import template from "@/assets/nursing-database-template.jpg.asset.json";

export const Route = createFileRoute("/print/$patientId/nursingdb")({
  head: () => ({
    meta: [
      { title: "Nursing Data Base (NURS 6A) — Ward 39" },
      { name: "description", content: "Overlay printing of admission and assessment data onto the official MOH NURS 6A nursing data base form." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NursingDbPrint,
});

const IW = 1352;
const IH = 1920;
const F = makeField(IW, IH);

function NursingDbPrint() {
  const { id } = usePrintPatientData();
  const vitals = useLiveQuery(
    () => db.vitals.where("patientId").equals(id).sortBy("date"),
    [id],
  );
  const last = (vitals ?? []).at(-1);

  return (
    <OverlayPrintPage formKey="nursingdb" template={template.url}>
      {(patient) => {
        const cid = (patient.cid || "").replace(/\D/g, "");
        const fileNo = (patient.fileNo || "").replace(/\D/g, "");
        return (
          <>
            <F left={380} top={58} width={330}>KCMH</F>
            <BoxedDigits value={fileNo} cells={6} left={908} width={322} top={58} iw={IW} ih={IH} />

            <F left={237} top={140} width={65} align="center">M</F>
            <F left={328} top={140} width={65} align="center">4</F>
            <F left={415} top={140} width={65} align="center">39</F>
            <F left={500} top={140} width={65} align="center">{patient.room}</F>
            <F left={587} top={140} width={70} align="center">{patient.bed}</F>

            <F left={845} top={162} width={385} size={14}>{patient.name}</F>
            <BoxedDigits value={cid} cells={12} left={852} width={363} top={205} iw={IW} ih={IH} size={12} />

            <F left={855} top={258} width={70}>{patient.sex}</F>
            <F left={1045} top={258} width={150}>{patient.age}</F>

            <F left={237} top={240} width={165} align="center" size={12}>{patient.doa}</F>
            <F left={430} top={240} width={330} align="center" size={11}>{patient.doctor}</F>

            <F left={355} top={310} width={300} size={12}>{patient.nationality}</F>
            <F left={355} top={352} width={300} size={12}>{patient.maritalStatus}</F>

            {/* Vital signs and measurements (latest reading) */}
            {last ? (
              <>
                <F left={548} top={1118} width={140} size={12}>{last.temp}</F>
                <F left={740} top={1118} width={200} size={12}>{last.pulse}</F>
                <F left={1015} top={1140} width={200} size={12}>{last.resp}</F>
                <F left={548} top={1158} width={180} size={12}>{last.bp}</F>
                <F left={790} top={1158} width={160} size={12}>{last.weight}</F>
              </>
            ) : null}
          </>
        );
      }}
    </OverlayPrintPage>
  );
}
