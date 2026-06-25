import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveIndianPincode } from "./pincode-lookup.server";

/**
 * Validate an Indian PIN code and resolve city/state via a Worker-reachable
 * postal API. Runs server-side to avoid CORS and keep the lookup reliable.
 */
export const validateIndianPincode = createServerFn({ method: "GET" })
  .inputValidator((data) =>
    z.object({ pincode: z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits") }).parse(data)
  )
  .handler(async ({ data }) => {
    const res = await resolveIndianPincode(data.pincode);
    if (res.ok) {
      return {
        valid: true as const,
        // serviceable === false ONLY for confirmed-unsupported destinations.
        // A successful lookup means we deliver there.
        serviceable: true as boolean,
        reason: "available" as const,
        city: res.city,
        state: res.state,
        areas: res.areas,
      };
    }
    // A valid 6-digit PIN that we couldn't resolve (postal API gap, new
    // locality, or a transient outage) is NEVER treated as unsupported — the
    // customer must still be able to save the address and continue to payment.
    // `reason` lets the UI distinguish a soft "couldn't verify" notice from a
    // hard, confirmed "we don't deliver here" block.
    return {
      valid: false as const,
      serviceable: true as boolean,
      reason: res.reason as "not_found" | "service_down" | "invalid",
      city: null,
      state: null,
      areas: [] as string[],
    };
  });
