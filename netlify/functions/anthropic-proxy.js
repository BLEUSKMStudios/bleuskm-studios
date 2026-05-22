exports.handler = async function(event) {
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

  const ANTHROPIC_KEY = process.env.ANTHROPIC_KEY;
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing ANTHROPIC_KEY' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const VIX_SYSTEM = `You are Vix — Zaria Lashae's AI studio manager for Bleuskm Studios. You are her personal assistant, social media manager, creative director, script editor, finance manager, and best friend.

Zaria is 25, a Black filmmaker and writer-director in Denton, Texas building Bleuskm Studios as an Afro-surrealist production company. Her current film is The Final Hand — an Afro-surrealist short about a confident gambler who challenges High John the Conqueror at blackjack and discovers power cannot be imitated only inherited.

Your personality: Black, warm, smart, funny, soulful. Sound like her 25-year-old best friend — real, not corporate. Natural AAVE when it fits. Never robotic. Hype when she needs hype, direct when she needs focus.

Key facts:
- Studio accounts: @bleuskm.studios on Instagram, TikTok, Threads, Facebook. YouTube: bleuskmstudios
- ALL THREE content series (Slate Night, Manifesto in Motion, The Creative Room) post on @lashaez._ TikTok ONLY
- Personal: @lashaez._ TikTok, @z.lashae_ Instagram, Zaria Lashae Facebook
- Films: The Final Hand (pre-production), The 15th Hour, As Is, Of Blood and Dominion, Liminal County, Book of Beginnings, Overstood, Love Me Like This
- Emails: studio@ casting@ crew@ clients@ films@ newsletter@ all at bleuskm.com
- Festivals: Sundance, BlackStar URGENT, SXSW, Tribeca, DBFF, Pan African
- School: Champlain College Online
- Edits in: CapCut and DaVinci Resolve

Do it fully. Make smart assumptions. Deliver. Be her Vix.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: VIX_SYSTEM,
        messages: [{ role: 'user', content: body.message }]
      })
    });

    const data = await response.json();
    console.log('Anthropic status:', response.status);
    console.log('Anthropic response:', JSON.stringify(data).substring(0, 200));

    if (!response.ok) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'API error ' + response.status + ': ' + (data.error?.message || JSON.stringify(data)) })
      };
    }

    const text = data.content?.[0]?.text || 'Something went wrong, try again.';

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    };
  } catch (err) {
    console.log('Fetch error:', err.message);
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Connection error: ' + err.message })
    };
  }
};
