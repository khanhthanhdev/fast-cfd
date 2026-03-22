# Phase 7: Storage & Persistence Decision

**Priority:** High | **Effort:** 2h | **Status:** Completed

---

## Overview

The schema already accepts world-space GINOT data. The real question is whether those fields
should persist across scene save/reload.

---

## Current State (COMPLETED)

- `packages/core/src/schema/nodes/heatmap.ts` already supports:
  - `ginotPointCloud`
  - `speedField`
  - `pressureField`
- `ginot-point-cloud.tsx` already renders stored world-space points directly
- `scene-persistence.ts` explicitly strips GINOT payload on save (transient by design)
- **Decision:** Raw GINOT payloads are transient for first production rollout

---

## Recommended Files

- VERIFY: `packages/core/src/schema/nodes/heatmap.ts`
- DECIDE/UPDATE: `packages/core/src/lib/scene-persistence.ts`
- VERIFY: `packages/viewer/src/components/renderers/heatmap/ginot-point-cloud.tsx`

---

## Decision (COMPLETED)

For the first production mesh rollout:

- [x] Raw GINOT point-cloud payload is transient
- [x] Plan does not claim reload survival
- [x] Schema support remains as-is
- [x] Full payload persistence deferred to explicit follow-up with storage budget

---

## Success Criteria (COMPLETED)

- [x] Persistence behavior is an explicit product/engineering choice
- [x] Plan, tests, and UX all reflect the same policy (transient)
- [x] No unnecessary schema rewrite was introduced

---

## Depends On

Independent, but must be resolved before final test acceptance is written.
