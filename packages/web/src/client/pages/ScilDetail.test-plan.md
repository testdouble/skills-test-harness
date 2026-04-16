# Test Plan: SCIL Detail Page (Issue #73)

## Scope

| Attribute | Value |
|-----------|-------|
| Scope type | Specific files |
| Files analyzed | 3 |
| Branch | test-harness/skill-call-improvement-loop |
| Language | TypeScript / TSX |
| Test framework | vitest |

### Files

- `tests/packages/web/src/client/pages/ScilDetail.tsx`
- `tests/packages/web/src/server/routes/scil.ts`
- `tests/packages/web/src/server/routes/scil.test.ts`

### Infrastructure Note

No React testing infrastructure exists in the project (`@testing-library/react`, `jsdom`/`happy-dom` are not installed; vitest config excludes `.test.tsx`). No other frontend page components have unit tests. All React component tests below are deferred until infrastructure is added.

## Test Plan

### CRIT — Critical Priority

**TP-001** (from EC2) **[Non-JSON response crashes fetch chain]**
- **Type:** Edge case (code fix)
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:106-107` — `res.json()` called without checking `res.ok`; HTML 500 responses produce cryptic SyntaxError
- **Test approach:** Fix: check `res.ok` before calling `res.json()`; show `res.statusText` for non-OK non-JSON responses
- **Priority justification:** Users see "SyntaxError: Unexpected token '<'" instead of actionable error messages when server returns non-JSON errors
- **Status:** CODE FIX — no test infrastructure available for React components

### HIGH — High Priority

**TP-002** (from EC3) **[details! non-null assertion with malformed API response]**
- **Type:** Edge case (code fix)
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:137` — `details!` assertion crashes if API returns `{}` (no `error` but no `summary`/`iterations`)
- **Test approach:** Fix: validate that `data.summary` and `data.iterations` exist before setting `details`
- **Priority justification:** Runtime TypeError crash renders blank page for malformed API responses

**TP-003** (from T1) **[Loading state renders correctly]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:121-123` — loading early return
- **Test approach:** Render with never-resolving fetch; assert "Loading..." text
- **Priority justification:** Core UI state with zero coverage
- **Status:** DEFERRED — no React testing infrastructure

**TP-004** (from T2) **[Error state renders with back link]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:108-109,124-135` — API error object display
- **Test approach:** Mock fetch to return `{ error: 'Not found' }`; assert error text and back link href
- **Priority justification:** Core UI state with zero coverage
- **Status:** DEFERRED — no React testing infrastructure

**TP-005** (from T3) **[Network failure error state]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:115-118` — `.catch()` handler
- **Test approach:** Mock fetch to reject; assert stringified error displayed
- **Priority justification:** Distinct code path from API error
- **Status:** DEFERRED — no React testing infrastructure

**TP-006** (from T4) **[Full detail page renders iterations and summary]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:137-223` — main success render
- **Test approach:** Mock fetch with full ScilRunDetails; assert original description, iteration labels, "Best" badge, best description card
- **Priority justification:** Primary happy path with zero coverage
- **Status:** DEFERRED — no React testing infrastructure

### MED — Medium Priority

**TP-007** (from T5) **[AccuracyBadge color logic for 100%, 80-99%, below 80%]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:55-56` — ternary color selection
- **Test approach:** Render AccuracyBadge with values 1.0, 0.85, 0.5; assert correct percentages and colors
- **Status:** DEFERRED — no React testing infrastructure

**TP-008** (from T6) **[AccuracyBadge returns null when value is null]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:54` — null guard
- **Test approach:** Render with `value={null}`; assert nothing rendered
- **Status:** DEFERRED — no React testing infrastructure

**TP-009** (from T7) **[TrainResultsTable renders nothing for empty results]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:68` — empty array guard
- **Test approach:** Render with empty array; assert nothing rendered
- **Status:** DEFERRED — no React testing infrastructure

**TP-010** (from T8) **[TrainResultsTable renders pass/fail indicators correctly]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:80-92` — result rows with trigger text and checkmark/cross
- **Test approach:** Render with passed and failed results; assert trigger/no-trigger text and symbols
- **Status:** DEFERRED — no React testing infrastructure

**TP-011** (from EC8) **[Empty iterations array renders section with no content]**
- **Type:** Edge case
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:180` — `.map()` on empty iterations
- **Test approach:** Mock fetch with `iterations: []`; verify "Iterations" header visible but no iteration cards
- **Status:** DEFERRED — no React testing infrastructure

### LOW — Low Priority

**TP-012** (from T9) **[Fetch URL includes runId from route params]**
- **Type:** Coverage gap
- **Test level:** Unit (component)
- **Code path:** `ScilDetail.tsx:99,105` — useParams + fetch URL
- **Test approach:** Render with route param; mock fetch; assert URL includes runId
- **Status:** DEFERRED — no React testing infrastructure

## Deferred Tests

- **S1: SectionHeader rendering** — `ScilDetail.tsx:36-51` — Pure presentational, zero logic
- **S2: Alternating row colors** — `ScilDetail.tsx:82` — Visual concern, brittle to test
- **S3: Row divider conditional** — `ScilDetail.tsx:90` — Minor visual detail

## Dropped Edge Cases

- **XSS via description fields** — React auto-escapes JSX string content; no `dangerouslySetInnerHTML`
- **CSRF** — Read-only GET endpoints for internal tool
- **DuckDB memory exhaustion** — Infrastructure concern, not guardable in code
- **EC1 (SQL injection via runId)** — Pre-existing pattern in analytics.ts, used across all query functions; outside scope of issue #73
- **EC7 (Path traversal via dataDir)** — Pre-existing pattern; dataDir comes from CLI args
- **EC5 (summaryRows[0] undefined)** — Pre-existing in analytics.ts; outside scope

## Coverage Summary

| Priority | Count |
|----------|-------|
| CRIT | 1 |
| HIGH | 4 |
| MED | 4 |
| LOW | 1 |
| **Total** | **10** |

Server route (`scil.ts`) has 100% test coverage — no gaps found. All 12 existing tests in `scil.test.ts` cover every branch.

ScilDetail.tsx has 0% test coverage. Two items (TP-001, TP-002) are code fixes to apply directly. The remaining 10 items are deferred pending React testing infrastructure (`@testing-library/react`, DOM environment in vitest config, `.test.tsx` include pattern). This matches the project pattern — no other frontend page has unit tests.
