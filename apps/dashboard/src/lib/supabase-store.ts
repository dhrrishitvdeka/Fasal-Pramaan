import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimStore, WebClaimRow, WebImageRow } from "./claim-pipeline";

export function createSupabaseClaimStore(client: SupabaseClient): ClaimStore {
  return {
    async insertClaim(row) {
      const { data, error } = await client.from("web_claims").insert(row).select().single();
      if (error) throw new Error(error.message);
      return data as WebClaimRow;
    },
    async updateClaim(id, patch) {
      const { error } = await client.from("web_claims").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    },
    async getClaim(id) {
      const { data, error } = await client.from("web_claims").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as WebClaimRow) ?? null;
    },
    async listClaims() {
      const { data, error } = await client
        .from("web_claims")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as WebClaimRow[];
    },
    async insertImages(rows) {
      if (!rows.length) return;
      const { error } = await client.from("web_claim_images").insert(rows);
      if (error) throw new Error(error.message);
    },
    async replaceAngleImages(claimId, rows) {
      if (!rows.length) return;
      const angles = [...new Set(rows.map((row) => row.angle_type))];
      const { error: deleteError } = await client
        .from("web_claim_images")
        .delete()
        .eq("claim_id", claimId)
        .in("angle_type", angles);
      if (deleteError) throw new Error(deleteError.message);
      const { error } = await client.from("web_claim_images").insert(rows);
      if (error) throw new Error(error.message);
    },
    async listImages(claimId) {
      const { data, error } = await client.from("web_claim_images").select("*").eq("claim_id", claimId);
      if (error) throw new Error(error.message);
      return (data || []) as WebImageRow[];
    },
    async uploadImage(path, bytes, contentType) {
      const { error } = await client.storage.from("fasal-web-evidence").upload(path, bytes, {
        contentType,
        upsert: true,
      });
      if (error) throw new Error(error.message);
      const { data: signed, error: signError } = await client.storage
        .from("fasal-web-evidence")
        .createSignedUrl(path, 60 * 60 * 24 * 7);
      if (signError) throw new Error(signError.message);
      return { url: signed.signedUrl, storagePath: path };
    },
    async insertReviewAction(row) {
      const { error } = await client.from("web_review_actions").insert(row);
      if (error) throw new Error(error.message);
    },
  };
}
