// Step 1A placeholder. Sign-in arrives in step 1C; until then this page only
// confirms the separate Studio OS deployment is running.
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px 16px",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ color: "var(--gold)", letterSpacing: "0.3em", fontSize: 12, fontWeight: 600, margin: 0 }}>
          BLEUSKM STUDIOS
        </p>
        <h1 style={{ fontWeight: 900, fontSize: "clamp(28px, 6vw, 44px)", margin: "12px 0" }}>Studio OS</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>Sign-in is not available yet.</p>
      </div>
    </main>
  );
}
