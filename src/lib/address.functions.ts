import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Validate an Indian PIN code and resolve city/state via India Post public API.
 * Runs server-side to avoid CORS and keep the lookup reliable.
 */
export const validateIndianPincode = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ pincode: z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits") }).parse(data)
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${data.pincode}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return { valid: false as const, city: null, state: null, areas: [] as string[] };
      const json = (await res.json()) as Array<{
        Status: string;
        PostOffice?: Array<{ Name: string; District: string; State: string }> | null;
      }>;
      const entry = json?.[0];
      if (!entry || entry.Status !== "Success" || !entry.PostOffice?.length) {
        return { valid: false as const, city: null, state: null, areas: [] as string[] };
      }
      const po = entry.PostOffice;
      return {
        valid: true as const,
        city: po[0].District,
        state: po[0].State,
        areas: Array.from(new Set(po.map((p) => p.Name))).slice(0, 12),
      };
    } catch {
      return { valid: false as const, city: null, state: null, areas: [] as string[] };
    }
  });
