"use client";

// Shown when a hub page fails to load. No technical details reach the screen.
export default function HubError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="empty">
      <h1>Something went wrong</h1>
      <p className="lead">This page couldn't be loaded. Nothing you saved was lost.</p>
      <button className="btn btn-inline" type="button" onClick={() => reset()}>Try again</button>
    </div>
  );
}
