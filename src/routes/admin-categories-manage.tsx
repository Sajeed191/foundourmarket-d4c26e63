import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { CategoryAdminSheet } from "@/components/admin/CategoryAdminSheet";
import { invalidateCategories } from "@/lib/use-categories";

export const Route = createFileRoute("/admin-categories-manage")({
  head: () => ({
    meta: [
      { title: "Categories — Admin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CategoriesManagePage,
});

function CategoriesManagePage() {
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});

  const loadCounts = useCallback(async () => {
    const { data } = await supabase.from("products").select("category");
    const counts = ((data as { category: string | null }[]) ?? []).reduce<Record<string, number>>(
      (acc, p) => {
        if (p.category) acc[p.category] = (acc[p.category] ?? 0) + 1;
        return acc;
      },
      {},
    );
    setProductCounts(counts);
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  return (
    <AdminShell
      title="Categories"
      subtitle="Manage every category and subcategory — create, edit, reorder and organize your full catalog."
      allow={["admin", "super_admin", "manager", "editor"]}
    >
      <CategoryAdminSheet
        variant="embedded"
        onClose={() => {}}
        onChanged={async () => {
          await loadCounts();
          invalidateCategories();
        }}
        productCounts={productCounts}
      />
    </AdminShell>
  );
}
