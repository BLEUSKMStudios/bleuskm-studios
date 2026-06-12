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

  const { recordId, selfTapeUrl } = body;
  if (!recordId || !selfTapeUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing recordId or selfTapeUrl" }) };

  try {
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent("Casting Submissions")}/${recordId}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          "Self Tape URL": selfTapeUrl,
          "Self Tape Status": "Submitted"
        }
      })
    });

    const data = await res.json();
    if (!res.ok) return { statusCode: res.status, headers, body: JSON.stringify({ error: data?.error?.message || "Airtable error" }) };

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
