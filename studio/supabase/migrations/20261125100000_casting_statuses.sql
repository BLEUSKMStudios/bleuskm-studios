-- Casting pipeline statuses: New → Reviewing → Shortlisted → Self-Tape
-- Invited → Self-Tape Received → Callback → Selected / Declined.
-- Added on their own (Postgres needs a new enum value committed before use).
-- Existing values and rows are unchanged: "submitted" is shown as New and
-- "not_selected" as Declined.
alter type public.casting_application_status add value if not exists 'selftape_invited' after 'shortlisted';
alter type public.casting_application_status add value if not exists 'selftape_received' after 'selftape_invited';
alter type public.casting_application_status add value if not exists 'selected' after 'audition';
