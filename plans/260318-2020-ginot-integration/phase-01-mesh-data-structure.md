# Phase 1: Geometry Snapshot Adapter

**Status:** Pending | **Priority:** High | **Effort:** 3h
**Updated:** 2026-03-19

> The filename is retained for continuity. This phase no longer introduces a persisted
> `RoomMeshNode`. V1 uses a transient runtime geometry snapshot instead.

---

## Overview

Create a transient `RoomGeometrySnapshot` from the selected level/zone so the editor can build
GINOT inputs without adding a new scene-node type.

This phase replaces the old "persist room mesh first" approach. The Python reference in
`docs/model-python.md` only requires geometry, bounds, `center`, and `scale`; it does not require
that the editor store room geometry as a first-class scene node.

**V1 scope**
- derive geometry from the current scene
- support box/extruded-room geometry for development
- keep geometry out of `useScene` and `useHVACScenarios`

**Out of scope**
- STL/OBJ upload workflows
- viewer renderer for a room-mesh node
- scene registry / event bus / schema-union changes

---

## Files to Create

### 1. Room Geometry Snapshot Module
**Path:** `packages/editor/src/lib/hvac/room-geometry-snapshot.ts`

---

## Files to Modify

### 1. HVAC Library Index
**Path:** `packages/editor/src/lib/hvac/index.ts`

---

## Target Runtime Types

```typescript
export interface RoomBounds {
  min: [number, number, number]
  max: [number, number, number]
}

export interface RoomGeometrySnapshot {
  vertices: Float32Array
  faces: Uint32Array
  bounds: RoomBounds
  center: [number, number, number]
  scale: number
  zonePolygon: [number, number][]
  floorY: number
  height: number
  source: 'zone-extrusion' | 'mock-box'
}

export interface BuildRoomGeometryParams {
  zonePolygon: [number, number][]
  floorY: number
  height: number
}
```

Design notes:
- keep typed arrays in runtime code for sampling efficiency
- do not put this type into core schema yet
- treat `center` and `scale` as cached normalization metadata, not as user-facing state

---

## Implementation Steps

### Step 1: Define the Snapshot Contract

Implement `RoomGeometrySnapshot` as a pure runtime object that contains:
- triangle mesh vertices
- triangle indices
- bounds
- normalization metadata
- enough zone metadata to support interior sampling

The snapshot should be easy to serialize for tests, but it should not be designed as a persisted
editor node in V1.

### Step 2: Build a Zone-Extrusion Adapter

Implement a helper that converts the selected zone into a watertight box/extrusion mesh:

```typescript
export function buildRoomGeometrySnapshot(
  params: BuildRoomGeometryParams,
): RoomGeometrySnapshot
```

V1 assumptions:
- use the zone polygon as the horizontal footprint
- use `floorY` plus room `height` from the selected level
- include only the room envelope
- ignore furniture and internal obstacles until explicitly scoped in

Expected faces:
- floor
- ceiling
- wall quads triangulated into faces

### Step 3: Compute Bounds and Normalization Metadata

Add helpers that compute:
- `bounds.min`
- `bounds.max`
- `center = (min + max) / 2`
- `scale = max(maxX - minX, maxY - minY, maxZ - minZ)`

These values must match the math shown in `docs/model-python.md`.

### Step 4: Add a Mock Box Helper

Add a deterministic helper for tests and offline development:

```typescript
export function createBoxRoomGeometrySnapshot(
  bounds: RoomBounds,
): RoomGeometrySnapshot
```

Use this helper in later phases for:
- mock inference responses
- golden-case fixtures
- UI development before Python backend wiring is ready

### Step 5: Export the Module

Export the snapshot helpers and types from:
- `packages/editor/src/lib/hvac/index.ts`

Keep the public surface small:
- `buildRoomGeometrySnapshot`
- `createBoxRoomGeometrySnapshot`
- `RoomGeometrySnapshot`
- `RoomBounds`

---

## Validation Rules

- Reject empty polygons
- Reject non-positive room heights
- Reject snapshots with zero-area bounds
- Ensure every snapshot has at least one face
- Ensure `center` and `scale` are computed once and reused downstream

---

## Success Criteria

- [ ] A selected zone can be converted into a `RoomGeometrySnapshot`
- [ ] Snapshot bounds, `center`, and `scale` match the formulas in `docs/model-python.md`
- [ ] No new core node type is introduced in V1
- [ ] Mock box geometry can be generated without touching the scene graph
- [ ] The snapshot contract is suitable for boundary sampling and interior sampling

---

## Related Files

- `docs/model-python.md` - authoritative normalization contract
- `packages/editor/src/hooks/use-hvac-analysis.ts` - future consumer of the snapshot
- `packages/editor/src/lib/hvac/index.ts` - export surface
