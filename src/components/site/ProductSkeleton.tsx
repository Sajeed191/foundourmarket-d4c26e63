export function ProductSkeletonGrid({
  count = 4,
  className = "grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>

      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card-premium p-2.5 sm:p-3 overflow-hidden">
          <div className="relative aspect-square mb-3 rounded-xl overflow-hidden bg-white/[0.04]">
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
          </div>
          <div className="px-1 space-y-2">
            <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
            <div className="h-2.5 w-1/2 rounded bg-white/[0.04]" />
            <div className="h-3 w-1/3 rounded bg-white/[0.05] mt-2" />
          </div>
        </div>
      ))}
    </div>
  );
}
