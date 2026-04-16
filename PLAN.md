Summary: Fix repo selector performance and search quality by replacing live GitHub paging on every query with a user-scoped cached repo index. The cache will be keyed by user and installation so search stays fast without widening repository visibility across users.

Context:
- The current selector flow is `repo-selector(-compact)` -> `useInstallationRepos` -> `/api/github/installations/repos` -> `listUserInstallationRepositories`.
- `apps/web/lib/github/installation-repos.ts` currently pages `GET /user/installations/{installationId}/repositories` with the user's OAuth token and filters in memory.
- That implementation is slow because each search can require multiple sequential GitHub requests.
- Search quality is poor because paging stops once enough matches are found, so results depend on early pages rather than the full accessible repo set.
- The current security boundary is correct: GitHub computes the intersection of app installation access and that specific user's repo access. A shared installation-level cache would break that boundary.
- `apps/web/components/repo-selector-compact.tsx` additionally re-sorts results client-side, which would override any future server-side ranking.
- Installation webhook handling already updates installation metadata in `apps/web/app/api/github/webhook/route.ts`, which is the right place to mark repo caches stale when access changes.

System Impact:
- Part of the system changing: repo discovery for the selector, not installation ownership or GitHub auth.
- Source of truth before: live GitHub responses per search request.
- Source of truth after: a per-user cached snapshot of repos derived from GitHub, refreshed from the same user-scoped GitHub endpoint.
- New state/invariants:
  - Repo cache rows must always belong to a single `userId` and `installationId`.
  - Reads must only return repos after verifying the installation belongs to `session.user.id`.
  - Cache refresh must never populate rows from an app-scoped token or for another user.
  - Installation metadata needs a refresh/staleness signal so the API can distinguish warm, stale, and missing caches.
- Dependent flows: repo selector UIs, explicit refresh actions, GitHub reconnect/unlink, installation webhooks, and any future repo search consumers.
- Duplicated logic to avoid: separate search/ranking rules in UI components. Ranking should live in one server-side query path.
- Smallest coherent solution: keep the existing `/api/github/installations/repos` contract, but change its backend from live GitHub search to secured local search over a user-scoped cache.

Approach:
- Add a new user-scoped installation repo cache table and minimal sync metadata.
- Repurpose the GitHub repo helper into a full-sync primitive that fetches all accessible repos for one user+installation from `GET /user/installations/{installationId}/repositories`.
- Update `/api/github/installations/repos` to:
  - verify `session.user.id`
  - verify the installation belongs to that user
  - serve results from the local cache
  - trigger a sync when the cache is missing, explicitly refreshed, or marked stale
  - apply server-side ranking for search (`exact` > `prefix` > boundary/segment match > substring; tie-break by recent activity, then name)
- Keep cache scope strictly per user. No cross-user deduplication, no shared installation cache, no global search index.
- Remove client-side resorting so UI preserves server ranking.
- Mark cache state stale when installation repository access changes, and clear user-scoped cache rows when GitHub access is disconnected/unlinked.

Changes:
- `apps/web/lib/db/schema.ts`
  - Add a new table for cached installation repos keyed by `userId`, `installationId`, and repo identity.
  - Add minimal installation sync metadata needed to determine whether repo cache is fresh or stale.
- `apps/web/lib/db/installations.ts` or a new colocated data-access file
  - Add helpers to upsert, replace, query, and clear cached repos for one user+installation.
  - Add helpers to mark installation repo cache stale/fresh.
- `apps/web/lib/github/installation-repos.ts`
  - Replace early-stop search behavior with full enumeration/sync behavior.
  - Keep the fetch source user-scoped by continuing to use the user's OAuth token.
- `apps/web/app/api/github/installations/repos/route.ts`
  - Preserve access checks.
  - Switch reads to cached search.
  - Support sync on cache miss, stale cache, and explicit refresh.
  - Centralize search ranking and limit handling here or in a dedicated data helper.
- `apps/web/app/api/github/webhook/route.ts`
  - On `installation` / `installation_repositories` events, mark affected repo caches stale for users tied to that installation.
- `apps/web/app/api/auth/github/unlink/route.ts` and any related disconnect flow
  - Clear the current user's cached installation repos when GitHub access is removed.
- `apps/web/components/repo-selector-compact.tsx`
  - Stop re-sorting API results client-side.
  - Keep debounce and refresh UX, but rely on server-ranked results.
- `apps/web/components/repo-selector.tsx`
  - Keep parity with the compact selector so both use the same backend semantics.
- `apps/web/lib/github/installation-repos.test.ts`
  - Replace tests that assert early-stop paging with tests for full sync behavior.
- Add API/data tests
  - Verify user A cannot read user B's cached repos, even for the same GitHub installation/account.
  - Verify stale-cache refresh, explicit refresh, and ranking for short queries like 2-letter repo names.

Verification:
- End-to-end behavior:
  - First selector open with no cache performs one sync and then serves local search results.
  - Subsequent searches do not hit GitHub repeatedly.
  - Short queries (for example `ui`, `db`) return exact/prefix matches correctly.
  - Refresh repopulates cache and updates results.
  - Installation webhook marks cache stale and next read re-syncs.
  - Disconnect/unlink removes cached repos for that user.
- Security checks:
  - API returns 403 for installations not owned by the session user.
  - Cached rows are only queried by matching `userId` + `installationId`.
  - Tests cover two users with overlapping installation IDs/accounts and confirm isolation.
- Relevant commands after implementation:
  - `bun install` if dependencies are not present
  - `bun run ci`
  - targeted bun tests for repo-cache and GitHub API route coverage
