const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE;
const BREVO_KEY      = process.env.BREVO_KEY;

const TBL_NEWSLETTER  = 'tblSMb3y7vrvjbONx';
const LIST_NEWSLETTER = 2;
const TPL_NEWSLETTER  = 3;

async function saveToAirtable(tableId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return res.json();
}

async function addBrevoContact(listId, email, name) {
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, attributes: { FIRSTNAME: name }, listIds: [listId], updateEnabled: true })
  });
  return res.json();
}

async function sendBrevoEmail(templateId, email, name) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: 'newsletter@bleuskm.com', name: 'BLEUSKM Studios' },
      replyTo: { email: 'studio@bleuskm.com', name: 'BLEUSKM Studios' },
      to: [{ email, name }],
      templateId,
      params: { FIRSTNAME: name }
    })
  });
  return res.json();
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders() };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const body = JSON.parse(event.body);
    const { name, email } = body;
    if (!email) return respond(400, { error: 'Email is required' });
    const cleanName = (name || '').trim();
    await saveToAirtable(TBL_NEWSLETTER, { 'Name': cleanName, 'Email': email.trim() });
    await addBrevoContact(LIST_NEWSLETTER, email.trim(), cleanName);
    await sendBrevoEmail(TPL_NEWSLETTER, email.trim(), cleanName);
    return respond(200, { success: true });
  } catch (err) {
    console.error('submit-newsletter error:', err);
    return respond(500, { error: 'Server error. Please try again.' });
  }
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}

function respond(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...corsHeaders() }, body: JSON.stringify(body) };
}
