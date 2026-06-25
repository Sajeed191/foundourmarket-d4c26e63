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

    // A valid 6-digit PIN must NEVER block checkout just because it isn't in
    // our lookup network (postal API gap, new locality, or service downtime).
    // We let the order proceed and confirm delivery availability after placement.
    return {
      serviceable: false,
      allowProceed: true,
      status: "service_down",
      postal,
      city: null,
      state: null,
      message: "Delivery availability will be confirmed after order placement.",
    };
  });
