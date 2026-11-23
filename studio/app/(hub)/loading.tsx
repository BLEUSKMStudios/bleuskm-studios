// Shown while a hub page loads.
export default function Loading() {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      <div className="sk-title" />
      <div />
      <div className="sk-block" />
      <div className="sk-block" />
    </div>
  );
}
