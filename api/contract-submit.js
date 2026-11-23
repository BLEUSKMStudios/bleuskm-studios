// api/contract-submit.js
// Handles submissions from ALL contract templates (crew, cast, talent, composer,
// editor, contractor, location, media release, usage rights).
// Backward compatible with the original signatureUrl-based payload.
//
// Signatures drawn on the page arrive as a base64 PNG/JPEG. They are uploaded
// straight into the Contracts record's Signature attachment field with
// Airtable's upload API (no Cloudinary). If that upload fails, the signature
// is attached to the backup email instead, so it is never lost.

const SIGNATURE_FIELD = 'Signature';
const MAX_SIGNATURE_BYTES = 5 * 1024 * 1024; // Airtable's upload limit

// Maps the CONTRACT_TYPE slug each template hardcodes -> friendly label
// stored in the Airtable "Contract Type" single-select field.
const SLUG_TO_LABEL = {
'crew-agreement': 'Crew Agreement',
'contractor-agreement': 'Contractor Agreement',
'actor-agreement': 'Cast Agreement',
'actor-deal-memo': 'Actor Deal Memo',
'talent-release': 'Talent Release',
'composer-agreement': 'Composer Agreement',
'editor-agreement': 'Editor Agreement',
'location-release': 'Location Release',
'media-release-bts': 'Media Release (BTS)',
'usage-rights': 'Usage Rights',
};

// Human-readable labels for the optional type-specific fields each template can send
const EXTRA_FIELD_LABELS = {
character: 'Character',
shootdates: 'Shoot Dates',
scope: 'Scope of Work',
deliverydate: 'Delivery Date',
location: 'Location',
period: 'Contract Period',
effectivedate: 'Effective Date',
filmdate: 'Film Date',
};

async function netlifyHandler(event) {
const headers = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Headers": "Content-Type",
"Access-Control-Allow-Methods": "POST, OPTIONS",
"Content-Type": "application/json"
};

if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

const base = process.env.AIRTABLE_PRODUCTION_BASE || process.env.AIRTABLE_BASE;
const token = process.env.AIRTABLE_TOKEN;
const brevoKey = process.env.BREVO_KEY;

if (!base || !token) return { statusCode: 500, headers, body: JSON.stringify({ error: "Missing credentials" }) };

let body;
try { body = JSON.parse(event.body || "{}"); }
catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) }; }

const {
contractType, // slug, e.g. 'crew-agreement' (new templates)
name, email, role, film,
dateSigned,
signatureUrl, // legacy path: already-hosted image URL
signatureImage, // new path: base64 data URI straight from canvas
} = body;

// Only require a signature â name/email may be absent when URL params weren't passed
if (!signatureUrl && !signatureImage) {
return { statusCode: 400, headers, body: JSON.stringify({ error: "Signature is required" }) };
}

// Legacy path: an already-hosted image URL. New path: a drawn signature.
const finalSignatureUrl = signatureUrl || "";
const signature = !finalSignatureUrl && signatureImage ? parseSignature(signatureImage) : null;
if (!finalSignatureUrl && !signature) {
return { statusCode: 400, headers, body: JSON.stringify({ error: "Signature image is invalid or too large" }) };
}

const contractTypeLabel = SLUG_TO_LABEL[contractType] || (contractType || "Crew Agreement");

// Build a readable "Extra Details" block from any type-specific fields present
const extraLines = [];
for (const key of Object.keys(EXTRA_FIELD_LABELS)) {
if (body[key]) extraLines.push(`${EXTRA_FIELD_LABELS[key]}: ${body[key]}`);
}
const extraDetails = extraLines.join("\n");

try {
const contractUrl = `https://api.airtable.com/v0/${base}/${encodeURIComponent("Contracts")}`;
const contractFields = {
"Name": name || "(not provided)",
"Email": email || "",
"Role": role || "",
"Date Signed": dateSigned || new Date().toISOString().split("T")[0],
"Contract Status": "Signed",
"Contract Type": contractTypeLabel,
};
if (extraDetails) contractFields["Extra Details"] = extraDetails;
if (finalSignatureUrl) contractFields[SIGNATURE_FIELD] = [{ url: finalSignatureUrl }];

const contractRes = await airtableFetch(contractUrl, token, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ fields: contractFields, typecast: true })
});

const contractData = await contractRes.json();
if (!contractRes.ok) {
await sendContractBackupEmail(brevoKey, { name, email, role, contractType: contractTypeLabel, signatureUrl: finalSignatureUrl, signature, dateSigned, extraDetails, airtableError: contractData?.error?.message || `Airtable ${contractRes.status}` });
return {
statusCode: 200,
headers,
body: JSON.stringify({
success: true,
queued: true,
airtableStatus: contractRes.status,
message: "Contract received. Airtable is temporarily busy, so a backup copy was sent to BLEUSKM."
})
};
}

// Drawn signature: upload it into the record just created.
if (signature) {
try {
await uploadSignatureToAirtable(base, token, contractData.id, signature);
} catch (e) {
console.log("Signature upload to Airtable failed:", e.message);
await sendContractBackupEmail(brevoKey, { name, email, role, contractType: contractTypeLabel, signature, dateSigned, extraDetails, airtableError: `The contract was saved in Airtable (record ${contractData.id}), but its signature image could not be attached: ${e.message}. The signature is attached to this email.` });
}
}

// ââ Crew-specific follow-up: mark Contract Status + send department guide ââ
// (Only fires if this signer matches a Crew applications record by email â
// naturally skipped for location owners, composers, etc.)
let guideLink = "";
let crewFilm = film || "The Final Hand";
let onSetRole = role || "";

if (email) {
try {
const crewRes = await airtableFetch(
`https://api.airtable.com/v0/${base}/${encodeURIComponent("Crew applications")}?filterByFormula=${encodeURIComponent(`{Email}="${email}"`)}`,
token
);
const crewData = await crewRes.json();

if (crewData.records && crewData.records.length > 0) {
const crewRecord = crewData.records[0];
const crewId = crewRecord.id;
const crewFields = crewRecord.fields;
guideLink = fieldText(crewFields["Guide Link"]);
crewFilm = fieldText(crewFields["Film"]) || crewFilm;
onSetRole = fieldFirst(crewFields, ["Preferred role by Director", "Preferred_role_by_Director"]) || fieldText(crewFields["Role"]) || onSetRole;

await airtableFetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent("Crew applications")}/${crewId}`, token, {
method: "PATCH",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ fields: { "Contract Status": "Signed" } })
});
}
} catch (e) { console.log("Crew lookup skipped:", e.message); }
}

let guideSent = false;
if (guideLink && brevoKey && email) {
try {
let shootDates = "July 19-25, 2026";
let shootLocation = "Denton, TX";
try {
const tlRes = await airtableFetch(`https://api.airtable.com/v0/${base}/${encodeURIComponent("Production Timeline")}`, token);
const tlData = await tlRes.json();
const phases = (tlData.records || []).sort((a, b) =>
(a.fields["Start Date"] || "").localeCompare(b.fields["Start Date"] || "")
);
const shootPhase = phases.find(r => {
const p = (r.fields["Phase"] || "").toLowerCase();
return p.includes("production") && !p.includes("pre") && !p.includes("post");
});
if (shootPhase) {
const start = shootPhase.fields["Start Date"];
const end = shootPhase.fields["End Date"];
if (start) {
const s = new Date(start + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
const e = end ? new Date(end + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
shootDates = e ? `${s}-${e}` : s;
}
}
} catch (e) { console.log("Timeline fetch skipped:", e.message); }

const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
method: "POST",
headers: { "api-key": brevoKey, "Content-Type": "application/json" },
body: JSON.stringify({
to: [{ email, name }],
templateId: 26,
params: {
NAME: name,
ROLE: onSetRole,
APPLIED_ROLE: role || "",
ORIGINAL_ROLE: role || "",
ON_SET_ROLE: onSetRole,
FILM: crewFilm,
GUIDE_LINK: guideLink,
SHOOT_DATES: shootDates,
SHOOT_LOCATION: shootLocation
}
})
});

if (brevoRes.ok) guideSent = true;
} catch (e) { console.log("Guide email skipped:", e.message); }
}

return {
statusCode: 200,
headers,
body: JSON.stringify({
success: true,
recordId: contractData.id,
guideSent,
message: guideSent ? "Contract saved and department guide sent automatically." : "Contract saved."
})
};
} catch (err) {
await sendContractBackupEmail(brevoKey, { name, email, role, contractType: contractTypeLabel, signatureUrl: finalSignatureUrl, signature, dateSigned, extraDetails, airtableError: err.message });
return { statusCode: 200, headers, body: JSON.stringify({ success: true, queued: true, message: "Contract received. A backup copy was sent to BLEUSKM." }) };
}
}

// ââ Vercel adapter ââ
module.exports = async (req, res) => {
const event = {
httpMethod: req.method,
queryStringParameters: req.query || {},
headers: req.headers || {},
body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
};
const result = await netlifyHandler(event);
const { statusCode = 200, headers = {}, body = '', isBase64Encoded } = result || {};
Object.entries(headers).forEach(([k, v]) => { try { res.setHeader(k, v); } catch (e) {} });
if (isBase64Encoded) {
res.status(statusCode).send(Buffer.from(body, 'base64'));
} else {
res.status(statusCode).send(body);
}
};

// Drawn signatures: only a PNG or JPEG data URI up to Airtable's 5 MB upload limit.
function parseSignature(dataUri) {
const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUri || "").trim());
if (!m) return null;
const bytes = Math.floor((m[2].length * 3) / 4);
if (!bytes || bytes > MAX_SIGNATURE_BYTES) return null;
const ext = m[1] === "png" ? "png" : "jpg";
return { contentType: `image/${m[1]}`, base64: m[2], filename: `signature-${Date.now()}.${ext}` };
}

// Airtable's upload API puts the file straight into the record's attachment field.
async function uploadSignatureToAirtable(base, token, recordId, signature) {
if (!/^rec[A-Za-z0-9]{14}$/.test(String(recordId || ""))) throw new Error("No record id");
const url = `https://content.airtable.com/v0/${base}/${recordId}/${encodeURIComponent(SIGNATURE_FIELD)}/uploadAttachment`;
const res = await airtableFetch(url, token, {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ contentType: signature.contentType, file: signature.base64, filename: signature.filename })
});
if (!res.ok) {
let detail = "";
try { detail = (await res.json())?.error?.message || ""; } catch (_) {}
throw new Error(detail || `Airtable upload ${res.status}`);
}
}

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
headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
});
if (lastRes.status !== 429 && lastRes.status < 500) return lastRes;
}
return lastRes;
}

async function sendContractBackupEmail(brevoKey, contract) {
if (!brevoKey) return false;
try {
const textContent = [
`A ${contract.contractType || "contract"} was submitted, but something failed before it could save normally.`,
"",
`Name: ${contract.name || "(not provided)"}`,
`Email: ${contract.email || "(not provided)"}`,
`Role: ${contract.role || ""}`,
`Contract Type: ${contract.contractType || ""}`,
`Date Signed: ${contract.dateSigned || new Date().toISOString().split("T")[0]}`,
contract.signature ? "Signature: attached to this email" : `Signature URL: ${contract.signatureUrl || ""}`,
contract.extraDetails ? `Extra Details:\n${contract.extraDetails}` : "",
`Error: ${contract.airtableError}`,
"",
"Manually enter this into Airtable Contracts when the issue is resolved."
].filter(Boolean).join("\n");

await fetch("https://api.brevo.com/v3/smtp/email", {
method: "POST",
headers: { "api-key": brevoKey, "Content-Type": "application/json" },
body: JSON.stringify({
sender: { email: "studio@bleuskm.com", name: "BLEUSKM Studios" },
to: [{ email: "studio@bleuskm.com", name: "Zaria" }],
subject: `BACKUP CONTRACT SIGNATURE - ${contract.name || "(unknown)"}`,
textContent,
...(contract.signature ? { attachment: [{ content: contract.signature.base64, name: contract.signature.filename }] } : {})
})
});
return true;
} catch (e) {
console.log("Backup contract email failed:", e.message);
return false;
}
}

function fieldText(value) {
if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(", ");
if (value && typeof value === "object") return value.name || value.url || value.filename || "";
return String(value ?? "").trim();
}

function fieldFirst(fields, names) {
for (const name of names) {
const value = fieldText(fields[name]);
if (value) return value;
}
return "";
}
