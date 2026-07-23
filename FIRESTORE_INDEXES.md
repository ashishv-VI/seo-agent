# Firestore Composite Indexes

**Story M8.3 — Firestore Index Audit.**

`firestore.indexes.json` declares the composite indexes required by the backend's
queries. It is version-controlled so the index set is reproducible and reviewable
(previously the repo had **no** index artifact — indexes, if any, existed only in
the Firebase console).

## Why these exist

Firestore serves **equality-only** queries (`where(field, "==", …)`, no `orderBy`,
no range) from automatic single-field indexes. A **composite index is required**
when a query combines:

- multiple fields with an `orderBy` on a different field than the filter, or
- an inequality/range (`>=`, `<=`, `>`, `<`) on one field plus a filter/order on
  another field.

An M8.3 scan of all 147 `.where()` call sites found **12 distinct query shapes**
that require a composite index. The other ~27 composite-looking queries are
equality-only and need no declared index. (A query whose inequality and `orderBy`
are on the *same* field — e.g. the `fix_verification` `checkAfter` cron sweep in
`index.js` — is also auto-served and intentionally NOT listed.)

## Indexes declared (12)

| Collection | Fields | Query source |
|---|---|---|
| `score_history` | clientId ==, capturedAt >= | `A24_strategist.js` |
| `conversions` | clientId ==, submittedAt (order) | `A24_strategist.js`, `CMO_agent.js` |
| `conversions` | clientId ==, createdAt >= | `AI4_leadQualityScore.js` |
| `rank_history` | clientId ==, date >= + order | `AI3_serpVolatility.js` |
| `fix_verification` | clientId ==, status ==, checkedAt desc | `CMO_agent.js` |
| `crawler_backlinks` | toDomain ==, savedAt >= | `crawler/backlinkGraph.js` |
| `crawler_queue` | status ==, queuedAt asc | `crawler/backlinkGraph.js` |
| `wp_push_log` | clientId ==, pushedAt desc | `routes/controlRoom.js` |
| `cwv_history` | clientId ==, createdAt asc | `routes/modules/monitoring.js` |
| `portal_snapshots` | clientId ==, createdAt desc | `routes/portal.js` |
| `approval_queue` | clientId ==, type ==, createdAt desc | `routes/tools.js` |
| `tasks` | status ==, priorityScore desc | `utils/taskQueue.js` |

## Deploying

These files do **not** deploy automatically (Render only runs the Node/static
services — see `render.yaml`). Deploy the indexes once, manually, from a machine
with the Firebase CLI authenticated to the project:

```bash
# from the repo root (where firebase.json lives)
firebase deploy --only firestore:indexes --project <FIREBASE_PROJECT_ID>
```

Index builds are asynchronous — Firestore reports "Building" then "Enabled" in
**Firestore → Indexes**. Queries that need a still-building index fail with
`FAILED_PRECONDITION` until the build completes.

## Verifying against the live project

Some of these indexes may already exist (hand-created in the console while the
app ran in production). To reconcile:

1. Firebase console → Firestore → **Indexes** tab.
2. Compare the "Enabled" composite indexes against the 12 above.
3. `firebase deploy --only firestore:indexes` is **idempotent** — it creates only
   what's missing and leaves existing indexes untouched. It will, however, prompt
   to **delete** any console-only index not present in this file; review that
   prompt carefully before confirming so a needed index isn't dropped.
