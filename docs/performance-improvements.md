# Performance Improvements

## Home Screen (My Clubs) slow load — ~10s on cold start

**Root cause:** 3 sequential Firestore round-trips before the clubs list appears.
Each cold-connection request can take 1–3 seconds.

```
1. initializeUserDocs()  →  getDoc('users/{uid}')             [blocks setInitialized]
2. getUserClubsWithRoles →  getDoc('userMemberships/{uid}')   [gets clubIds]
3. Promise.all           →  getDoc('clubs/{id}') × N
                         +  getDoc('clubs/{id}/players/{uid}') × N
```

---

### Fix 1 — Fire-and-forget `initializeUserDocs` (easy, no schema change)

**File:** `src/hooks/useAuthListener.ts`

`initializeUserDocs` is awaited before `setInitialized(true)`, which means the
clubs query cannot start until a Firestore read (and possible write for new users)
completes. For returning users the write never runs, so we're just paying for
an unnecessary sequential read.

Change:
```ts
// Before
await initializeUserDocs(user);
setUser(user);
setInitialized(true);

// After
if (user) initializeUserDocs(user);  // fire-and-forget, only matters for new users
setUser(user);
setInitialized(true);
```

Expected gain: removes one full sequential round-trip, ~1–3s off worst case.
Risk: none — `initializeUserDocs` is a no-op for existing users (doc already exists).

---

### Fix 2 — Denormalize role into `userMemberships` (bigger, schema change)

**Files:** `src/services/clubService.ts`, `src/services/authService.ts`, Cloud Function `resolveJoinRequest`

Currently `getUserClubsWithRoles` reads the player subcollection doc for each
club just to check `role === 'admin'`. Storing roles in `userMemberships` itself
eliminates those N reads and collapses the fan-out to a single doc read.

**New shape:**
```
userMemberships/{uid}: {
  clubIds: ["clubA", "clubB"],
  roles: { "clubA": "admin", "clubB": "member" }
}
```

**Migration concern:** Existing docs don't have `roles`. Need a fallback:
```ts
const roles = membershipSnap.data().roles ?? {};
```
Without a backfill, existing users will appear as non-admin until their doc is
updated. Options:
- Lazy backfill: write `roles` on first read if absent (one extra write, once per user)
- Script backfill: run a one-time migration against all `userMemberships` docs

**Places that must also write `roles` to stay in sync:**

| Event | File |
|---|---|
| User creates a club | `clubService.ts:createClub` — add `roles.{clubId}: 'admin'` |
| Join request approved | Cloud Function `resolveJoinRequest` — add `roles.{clubId}: 'member'` |
| Admin changes member role | `clubService.ts:setMemberRole` — update `userMemberships/{uid}.roles.{clubId}` |
| User first signs up | `authService.ts:initializeUserDocs` — set `roles: {}` |

Expected gain: removes the N player subcollection reads, ~1–3s off depending on club count.
Risk: medium — multiple write paths to keep in sync, Cloud Function needs updating.

---

### Fix 3 — Add `staleTime` to the clubs React Query (easy, no schema change)

**File:** `src/screens/Home/index.tsx`

Default `staleTime` is 0ms, so every time the user returns to the home tab the
clubs list refetches. Adding a stale window avoids redundant fetches during a
session.

```ts
const { data: clubsWithRoles, isLoading } = useQuery({
  queryKey: ['clubsWithRoles', user?.uid],
  queryFn: () => getUserClubsWithRoles(user!.uid),
  enabled: !!user,
  staleTime: 5 * 60 * 1000,  // treat data as fresh for 5 minutes
});
```

Expected gain: eliminates refetches on tab re-focus within a session.
Risk: low — user won't see a newly created club for up to 5 minutes unless they
hard-refresh. Can invalidate the query manually after `createClub` to mitigate.
