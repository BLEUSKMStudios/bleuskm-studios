import Link from "next/link";
import { isOwnerHere } from "@/lib/hub/owner";
import { listPeople } from "@/lib/hub/people";
import { NoAccess, PageHead } from "@/components/hub/Page";
import { LocalTime } from "@/components/hub/LocalTime";

export const metadata = { title: "User Access · BLEUSKM Studio OS" };

export default async function UsersPage() {
  if (!(await isOwnerHere())) return <NoAccess what="Settings" />;
  const people = await listPeople();
  return (
    <>
      <PageHead title="User Access" lead={<><Link className="link" href="/settings">Settings &amp; Administration</Link> · Everyone who can sign in to the hub</>}>
        <Link className="btn btn-inline" href="/settings/users/invite">Invite someone</Link>
      </PageHead>
      <section className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Last signed in</th><th></th></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td>{p.full_name}</td>
                  <td>{p.email}</td>
                  <td>
                    {p.is_owner ? <span className="tag tag-active">Owner</span>
                      : p.status === "deactivated" ? <span className="tag tag-archived">Deactivated</span>
                      : p.invitePending ? <span className="tag tag-planning">Invitation pending</span>
                      : <span className="tag tag-active">Active</span>}
                  </td>
                  <td><LocalTime iso={p.lastSignIn} /></td>
                  <td>{p.is_owner ? <span className="small">Full access</span> : <Link className="link" href={`/settings/users/${p.id}`}>Manage access</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
