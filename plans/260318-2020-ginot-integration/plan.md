# GINOT Neural Operator Integration Plan

**Created:** 2026-03-18
**Updated:** 2026-03-19
**Status:** Implemented (Phases 1-8 Complete)
**Type:** AI Backend Integration for 3D Airflow Visualization

---

## Overview

Integrate GINOT (Geometry-Integrated Neural Operator) as the airflow prediction backend for the
Pascal Editor.

This refined plan is based on [docs/model-python.md](../../docs/model-python.md), which is the
authoritative source for the model contract.

**Current editor flow**
- `use-hvac-analysis` builds a 12-value feature vector
- `POST /api/hvac-inference` returns mock 2D/3D grids synchronously
- `HeatmapNode` renders temperature/velocity-style grids

**Target flow**
- Editor derives room geometry, boundary points, and interior query points
- Editor/backend builds the exact GINOT tensors: `load`, `pc`, `xyt`
- GINOT returns `U/V/W/p` at the queried interior points
- Editor visualizes physically honest fields derived from model output:
  `speed = sqrt(U^2 + V^2 + W^2)` and `pressure`

**Important scope correction**
- GINOT does **not** output temperature, PMV, or comfort score
- The integration must **not** invent those values from velocity and present them as model output
- Existing temperature/PMV visualizations should remain legacy behavior unless backed by a separate
  model or explicit post-processing feature

**Authority note**
- The detailed phase files in this folder were drafted before this refinement
- Treat this file as the source of truth until those phase docs are rewritten

---

## Implementation Summary

All 8 phases have been implemented:

| Phase | Status | Files Created/Modified |
|-------|--------|------------------------|
| 1. Geometry Snapshot Adapter | Complete | `packages/editor/src/lib/hvac/room-geometry-snapshot.ts` |
| 2. Boundary + Interior Sampling | Complete | `packages/editor/src/lib/hvac/point-sampler.ts` |
| 3. Normalization Utilities | Complete | `packages/editor/src/lib/hvac/normalization.ts` |
| 4. GINOT Input Builder | Complete | `packages/editor/src/lib/hvac/ginot-input-builder.ts` |
| 5. API Route Migration | Complete | `apps/editor/app/api/hvac-inference/route.ts`, `packages/editor/src/lib/hvac/ai-inference-client.ts` |
| 6. Response Contract & Visualization | Complete | `packages/core/src/schema/nodes/heatmap.ts` |
| 7. Mock Fixtures & Golden Cases | Complete | `packages/editor/src/lib/hvac/mock-room-generator.ts` |
| 8. Hook, Store, Viewer Integration | Complete | `packages/editor/src/hooks/use-hvac-analysis.ts` |

**Build Status:** Passing (no TypeScript errors)

---

## Model Contract

### Inputs

| Tensor | Shape | Source | Notes |
|--------|-------|--------|-------|
| `pc` | `[1, 100000, 3]` | Boundary mesh surface samples | Normalize with global `center` and `scale` |
| `xyt` | `[1, N, 3]` | Interior query points | Use the same `center` and `scale` as `pc` |
| `load` | `[1, 9]` | Inlet/outlet centers + inlet velocity | Centers normalized, velocity stays in physical units |

`load` layout:
- `0..2`: normalized inlet center `[x, y, z]`
- `3..5`: normalized outlet center `[x, y, z]`
- `6..8`: inlet velocity vector `[u, v, w]` in m/s

### Output

| Tensor | Shape | Meaning |
|--------|-------|---------|
| `predictions` | `[1, N, 4]` | `[U, V, W, p]` at the queried `xyt` points |

Derived fields for visualization:
- `speed = sqrt(U^2 + V^2 + W^2)`
- `positions_world = (xyt * scale) + center`

### Normalization Rules

- Compute `center` as the mean of mesh min/max bounds
- Compute `scale` as the maximum room dimension
- Apply the same normalization to:
  boundary points
  query points
  inlet center
  outlet center
- Do **not** normalize velocity values in `load`

### Implementation Implications

- The integration must keep the geometry and normalization pipeline consistent across `pc`, `xyt`,
  and `load`
- `sample_interior()` in the Python reference filters by `mesh.contains()`, so the real number of
  valid interior points may be lower than the first random draw
- If the backend requires a fixed query count, it must resample until the requested count is met
- The model outputs airflow and pressure only; any comfort metrics must be treated as separate,
  non-GINOT computations

---

## Architecture Decisions

### 1. No New Scene Node for Mesh in V1

Do **not** start with a persisted `RoomMeshNode`.

Reason:
- the current scene graph has no mesh import/render pipeline for a room mesh
- adding a new node type requires schema, union, event, registry, and renderer wiring
- the model only needs geometry data, not necessarily a first-class scene node

V1 approach:
- derive a transient room-geometry snapshot from the current scene and selected zone
- allow a simple mock box room generator for offline development

Defer a persisted mesh node until one of these is required:
- user-uploaded STL/OBJ workflows
- cached multi-run geometry reuse
- explicit mesh inspection/debugging in the UI

### 2. Keep the API Synchronous First

Do **not** introduce polling jobs as the base plan.

Reason:
- the current route is synchronous
- the current hook/UI path expects a single request/response cycle
- async jobs add coordination complexity that is not justified until backend latency proves it

V1 approach:
- keep `POST /api/hvac-inference`
- migrate its payload from `features` to `{ load, pc, xyt, metadata }`
- return completed airflow results in one response

Only add async job orchestration if:
- Python inference time becomes materially too slow for request/response
- deployment constraints require queueing/background execution

### 3. Keep `use-hvac-analysis` as the Orchestrator

Do **not** move end-to-end orchestration into the scenario store.

Reason:
- the current product flow lives in `packages/editor/src/hooks/use-hvac-analysis.ts`
- the hook already owns selection, diffuser detection, API execution, node CRUD, and scenario CRUD

V1 approach:
- update the hook to build GINOT inputs and consume GINOT outputs
- keep the store focused on scenario selection and cached result state

### 4. Align Visualization With Real Model Output

Do **not** map GINOT output into fake temperature/PMV fields.

V1 rendering targets:
- speed
- pressure
- optional velocity vectors

Implementation options:
- extend `HeatmapNode` to support speed/pressure semantics plus optional raw point-cloud payload
- or create a dedicated airflow field node if heatmap semantics become too misleading

For V1, prefer the smaller change that preserves current UI momentum while keeping field names
honest.

### 5. Put Heavy Spatial Work on the Backend

Avoid expensive client-side point-cloud voxelization as the primary plan.

Reason:
- converting 50k query points into dense 3D grids can be expensive
- the browser should not become the main CFD post-processing engine

Preferred split:
- backend runs GINOT inference
- backend may optionally voxelize `speed` and `pressure` into viewer-friendly grids
- client keeps lightweight transforms only: validation, denormalization checks, field selection

---

## Refined Phases

| Phase | Deliverable | Priority | Effort |
|-------|-------------|----------|--------|
| 1 | Geometry snapshot adapter from current scene/zone | High | 3h |
| 2 | Boundary + interior sampling utilities | High | 4h |
| 3 | Shared normalization utilities matching Python reference | High | 2h |
| 4 | GINOT input builder for `load` / `pc` / `xyt` | High | 3h |
| 5 | Synchronous API route + client migration | High | 4h |
| 6 | Honest response contract for speed / pressure / vectors | High | 4h |
| 7 | Mock fixtures and golden-case verification | Medium | 3h |
| 8 | Hook, store, and viewer integration | High | 4h |

**Total Estimated Effort:** ~27 hours

---

## Phase Details

### Phase 1: Geometry Snapshot Adapter

Goal:
- Build a transient geometry representation from the selected room/zone for sampling and
  normalization

Deliverables:
- `RoomGeometrySnapshot` type with vertices, faces, bounds, `center`, and `scale`
- adapter from current scene nodes to geometry snapshot
- mock box-room snapshot generator for non-mesh development

Notes:
- this phase replaces the old “persisted RoomMeshNode first” assumption
- if furniture is out of scope for V1, document that the initial geometry includes only envelope
  surfaces

### Phase 2: Boundary and Interior Sampling

Goal:
- Match the model reference for boundary and interior point generation

Deliverables:
- boundary surface sampling for `pc`
- interior sampling for `xyt`
- retry/resample logic so query count is predictable

Rules:
- target `pc = 100000` surface points
- target `xyt = 50000` interior points unless backend sets a different cap
- use the same geometry snapshot for both

### Phase 3: Normalization Utilities

Goal:
- Match the reference normalization exactly

Deliverables:
- `computeNormalization(bounds)`
- `normalizePoints()`
- `denormalizePoints()`
- `normalizeLoadVector()`

Validation:
- same `center` and `scale` applied to `pc`, `xyt`, inlet center, and outlet center
- inlet velocity remains in world units

### Phase 4: GINOT Input Builder

Goal:
- Build the exact tensors consumed by the Python model

Deliverables:
- input builder returning:
  `load: Float32Array(9)`
  `pc: Float32Array(boundaryCount * 3)`
  `xyt: Float32Array(queryCount * 3)`
- validation helpers for shape and normalization invariants

Notes:
- derive inlet/outlet centers from detected supply/return diffusers
- derive inlet velocity vector from diffuser orientation plus airflow rate
- if diffuser orientation is unavailable, define a documented fallback and keep it explicit

### Phase 5: Synchronous API Route and Client Migration

Goal:
- Replace the legacy 12-feature surrogate-model contract with the GINOT tensor contract

Deliverables:
- update `POST /api/hvac-inference`
- update the existing client used by `use-hvac-analysis`
- request payload shape:
  `load`
  `pc`
  `xyt`
  optional metadata for debugging

Preferred response shape:
- `positions`
- `velocities`
- `pressure`
- `speed`
- `bounds`
- optional `voxelized` grids if the backend produces them

Notes:
- keep the endpoint synchronous in V1
- async job APIs are a follow-up only if runtime data justifies them

### Phase 6: Response Contract and Visualization Semantics

Goal:
- Translate raw model output into UI data without inventing unsupported quantities

Deliverables:
- derive speed from `U/V/W`
- preserve pressure as a first-class scalar
- optional vector payload for arrow rendering
- optional server-produced voxel grids for viewer reuse

Explicit non-goals:
- no fake temperature from velocity
- no PMV/comfort score presented as GINOT output

Decision point:
- either extend `HeatmapNode` with honest scalar semantics
- or introduce a dedicated airflow visualization node if the existing schema becomes too confusing

### Phase 7: Mock Fixtures and Golden Cases

Goal:
- Keep development moving without the production Python service

Deliverables:
- deterministic mock geometry snapshots
- deterministic mock GINOT responses matching `[positions, velocities, pressure, speed]`
- one golden-case tensor fixture validated against the Python reference math

Test rooms:
1. Simple Office: 5×4×2.8m, 1 supply + 1 return
2. Conference Room: 8×6×3m, 4 supply + 2 return
3. Bedroom: 4×3×2.5m, 1 supply + 1 return
4. Living Room: 6×5×2.8m, 2 supply + 1 return

### Phase 8: Hook, Store, and Viewer Integration

Goal:
- Wire the refined backend into the current editor workflow

Deliverables:
- update `use-hvac-analysis` to:
  gather geometry
  build GINOT input
  call the migrated API
  update the active visualization node
  cache scenario results
- keep `use-hvac-scenarios` focused on scenario metadata and cached outputs
- update viewer/UI controls to select speed or pressure and show vectors when available

Notes:
- this is the real end-to-end integration phase
- do not treat store-only changes as sufficient

---

## Critical Files

| File | Action | Purpose |
|------|--------|---------|
| `packages/editor/src/hooks/use-hvac-analysis.ts` | UPDATE | Main HVAC orchestration path |
| `apps/editor/app/api/hvac-inference/route.ts` | UPDATE | Migrate API contract to GINOT tensors |
| `packages/editor/src/lib/hvac/ai-inference-client.ts` | UPDATE | Reuse existing client surface for new request/response types |
| `packages/editor/src/lib/hvac/point-sampler.ts` | CREATE | Boundary and interior sampling |
| `packages/editor/src/lib/hvac/normalization.ts` | CREATE | Python-matching normalization helpers |
| `packages/editor/src/lib/hvac/ginot-input-builder.ts` | CREATE | Build `load`, `pc`, `xyt` |
| `packages/editor/src/lib/hvac/room-geometry-snapshot.ts` | CREATE | Scene-to-geometry adapter |
| `packages/editor/src/lib/hvac/mock-room-generator.ts` | CREATE | Deterministic mock geometry + mock GINOT outputs |
| `packages/editor/src/store/use-hvac-scenarios.ts` | UPDATE | Cache scenario metadata and results |
| `packages/core/src/schema/nodes/heatmap.ts` | UPDATE | Honest scalar-field semantics or raw airflow payload support |
| `packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx` | UPDATE | Render speed/pressure and vectors correctly |
| `packages/editor/src/components/ui/sidebar/panels/hvac-panel/index.tsx` | UPDATE | Expose supported fields and loading states |

---

## Success Criteria

- [ ] Request-building logic matches `docs/model-python.md` for `load`, `pc`, and `xyt`
- [ ] The same normalization parameters are used for geometry, query points, and inlet/outlet
      centers
- [ ] The migrated API accepts GINOT tensor payloads and returns airflow results successfully
- [ ] The editor renders speed and pressure without fabricating temperature/PMV as model outputs
- [ ] `use-hvac-analysis` drives the full flow from selected zone to rendered result
- [ ] Scenario state can cache and re-open a completed airflow run
- [ ] Mock fixtures enable development without the Python backend
- [ ] At least one golden-case fixture verifies normalization and denormalization math against the
      Python reference

---

## Open Questions

1. Should V1 geometry include furniture/obstacles, or only the room envelope from walls/zone?
2. Does the backend want raw `predictions` plus normalization metadata, or already denormalized
   `positions/velocities/pressure/speed`?
3. Can the backend voxelize speed/pressure efficiently enough that the browser can keep using a
   grid-style renderer?
4. Do we extend `HeatmapNode`, or introduce a dedicated airflow node once the response format is
   stable?

---

## Links

- [Python Model Reference](../../docs/model-python.md)
- [GINOT Interface Notes](../../docs/ginot-model-interface.md)
- [Current HVAC Hook](../../packages/editor/src/hooks/use-hvac-analysis.ts)
- [Current Scenario Store](../../packages/editor/src/store/use-hvac-scenarios.ts)
- [Current API Route](../../apps/editor/app/api/hvac-inference/route.ts)
- [Current Mock CFD Generator](../../packages/editor/src/lib/hvac/mock-cfd-generator.ts)
