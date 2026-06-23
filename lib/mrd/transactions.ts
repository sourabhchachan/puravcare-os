import type { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

export async function insertMrdTransaction(
  supabase: Supabase,
  row: {
    file_id: string;
    action: string;
    from_status?: string | null;
    to_status?: string | null;
    request_id?: string | null;
    actor_id?: string | null;
    note?: string | null;
  },
) {
  const { error } = await supabase.from("mrd_transactions").insert({
    file_id: row.file_id,
    action: row.action,
    from_status: row.from_status ?? null,
    to_status: row.to_status ?? null,
    request_id: row.request_id ?? null,
    actor_id: row.actor_id ?? null,
    note: row.note ?? null,
  });
  if (error) throw error;
}
