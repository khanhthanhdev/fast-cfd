# Phase 6: Response Contract and Visualization Semantics

**Status:** Pending | **Priority:** High | **Effort:** 4h
**Updated:** 2026-03-19

---

## Overview

Transform the API response into a viewer-friendly airflow visualization model without inventing
unsupported physical quantities.

The authoritative model output is:
- `U`
- `V`
- `W`
- `p`

The editor may derive:
- `speed = sqrt(U^2 + V^2 + W^2)`

The editor must **not** present:
- fake temperature derived from velocity
- PMV or comfort score as if GINOT produced them

---

## Files to Create

### 1. Response Transformer Module
**Path:** `packages/editor/src/lib/hvac/ginot-response-transformer.ts`

---

## Files to Modify

### 1. Heatmap Schema
**Path:** `packages/core/src/schema/nodes/heatmap.ts`

### 2. 3D Heatmap Renderer
**Path:** `packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx`

### 3. HVAC Library Index
**Path:** `packages/editor/src/lib/hvac/index.ts`

---

## Preferred V1 Data Model

To minimize viewer churn, keep using `HeatmapNode` in V1, but make the schema honest about the
field being rendered.

Recommended schema evolution:

```typescript
visualizationType: z.enum([
  'temperature',
  'velocity',
  'pmv',
  'speed',
  'pressure',
])

data: z.object({
  // legacy fields remain for backward compatibility
  temperatureGrid: z.array(z.array(z.number())).optional(),
  velocityGrid: z.array(z.array(z.number())).optional(),
  averageTemperature: z.number().optional(),
  pmv: z.number().optional(),
  comfortScore: z.number().optional(),

  // new airflow payload
  airflow: z.object({
    positions: z.array(z.number()),
    velocities: z.array(z.number()),
    pressure: z.array(z.number()),
    speed: z.array(z.number()),
  }).optional(),

  speedGrid: z.array(z.array(z.number())).optional(),
  pressureGrid: z.array(z.array(z.number())).optional(),
  speedGrid3D: z.array(z.array(z.array(z.number()))).optional(),
  pressureGrid3D: z.array(z.array(z.array(z.number()))).optional(),
  velocityDirection3D: z.array(
    z.array(
      z.array(
        z.object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        }),
      ),
    ),
  ).optional(),
})
```

If extending `HeatmapNode` becomes too awkward in implementation, stop and introduce a dedicated
airflow node before spreading misleading heatmap semantics further.

---

## Implementation Steps

### Step 1: Create a Lightweight Transformer

Implement:

```typescript
export interface AirflowPointCloud {
  positions: Float32Array
  velocities: Float32Array
  pressure: Float32Array
  speed: Float32Array
}

export function computeSpeed(velocities: Float32Array): Float32Array

export function transformGINOTResponse(
  response: GINOTInferenceResponse,
): {
  airflow: AirflowPointCloud
  heatmapPatch: Record<string, unknown>
}
```

The transformer's job is:
- validate array lengths
- compute `speed` if the backend omitted it
- convert arrays into a node patch the viewer can consume

The transformer should stay lightweight. Heavy voxelization should not be the default browser-side
strategy.

### Step 2: Accept Optional Voxelized Data

If the backend provides:
- `speedGrid`
- `pressureGrid`
- `speedGrid3D`
- `pressureGrid3D`
- `velocityDirection3D`

the transformer should pass them through directly into the node patch.

This keeps the viewer usable in grid/slice/volume modes without expensive client-side
reconstruction.

### Step 3: Add Viewer-Semantic Guards

Update the renderer so:
- `visualizationType === 'speed'` reads airflow speed grids
- `visualizationType === 'pressure'` reads airflow pressure grids
- vector rendering uses real velocity directions when available

If only raw point-cloud data exists and no grids are present:
- either render a point-cloud fallback
- or disable slice/volume modes explicitly in the UI

Do not silently map raw airflow arrays onto `temperatureGrid`.

### Step 4: Keep Legacy Data Working

Do not break the current mock CFD path immediately.

Requirements:
- existing temperature/PMV screens continue to work for legacy scenarios
- new GINOT scenarios use `speed` and `pressure`
- the schema can hold both until migration is complete

### Step 5: Add Response Validation

Validate:
- `positions.length % 3 === 0`
- `velocities.length % 3 === 0`
- `pressure.length === positions.length / 3`
- `speed.length === positions.length / 3`

Fail early if the backend returns inconsistent lengths.

---

## Explicit Non-Goals

- no temperature synthesis from velocity
- no PMV or comfort-score synthesis from airflow output
- no browser-first inverse-distance voxelization as the primary path

If the route cannot provide voxelized data yet, prefer a simple raw-point visualization fallback
over expensive client interpolation that is likely to be wrong or slow.

---

## Success Criteria

- [ ] Speed is computed correctly from `U/V/W`
- [ ] Pressure remains a first-class scalar field
- [ ] Viewer code can distinguish legacy temperature data from GINOT airflow data
- [ ] No unsupported temperature or comfort metrics are presented as model output
- [ ] Raw airflow arrays and optional voxelized grids can both flow through the response layer

---

## Related Files

- `docs/model-python.md` - authoritative output semantics
- `apps/editor/app/api/hvac-inference/route.ts` - upstream response source
- `packages/editor/src/hooks/use-hvac-analysis.ts` - downstream consumer
