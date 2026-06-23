import { computeDaysOutOfMrd } from "@/lib/mrd/files";
import { latestOpenBorrow } from "@/lib/mrd/requests";

type FileRow = {
  id: string;
  ipd_number: string;
  patient_id: string | null;
  status: string;
  added_manually: boolean;
  created_at: string;
  updated_at: string;
};

type PatientRow = { id: string; full_name: string };

type RequestRow = {
  id: string;
  file_id: string;
  request_type: string;
  status: string;
  dispatched_at: string | null;
};

export function enrichMrdFile(file: FileRow, patient: PatientRow | undefined, requests: RequestRow[]) {
  const fileRequests = requests.filter((r) => r.file_id === file.id);
  const openBorrow = latestOpenBorrow(fileRequests);
  const daysOut = computeDaysOutOfMrd(
    file.status,
    openBorrow?.dispatched_at,
    file.status === "with_staff" && Boolean(openBorrow?.dispatched_at),
  );

  return {
    ...file,
    patient_name: patient?.full_name ?? null,
    days_out_of_mrd: daysOut,
    highlight_overdue: daysOut >= 5,
  };
}
