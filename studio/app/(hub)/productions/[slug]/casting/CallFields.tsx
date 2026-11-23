import { Submit } from "@/components/hub/HubForm";
import { CALL_STATUSES, CALL_STATUS_LABEL, ROLE_STATUSES, ROLE_STATUS_LABEL, isoToStudioLocal } from "@/lib/hub/casting-core";
import type { CastingCall, CastingRole } from "@/lib/hub/casting-data";

export function CallFields({ c, productionId, defaultSlug, returnTo }: { c?: CastingCall; productionId: string; defaultSlug: string; returnTo: string }) {
  return (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <input type="hidden" name="production_id" value={productionId} />
      <input type="hidden" name="return_to" value={returnTo} />
      <label className="field wide"><span>Title</span><input name="title" required maxLength={160} defaultValue={c?.title ?? ""} placeholder="e.g. Love Me Like This: Lead roles" /></label>
      <label className="field"><span>Status</span>
        <select name="status" defaultValue={c?.status ?? "draft"}>
          {CALL_STATUSES.map((s) => <option key={s} value={s}>{CALL_STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="field"><span>Website address key</span><input name="public_slug" maxLength={60} defaultValue={c?.public_slug ?? defaultSlug} /></label>
      <label className="field"><span>Opens (Central time, optional)</span><input type="datetime-local" name="opens_at" defaultValue={isoToStudioLocal(c?.opens_at)} /></label>
      <label className="field"><span>Submission deadline (Central time)</span><input type="datetime-local" name="deadline" defaultValue={isoToStudioLocal(c?.deadline)} /></label>
      <label className="field wide"><span>Early-access codes (optional, comma separated, e.g. TFH-FAMILY, LMLT-FIRST). Before the opening time, only people with a code link can apply.</span><input name="early_access_codes" maxLength={500} defaultValue={(c?.early_access_codes ?? []).join(", ")} /></label>
      <label className="field wide"><span>Short summary (shown on the website)</span><textarea name="summary" rows={2} maxLength={2000} defaultValue={c?.summary ?? ""} /></label>
      <label className="field wide"><span>Description</span><textarea name="description" rows={4} maxLength={20000} defaultValue={c?.description ?? ""} /></label>
      <label className="field wide"><span>Requirements for everyone (one per line)</span><textarea name="requirements" rows={3} maxLength={20000} defaultValue={c?.requirements ?? ""} /></label>
      <label className="field wide"><span>Submission instructions</span><textarea name="instructions" rows={3} maxLength={5000} defaultValue={c?.instructions ?? ""} placeholder="e.g. Upload a recent headshot and resume. Reels and self-tapes as links." /></label>
      <label className="field"><span>Shoot location</span><input name="location" maxLength={300} defaultValue={c?.location ?? ""} /></label>
      <label className="field"><span>Compensation</span><input name="compensation" maxLength={500} defaultValue={c?.compensation ?? ""} /></label>
      <div className="wide"><Submit>{c ? "Save casting call" : "Create casting call"}</Submit></div>
    </>
  );
}

export function RoleFields({ r, callId, productionId, nextSort }: { r?: CastingRole; callId: string; productionId: string; nextSort: number }) {
  return (
    <>
      {r && <input type="hidden" name="id" value={r.id} />}
      <input type="hidden" name="call_id" value={callId} />
      <input type="hidden" name="production_id" value={productionId} />
      <label className="field"><span>Role name</span><input name="name" required maxLength={120} defaultValue={r?.name ?? ""} /></label>
      <label className="field"><span>Type and casting line</span><input name="role_type" maxLength={120} defaultValue={r?.role_type ?? ""} placeholder="e.g. Male Lead · Black American Male" /></label>
      <label className="field"><span>Age from</span><input name="age_min" inputMode="numeric" defaultValue={r?.age_min ?? ""} /></label>
      <label className="field"><span>Age to</span><input name="age_max" inputMode="numeric" defaultValue={r?.age_max ?? ""} /></label>
      <label className="field"><span>Status</span>
        <select name="status" defaultValue={r?.status ?? "open"}>
          {ROLE_STATUSES.map((s) => <option key={s} value={s}>{ROLE_STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="field"><span>Own deadline (optional, Central)</span><input type="datetime-local" name="deadline" defaultValue={isoToStudioLocal(r?.deadline)} /></label>
      <label className="field wide"><span>Summary</span><textarea name="summary" rows={2} maxLength={2000} defaultValue={r?.summary ?? ""} /></label>
      <label className="field wide"><span>Character breakdown</span><textarea name="description" rows={4} maxLength={10000} defaultValue={r?.description ?? ""} /></label>
      <label className="field wide"><span>Seeking (one per line)</span><textarea name="requirements" rows={4} maxLength={10000} defaultValue={r?.requirements ?? ""} /></label>
      <label className="field"><span>Order on the page</span><input name="sort" inputMode="numeric" defaultValue={r?.sort ?? nextSort} /></label>
      <div className="wide"><Submit>{r ? "Save role" : "Add role"}</Submit></div>
    </>
  );
}
