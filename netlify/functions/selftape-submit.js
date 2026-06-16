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

  const { recordId, selfTapeUrl } = body;
  if (!recordId || !selfTapeUrl) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing recordId or selfTapeUrl" }) };

  try {
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent("Casting Submissions")}/${recordId}`;
    const res = await airtableFetch(url, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          "Self Tape URL": selfTapeUrl,
          "Self Tape Status": "Submitted"
        }
      })
    });

    const data = await res.json();
    if (!res.ok) {
      await sendSelfTapeBackupEmail(brevoKey, { recordId, selfTapeUrl, airtableError: data?.error?.message || `Airtable ${res.status}` });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          queued: true,
          airtableStatus: res.status,
          message: "Self tape received. Airtable is temporarily busy, so a backup copy was sent to BLEUSKM."
        })
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
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

async function sendSelfTapeBackupEmail(brevoKey, tape) {
  if (!brevoKey) return false;
  try {
    const textContent = [
      "A self-tape was submitted, but Airtable was temporarily unavailable.",
      "",
      `Casting Record ID: ${tape.recordId}`,
      `Self Tape URL: ${tape.selfTapeUrl}`,
      `Airtable Error: ${tape.airtableError}`,
      "",
      "Manually paste this into the Self Tape URL field when Airtable is available."
    ].join("\n");

    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { email: "studio@bleuskm.com", name: "BLEUSKM Studios" },
        to: [{ email: "studio@bleuskm.com", name: "Zaria" }],
        subject: "BACKUP SELF-TAPE SUBMISSION",
        textContent
      })
    });
    return true;
  } catch (e) {
    console.log("Backup self-tape email failed:", e.message);
    return false;
  }
}
