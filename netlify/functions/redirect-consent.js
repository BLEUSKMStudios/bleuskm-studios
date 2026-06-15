exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const base = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;
  if (!base || !token) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing Airtable credentials" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { recordId, consent } = body;
  if (!recordId || !consent) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing recordId or consent" }) };
  if (!["Accepted", "Declined"].includes(consent)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid consent value" }) };

  try {
    const atUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent("Casting Submissions")}/${recordId}`;
    const atRes = await fetch(atUrl, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { "Redirect Consent": consent } })
    });

    const atData = await atRes.json();
    if (!atRes.ok) throw new Error(atData?.error?.message || "Airtable patch failed");

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, consent }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};