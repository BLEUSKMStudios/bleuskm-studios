/* Studio OS public casting settings. These are public values by design: the
 * publishable key only reaches what Row Level Security allows signed-out
 * visitors (read an open casting call, apply, upload into their own folder). */
window.BLEUSKM_CASTING = {
  supabaseUrl: 'https://diuexvyahrpmujkctlzl.supabase.co',
  publishableKey: 'sb_publishable_e6sIK_fC3LRv_u5n9DiGow_Z6YbnQwP',
  // Studio OS address used for the Airtable "Headshot" link of an uploaded headshot.
  // The link only opens for signed-in Studio OS users with Casting access.
  hubUrl: /(^|\.)bleuskm\.com$/.test(location.hostname)
    ? 'https://bleuskm-studio-os.vercel.app'
    : 'https://bleuskm-studio-os-git-claude-pro-c625c7-bleuskmstudios-projects.vercel.app'
};
