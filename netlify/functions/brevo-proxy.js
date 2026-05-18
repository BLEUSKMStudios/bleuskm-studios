exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const BREVO_KEY = process.env.BREVO_KEY;
  const body = JSON.parse(event.body);
  const { endpoint, payload } = body;

  // Only allow these two Brevo endpoints
  const allowed = [
    'https://api.brevo.com/v3/smtp/email',
    'https://api.brevo.com/v3/contacts'
  ];
  if (!allowed.includes(endpoint)) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'api-key': BREVO_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': 'https://bleuskm.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
