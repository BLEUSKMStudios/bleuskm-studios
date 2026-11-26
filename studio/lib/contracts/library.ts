// The BLEUSKM Studios agreement library: role-specific master templates in
// the house format of the live actor agreement (bleuskm.com/contracts/
// actor-agreement): a party bar, numbered sections, BLEUSKM's signature and
// the signer's. Pure data (unit-tested).
//
// These are drafts prepared for the owner's review. Every template lists the
// points an attorney should review. None is presented as legally approved.

export type Clause = { title: string; text: string; review?: string };
export type Audience = "cast" | "crew" | "other";

export type TemplateDef = {
  key: string;
  name: string;
  audience: Audience;
  identity: "casting" | "crew" | "studio";
  title: string;                 // big title on the agreement
  docLabel: string;              // small caps label in the header
  signerLabel: string;           // "Actor", "Crew Member", "Owner"…
  party: { label: string; field: string }[]; // the party bar
  required: string[];            // must have a value before sending
  clauses: Clause[];
  /** Plain-language notes for the owner and her attorney. */
  review: string[];
};

/** Fields a template can fill, with how they're labelled in forms. */
export const FIELDS: Record<string, { label: string; hint?: string; long?: boolean }> = {
  recipient_name: { label: "Legal name", hint: "As it should appear on the signed agreement" },
  production_title: { label: "Production" },
  role: { label: "Character or position" },
  department: { label: "Department" },
  shoot_dates: { label: "Shoot dates", hint: "Leave empty if not set: the agreement says they'll be confirmed in writing" },
  locations: { label: "Locations", long: true },
  compensation: { label: "Compensation", hint: "Default: none (voluntary, unpaid)" },
  responsibilities: { label: "Responsibilities", long: true },
  permissions: { label: "Permissions and special terms", long: true, hint: "e.g. stunts, intimacy, wardrobe, special skills" },
  studio_rep_name: { label: "BLEUSKM representative" },
  studio_rep_title: { label: "Representative's title" },
  effective_date: { label: "Effective date", hint: "Defaults to the date the agreement is signed" },
  guardian_name: { label: "Parent or legal guardian's name" },
  minor_birthdate: { label: "Minor's date of birth" },
  property_address: { label: "Property address", long: true },
  property_owner: { label: "Owner or authorized agent" },
  access_dates: { label: "Dates and times of access", long: true },
  materials: { label: "Materials licensed", long: true, hint: "Title, creator and a short description of each work" },
  equipment_list: { label: "Equipment", long: true, hint: "Item, serial number, condition" },
  equipment_value: { label: "Stated replacement value" },
  return_date: { label: "Return date" },
  purpose: { label: "Purpose of disclosure", long: true },
};

export const UNKNOWN = "To be confirmed in writing by BLEUSKM Studios";

// ---------------------------------------------------------------------------
// Shared clauses
// ---------------------------------------------------------------------------
const P = (who: string, extra = "") =>
  `This Agreement is entered into between BLEUSKM Studios, an independent film production company based in Denton, Texas ("Production"), and {{recipient_name}} ("${who}")${extra}, in connection with the production currently titled {{production_title}} (the "Film"). It takes effect on {{effective_date}}.`;

const UNPAID = (who: string): Clause => ({
  title: "Compensation",
  text: `Compensation for ${who}'s services: {{compensation}}. Unless a payment is stated in this section, participation is voluntary and unpaid, and no monetary compensation is promised, implied or owed, now or in the future, for services under this Agreement. ${who} confirms they are taking part knowingly and freely. Production will reimburse pre-approved, documented out-of-pocket expenses only if it agrees to do so in writing in advance.`,
  review: "Unpaid work: whether unpaid participation is lawful for this role and production (federal Fair Labor Standards Act and Texas law, for-profit versus non-profit status, intern or volunteer rules).",
});

const IMDB = (who: string, what: string): Clause => ({
  title: "Credit",
  text: `BLEUSKM Studios is committed to crediting ${who} for ${what}. BLEUSKM Studios will make reasonable efforts to submit accurate cast and crew credits to IMDb following production. The final acceptance, publication, and display of credits are subject to IMDb's independent policies and approval processes. The form and placement of any on-screen credit are at Production's discretion. An inadvertent failure to give credit is not a breach of this Agreement, and Production will correct it in future materials where reasonably practical once notified.`,
});

const INDEPENDENT = (who: string): Clause => ({
  title: "Independent Status",
  text: `${who} takes part as an independent participant and not as an employee, partner or agent of Production. ${who} is responsible for their own taxes, if any arise, and nothing in this Agreement creates an employment relationship.`,
  review: "Worker classification: confirm the independent-participant language fits how the role is directed and scheduled (the label alone does not decide classification).",
});

const CONFIDENTIAL = (who: string): Clause => ({
  title: "Confidentiality",
  text: `${who} will keep all non-public information about the Film confidential, including the script, story, cast, locations, schedules, footage and creative direction, and will not share it, or post about it on social media, without Production's prior written consent. This obligation continues after the Film is completed until Production makes the information public.`,
});

const CONDUCT = (who: string): Clause => ({
  title: "Conduct, Safety & Professionalism",
  text: `${who} will act professionally, arrive prepared and on time, follow reasonable direction and all safety instructions, and treat everyone on set with respect. Production maintains a set free of harassment and discrimination; concerns can be raised with the producer or with BLEUSKM Studios at studio@bleuskm.com. ${who} may stop any activity they reasonably believe is unsafe. Production may end ${who}'s participation for disruptive, unsafe or unlawful conduct.`,
});

const RISK = (who: string): Clause => ({
  title: "Assumption of Risk",
  text: `${who} understands that film production can involve physical activity, travel, equipment and changing conditions, and voluntarily accepts the ordinary risks of taking part. To the fullest extent permitted by law, ${who} releases BLEUSKM Studios, its owners, producers and representatives from claims arising from those ordinary risks. THIS RELEASE DOES NOT COVER CLAIMS ARISING FROM PRODUCTION'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR ANY CLAIM THAT CANNOT LAWFULLY BE RELEASED.`,
  review: "Liability waiver: Texas requires releases of negligence to meet the express-negligence and conspicuousness (fair notice) rules. Confirm the wording, the capitalised text, and whether insurance should replace or supplement this clause.",
});

const ESIGN = (who: string): Clause => ({
  title: "Electronic Records & Signatures",
  text: `${who} agrees to receive and sign this Agreement electronically. A typed or drawn electronic signature, applied after verifying ${who}'s email address, is ${who}'s legal signature and has the same effect as a handwritten one under the federal E-SIGN Act and the Texas Uniform Electronic Transactions Act. ${who} may request a paper copy at any time by emailing studio@bleuskm.com and may withdraw consent to electronic records for future documents the same way. ${who} will receive a signed copy of this Agreement by email.`,
});

const GENERAL: Clause = {
  title: "General Terms",
  text: "This Agreement is the entire agreement between the parties about its subject and replaces any earlier discussions. It may be changed only in a writing signed by both parties. If any part is found unenforceable, the rest remains in effect. This Agreement is governed by the laws of the State of Texas, and any dispute will be resolved in the state or federal courts located in Denton County, Texas.",
};

const NO_OBLIGATION = (who: string): Clause => ({
  title: "No Obligation to Use",
  text: `Production is not required to use ${who}'s services, performance or contributions in the Film, or to complete, release or distribute the Film.`,
});

const UNION = (who: string): Clause => ({
  title: "Union Status",
  text: `${who} confirms whether they are a member of any union or guild (such as SAG-AFTRA, IATSE or the DGA) by telling Production before signing. If ${who} is a member, this Agreement does not take effect until Production confirms in writing that the engagement complies with that union's rules (for example, under an appropriate low-budget or short-project agreement).`,
  review: "Union rules: if any participant is a SAG-AFTRA (or other guild) member, the production may need a signatory agreement; members may be barred from non-union work.",
});

const RIGHTS = (who: string, what: string): Clause => ({
  title: "Grant of Rights",
  text: `${who} grants Production, its licensees and assigns an irrevocable, perpetual, worldwide, royalty-free right to record, edit and use ${what}, and ${who}'s name, approved likeness and biography in connection with them, in the Film and in all versions, trailers, promotion, publicity, festival submissions, distribution and archives, in any media now known or later developed. ${who} may use clips and stills of their own work for a personal portfolio, reel or website after the Film's first public release (or earlier with Production's written consent), with credit to BLEUSKM Studios.`,
  review: "Intellectual property: confirm the scope (perpetual, worldwide, all media) and the portfolio carve-out are what BLEUSKM wants to offer.",
});

const WORK_PRODUCT = (who: string): Clause => ({
  title: "Ownership of Work",
  text: `All results and proceeds of ${who}'s services on the Film, including footage, designs, documents and other materials created for it, are owned by Production. To the extent allowed by law they are "works made for hire" for Production; to the extent they are not, ${who} assigns to Production all rights in them, including copyright, and waives any moral rights. ${who} keeps ownership of their pre-existing tools, templates and know-how, and grants Production a perpetual licence to any of them incorporated into the Film.`,
  review: "Work for hire: an unpaid, non-employee contribution may not qualify as a work made for hire under US copyright law; the assignment backs it up. Confirm with an attorney.",
});

const WARRANTY = (who: string): Clause => ({
  title: "Warranties",
  text: `${who} confirms they are at least 18 years old (unless a parent or guardian signs below), have the right to enter this Agreement, and have no commitment that conflicts with it.`,
});

const DATES: Clause = {
  title: "Schedule & Locations",
  text: "Shoot dates: {{shoot_dates}}. Locations: {{locations}}. Production will share call times and the call sheet in advance. Dates may change; Production will give as much notice as reasonably possible, and the participant may decline new dates that conflict with prior commitments.",
};

const SIGN_NOTE = "By signing, each party confirms they have read, understood and agreed to all terms of this Agreement.";
export { SIGN_NOTE };

// ---------------------------------------------------------------------------
// The templates
// ---------------------------------------------------------------------------
const party = (...p: [string, string][]) => p.map(([label, field]) => ({ label, field }));

export const LIBRARY: readonly TemplateDef[] = [
  {
    key: "actor_principal", name: "Principal & Supporting Actor Agreement", audience: "cast", identity: "casting",
    title: "Actor Agreement", docLabel: "Cast / Performer Agreement", signerLabel: "Actor",
    party: party(["Name", "recipient_name"], ["Character", "role"], ["Project", "production_title"], ["Shoot Dates", "shoot_dates"]),
    required: ["recipient_name", "production_title", "role"],
    clauses: [
      { title: "Parties", text: P("Actor") },
      { title: "Role & Services", text: "Actor will portray the character of {{role}} and perform the services reasonably required for that role, including scheduled rehearsals, table reads, fittings, production days and any reasonable additional sessions (such as pickups or ADR). Additional terms: {{permissions}}" },
      DATES,
      UNPAID("Actor"),
      IMDB("Actor", "their performance"),
      RIGHTS("Actor", "Actor's performance, voice and likeness as recorded for the Film"),
      { title: "Nudity, Intimacy & Stunts", text: "No nudity, simulated sex or intimate scene will be filmed unless it is described in writing and Actor consents in a separate written rider before filming. Any stunt or hazardous activity will be described in advance, supervised appropriately, and may be performed by a double. Actor may decline any such activity." },
      CONFIDENTIAL("Actor"),
      CONDUCT("Actor"),
      RISK("Actor"),
      INDEPENDENT("Actor"),
      UNION("Actor"),
      NO_OBLIGATION("Actor"),
      WARRANTY("Actor"),
      ESIGN("Actor"),
      GENERAL,
    ],
    review: [
      "Unpaid participation (FLSA and Texas law), especially if BLEUSKM is a for-profit company or the film earns revenue.",
      "Union members: SAG-AFTRA performers may need a signatory agreement (e.g. Short Project or Micro-Budget).",
      "Liability release wording under Texas fair-notice rules; consider production insurance.",
      "Name, likeness and voice rights scope; portfolio carve-out timing.",
      "Changed from the live agreement: IMDb wording corrected; sections 5 and 6 (grant of rights, media usage) merged to remove duplication; added schedule, nudity/intimacy/stunts, independent status, union status, no-obligation and general terms; the release now excludes gross negligence and wilful misconduct.",
    ],
  },
  {
    key: "background_performer", name: "Background Performer & Extra Agreement", audience: "cast", identity: "casting",
    title: "Background Performer Agreement", docLabel: "Background / Extra Agreement", signerLabel: "Performer",
    party: party(["Name", "recipient_name"], ["Project", "production_title"], ["Shoot Dates", "shoot_dates"], ["Location", "locations"]),
    required: ["recipient_name", "production_title"],
    clauses: [
      { title: "Parties", text: P("Performer") },
      { title: "Services", text: "Performer will appear as a background performer (extra) in scenes directed by Production on the dates below, follow wardrobe and continuity instructions, and remain available for the scheduled call. Notes: {{permissions}}" },
      DATES,
      UNPAID("Performer"),
      IMDB("Performer", "their background work where IMDb's rules allow background credits"),
      RIGHTS("Performer", "Performer's appearance, voice and likeness as recorded for the Film"),
      CONFIDENTIAL("Performer"),
      CONDUCT("Performer"),
      RISK("Performer"),
      NO_OBLIGATION("Performer"),
      WARRANTY("Performer"),
      ESIGN("Performer"),
      GENERAL,
    ],
    review: [
      "IMDb does not always accept background credits; the wording reflects that.",
      "Unpaid participation and liability release (as for actors).",
      "Union background performers (SAG-AFTRA) in covered zones.",
    ],
  },
  {
    key: "crew_general", name: "Crew Member Agreement", audience: "crew", identity: "crew",
    title: "Crew Agreement", docLabel: "Crew Member Agreement", signerLabel: "Crew Member",
    party: party(["Name", "recipient_name"], ["Position", "role"], ["Department", "department"], ["Project", "production_title"], ["Shoot Dates", "shoot_dates"]),
    required: ["recipient_name", "production_title", "role"],
    clauses: [
      { title: "Parties", text: P("Crew Member") },
      { title: "Position & Duties", text: "Crew Member will serve as {{role}} in the {{department}} department, reporting to the department head or producer, and perform the duties customary for that position, including: {{responsibilities}}" },
      DATES,
      UNPAID("Crew Member"),
      IMDB("Crew Member", "their work in their position"),
      WORK_PRODUCT("Crew Member"),
      { title: "Equipment & Property", text: "Crew Member will use Production's and others' equipment with reasonable care and only for the Film. Any personal equipment Crew Member brings is at their own risk unless Production agrees otherwise in a signed equipment loan agreement." },
      CONFIDENTIAL("Crew Member"),
      CONDUCT("Crew Member"),
      RISK("Crew Member"),
      INDEPENDENT("Crew Member"),
      UNION("Crew Member"),
      NO_OBLIGATION("Crew Member"),
      WARRANTY("Crew Member"),
      ESIGN("Crew Member"),
      GENERAL,
    ],
    review: [
      "Unpaid crew and worker classification (crew follow schedules and direction, which weighs toward employment).",
      "Work-made-for-hire and assignment of crew contributions.",
      "IATSE or other union members.",
      "Liability release and personal-equipment risk.",
    ],
  },
  {
    key: "crew_key", name: "Department Head & Key Crew Agreement", audience: "crew", identity: "crew",
    title: "Key Crew Agreement", docLabel: "Department Head Agreement", signerLabel: "Department Head",
    party: party(["Name", "recipient_name"], ["Position", "role"], ["Department", "department"], ["Project", "production_title"], ["Shoot Dates", "shoot_dates"]),
    required: ["recipient_name", "production_title", "role", "department"],
    clauses: [
      { title: "Parties", text: P("Department Head") },
      { title: "Position & Responsibilities", text: "Department Head will serve as {{role}} and lead the {{department}} department through preparation, production and wrap, including: {{responsibilities}}. Department Head will recommend crew for the department, plan the department's needs within the resources Production approves, and keep the producer informed of schedule, safety and resource issues." },
      { title: "Authority & Approvals", text: "Department Head may not hire, commit funds, sign agreements or make purchases on Production's behalf without the producer's prior written approval. Crew recommended by Department Head join the Film only after signing their own agreement with Production." },
      DATES,
      UNPAID("Department Head"),
      IMDB("Department Head", "their role leading the department"),
      WORK_PRODUCT("Department Head"),
      { title: "Safety Leadership", text: "Department Head is responsible for the safe working practices of their department, including equipment checks, rigging and electrical safety where relevant, and stopping work that is unsafe. Department Head will report incidents to the producer the same day." },
      CONFIDENTIAL("Department Head"),
      CONDUCT("Department Head"),
      RISK("Department Head"),
      INDEPENDENT("Department Head"),
      UNION("Department Head"),
      NO_OBLIGATION("Department Head"),
      WARRANTY("Department Head"),
      ESIGN("Department Head"),
      GENERAL,
    ],
    review: [
      "Supervisory duties make worker classification more sensitive for unpaid key crew.",
      "Safety responsibility: confirm it does not shift Production's own legal duties onto a volunteer.",
      "Authority limits and approvals.",
    ],
  },
  {
    key: "producer", name: "Producer & Production Coordinator Agreement", audience: "crew", identity: "crew",
    title: "Producer Agreement", docLabel: "Producer / Coordinator Agreement", signerLabel: "Producer",
    party: party(["Name", "recipient_name"], ["Title", "role"], ["Project", "production_title"], ["Term", "shoot_dates"]),
    required: ["recipient_name", "production_title", "role"],
    clauses: [
      { title: "Parties", text: P("Producer") },
      { title: "Title & Services", text: "Producer will serve as {{role}} on the Film and provide producing or coordination services as directed by BLEUSKM Studios, including: {{responsibilities}}" },
      { title: "Authority", text: "Producer may communicate with cast, crew, locations and vendors on Production's behalf for scheduling and logistics. Producer may not sign agreements, commit funds, grant rights or make public statements for BLEUSKM Studios without prior written approval from {{studio_rep_name}}. All agreements are issued and signed by BLEUSKM Studios." },
      { title: "Term", text: "Producer's services run from the effective date through delivery of the Film or an earlier date set by Production in writing. Schedule: {{shoot_dates}}." },
      UNPAID("Producer"),
      IMDB("Producer", "their producing or coordination work, under the credit title agreed in writing"),
      WORK_PRODUCT("Producer"),
      { title: "Data & Records", text: "Producer will keep cast, crew and applicant information private, use it only for the Film, store production records in BLEUSKM Studio OS, and return or delete copies at the end of their services." },
      CONFIDENTIAL("Producer"),
      CONDUCT("Producer"),
      RISK("Producer"),
      INDEPENDENT("Producer"),
      NO_OBLIGATION("Producer"),
      WARRANTY("Producer"),
      ESIGN("Producer"),
      GENERAL,
    ],
    review: [
      "Producer credit titles (Producers Guild conventions) and whether any back-end or deferred compensation is promised elsewhere.",
      "Authority limits and handling of personal data.",
      "Unpaid services and classification.",
    ],
  },
  {
    key: "nda", name: "Confidentiality & Nondisclosure Agreement", audience: "other", identity: "studio",
    title: "Confidentiality Agreement", docLabel: "Nondisclosure Agreement", signerLabel: "Recipient",
    party: party(["Name", "recipient_name"], ["Project", "production_title"], ["Effective", "effective_date"]),
    required: ["recipient_name", "production_title"],
    clauses: [
      { title: "Parties", text: P("Recipient") },
      { title: "Purpose", text: "BLEUSKM Studios will share confidential information with Recipient for this purpose: {{purpose}}" },
      { title: "Confidential Information", text: "Confidential information means all non-public information about the Film and BLEUSKM Studios that Recipient receives, including scripts, treatments, story and character details, casting, budgets, schedules, locations, footage, business plans and the personal information of cast and crew. It does not include information that is or becomes public through no fault of Recipient, that Recipient already lawfully knew, or that Recipient independently develops." },
      { title: "Obligations", text: "Recipient will use confidential information only for the purpose above, protect it with reasonable care, share it only with people who need it for that purpose and are bound by similar obligations, not copy or post it, and return or destroy it on request. Recipient may disclose information when required by law, after giving BLEUSKM Studios prompt notice where allowed." },
      { title: "Term", text: "These obligations last for five (5) years from the effective date, and for personal information and unreleased story details until BLEUSKM Studios makes them public." },
      { title: "Remedies", text: "Unauthorized disclosure could cause harm that money cannot fully repair, so BLEUSKM Studios may seek an injunction in addition to any other remedy." },
      { title: "Whistleblower & Workplace Notice", text: "Nothing in this Agreement stops Recipient from reporting possible violations of law to a government agency, or from discussing or disclosing information about unlawful acts in the workplace such as harassment or discrimination." },
      ESIGN("Recipient"),
      GENERAL,
    ],
    review: [
      "Term length and the injunction clause.",
      "Required carve-outs (federal Defend Trade Secrets Act notice, Speak Out Act and similar rules on harassment disclosures).",
    ],
  },
  {
    key: "likeness_release", name: "Appearance & Likeness Release", audience: "other", identity: "studio",
    title: "Appearance Release", docLabel: "Appearance & Likeness Release", signerLabel: "Participant",
    party: party(["Name", "recipient_name"], ["Project", "production_title"], ["Date", "shoot_dates"], ["Location", "locations"]),
    required: ["recipient_name", "production_title"],
    clauses: [
      { title: "Parties", text: P("Participant") },
      { title: "Appearance", text: "Participant agrees to appear, and to be photographed and recorded, in connection with the Film, including behind-the-scenes, interview and promotional content, on or around: {{shoot_dates}}, at: {{locations}}." },
      { title: "Grant of Rights", text: "Participant grants Production, its licensees and assigns the irrevocable, perpetual, worldwide right to use Participant's name, image, likeness, voice and appearance as recorded, in the Film, its promotion, behind-the-scenes and press materials, festival submissions and distribution, in any media now known or later developed, without further payment. Production may edit the recordings but will not use them in a way that is defamatory or presents Participant in a false light." },
      UNPAID("Participant"),
      { title: "Release", text: "Participant releases Production from claims for invasion of privacy, right of publicity or defamation arising from uses allowed by this release, except claims for uses this release does not allow." },
      WARRANTY("Participant"),
      ESIGN("Participant"),
      GENERAL,
    ],
    review: [
      "Right of publicity (Texas Property Code ch. 26 for deceased individuals; common law for living people).",
      "Use limits (false light, endorsement) and minors (use the Minor Performer Agreement with a guardian instead).",
    ],
  },
  {
    key: "location_release", name: "Location Release", audience: "other", identity: "studio",
    title: "Location Release", docLabel: "Location Agreement", signerLabel: "Owner",
    party: party(["Owner / Agent", "recipient_name"], ["Project", "production_title"], ["Property", "property_address"], ["Dates", "access_dates"]),
    required: ["recipient_name", "production_title", "property_address"],
    clauses: [
      { title: "Parties", text: P("Owner", ", the owner or authorized agent of the property described below") },
      { title: "Property & Access", text: "Owner grants Production, its cast, crew, vehicles and equipment the right to enter and use the property at {{property_address}} (the \"Property\") to prepare, film and restore, on: {{access_dates}}. Areas, parking and house rules: {{permissions}}" },
      { title: "Fee", text: "Location fee: {{compensation}}. Unless a fee is stated, Owner grants access without charge." },
      { title: "Rights in Footage", text: "Production owns all footage and photographs taken at the Property and may use them, including the Property's appearance, name (unless Owner asks in writing that it not be named), signs and address, in the Film and its promotion and distribution, in any media, perpetually and worldwide. Production may depict the Property as a fictional place." },
      { title: "Care & Restoration", text: "Production will use reasonable care, follow the house rules above, and leave the Property in the condition it was found, normal wear excepted. Owner and Production will note any existing damage before filming. Production will repair or pay the reasonable cost of repairing physical damage caused by Production, if Owner reports it in writing within ten (10) days after the last access date." },
      { title: "Insurance & Responsibility", text: "Production will tell Owner before filming whether it carries production insurance and, if so, provide a certificate on request. Production is responsible for injuries to its own cast and crew caused by Production's activities, except those caused by a hidden hazard Owner knew of and did not disclose." },
      { title: "Authority", text: "Owner confirms they own the Property or are authorized by its owner to sign this release, and that no other permission (such as a landlord, HOA or city permit) is needed, or that Owner has told Production what is needed." },
      ESIGN("Owner"),
      GENERAL,
    ],
    review: [
      "Insurance: most locations require a certificate of insurance; decide whether to buy short-term production insurance.",
      "Damage claim window and responsibility allocation.",
      "City film permits (Denton, Dallas, Fort Worth) for street or public-property filming.",
    ],
  },
  {
    key: "ip_release", name: "Music, Artwork & Materials License", audience: "other", identity: "studio",
    title: "Materials License", docLabel: "Music, Artwork & IP License", signerLabel: "Licensor",
    party: party(["Licensor", "recipient_name"], ["Project", "production_title"], ["Effective", "effective_date"]),
    required: ["recipient_name", "production_title", "materials"],
    clauses: [
      { title: "Parties", text: P("Licensor") },
      { title: "Materials", text: "Licensor licenses the following works to Production (the \"Materials\"): {{materials}}" },
      { title: "License", text: "Licensor grants Production a non-exclusive, irrevocable, perpetual, worldwide license to reproduce, synchronize, edit, display and perform the Materials in the Film, its trailers and promotion, festival submissions and distribution, in any media now known or later developed. For music, this covers both the composition and the master recording if Licensor controls both; if not, Licensor will identify the other rights holders below." },
      { title: "Fee", text: "License fee: {{compensation}}. Unless a fee is stated, the license is granted without charge." },
      IMDB("Licensor", "the Materials (in a music, art or special-thanks credit as appropriate)"),
      { title: "Licensor's Warranties", text: "Licensor confirms they own or control all rights needed to grant this license, that the Materials are original or properly cleared (including any samples, featured performers or third-party artwork), and that Production's use as allowed here will not infringe anyone's rights. Other rights holders, collecting societies (e.g. ASCAP, BMI) or restrictions: {{permissions}}" },
      { title: "Ownership", text: "Licensor keeps ownership of the Materials. Production owns the Film." },
      ESIGN("Licensor"),
      GENERAL,
    ],
    review: [
      "Music needs both sync (composition) and master-use rights; performing-rights societies still collect public performance royalties.",
      "Indemnity for infringement claims (not included; consider adding).",
      "Exclusive versus non-exclusive terms for commissioned work (use a commissioning agreement instead).",
    ],
  },
  {
    key: "equipment_loan", name: "Equipment Loan Agreement", audience: "other", identity: "crew",
    title: "Equipment Loan Agreement", docLabel: "Equipment Loan", signerLabel: "Lender",
    party: party(["Lender", "recipient_name"], ["Project", "production_title"], ["Return by", "return_date"]),
    required: ["recipient_name", "production_title", "equipment_list"],
    clauses: [
      { title: "Parties", text: P("Lender") },
      { title: "Equipment", text: "Lender loans Production the following equipment (the \"Equipment\"): {{equipment_list}}. Stated replacement value: {{equipment_value}}." },
      { title: "Loan Period", text: "From pickup or delivery for the Film's preparation and shoot ({{shoot_dates}}) until return on or before {{return_date}}. Fee: {{compensation}}. Unless a fee is stated, the loan is free of charge." },
      { title: "Condition & Care", text: "Lender and Production will record the Equipment's condition (photos or notes) at handover and return. Production will use it with reasonable care, by people competent to operate it, and only for the Film." },
      { title: "Loss & Damage", text: "Production will repair, or pay the reasonable cost of repairing, damage beyond normal wear that happens while the Equipment is in Production's care, up to the stated replacement value, and will replace or pay that value for Equipment lost or stolen in Production's care, unless the loss is caused by Lender or by a defect in the Equipment." },
      { title: "Credit", text: "If Lender wishes, Production will thank Lender in the Film's credits where Production gives such credits; see also the credit commitments in any crew agreement Lender signs." },
      ESIGN("Lender"),
      GENERAL,
    ],
    review: [
      "Production's exposure for loss or damage (consider equipment insurance or limiting liability).",
      "Equipment that comes with an operator: the operator also signs a crew agreement.",
    ],
  },
  {
    key: "minor_performer", name: "Minor Performer Agreement (Parent or Guardian)", audience: "cast", identity: "casting",
    title: "Minor Performer Agreement", docLabel: "Minor Performer Agreement", signerLabel: "Parent or Legal Guardian",
    party: party(["Performer", "recipient_name"], ["Guardian", "guardian_name"], ["Character", "role"], ["Project", "production_title"], ["Shoot Dates", "shoot_dates"]),
    required: ["recipient_name", "guardian_name", "minor_birthdate", "production_title", "role"],
    clauses: [
      { title: "Parties", text: "This Agreement is entered into between BLEUSKM Studios, an independent film production company based in Denton, Texas (\"Production\"), and {{guardian_name}} (\"Guardian\"), the parent or legal guardian of {{recipient_name}}, born {{minor_birthdate}} (\"Performer\"), in connection with the production currently titled {{production_title}} (the \"Film\"). It takes effect on {{effective_date}}." },
      { title: "Role & Services", text: "Guardian consents to Performer portraying {{role}} and taking part in rehearsals and production days. Additional terms: {{permissions}}" },
      { title: "Supervision & Welfare", text: "A parent or legal guardian (or an adult Guardian designates in writing) will be present and within sight or sound of Performer at all times on set. Production will keep work hours appropriate to Performer's age and schooling, provide rest and meal breaks, and never require Performer to take part in nudity, sexual content, or dangerous activity. Guardian may stop Performer's participation at any time for Performer's welfare." },
      { title: "Hours & Schooling", text: "Production will schedule Performer's work outside school hours where possible and follow all applicable Texas child-labor rules and any permits they require. Schedule: {{shoot_dates}}." },
      DATES,
      UNPAID("Performer"),
      IMDB("Performer", "their performance"),
      RIGHTS("Performer", "Performer's performance, voice and likeness as recorded for the Film"),
      { title: "Guardian's Authority", text: "Guardian confirms they are Performer's parent or legal guardian with authority to sign for Performer, and agrees on Performer's behalf to the confidentiality, conduct and other terms of this Agreement." },
      CONFIDENTIAL("Guardian and Performer"),
      RISK("Guardian, for themselves and Performer,"),
      ESIGN("Guardian"),
      GENERAL,
    ],
    review: [
      "REQUIRED before casting any minor: attorney review of Texas child-labor rules for performers, any permits, work-hour limits and on-set teacher requirements.",
      "Releases signed by a parent for a minor may not be enforceable for future negligence claims; confirm insurance.",
      "Rights granted by a guardian: a minor may be able to disaffirm some contracts; consider court approval for significant engagements.",
      "Verify the guardian's identity and authority (e.g. ID check) before filming.",
    ],
  },
];

export function templateByKey(key: string): TemplateDef | undefined {
  return LIBRARY.find((t) => t.key === key);
}

/** Every {{field}} a template uses. */
export function templateFields(t: Pick<TemplateDef, "clauses" | "party" | "required">): string[] {
  const out = new Set<string>(t.required);
  for (const p of t.party) out.add(p.field);
  for (const c of t.clauses) for (const m of c.text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}
