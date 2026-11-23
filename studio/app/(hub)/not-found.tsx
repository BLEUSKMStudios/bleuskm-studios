import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <h1>Page not found</h1>
      <p className="lead">This address doesn't exist in Studio OS.</p>
      <Link className="btn btn-inline" href="/">Back to the dashboard</Link>
    </div>
  );
}
