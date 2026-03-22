# Phase 7: Mock Fixtures and Golden Cases

**Status:** Pending | **Priority:** Medium | **Effort:** 3h
**Updated:** 2026-03-19

---

## Overview

Provide deterministic development fixtures for geometry, GINOT-like airflow output, and
normalization verification.

This phase is not a substitute for the real Python backend. Its purpose is to:
- unblock UI and hook work
- keep the API contract stable
- verify tensor math and denormalization behavior against the Python reference

---

## Files to Create

### 1. Mock Room Generator Module
**Path:** `packages/editor/src/lib/hvac/mock-room-generator.ts`

### 2. Golden Fixture Data
**Path:** `packages/editor/src/lib/hvac/__fixtures__/ginot-golden-case.ts`

---

## Files to Modify

### 1. HVAC Library Index
**Path:** `packages/editor/src/lib/hvac/index.ts`

---

## Target Types

```typescript
import type { DiffuserInfo } from './diffuser-detector'
import type { HVACBoundaryConditions } from '../../store/use-hvac-scenarios'
import type { RoomGeometrySnapshot } from './room-geometry-snapshot'
import type { GINOTInferenceResponse } from './ai-inference-client'

export interface MockRoomTemplate {
  id: string
  name: string
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
  zonePolygon: [number, number][]
  supplyDiffusers: DiffuserInfo[]
  returnDiffusers: DiffuserInfo[]
  boundaryConditions: HVACBoundaryConditions
}

export interface MockRoomResult {
  geometry: RoomGeometrySnapshot
  supplyDiffusers: DiffuserInfo[]
  returnDiffusers: DiffuserInfo[]
  boundaryConditions: HVACBoundaryConditions
}
```

---

## Implementation Steps

### Step 1: Define Deterministic Room Templates

Provide at least these templates:
1. Simple Office: 5×4×2.8m
2. Conference Room: 8×6×3m
3. Bedroom: 4×3×2.5m
4. Living Room: 6×5×2.8m

Each template should include:
- room bounds
- zone polygon
- supply diffuser positions
- return diffuser positions
- default boundary conditions

### Step 2: Generate Geometry Snapshots from Templates

Add:

```typescript
export function generateMockRoom(
  templateId: string,
): MockRoomResult
```

Use the Phase 1 box/extrusion helper so the mock geometry goes through the same code paths as real
geometry snapshots.

### Step 3: Generate Deterministic Mock GINOT Responses

Add:

```typescript
export function generateMockGINOTResponse(
  room: MockRoomResult,
  options?: {
    queryCount?: number
    includeVoxelized?: boolean
    seed?: number
  },
): GINOTInferenceResponse
```

Requirements:
- output arrays must match the real response contract
- use seeded randomness or purely deterministic formulas
- return physically plausible airflow patterns, not arbitrary noise

Recommended mock semantics:
- denormalized `positions`
- consistent `velocities`
- `pressure`
- derived `speed`
- optional speed/pressure grids for viewer development

### Step 4: Add a Golden-Case Normalization Fixture

Create one small, deterministic fixture that proves:
- `center` is computed correctly
- `scale` is computed correctly
- normalized coordinates match the Python formula
- denormalized positions return to world space

This fixture should be simple enough to inspect manually.

### Step 5: Wire the Mock Path Into the API Route

The route from Phase 5 should be able to:
- call the real backend when configured
- fall back to `generateMockGINOTResponse(...)` when it is not

That ensures frontend work can progress without branching the client contract.

---

## Validation Rules

- mock outputs must use the same array lengths and field names as the real API
- mock `speed` must equal the magnitude of mock velocities
- fixture data must be deterministic across runs
- template geometry must reuse the same snapshot and normalization path as real code

---

## Success Criteria

- [ ] Deterministic mock room templates exist for the four V1 scenarios
- [ ] Mock responses match the real `GINOTInferenceResponse` contract
- [ ] A backend-unavailable route can still return useful airflow results for the UI
- [ ] At least one golden-case fixture verifies normalization and denormalization math

---

## Related Files

- `plans/260318-2020-ginot-integration/phase-01-mesh-data-structure.md` - geometry snapshot source
- `plans/260318-2020-ginot-integration/phase-05-inference-client.md` - route fallback integration
- `docs/model-python.md` - normalization authority
