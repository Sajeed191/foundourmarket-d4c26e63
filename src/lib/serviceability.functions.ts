import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  postal: z.string().min(4).max(10).regex(/^\d{4,10}$/),
});

export type ServiceabilityResult = {
  serviceable: boolean;
  postal: string;
  city: string | null;
  state: string | null;
  message: string;
};

/**
 * Validates an Indian pincode against the public India Post API and reports
 * whether the destination is serviceable for delivery.
 */
export const validatePincode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ServiceabilityResult> => {
    const postal = data.postal.trim();

    // Indian pincodes are 6 digits — anything else is unsupported for now.
    if (!/^\d{6}$/.test(postal)) {
      return {
        serviceable: false,
        postal,
        city: null,
        state: null,
        message: "Enter a valid 6-digit Indian pincode to check delivery.",
      };
    }

    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${postal}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        return {
          serviceable: false,
          postal,
          city: null,
          state: null,
          message: "Could not verify delivery for this pincode right now.",
        };
      }
      const json = (await res.json()) as Array<{
        Status: string;
        PostOffice?: Array<{ District: string; State: string }> | null;
      }>;
      const entry = json?.[0];
      const office = entry?.PostOffice?.[0];

      if (entry?.Status === "Success" && office) {
        return {
          serviceable: true,
          postal,
          city: office.District ?? null,
          state: office.State ?? null,
          message: `Delivery available to ${office.District}, ${office.State}.`,
        };
      }

      return {
        serviceable: false,
        postal,
        city: null,
        state: null,
        message: "Sorry, we don't deliver to this pincode yet.",
      };
    } catch {
      return {
        serviceable: false,
        postal,
        city: null,
        state: null,
        message: "Could not verify delivery for this pincode right now.",
      };
    }
  });
