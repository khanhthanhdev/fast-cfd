# Phase 3: Shared Normalization Utilities

**Status:** Pending | **Priority:** High | **Effort:** 2h
**Updated:** 2026-03-19

---

## Overview

Implement the normalization helpers that must match `docs/model-python.md` exactly.

The model contract is strict:
- boundary points and query points use the same `center` and `scale`
- inlet and outlet centers use the same `center` and `scale`
- inlet velocity remains in physical units and is not normalized

This phase is intentionally small and exact. The value is in correctness, not complexity.

---

## Files to Create

### 1. Normalization Module
**Path:** `packages/editor/src/lib/hvac/normalization.ts`

---

## Files to Modify

### 1. HVAC Library Index
**Path:** `packages/editor/src/lib/hvac/index.ts`

---

## Target Types

```typescript
export interface NormalizationParams {
  center: [number, number, number]
  scale: number
}

export interface Bounds3D {
  min: [number, number, number]
  max: [number, number, number]
}
```

---

## Implementation Steps

### Step 1: Implement `computeNormalization()`

Add:

```typescript
export function computeNormalization(bounds: Bounds3D): NormalizationParams
```

The implementation must mirror the Python notebook:

```python
center = mesh.bounds.mean(axis=0)
scale = (mesh.bounds[1] - mesh.bounds[0]).max()
```

TypeScript equivalent:
- `center = ((min + max) / 2)`
- `scale = max(dx, dy, dz)`

### Step 2: Implement Point Normalization Helpers

Add:

```typescript
export function normalizePoints(
  points: Float32Array,
  params: NormalizationParams,
): Float32Array

export function denormalizePoints(
  points: Float32Array,
  params: NormalizationParams,
): Float32Array
```

Rules:
- normalized point = `(point - center) / scale`
- denormalized point = `(point * scale) + center`

Also add single-point helpers if they simplify later phases:
- `normalizePoint()`
- `denormalizePoint()`

### Step 3: Implement `normalizeLoadVector()`

Add:

```typescript
export function normalizeLoadVector(
  inletCenter: [number, number, number],
  outletCenter: [number, number, number],
  inletVelocity: [number, number, number],
  params: NormalizationParams,
): Float32Array
```

Expected output layout:
- `0..2` normalized inlet center
- `3..5` normalized outlet center
- `6..8` raw inlet velocity in m/s

Do not add any hidden scaling to the velocity vector.

### Step 4: Add Minimal Assertions

Add lightweight validation helpers:
- reject `scale <= 0`
- reject point arrays whose length is not divisible by 3
- optionally provide a round-trip check helper for tests

### Step 5: Export for Downstream Use

Export:
- `computeNormalization`
- `normalizePoints`
- `denormalizePoints`
- `normalizeLoadVector`
- `NormalizationParams`

---

## Golden-Case Test Expectations

At least one deterministic test should prove:
- computed `center` matches the midpoint of the bounds
- computed `scale` matches the largest dimension
- `denormalizePoints(normalizePoints(points))` round-trips within tolerance
- `normalizeLoadVector()` leaves velocity untouched

Use the same formulas and naming as `docs/model-python.md` to avoid drift.

---

## Success Criteria

- [ ] `computeNormalization()` matches the Python reference math exactly
- [ ] Point normalization and denormalization round-trip correctly
- [ ] `normalizeLoadVector()` normalizes only centers, not velocity
- [ ] Utilities are generic over bounds and reusable across sampling, API, and tests

---

## Related Files

- `docs/model-python.md` - normalization authority
- `plans/260318-2020-ginot-integration/phase-02-point-sampling.md` - upstream points
- `plans/260318-2020-ginot-integration/phase-04-input-builder.md` - downstream tensor builder
