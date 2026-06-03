exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const base = process.env.AIRTABLE_BASE;
  const token = process.env.AIRTABLE_TOKEN;

  if (!base || !token) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Missing AIRTABLE_BASE or AIRTABLE_TOKEN" })
    };
  }

  try {
    if (event.httpMethod === "GET") {
      const table = event.queryStringParameters?.table;

      if (!table) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing table parameter" })
        };
      }

      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}?maxRecords=100`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();

      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify(data)
      };
    }

    if (event.httpMethod === "PATCH") {
      const { table, id, fields } = JSON.parse(event.body || "{}");

      if (!table || !id || !fields) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Missing table, id, or fields" })
        };
      }

      const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}/${id}`;

      const res = await fetch(url, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
      });

      const data = await res.json();

      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify(data)
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
