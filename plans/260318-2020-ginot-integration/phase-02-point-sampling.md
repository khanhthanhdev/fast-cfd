# Phase 2: Boundary and Interior Sampling

**Status:** Pending | **Priority:** High | **Effort:** 4h
**Updated:** 2026-03-19

---

## Overview

Implement sampling utilities for the two geometry-derived tensors required by GINOT:
- `pc`: 100,000 boundary surface points
- `xyt`: interior query points, typically 50,000

This phase must match the behavior described in `docs/model-python.md`:
- boundary points come from the room surface
- interior points come from inside the room volume
- interior points are filtered by an inside-room test, so fixed-count sampling must resample until
  the target count is met

---

## Files to Create

### 1. Point Sampler Module
**Path:** `packages/editor/src/lib/hvac/point-sampler.ts`

---

## Files to Modify

### 1. HVAC Library Index
**Path:** `packages/editor/src/lib/hvac/index.ts`

---

## Target Types

```typescript
import type { RoomGeometrySnapshot } from './room-geometry-snapshot'

export interface SamplingOptions {
  boundaryCount?: number
  interiorCount?: number
  oversampleFactor?: number
  maxPasses?: number
}

export interface SamplingResult {
  boundaryPoints: Float32Array
  interiorPoints: Float32Array
}
```

Suggested defaults:
- `boundaryCount = 100000`
- `interiorCount = 50000`
- `oversampleFactor = 2`
- `maxPasses = 10`

---

## Implementation Steps

### Step 1: Implement Boundary Surface Sampling

Add:

```typescript
export function sampleBoundaryPoints(
  geometry: RoomGeometrySnapshot,
  count = 100000,
): Float32Array
```

Implementation requirements:
- sample triangles with probability proportional to face area
- use barycentric sampling for points on each selected triangle
- return a flat `Float32Array` shaped as `[x, y, z, ...]`

This mirrors the Python reference's `trimesh.sample.sample_surface(...)`.

### Step 2: Implement Interior Sampling for V1 Envelope Geometry

Add:

```typescript
export function sampleInteriorPoints(
  geometry: RoomGeometrySnapshot,
  count = 50000,
  options?: SamplingOptions,
): Float32Array
```

V1 implementation strategy:
- sample uniformly within `geometry.bounds`
- keep only points inside the zone extrusion
- repeat until `count` valid points are collected or fail with a clear error

The inside-room check can use the V1 geometry assumptions:
- horizontal inclusion by zone polygon
- vertical inclusion by `floorY <= y <= floorY + height`

This is cheaper and easier to reason about than a generic triangle-mesh containment test while the
geometry remains an envelope extrusion.

### Step 3: Add Exact-Count Resampling Logic

Do not accept underfilled results silently.

The Python notebook shows:

```python
pts = np.random.uniform(mesh.bounds[0], mesh.bounds[1], size=(N, 3))
inside = mesh.contains(pts)
return pts[inside]
```

That can return fewer than `N` points. For editor integration:
- keep drawing candidate batches
- append accepted points
- stop only when the requested count is reached
- throw a descriptive error if the geometry is too degenerate to satisfy the request

### Step 4: Add Low-Level Geometry Helpers

Helpers likely needed:
- `triangleArea()`
- `samplePointOnTriangle()`
- `isPointInPolygonXZ()`
- `isPointInsideExtrudedZone()`

Keep these private unless another phase needs them.

### Step 5: Add a One-Shot Convenience Helper

Add:

```typescript
export function sampleGINOTPoints(
  geometry: RoomGeometrySnapshot,
  options?: SamplingOptions,
): SamplingResult
```

This should call both boundary and interior sampling with shared defaults.

---

## Validation Rules

- Boundary point count must equal the requested count exactly
- Interior point count must equal the requested count exactly
- Returned arrays must be divisible by 3
- Boundary points should stay on envelope surfaces within floating-point tolerance
- Interior points should stay strictly inside the room, not outside bounds

---

## Performance Notes

- 100k boundary sampling is acceptable in-browser for V1 if implemented with precomputed face CDF
- interior sampling should batch random generation instead of testing one point at a time
- if client-side sampling becomes too slow, move it server-side without changing the public
  contract

---

## Success Criteria

- [ ] `sampleBoundaryPoints()` produces exactly 100,000 surface points by default
- [ ] `sampleInteriorPoints()` produces exactly 50,000 valid interior points by default
- [ ] Resampling logic handles the underfilled-first-pass case from the Python reference
- [ ] Sampling utilities accept `RoomGeometrySnapshot`, not a persisted mesh node
- [ ] Output arrays are ready to normalize and ship to GINOT

---

## Related Files

- `docs/model-python.md` - model reference for `pc` and `xyt`
- `plans/260318-2020-ginot-integration/phase-01-mesh-data-structure.md` - geometry snapshot input
- `plans/260318-2020-ginot-integration/phase-03-normalization.md` - next phase
