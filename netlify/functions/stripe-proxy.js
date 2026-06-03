exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: ''
    };
  }

  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_KEY) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing STRIPE_SECRET_KEY' })
    };
  }

  try {
    // Fetch balance
    const balRes = await fetch('https://api.stripe.com/v1/balance', {
      headers: { 'Authorization': 'Bearer ' + STRIPE_KEY }
    });
    const balData = await balRes.json();
    const balance = balData.available ? (balData.available[0]?.amount / 100).toFixed(2) : '0.00';

    // Fetch recent charges
    const txRes = await fetch('https://api.stripe.com/v1/charges?limit=10', {
      headers: { 'Authorization': 'Bearer ' + STRIPE_KEY }
    });
    const txData = await txRes.json();
    const transactions = txData.data ? txData.data.map(function(c) {
      return { description: c.description || c.billing_details?.name || 'Payment', amount: c.amount, created: c.created };
    }) : [];

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance, transactions })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
