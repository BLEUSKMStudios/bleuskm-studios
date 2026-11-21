import Link from "next/link";
import { requireSignedIn } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Step 1C landing page: proves sign-in works. The hub menu and dashboard
// arrive in step 1D.
export default async function Home() {
  const me = await requireSignedIn();
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <p className="eyebrow">BLEUSKM STUDIO OS</p>
        <h1>Welcome, {me.fullName}</h1>
        <p className="lead">
          You're signed in as {me.email}
          {me.isOwner ? " (studio owner)" : ""}. The hub menu and dashboard arrive in the next step.
        </p>
        {me.isOwner && (
          <p style={{ margin: "0 0 12px" }}>
            <Link className="btn" href="/settings/invite">Invite someone</Link>
          </p>
        )}
        <form action="/auth/signout" method="post">
          <button className="btn btn-quiet" type="submit">Sign out</button>
        </form>
      </div>
    </main>
  );
}
