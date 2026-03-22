# Phase 5: Synchronous API Route and Client Migration

**Status:** Pending | **Priority:** High | **Effort:** 4h
**Updated:** 2026-03-19

---

## Overview

Migrate the existing HVAC API path from the legacy 12-feature surrogate-model contract to the
GINOT tensor contract.

This phase explicitly keeps the flow synchronous:
- keep `POST /api/hvac-inference`
- keep one request / one response in V1
- do not introduce job polling or queue APIs unless runtime data proves they are needed

The current client and route already exist, so this phase updates them instead of creating a second
parallel integration surface.

---

## Files to Modify

### 1. Existing AI Inference Client
**Path:** `packages/editor/src/lib/hvac/ai-inference-client.ts`

### 2. Existing Next.js Route
**Path:** `apps/editor/app/api/hvac-inference/route.ts`

### 3. HVAC Library Index
**Path:** `packages/editor/src/lib/hvac/index.ts`

---

## Target Request and Response Shapes

```typescript
export interface GINOTInferenceRequest {
  load: number[]
  pc: number[]
  xyt: number[]
  metadata?: {
    scenarioId?: string
    zoneId?: string
    center?: [number, number, number]
    scale?: number
    bounds?: {
      min: [number, number, number]
      max: [number, number, number]
    }
  }
}

export interface GINOTInferenceResponse {
  positions: number[]
  velocities: number[]
  pressure: number[]
  speed: number[]
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
  voxelized?: {
    gridSize: number
    verticalLevels: number
    speedGrid?: number[][]
    pressureGrid?: number[][]
    speedGrid3D?: number[][][]
    pressureGrid3D?: number[][][]
    velocityDirection3D?: { x: number; y: number; z: number }[][][]
  }
}
```

Design decisions:
- request uses normalized `load`, `pc`, and `xyt`
- response is viewer-friendly and already denormalized
- response contains real airflow fields only

---

## Implementation Steps

### Step 1: Update the Existing Client Surface

Refactor `packages/editor/src/lib/hvac/ai-inference-client.ts` so the exported function still fits
the current app flow, but now sends GINOT tensors instead of the old `featureVector`.

Recommended public API:

```typescript
export async function callAIInference(
  request: GINOTInferenceRequest,
): Promise<GINOTInferenceResponse>
```

Rationale:
- `use-hvac-analysis` already calls `callAIInference(...)`
- reusing that name reduces integration churn
- new types should replace `AIInferenceRequest` / `AIInferenceResponse` rather than coexist forever

### Step 2: Validate the New Request in the Route

The route should reject malformed payloads early:
- `load.length === 9`
- `pc.length % 3 === 0`
- `xyt.length % 3 === 0`
- `pc.length > 0`
- `xyt.length > 0`

Add clear 400-level errors for invalid tensor shapes.

### Step 3: Define Backend Execution Modes

The route should support two synchronous execution modes:

1. **Real Python backend configured**
   - forward tensors to the Python service
   - receive either raw predictions or viewer-ready fields

2. **Python backend unavailable**
   - return deterministic mock GINOT output from Phase 7

This keeps frontend development unblocked while the Python service is still evolving.

### Step 4: Denormalize on the Server When Needed

If the Python backend returns:
- raw `predictions`
- raw normalized `xyt`
- normalization metadata

then the route should:
- compute `speed = sqrt(U^2 + V^2 + W^2)`
- denormalize positions using `center` and `scale`
- return `positions`, `velocities`, `pressure`, `speed`, and `bounds`

This keeps the browser-side transform small and stable.

### Step 5: Preserve Timeouts and Error Handling

The current client already enforces a request timeout. Preserve that behavior.

V1 expectations:
- time out the fetch if the backend stalls
- surface backend 4xx/5xx errors clearly in the UI
- do not invent retry loops inside the client

### Step 6: Export the New Types

Export the migrated request/response types and client from:
- `packages/editor/src/lib/hvac/index.ts`

Remove or deprecate references to the old `featureVector` contract in the public HVAC library
surface once all call sites are updated.

---

## Route Responsibilities

Preferred route responsibilities:
- validate tensors
- call Python backend or mock fallback
- convert raw predictions into viewer-friendly arrays when necessary
- optionally attach voxelized speed/pressure grids for grid-based rendering

Avoid pushing these responsibilities into `use-hvac-analysis` if the route can do them once in a
centralized place.

---

## Explicit Non-Goals

- no `GET /api/hvac-inference/:jobId`
- no async polling client
- no WebSocket protocol
- no legacy `featureVector` path as the primary API once migration is complete

---

## Success Criteria

- [ ] The existing `callAIInference()` path sends `load`, `pc`, and `xyt`
- [ ] `POST /api/hvac-inference` validates GINOT tensor shapes correctly
- [ ] The route can return deterministic mock GINOT results when Python is unavailable
- [ ] Real airflow responses come back synchronously in one request
- [ ] Error handling and timeouts remain clear at the UI boundary

---

## Related Files

- `docs/model-python.md` - tensor and output contract
- `packages/editor/src/hooks/use-hvac-analysis.ts` - current caller
- `plans/260318-2020-ginot-integration/phase-04-input-builder.md` - upstream builder
- `plans/260318-2020-ginot-integration/phase-07-mock-room-generator.md` - mock fallback
