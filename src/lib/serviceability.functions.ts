import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveIndianPincode } from "./pincode-lookup.server";

const inputSchema = z.object({
  postal: z.string().min(4).max(10).regex(/^\d{4,10}$/),
});

/**
 * Distinct verification states so the UI never shows a false
 * "delivery unavailable" message when verification merely failed:
 *  - available        → PIN verified, we deliver there
 *  - not_serviceable  → PIN does not exist / out of delivery network
 *  - invalid          → malformed PIN (not 6 digits)
 *  - service_down     → lookup service unreachable; allow checkout with warning
 */
export type ServiceabilityStatus = "available" | "not_serviceable" | "invalid" | "service_down";

export type ServiceabilityResult = {
  serviceable: boolean;
  /** When true, checkout may proceed even though we couldn't fully verify. */
  allowProceed: boolean;
  status: ServiceabilityStatus;
  postal: string;
  city: string | null;
  state: string | null;
  message: string;
};

/**
 * Validates an Indian PIN code and reports whether the destination is
 * serviceable. All shipping/region decisions remain server-side.
 */
export const validatePincode = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ServiceabilityResult> => {
    const postal = data.postal.trim();

    // Indian PIN codes are exactly 6 digits.
    if (!/^\d{6}$/.test(postal)) {
      return {
        serviceable: false,
        allowProceed: false,
        status: "invalid",
        postal,
        city: null,
        state: null,
        message: "Enter a valid 6-digit Indian PIN code to check delivery.",
      };
    }

    const res = await resolveIndianPincode(postal);

    if (res.ok) {
      return {
        serviceable: true,
        allowProceed: true,
        status: "available",
        postal,
        city: res.city,
        state: res.state,
        message: `Delivery available to ${res.city ?? "your area"}${res.state ? `, ${res.state}` : ""}.`,
      };
    }

    if (res.reason === "invalid") {
      return {
        serviceable: false,
        allowProceed: false,
        status: "invalid",
        postal,
        city: null,
        state: null,
        message: "Enter a valid 6-digit Indian PIN code to check delivery.",
      };
    }

    if (res.reason === "not_found") {
      return {
        serviceable: false,
        allowProceed: false,
        status: "not_serviceable",
        postal,
        city: null,
        state: null,
        message: "We couldn't find this PIN code. Please double-check it.",
      };
    }

    // service_down — never block a valid customer on API downtime.
    return {
      serviceable: false,
      allowProceed: true,
      status: "service_down",
      postal,
      city: null,
      state: null,
      message:
        "Delivery verification is temporarily unavailable. Our team will confirm availability before dispatch.",
    };
  });
