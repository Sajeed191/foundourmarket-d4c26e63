import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STAFF_ROLES = ["admin", "super_admin"];

async function assertStaff(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", STAFF_ROLES);
  if (!data || data.length === 0) {
    throw new Error("Forbidden: admin access required.");
  }
}

const inputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
});

/**
 * Generate a premium 1:1 category thumbnail with AI based on the category
 * name, upload it to storage, and return the public URL. Admin-only.
 */
export const generateCategoryImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await assertStaff(supabase, userId);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI image generation is not configured.");

    const prompt =
      `Premium e-commerce category thumbnail for "${data.name}"` +
      (data.description ? ` — ${data.description}.` : ".") +
      " Luxury, futuristic, cinematic product photography composition, dark navy and black layered background with warm orange and amber glow accents, soft premium lighting, glassmorphism, centered hero subject representing the category, minimal, high-end, no text, no watermark. Square 1:1 framing.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-image-1-mini",
        prompt,
        size: "1024x1024",
        quality: "low",
        n: 1,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Image generation failed (${res.status}). ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("Image generation returned no image.");

    const bytes = Buffer.from(b64, "base64");
    const path = `categories/ai-${data.slug}-${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("product-images")
      .upload(path, bytes, {
        cacheControl: "31536000",
        upsert: true,
        contentType: "image/png",
      });
    if (upErr) throw new Error(upErr.message || "Upload failed.");

    const { data: pub } = supabaseAdmin.storage.from("product-images").getPublicUrl(path);
    return { url: `${pub.publicUrl}?v=${Date.now()}` };
  });
