# Phase 4: GINOT Input Builder

**Status:** Pending | **Priority:** High | **Effort:** 3h
**Updated:** 2026-03-19

---

## Overview

Build the exact model input tensors required by `docs/model-python.md`:
- `load`
- `pc`
- `xyt`

This phase consumes:
- a `RoomGeometrySnapshot`
- detected supply and return diffusers
- airflow boundary conditions

This phase does **not** create fake model fields, and it does **not** rely on a persisted
`RoomMeshNode`.

---

## Files to Create

### 1. GINOT Input Builder Module
**Path:** `packages/editor/src/lib/hvac/ginot-input-builder.ts`

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
import type { NormalizationParams } from './normalization'

export interface GINOTInput {
  load: Float32Array
  pc: Float32Array
  xyt: Float32Array
  normalization: NormalizationParams
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
}

export interface BuildGINOTInputParams {
  geometry: RoomGeometrySnapshot
  boundaryConditions: HVACBoundaryConditions
  supplyDiffuser: DiffuserInfo
  returnDiffuser: DiffuserInfo
  boundaryCount?: number
  queryCount?: number
}
```

Design note:
- include normalization metadata in the returned object so the route or tests can denormalize
  consistently when needed

---

## Implementation Steps

### Step 1: Validate Required Inputs Early

Before building tensors, fail fast on:
- missing supply diffuser
- missing return diffuser
- degenerate geometry
- non-positive airflow rate

V1 decision:
- require both a supply and a return diffuser
- do not silently fabricate the outlet center as `[0, 0, 0]`

### Step 2: Resolve Inlet and Outlet Centers

Use diffuser centers directly:
- inlet center comes from the supply diffuser
- outlet center comes from the return diffuser

If multiple diffusers are later supported in one run:
- define one selection rule explicitly
- or aggregate into a backend-supported boundary representation

V1 should stay conservative and documented.

### Step 3: Resolve the Inlet Velocity Vector

Add a helper:

```typescript
export function computeInletVelocityVector(
  airflowRate: number,
  diffuser: DiffuserInfo,
): [number, number, number]
```

Rules:
- convert airflow rate to a physical velocity vector
- use diffuser orientation if it exists
- if orientation is unavailable, apply one documented fallback only

Recommended V1 fallback:
- assume downward flow for ceiling diffusers
- surface this assumption in code comments and tests

### Step 4: Sample and Normalize Geometry Tensors

Build tensors in this order:
1. compute normalization from `geometry.bounds`
2. sample boundary points and normalize them into `pc`
3. sample interior points and normalize them into `xyt`
4. normalize inlet/outlet centers and build `load`

This ordering should match the Python notebook exactly.

### Step 5: Expose Shape and Sanity Validators

Add:

```typescript
export function validateGINOTInput(input: GINOTInput): {
  valid: boolean
  errors: string[]
}
```

Validate:
- `load.length === 9`
- `pc.length === boundaryCount * 3`
- `xyt.length === queryCount * 3`
- array lengths divisible by 3
- `normalization.scale > 0`

Also add a helper for debugging:

```typescript
export function getTensorShapes(input: GINOTInput): {
  load: [number]
  pc: [number, number]
  xyt: [number, number]
}
```

---

## Example Output Contract

```typescript
const input = buildGINOTInput({
  geometry,
  boundaryConditions,
  supplyDiffuser,
  returnDiffuser,
  boundaryCount: 100000,
  queryCount: 50000,
})

// input.load.length === 9
// input.pc.length === 300000
// input.xyt.length === 150000
```

---

## Non-Goals

- no `featureVector` compatibility layer in this builder
- no temperature inference
- no PMV or comfort-score calculations
- no async job orchestration

---

## Success Criteria

- [ ] The builder produces `load`, `pc`, and `xyt` exactly as required by `docs/model-python.md`
- [ ] The same normalization parameters are applied to all geometry-derived inputs
- [ ] The builder refuses to run without both supply and return diffuser data
- [ ] Velocity stays in physical units in `load`
- [ ] Shape validation catches malformed tensors before API calls

---

## Related Files

- `docs/model-python.md` - authoritative tensor contract
- `plans/260318-2020-ginot-integration/phase-01-mesh-data-structure.md` - geometry snapshot
- `plans/260318-2020-ginot-integration/phase-02-point-sampling.md` - sampling
- `plans/260318-2020-ginot-integration/phase-03-normalization.md` - normalization
