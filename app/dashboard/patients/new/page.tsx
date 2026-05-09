"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/lib/hooks/useAuth";

function toLocalInputValue(date: Date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function NewPatientPage() {
  const router = useRouter();
  const { session } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [admissionType, setAdmissionType] = useState<"opd" | "ipd">("opd");
  const [bedNumber, setBedNumber] = useState("");
  const [ipdNumber, setIpdNumber] = useState("");
  const [admissionDate, setAdmissionDate] = useState(toLocalInputValue(new Date()));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const disableSubmit = useMemo(
    () =>
      saving ||
      !fullName.trim() ||
      (admissionType === "ipd" && (!bedNumber.trim() || !ipdNumber.trim())),
    [saving, fullName, admissionType, bedNumber, ipdNumber],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError("");
    if (admissionType === "ipd" && !ipdNumber.trim()) {
      const msg = "IPD number is required for IPD admission";
      setError(msg);
      toast.error(msg);
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": session.id,
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          age: age ? Number(age) : null,
          gender: gender || null,
          phone: phone.trim() || null,
          admission_type: admissionType,
          bed_number: admissionType === "ipd" ? bedNumber.trim() : null,
          ipd_number: admissionType === "ipd" ? ipdNumber.trim() || null : null,
          admission_date: new Date(admissionDate).toISOString(),
        }),
      });
      const body = (await response.json()) as { error?: string; patient?: { id: string } };
      if (!response.ok || !body.patient?.id) {
        setError(body.error ?? "Could not admit patient");
        toast.error(body.error ?? "Could not admit patient");
        return;
      }
      toast.success("Patient admitted");
      router.replace(`/dashboard/patients/${body.patient.id}`);
    } catch {
      setError("Could not admit patient");
      toast.error("Could not admit patient");
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-900">New Patient Admission</h1>
        <Link href="/dashboard/patients" className="text-xs font-medium text-[#2563EB] underline">
          Cancel
        </Link>
      </div>

      <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={onSubmit}>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Full Name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Age</label>
          <input
            type="number"
            min={0}
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          >
            <option value="">Select</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Admission Type</label>
          <select
            value={admissionType}
            onChange={(e) => setAdmissionType(e.target.value as "opd" | "ipd")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          >
            <option value="opd">OPD</option>
            <option value="ipd">IPD</option>
          </select>
        </div>

        {admissionType === "ipd" ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Bed Number</label>
              <input
                value={bedNumber}
                onChange={(e) => setBedNumber(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">IPD Number</label>
              <input
                value={ipdNumber}
                onChange={(e) => setIpdNumber(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
              />
            </div>
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Admission Date</label>
          <input
            type="datetime-local"
            value={admissionDate}
            onChange={(e) => setAdmissionDate(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-[#2563EB] focus:ring-2"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={disableSubmit}
          className="w-full rounded-lg bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Admit Patient"}
        </button>
      </form>
    </div>
  );
}
