exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const base     = process.env.AIRTABLE_BASE;
  const token    = process.env.AIRTABLE_TOKEN;
  const brevoKey = process.env.BREVO_KEY;

  if (!base || !token) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing credentials" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { name, email, role, signatureUrl, dateSigned } = body;
  if (!name || !email || !role || !signatureUrl) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  try {
    // ── 1. Save contract record to Airtable ──────────────────
    const contractUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent("Contracts")}`;
    const contractRes = await fetch(contractUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          "Name":            name,
          "Email":           email,
          "Role":            role,
          "Signature":       [{ url: signatureUrl }],
          "Date Signed":     dateSigned || new Date().toISOString().split("T")[0],
          "Contract Status": "Signed"
        }
      })
    });

    const contractData = await contractRes.json();
    if (!contractRes.ok) {
      return { statusCode: contractRes.status, headers, body: JSON.stringify({ error: contractData?.error?.message || "Airtable error" }) };
    }

    // ── 2. Look up crew member in Crew Applications ───────────
    let guideLink = "";
    let crewFilm  = "The Final Hand";
    let onSetRole = role;

    try {
      const crewRes  = await fetch(
        `https://api.airtable.com/v0/${base}/${encodeURIComponent("Crew applications")}?filterByFormula=${encodeURIComponent(`{Email}="${email}"`)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const crewData = await crewRes.json();

      if (crewData.records && crewData.records.length > 0) {
        const crewRecord = crewData.records[0];
        const crewId     = crewRecord.id;
        const crewFields = crewRecord.fields;

        // Get guide link, film, and on-set role
        guideLink  = (crewFields["Guide Link"]                   || "").trim();
        crewFilm   = (crewFields["Film"]                         || "The Final Hand").trim();
        // Use Preferred_role_by_Director if set, otherwise fall back to Role
        onSetRole  = (crewFields["Preferred_role_by_Director"]   || "").trim() || role;

        // Update Contract Status on crew record
        await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent("Crew applications")}/${crewId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { "Contract Status": "Signed" } })
        });
      }
    } catch (e) { console.log("Crew lookup skipped:", e.message); }

    // ── 3. Auto-send T26 guide email if guide link exists ─────
    let guideSent = false;
    if (guideLink && brevoKey) {
      try {
        // Get shoot dates from Production Timeline
        let shootDates    = "July 19–25, 2026";
        let shootLocation = "Denton, TX";
        try {
          const tlRes  = await fetch(
            `https://api.airtable.com/v0/${base}/${encodeURIComponent("Production Timeline")}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const tlData = await tlRes.json();
          const phases = (tlData.records || []).sort((a, b) =>
            (a.fields["Start Date"] || "").localeCompare(b.fields["Start Date"] || "")
          );
          const shootPhase = phases.find(r => {
            const p = (r.fields["Phase"] || "").toLowerCase();
            return p.includes("production") && !p.includes("pre") && !p.includes("post");
          });
          if (shootPhase) {
            const start = shootPhase.fields["Start Date"];
            const end   = shootPhase.fields["End Date"];
            if (start) {
              const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
              const e = end ? new Date(end + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
              shootDates = e ? `${s}–${e}` : s;
            }
          }
        } catch (e) { console.log("Timeline fetch skipped:", e.message); }

        const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key":      brevoKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            to:         [{ email, name }],
            templateId: 26,
            params: {
              NAME:           name,
              ROLE:           onSetRole,
              FILM:           crewFilm,
              GUIDE_LINK:     guideLink,
              SHOOT_DATES:    shootDates,
              SHOOT_LOCATION: shootLocation,
            }
          })
        });

        if (brevoRes.ok) {
          guideSent = true;
          console.log(`T26 guide sent to ${email}`);
        } else {
          const brevoErr = await brevoRes.json().catch(() => ({}));
          console.log("T26 send failed:", brevoErr?.message || brevoRes.status);
        }
      } catch (e) { console.log("Guide email skipped:", e.message); }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success:    true,
        recordId:   contractData.id,
        guideSent,
        message:    guideSent
          ? "Contract saved and department guide sent automatically."
          : guideLink
            ? "Contract saved. Guide link found but email failed — send manually from dashboard."
            : "Contract saved. No guide link set — send guide manually from dashboard when ready."
      })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
