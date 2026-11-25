import "@/components/contracts/agreement.css";
import { recipientByToken, unsubscribe } from "@/lib/campaigns/public";
import { maskEmail } from "@/lib/contracts/render";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe · BLEUSKM Studios", robots: { index: false, follow: false } };

// One click (a form, so link scanners that open emails don't unsubscribe people by accident).
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const r = await recipientByToken(token);
  async function act() {
    "use server";
    await unsubscribe(token);
    const { redirect } = await import("next/navigation");
    redirect(`/u/${token}?done=1`);
  }
  const box = (children: React.ReactNode) => <main className="ag-page"><div className="ag"><div className="ag-done"><p className="ag-step">BLEUSKM Studios</p>{children}</div></div></main>;
  if (!r) return box(<><h1>This link isn&apos;t valid</h1><p>To stop our emails, reply to any of them with &ldquo;unsubscribe&rdquo; and we&apos;ll take you off the list.</p></>);
  if (r.unsubscribed || sp.done) return box(<><h1>You&apos;re unsubscribed</h1><p>{maskEmail(r.email)} won&apos;t get {r.audience} emails from BLEUSKM Studios anymore. Emails about anything you&apos;ve applied for are separate and still reach you.</p></>);
  return box(
    <>
      <h1>Unsubscribe from {r.audience}?</h1>
      <p>{maskEmail(r.email)} will stop getting {r.audience} emails from BLEUSKM Studios.</p>
      <form action={act}><button className="ag-btn" type="submit">Unsubscribe</button></form>
    </>,
  );
}
