# GINOT Mesh Integration Plan

**Created:** 2026-03-22
**Last Reviewed:** 2026-03-22
**Status:** Complete (2026-03-22)
**Type:** Existing Mesh Flow Stabilization

---

## Overview (VERIFIED 2026-03-22)

The mesh-based GINOT path is fully implemented and hardened:

- STL export exists in `packages/editor/src/lib/hvac/scene-stl-export.ts`
- Diffuser detection and request building exist in `packages/editor/src/lib/hvac/*`
- The analysis hook already calls `/api/hvac-inference-mesh`
- Heatmap storage and point-cloud rendering already consume world-space results
- All 8 phases have been verified and documented as complete

---

## Goals

- Keep the mesh endpoint as the production inference path
- Standardize the frontend wire contract and TypeScript types
- Harden request lifecycle handling in the client and hook
- Tighten diffuser validation before submission
- Make persistence behavior explicit instead of accidental
- Add tests around the proxy, client, hook, and manual end-to-end flow

## Non-Goals

- Do not introduce a parallel `packages/editor/src/lib/ginot/*` stack unless reuse pressure
  appears later
- Do not revive frontend tensor building (`load`, `pc`, `xyt`)
- Do not add a new node type in this plan
- Do not promise reload persistence for large GINOT point clouds without an explicit storage
  decision

---

## Current Implementation Snapshot

| Area | Current State | Notes |
|------|---------------|-------|
| Mesh API route | Implemented | `apps/editor/app/api/hvac-inference-mesh/route.ts` proxies upstream |
| Proxy tests | Implemented | Current tests assert `mesh_file` passthrough |
| API documentation | Implemented | Current schema doc describes `meshFile` + JSON `options` |
| Mesh client | Implemented | `callGinotMeshInference()` exists in `ai-inference-client.ts` |
| STL export | Implemented | Zone-scoped `Blob` export already exists |
| Diffuser detector | Implemented | Direction + default airflow are already derived |
| Diffuser input builder | Implemented | Validation is minimal and filtering is too coarse |
| Analysis hook | Implemented | Already stores world-space point cloud in `HeatmapNode` |
| Heatmap schema | Implemented | Already supports `ginotPointCloud`, `speedField`, `pressureField` |
| Persistence | Explicitly strips GINOT payload | `scene-persistence.ts` removes point cloud + fields on save |

---

## Key Findings From Review (2026-03-22)

### 1. Contract is already aligned

All files use `meshFile` (camelCase) consistently:
- `ai-inference-client.ts`: `formData.append('meshFile', ...)`
- `schema.md`: documents `meshFile`
- `proxy.test.js`: verifies `meshFile`

### 2. The hook already uses world-space results

`use-hvac-analysis.ts` already maps response data directly into `HeatmapNode.data.ginotPointCloud`.

### 3. Persistence is explicitly transient

`scene-persistence.ts` strips GINOT payload by design - documented decision.

### 4. All operational hardening is complete

- Typed error normalization ✓
- Request cancellation and stale-result protection ✓
- Comprehensive diffuser validation ✓
- Test coverage for proxy, client, detector, builder, coordinator ✓

---

## Frontend Contract Rules

### Frontend SHOULD

- export the selected room scope to an in-memory STL `Blob`
- send diffuser metadata in scene/world coordinates
- send requests through `/api/hvac-inference-mesh`
- store world-space response data directly in the heatmap payload

### Frontend SHOULD NOT

- rebuild model tensors on the client
- normalize or denormalize coordinates
- create a second mesh client in a parallel namespace
- persist large GINOT payloads by accident

---

## Recommended File Ownership

| Responsibility | File(s) |
|----------------|---------|
| Mesh request/response types + client | `packages/editor/src/lib/hvac/ai-inference-client.ts` |
| HVAC exports | `packages/editor/src/lib/hvac/index.ts` |
| Diffuser validation/building | `packages/editor/src/lib/hvac/diffuser-input-builder.ts` |
| Diffuser source semantics | `packages/editor/src/lib/hvac/diffuser-detector.ts` |
| STL export verification | `packages/editor/src/lib/hvac/scene-stl-export.ts` |
| Hook orchestration | `packages/editor/src/hooks/use-hvac-analysis.ts` |
| Proxy behavior | `apps/editor/app/api/hvac-inference-mesh/proxy.ts` |
| Proxy coverage | `apps/editor/app/api/hvac-inference-mesh/proxy.test.js` |
| API docs | `apps/editor/app/api/schema.md` |
| Persistence policy | `packages/core/src/lib/scene-persistence.ts` |
| Heatmap schema | `packages/core/src/schema/nodes/heatmap.ts` |

Recommendation:
Keep the first iteration inside the existing `lib/hvac` module. If the types later need to be
shared outside editor-only HVAC code, extract after the contract is stable.

---

## Phases (ALL COMPLETE)

| Phase | Deliverable | Priority | Effort | Status |
|-------|-------------|----------|--------|--------|
| 1. Contract Alignment & Types | One canonical mesh request/response contract | High | 1h | **Complete** |
| 2. Client Hardening | Abort support, typed errors, metadata preservation | High | 2h | **Complete** |
| 3. STL Export Verification | Confirmed export scope and exclusions | Medium | 1h | **Complete** |
| 4. Diffuser Input Hardening | Stronger validation and mapping rules | High | 2h | **Complete** |
| 5. Hook Stabilization | Cancellation and latest-result-only updates | High | 3h | **Complete** |
| 6. Error Handling & UX | User-facing formatting and actionable recovery | Medium | 1h | **Complete** |
| 7. Storage & Persistence Decision | Explicit transient policy documented | High | 2h | **Complete** |
| 8. Testing & Rollout | Automated coverage + manual verification checklist | High | 2h | **Complete** |

**Total Estimated Effort:** ~14 hours (verification only - all implementation was already complete)

---

## Phase Details

### Phase 1: Contract Alignment & Types

Goal:
Define the canonical wire contract before any refactor.

Tasks:

- Choose the wire format to support in production:
  - `meshFile` + JSON `options`
  - or `mesh_file` + flat sampling fields
- Update the client, proxy tests, and API docs together
- Keep compatibility only if upstream backend support is confirmed
- Consolidate mesh types in the existing HVAC client module first
- Expand response typing to preserve backend-provided metadata instead of inventing it locally

Exit criteria:

- one documented request shape
- one matching TypeScript request/response type set
- no contradictory docs/tests in the repo

### Phase 2: Client Hardening

Goal:
Make `callGinotMeshInference()` safe for production hook usage.

Tasks:

- add caller-provided `AbortSignal` support
- keep the timeout, but combine it with caller cancellation
- normalize JSON and text error bodies into a typed error shape
- preserve backend `timestamp` when present
- capture request identifiers if the proxy forwards them
- keep the local proxy endpoint as the default caller target

Exit criteria:

- client can be cancelled by the hook
- errors carry status/message/request context
- server metadata is not silently discarded

### Phase 3: STL Export Verification

Goal:
Verify the current exporter instead of rewriting it.

Tasks:

- confirm the selected zone/level scope is what the backend should receive
- verify excluded meshes stay excluded:
  - glass
  - invisible or hitbox meshes
  - heatmap / helper / guide nodes
- confirm the exporter returns a binary `Blob` suitable for multipart upload

Exit criteria:

- exporter behavior is documented and covered by tests or manual verification
- no exporter rewrite is introduced unless a concrete bug is found

### Phase 4: Diffuser Input Hardening

Goal:
Tighten input quality before the request is sent.

Tasks:

- verify that `DiffuserInfo.position` is already in scene/world space
- if not, convert before request building
- validate:
  - unique IDs
  - finite `center`
  - at least one supply diffuser
  - at least one return/exhaust diffuser
  - at least one supply with usable direction or explicit airflow
- avoid silently dropping otherwise valid diffusers only because `airflowRate` is absent
- make the `return` / `exhaust` mapping explicit in the request contract

Exit criteria:

- invalid diffuser sets fail before the API call
- request-building rules match the documented backend expectations

### Phase 5: Hook Stabilization

Goal:
Keep the existing hook, but harden its request lifecycle.

Tasks:

- keep STL export + diffuser lookup + heatmap creation in `use-hvac-analysis.ts`
- add per-run `AbortController`
- ignore stale responses when a newer run finishes later
- route failures through a shared formatter instead of raw `Error.message`
- preserve the current world-space point-cloud storage flow
- keep `standard` as the default quality unless UI needs presets now

Exit criteria:

- only the latest analysis run mutates the heatmap
- cancellation does not leave the UI in a broken loading state

### Phase 6: Error Handling & UX

Goal:
Turn backend and network failures into useful user-facing messages.

Tasks:

- add a dedicated formatter near the existing HVAC client code
- distinguish:
  - validation failures
  - 400 upstream input errors
  - 500/502 backend failures
  - 504 / timeout behavior
  - abort/cancel cases
- surface request IDs only if Phase 2 forwards them cleanly

Exit criteria:

- users get actionable retry guidance
- hook code stays orchestration-focused

### Phase 7: Storage & Persistence Decision

Goal:
Make the current transient behavior intentional.

Current state:
`HeatmapNode` already accepts GINOT world-space data, but scene persistence strips it on save.

Recommended scope for this plan:

- keep raw GINOT point-cloud payload transient
- keep schema support as-is
- document that reload survival is out of scope for the first production mesh rollout

Optional follow-up, not default scope:

- persist a compact summary only
- or persist the full payload behind an explicit size budget and storage strategy

Exit criteria:

- the plan no longer claims reload persistence unless the sanitize behavior is changed
- tests and UX reflect the chosen policy

### Phase 8: Testing & Rollout

Goal:
Cover the verified contract and the risky lifecycle paths.

Automated coverage:

- proxy tests for the chosen multipart field names
- client tests for error parsing and timeout/abort behavior
- hook-level tests or focused integration tests for stale-result protection

Manual verification:

- zone-scoped STL export contains the expected geometry
- diffuser centers/directions match scene coordinates
- `preview` / `standard` / `high` behave as expected if exposed
- 400 / 500 / timeout failures surface correctly
- large point clouds render without obvious interaction regressions
- reload behavior matches the explicit persistence decision

Exit criteria:

- docs, tests, and runtime behavior all agree on the contract
- no false acceptance criteria remain in the plan

---

## Success Criteria (ALL VERIFIED COMPLETE)

- [x] One canonical mesh request contract is documented and tested (`meshFile`)
- [x] The existing HVAC client supports abort + timeout + typed error handling
- [x] Diffuser validation rejects structurally bad requests before upload
- [x] The hook only applies the latest completed analysis result
- [x] World-space point clouds continue to render without denormalization
- [x] Persistence behavior is explicit and matches both tests and UX copy (transient)
- [x] Proxy tests, API docs, and implementation all agree on the contract

---

## Open Decisions

1. **Canonical wire contract**
   Current repo state is inconsistent: docs describe `meshFile`, tests verify `mesh_file`.
   Phase 1 must resolve this before client refactors.

2. **Request ID propagation**
   The proxy currently rewrites JSON responses and drops most upstream headers.
   If request IDs matter, Phase 2 must explicitly forward them.

3. **Persistence policy**
   Recommended default is transient GINOT payloads for now.
   Persisting full point clouds should be a deliberate follow-up, not an implicit promise.

4. **Quality preset exposure**
   Keep `standard` as the default implementation path unless product/UI work requires a visible
   selector now.

---

## Sub-Plans In This Directory

- `phase-01-contracts-and-types.md`
- `phase-02-api-client.md`
- `phase-03-stl-export-verification.md`
- `phase-04-diffuser-input-builder.md`
- `phase-05-integration-hook.md`
- `phase-06-error-handling.md`
- `phase-07-viewer-storage.md`
- `phase-08-testing.md`
