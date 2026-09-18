import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getPatientTool from "./tools/get-patient";
import listPatientsTool from "./tools/list-patients";
import searchPatientsTool from "./tools/search-patients";
import wardSummaryTool from "./tools/ward-summary";

// The OAuth issuer must be the direct Supabase host; the project ref is the
// only Supabase value that survives publish unchanged.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "b-3up1",
  title: "B-3up1",
  version: "0.1.0",
  instructions:
    "Tools for the Ward 39 patient registry (KCMH). Use `ward_summary` for occupancy, `list_patients` for the current patient list, `search_patients` to find a patient by name, file number, diagnosis or doctor, and `get_patient` for one patient's full record. All tools act as the signed-in user and are read-only.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [wardSummaryTool, listPatientsTool, searchPatientsTool, getPatientTool],
});
