import Link from "next/link";
import { isOwnerHere } from "@/lib/hub/owner";
import { NoAccess, PageHead } from "@/components/hub/Page";

export const metadata = { title: "Settings · BLEUSKM Studio OS" };

const CARDS = [
  { href: "/settings/users", title: "User Access", text: "Invite people, deactivate or reactivate them, send password resets, and set what each person can open." },
  { href: "/settings/productions", title: "Productions", text: "Details, lifecycle stages, the sections each production uses, and its departments." },
  { href: "/settings/audit", title: "Audit log", text: "Every change to people, access and productions, with who made it and when." },
  { href: "/status", title: "System status", text: "Database connection, security rules and migrations on this environment." },
];

export default async function SettingsHome() {
  if (!(await isOwnerHere())) return <NoAccess what="Settings" />;
  return (
    <>
      <PageHead title="Settings" lead="Only you can see this area." />
      <div className="cards">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href} className="card">
            <h2>{c.title}</h2>
            <p className="small">{c.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
