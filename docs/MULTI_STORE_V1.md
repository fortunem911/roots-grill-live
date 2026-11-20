# Roots Grill Cloud — Multi-Store Control V1

Status: agreed product rules; implementation pending. Existing live landscape/portrait players must remain unchanged until tested.

## Exactly three playback modes
1. HEAD_OFFICE (default for every new store): screens use Head Office's assigned playlist.
2. LOCAL: screens use only that store's playlist. Only Head Office may approve/change a store's mode.
3. EMERGENCY (temporary override): Head Office can target any store or all stores, regardless of their normal mode. On expiry or manual stop, each store resumes its previous mode.

No blended playlists, percentage allocation, or mandatory national slots in V1.

## Control and roles
- Head Office admin: sees every store and screen; creates stores; approves local mode; assigns and revokes normal national distribution; starts/stops targeted emergency broadcasts; can see playback and connectivity status.
- Store admin: manages only own local media and screens; can request Local mode but cannot activate it, change another store, or suppress emergency content.
- New stores default to HEAD_OFFICE and appear in Head Office directory.
- Excluded/local stores can still receive Head Office emergency broadcasts.

## Monitoring
- Each registered screen has a unique identity and a scoped credential (not a shared admin password).
- Screen reports periodic heartbeat: last_seen, store_id, screen_id, active_media_id, playback_mode, optional player error/stall metrics.
- Head Office panel shows Online/Offline based on recent heartbeat, current reported item, and last contact.
- Online means reporting, not proof of smooth video playback; track playback health separately.
- Never display demo/sample monitoring values as real telemetry.

## Suggested incremental implementation
1. Store and screen identity schema; RLS and secure screen registration; preserve existing two screens.
2. Heartbeat endpoint and compact Head Office monitor; validate on the current landscape and portrait screens.
3. Store accounts and isolated media ownership; new stores default to HEAD_OFFICE.
4. Explicit mode switch with Head Office approval; playlist resolution at the Edge Function.
5. Emergency broadcast targeting and automatic reversion, with audit history.

## Technical guardrails
- Keep current dashboard and screen URLs stable; migrate existing display identities without requiring new bookmarks.
- Do not trust store IDs, roles, or screen IDs supplied by browser clients without authorization.
- Enforce store isolation and Head Office permissions at database/API level, not only in UI.
- Never expose Supabase service-role credentials to browsers.
- Plan emergency override priority and safe fallback for offline screens.
- Continue video optimization, TV compatibility and offline resilience as separate improvements.
