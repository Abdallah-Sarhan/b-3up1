import { createFileRoute } from "@tanstack/react-router";
import {
  BoxedDigits,
  OverlayPrintPage,
  makeField,
} from "@/components/OverlayPrint";
import template from "@/assets/consultation-report-template.jpg.asset.json";

export const Route = createFileRoute("/print/$patientId/consultation")({
  head: () => ({
    meta: [
      { title: "Consultation Report (MR 9) — Ward 39" },
      { name: "description", content: "Overlay printing of patient identification data onto the official MOH MR 9 consultation report form." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsultationPrint,
});

const IW = 1196;
const IH = 1692;
const F = makeField(IW, IH);

function ConsultationPrint() {
  return (
    <OverlayPrintPage formKey="consultation" template={template.url}>
      {(patient) => {
        const cid = (patient.cid || "").replace(/\D/g, "");
        const fileNo = (patient.fileNo || "").replace(/\D/g, "");
        return (
          <>
            <F left={300} top={52} width={300}>KCMH</F>
            <BoxedDigits value={fileNo} cells={6} left={845} width={245} top={52} iw={IW} ih={IH} />

            <F left={195} top={112} width={70} align="center">M</F>
            <F left={275} top={112} width={70} align="center">4</F>
            <F left={385} top={112} width={70} align="center">39</F>
            <F left={475} top={112} width={70} align="center">{patient.room}</F>
            <F left={562} top={112} width={70} align="center">{patient.bed}</F>

            <F left={745} top={148} width={340} size={14}>{patient.name}</F>
            <BoxedDigits value={cid} cells={12} left={730} width={358} top={192} iw={IW} ih={IH} size={12} />

            <F left={745} top={250} width={70}>{patient.sex}</F>
            <F left={925} top={250} width={130}>{patient.age}</F>

            <F left={195} top={240} width={140} align="center" size={12}>{patient.doa}</F>
            <F left={395} top={240} width={210} align="center" size={11}>{patient.doctor}</F>

            {/* Provisional diagnosis */}
            <F left={400} top={318} width={700} size={12}>{patient.diagnosis}</F>
          </>
        );
      }}
    </OverlayPrintPage>
  );
}
