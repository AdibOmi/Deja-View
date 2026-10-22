export function PosterSkeleton() {
  return (
    <div className="posterCard posterCard--skeleton" aria-hidden="true">
      <div className="posterFrame shimmer" />
      <div className="skelLine shimmer" />
      <div className="skelLine skelLine--short shimmer" />
    </div>
  );
}

export function RowSkeleton({ count = 8 }) {
  return (
    <div className="rowTrack">
      {Array.from({ length: count }, (_, i) => (
        <PosterSkeleton key={i} />
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 12 }) {
  return (
    <div className="posterGrid">
      {Array.from({ length: count }, (_, i) => (
        <PosterSkeleton key={i} />
      ))}
    </div>
  );
}
