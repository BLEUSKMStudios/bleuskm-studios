exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const base  = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;
  if (!base || !token) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing credentials" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

  const { name, email, role, signatureUrl, dateSigned } = body;
  if (!name || !email || !role || !signatureUrl) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
  }

  try {
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent("Contracts")}`;
    const res = await fetch(url, {
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

    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: data?.error?.message || "Airtable error" }) };

    // Also update Crew Applications status if email matches
    try {
      const crewRes = await fetch(
        `https://api.airtable.com/v0/${base}/${encodeURIComponent("Crew applications")}?filterByFormula=${encodeURIComponent(`{Email}="${email}"`)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const crewData = await crewRes.json();
      if (crewData.records && crewData.records.length > 0) {
        const crewId = crewData.records[0].id;
        await fetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent("Crew applications")}/${crewId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { "Contract Status": "Signed" } })
        });
      }
    } catch (e) { console.log("Crew update skipped:", e.message); }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, recordId: data.id }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
