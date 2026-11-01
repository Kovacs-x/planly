-- Fitness › Body: let the body-import Edge Function save weigh-ins (1 Nov 2026).
--
-- body-import (058) saves a Shortcut's weigh-ins with the server-only service_role, which bypasses RLS but still
-- needs table rights. planly_body_weights (056) only granted rights to authenticated, so the first real import failed
-- with "permission denied" (403) after the key was accepted. This grants service_role exactly what the function
-- uses: INSERT (… on conflict do nothing) and SELECT (return=representation). No other role, policy or row changes;
-- the browser roles (anon, authenticated) are untouched, and service_role keys never reach the browser.

grant select, insert on public.planly_body_weights to service_role;
