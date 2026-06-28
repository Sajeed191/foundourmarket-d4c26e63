import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/gpu-test")({
  head: () => ({
    meta: [
      { title: "GPU Render Test" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GpuTestPage,
});

// Standalone GPU/compositor diagnostic page.
// No shared components, no animation, transform, filter, backdrop-filter,
// border-radius, overflow hidden, shadows, gradients, canvas, IntersectionObserver,
// lazy loading or srcset/sizes. Plain <img> tags using the original source URLs.
const IMAGES = [
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/ae416357-b682-4bfd-b2d6-d6b62d952a6a/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/f304875d-edc5-4820-8964-4d0c7cb9a4a0/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/3a2774ca-4b23-4229-b82c-123605e2dd17/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/07999fd9-0e4f-4d6f-af17-2c4a4e325212/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/70a1be4f-469a-45e7-8347-7e5086806eba/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/085ea123-01bf-4152-821b-9f9f89f497f5/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/4e8a9e7e-d315-440c-9ca3-7552ca4822db/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/ee91558e-4cb6-4d13-b56e-4a5ef2379bc2/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/2ff709c5-8752-4fbd-8d80-fcba3e21ef83/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/606f7da5-56a3-46e5-a3d8-abd3278a4797/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/805d95a7-8eb6-47cf-bd8a-04f386a03536/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/50d5d0b3-7fbc-426b-80b6-420008c60e39/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/9d5bbea7-a3e8-4430-b256-888633a42864/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/5473936c-dda2-44d4-a449-67f03dd3694a/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/9bc1b53c-e692-4ab7-baeb-4e27a7f2b048/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/a61b4040-fe49-47b7-8486-e64eee679e35/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/b9a4b7e2-4c40-4ae6-a588-6066f28e1aab/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/62ed84ca-9976-4375-a4da-679b352012f4/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/3ae69f5c-6766-4049-a1a8-40bfedbfafc1/medium.webp",
  "https://jczcebzqxrwrblxvqpdg.supabase.co/storage/v1/object/public/media/product/cf0755f3-acf0-42dc-8e06-bafa354fac1a/medium.webp",
];

function GpuTestPage() {
  return (
    <div style={{ backgroundColor: "#ffffff", minHeight: "100vh", padding: "16px" }}>
      <h1 style={{ color: "#000000", fontSize: "18px", margin: "0 0 16px 0" }}>
        GPU Render Test
      </h1>
      {IMAGES.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={"test " + (i + 1)}
          width={300}
          height={300}
          loading="eager"
          decoding="sync"
          style={{ display: "block", width: "300px", height: "auto", marginBottom: "16px" }}
        />
      ))}
    </div>
  );
}
