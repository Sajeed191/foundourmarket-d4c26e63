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
      return { valid: true as const, city: res.city, state: res.state, areas: res.areas };
    }
    return { valid: false as const, city: null, state: null, areas: [] as string[] };
  });
