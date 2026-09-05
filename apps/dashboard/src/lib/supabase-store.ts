import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimStore, WebClaimRow, WebImageRow } from "./claim-pipeline";

export function createSupabaseClaimStore(client: SupabaseClient): ClaimStore {
  return {
    async insertClaim(row) {
      try {
        const { data, error } = await client.from("web_claims").insert(row).select().single();
        if (error) throw new Error(error.message);
        return data as WebClaimRow;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: string })?.code;
        if (/duplicate|unique|already exists|23505/i.test(msg) || code === "23505") {
          throw new Error("Claim already exists");
        }
        if (/foreign key|fkey|23503/i.test(msg) || code === "23503") {
          // If plot_id violates foreign key constraint (e.g. plot deleted or from demo state),
          // fallback to plot_id: null so the farmer's crop evidence and claim are never lost.
          const { plot_id: _badPlot, ...fallback } = row as any;
          const { data, error } = await client
            .from("web_claims")
            .insert({ ...fallback, plot_id: null })
            .select()
            .single();
          if (error) throw new Error(error.message);
          return data as WebClaimRow;
        }
        if (code === "42703" || code === "PGRST204" || /column.*does not exist|Could not find the '.*' column/i.test(msg)) {
          const {
            peril: _p,
            intent_id: _i,
            gate_result: _g,
            context_signals: _c,
            adaptive_result: _a,
            inference_status: _s,
            inference_error: _e,
            inference_started_at: _t,
            growth_stage: _gs,
            predicted_growth_stage: _pgs,
            corrected_growth_stage: _cgs,
            sowing_date: _sd,
            ...stripped
          } = row as any;
          const { data, error } = await client.from("web_claims").insert(stripped).select().single();
          if (error) {
            if (/duplicate|unique|already exists|23505/i.test(error.message)) {
              throw new Error("Claim already exists");
            }
            throw new Error(error.message);
          }
          return data as WebClaimRow;
        }
        throw err;
      }
    },
    async deleteClaim(id) {
      const { error } = await client.from("web_claims").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    async updateClaim(id, patch, opts) {
      const currentBody: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
      const apply = async (body: Record<string, unknown>) => {
        let query = client.from("web_claims").update(body).eq("id", id);
        if (opts?.expectedStatus) {
          query = query.eq("status", opts.expectedStatus);
        }
        const { data, error } = await query.select("id");
        if (error) throw new Error(error.message);
        if (opts?.expectedStatus && (!data || data.length === 0)) {
          throw new Error("Claim status changed");
        }
      };

      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          await apply(currentBody);
          return;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const code = (err as { code?: string })?.code;
          if (msg === "Claim status changed") throw err;

          const colMatch =
            msg.match(/Could not find the '([^']+)' column/i) ||
            msg.match(/column "?([^"\s]+)"? does not exist/i) ||
            msg.match(/column "?([^"\s]+)"? of relation/i);

          if (colMatch && colMatch[1] && colMatch[1] in currentBody) {
            delete currentBody[colMatch[1]];
            continue;
          }

          if (
            code === "42703" ||
            code === "PGRST204" ||
            /growth_stage|predicted_growth_stage|corrected_growth_stage|sowing_date|peril|intent_id|gate_result|context_signals|adaptive_result|inference_|column.*does not exist|Could not find the '.*' column/i.test(msg)
          ) {
            delete currentBody.growth_stage;
            delete currentBody.predicted_growth_stage;
            delete currentBody.corrected_growth_stage;
            delete currentBody.sowing_date;
            delete currentBody.peril;
            delete currentBody.intent_id;
            delete currentBody.gate_result;
            delete currentBody.context_signals;
            delete currentBody.adaptive_result;
            delete currentBody.inference_status;
            delete currentBody.inference_error;
            delete currentBody.inference_started_at;
            continue;
          }

          throw err;
        }
      }
    },
    async getClaim(id) {
      const { data, error } = await client.from("web_claims").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as WebClaimRow) ?? null;
    },
    async getPlot(plotId) {
      try {
        const { data, error } = await client
          .from("web_plots")
          .select("id, area_hectares, crop_type")
          .eq("id", plotId)
          .maybeSingle();
        if (error) return null;
        return data ?? null;
      } catch {
        return null;
      }
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
      try {
        const { error } = await client.from("web_claim_images").insert(rows);
        if (error) throw new Error(error.message);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/gate_result/i.test(msg)) {
          const stripped = rows.map(({ gate_result: _g, ...rest }: any) => rest);
          const { error } = await client.from("web_claim_images").insert(stripped);
          if (error) throw new Error(error.message);
        } else {
          throw err;
        }
      }
    },
    async replaceAngleImages(claimId, rows) {
      if (!rows.length) return;
      // Insert first so a failed write cannot delete the farmer's previous evidence.
      await this.insertImages(rows);
      const keepIds = rows.map((row) => row.id);
      const angles = [...new Set(rows.map((row) => row.angle_type))];
      const { error: deleteError } = await client
        .from("web_claim_images")
        .delete()
        .eq("claim_id", claimId)
        .in("angle_type", angles)
        .not("id", "in", `(${keepIds.join(",")})`);
      if (deleteError) throw new Error(deleteError.message);
    },
    async listImages(claimId) {
      const { data, error } = await client.from("web_claim_images").select("*").eq("claim_id", claimId);
      if (error) throw new Error(error.message);
      const rows = (data || []) as WebImageRow[];
      return Promise.all(
        rows.map(async (row) => {
          if (row.storage_path) {
            try {
              const { data: signed } = await client.storage
                .from("fasal-web-evidence")
                .createSignedUrl(row.storage_path, 60 * 60 * 24 * 7);
              if (signed?.signedUrl) {
                return { ...row, image_url: signed.signedUrl };
              }
            } catch {
              // keep existing image_url if signed url refresh fails
            }
          }
          return row;
        }),
      );
    },
    async uploadImage(path, bytes, contentType) {
      const { error } = await client.storage.from("fasal-web-evidence").upload(path, bytes, {
        contentType,
        upsert: true,
      });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      let url = "";
      try {
        const { data: signed, error: signError } = await client.storage
          .from("fasal-web-evidence")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (!signError && signed?.signedUrl) {
          url = signed.signedUrl;
        }
      } catch {
        // fallback to public url
      }
      if (!url) {
        const { data: pub } = client.storage.from("fasal-web-evidence").getPublicUrl(path);
        url = pub?.publicUrl || "";
      }
      return { url, storagePath: path };
    },
    async downloadImage(path) {
      const { data, error } = await client.storage.from("fasal-web-evidence").download(path);
      if (error) throw new Error(error.message);
      const buf = await data.arrayBuffer();
      return new Uint8Array(buf);
    },
    async insertReviewAction(row) {
      const { error } = await client.from("web_review_actions").insert(row);
      if (error) throw new Error(error.message);
    },
  };
}
