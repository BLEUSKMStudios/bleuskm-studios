const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const AIRTABLE_BASE  = process.env.AIRTABLE_BASE;
const BREVO_KEY      = process.env.BREVO_KEY;

const TBL_CREW       = 'tblCR7Cg3WugORlwO';
const TBL_NEWSLETTER = 'tblSMb3y7vrvjbONx';
const LIST_CREW       = 6;
const LIST_NEWSLETTER = 2;
const TPL_CREW        = 2;
const TPL_NEWSLETTER  = 3;

async function saveToAirtable(tableId, fields) {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return res.json();
}

async function addBrevoContact(listId, email, name, attrs) {
  const res = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, attributes: { FIRSTNAME: name, ...attrs }, listIds: [listId], updateEnabled: true })
  });
  return res.json();
}

async function sendBrevoEmail(templateId, email, name, params) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { email: 'crew@bleuskm.com', name: 'BLEUSKM Studios' },
      replyTo: { email: 'studio@bleuskm.com', name: 'BLEUSKM Studios' },
      to: [{ email, name }],
      templateId,
      params: { FIRSTNAME: name, ...params }
    })
  });
  return res.json();
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders() };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const body = JSON.parse(event.body);
    const { name, email, phone, city, role, resume, reel, gear, availability, filmInterest, newsletter } = body;
    if (!email || !name) return respond(400, { error: 'Missing required fields' });
    const fields = { 'Name': name, 'Email': email, 'Role': role || '' };
    if (phone) fields['Phone'] = phone;
    if (city) fields['City'] = city;
    if (resume) fields['Resume / Portfolio Link'] = resume;
    if (reel) fields['Reel / Work Samples'] = reel;
    if (gear) fields['Gear List'] = gear;
    if (availability) fields['Availability'] = availability;
    if (filmInterest) fields['Film Interest'] = filmInterest;
    await saveToAirtable(TBL_CREW, fields);
    await addBrevoContact(LIST_CREW, email, name, { CREW_ROLE: role || '' });
    await sendBrevoEmail(TPL_CREW, email, name, { ROLE: role || '' });
    if (newsletter) {
      await saveToAirtable(TBL_NEWSLETTER, { 'Name': name, 'Email': email });
      await addBrevoContact(LIST_NEWSLETTER, email, name, {});
      await sendBrevoEmail(TPL_NEWSLETTER, email, name, {});
    }
    return respond(200, { success: true });
  } catch (err) {
    console.error('submit-crew error:', err);
    return respond(500, { error: 'Server error. Please try again.' });
  }
};

function corsHeaders() {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
}

function respond(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...corsHeaders() }, body: JSON.stringify(body) };
}
