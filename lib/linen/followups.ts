import type { createServiceClient } from "@/lib/supabase/service";

type Supabase = ReturnType<typeof createServiceClient>;

export async function createLinenFollowup(
  supabase: Supabase,
  params: {
    item_id: string;
    quantity: number;
    source_type: "return" | "laundry";
    source_id: string;
    created_by: string;
  },
) {
  const { error } = await supabase.from("linen_followups").insert({
    item_id: params.item_id,
    quantity: params.quantity,
    source_type: params.source_type,
    source_id: params.source_id,
    status: "open",
    created_by: params.created_by,
  });
  if (error) throw new Error("followup_failed");
}
