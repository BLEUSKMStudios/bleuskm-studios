exports.handler = async function(event) {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const BREVO_KEY = process.env.BREVO_KEY;

  if (!BREVO_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing BREVO_KEY' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { endpoint, payload } = body;

  const allowed = [
    'https://api.brevo.com/v3/smtp/email',
    'https://api.brevo.com/v3/contacts'
  ];

  if (!allowed.includes(endpoint)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden endpoint' }) };
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
    console.log('Brevo response:', response.status, JSON.stringify(data));

    return {
      statusCode: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('Brevo error:', err.message);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
