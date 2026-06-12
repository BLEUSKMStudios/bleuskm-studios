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

  if (!base || !token || !brevoKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing credentials" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { recordId, consent } = body;
  if (!recordId || !consent) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing recordId or consent" }) };
  if (!["Accepted", "Declined"].includes(consent)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid consent value" }) };

  try {
    // 1. Write consent to Airtable
    const atUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent("Casting Submissions")}/${recordId}`;
    const atRes = await fetch(atUrl, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { "Redirect Consent": consent } })
    });

    const atData = await atRes.json();
    if (!atRes.ok) throw new Error(atData?.error?.message || "Airtable patch failed");

    // 2. Fetch the record to get actor details for email
    const getRes = await fetch(atUrl, { headers: { Authorization: `Bearer ${token}` } });
    const record = await getRes.json();
    const f      = record.fields || {};

    const email  = (f["Email"] || "").trim();
    const name   = (f["Name"]  || "").trim();
    const role   = (f["Role"]  || "").trim();

    if (!email) {
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, note: "No email to send follow-up" }) };
    }

    // 3. Send follow-up email based on consent
    let templateId, params;

    if (consent === "Accepted") {
      // Send callback / self-tape email (template 15)
      const selfTapeUrl = `https://bleuskm.com/selftape?name=${encodeURIComponent(name)}&role=${encodeURIComponent(role)}&email=${encodeURIComponent(email)}&id=${encodeURIComponent(recordId)}`;
      templateId = 15;
      params = {
        NAME:         name,
        ROLE:         role,
        SELFTAPE_URL: selfTapeUrl,
        CALENDLY_URL: "https://calendly.com/studio-bleuskm/30min"
      };
    } else {
      // Send rejection email (template 16)
      templateId = 16;
      params = { NAME: name, ROLE: role };
    }

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json" },
      body: JSON.stringify({ to: [{ email }], templateId, params })
    });

    if (!brevoRes.ok) {
      const brevoErr = await brevoRes.json().catch(() => ({}));
      console.error("Brevo error:", brevoErr);
      // Don't fail the whole request — consent was already saved
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, emailError: brevoErr?.message || "Brevo failed" }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, consent, emailSent: true }) };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
