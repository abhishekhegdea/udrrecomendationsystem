export function ProductSkeleton() {
  return (
    <div className="animate-pulse bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Image placeholder */}
      <div className="aspect-square bg-muted rounded-t-2xl" />
      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Rating */}
        <div className="flex items-center gap-2">
          <div className="h-3 w-12 bg-muted rounded-full" />
          <div className="h-3 w-8 bg-muted rounded-full" />
        </div>
        {/* Title */}
        <div className="h-4 w-full bg-muted rounded-full" />
        <div className="h-4 w-3/4 bg-muted rounded-full" />
        {/* Price */}
        <div className="flex items-center justify-between pt-1">
          <div className="h-5 w-20 bg-muted rounded-full" />
          <div className="h-4 w-16 bg-muted rounded-full" />
        </div>
      </div>
    </div>
  )
}

export function ProductGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  )
}
