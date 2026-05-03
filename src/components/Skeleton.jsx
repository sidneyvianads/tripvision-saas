// Skeleton loader genérico — placeholder de conteúdo enquanto carrega.

export default function Skeleton({ lines = 3, height = 16, className = "" }) {
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height, width: i === lines - 1 ? "70%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="skeleton w-10 h-10 rounded-full" style={{ borderRadius: 999 }} />
        <div className="flex-1">
          <div className="skeleton h-4 w-1/3 mb-1.5" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      </div>
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-3 w-4/5" />
    </div>
  );
}

export function TabSkeleton() {
  return (
    <div className="px-4 py-6 space-y-3">
      <CardSkeleton />
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
