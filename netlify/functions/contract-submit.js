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
    const contractUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent("Contracts")}`;
    const contractRes = await airtableFetch(contractUrl, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      await sendContractBackupEmail(brevoKey, { name, email, role, signatureUrl, dateSigned, airtableError: contractData?.error?.message || `Airtable ${contractRes.status}` });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          queued: true,
          airtableStatus: contractRes.status,
          message: "Contract received. Airtable is temporarily busy, so a backup copy was sent to BLEUSKM."
        })
      };
    }

    let guideLink = "";
    let crewFilm  = "The Final Hand";
    let onSetRole = role;

    try {
      const crewRes  = await airtableFetch(
        `https://api.airtable.com/v0/${base}/${encodeURIComponent("Crew applications")}?filterByFormula=${encodeURIComponent(`{Email}="${email}"`)}`,
        token
      );
      const crewData = await crewRes.json();

      if (crewData.records && crewData.records.length > 0) {
        const crewRecord = crewData.records[0];
        const crewId     = crewRecord.id;
        const crewFields = crewRecord.fields;

        guideLink  = fieldText(crewFields["Guide Link"]);
        crewFilm   = fieldText(crewFields["Film"]) || "The Final Hand";
        onSetRole  = fieldFirst(crewFields, ["Preferred role by Director", "Preferred_role_by_Director"]) || fieldText(crewFields["Role"]) || role;

        await airtableFetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent("Crew applications")}/${crewId}`, token, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { "Contract Status": "Signed" } })
        });
      }
    } catch (e) { console.log("Crew lookup skipped:", e.message); }

    let guideSent = false;
    if (guideLink && brevoKey) {
      try {
        let shootDates    = "July 19-25, 2026";
        let shootLocation = "Denton, TX";
        try {
          const tlRes  = await airtableFetch(
            `https://api.airtable.com/v0/${base}/${encodeURIComponent("Production Timeline")}`,
            token
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
              shootDates = e ? `${s}-${e}` : s;
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
              APPLIED_ROLE:   role,
              ORIGINAL_ROLE:  role,
              ON_SET_ROLE:    onSetRole,
              PREFERRED_ROLE_BY_DIRECTOR: onSetRole,
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
            ? "Contract saved. Guide link found but email failed - send manually from dashboard."
            : "Contract saved. No guide link set - send guide manually from dashboard when ready."
      })
    };

  } catch (err) {
    await sendContractBackupEmail(brevoKey, { name, email, role, signatureUrl, dateSigned, airtableError: err.message });
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        queued: true,
        message: "Contract received. A backup copy was sent to BLEUSKM."
      })
    };
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function airtableFetch(url, token, options = {}) {
  const delays = [0, 1200, 2600, 5200];
  let lastRes;
  for (const delay of delays) {
    if (delay) await sleep(delay);
    lastRes = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    if (lastRes.status !== 429 && lastRes.status < 500) return lastRes;
  }
  return lastRes;
}

async function sendContractBackupEmail(brevoKey, contract) {
  if (!brevoKey) return false;
  try {
    const subject = `BACKUP CONTRACT SIGNATURE - ${contract.name}`;
    const textContent = [
      "A crew contract was submitted, but Airtable was temporarily unavailable.",
      "",
      `Name: ${contract.name}`,
      `Email: ${contract.email}`,
      `Role: ${contract.role}`,
      `Date Signed: ${contract.dateSigned || new Date().toISOString().split("T")[0]}`,
      `Signature URL: ${contract.signatureUrl}`,
      `Airtable Error: ${contract.airtableError}`,
      "",
      "Manually enter this into Airtable Contracts when Airtable is available."
    ].join("\n");

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { email: "studio@bleuskm.com", name: "BLEUSKM Studios" },
        to: [{ email: "studio@bleuskm.com", name: "Zaria" }],
        subject,
        textContent
      })
    });
    return true;
  } catch (e) {
    console.log("Backup contract email failed:", e.message);
    return false;
  }
}

function fieldText(value) {
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return value.name || value.url || value.filename || "";
  return String(value ?? "").trim();
}

function fieldFirst(fields, names) {
  for (const name of names) {
    const value = fieldText(fields[name]);
    if (value) return value;
  }
  return "";
}
