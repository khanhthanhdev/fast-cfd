# Phase 8: Hook, Store, and Viewer Integration

**Status:** Pending | **Priority:** High | **Effort:** 4h
**Updated:** 2026-03-19

---

## Overview

Wire the refined GINOT pipeline into the actual editor workflow.

This phase is the end-to-end integration phase. The real orchestrator is the existing
`use-hvac-analysis` hook, not the scenario store alone.

V1 principles:
- `use-hvac-analysis` owns selection, diffuser detection, request execution, node CRUD, and UI
  state
- `useHVACScenarios` stores scenario metadata and cached results
- the HVAC panel shows supported airflow fields only

---

## Files to Modify

### 1. HVAC Analysis Hook
**Path:** `packages/editor/src/hooks/use-hvac-analysis.ts`

### 2. HVAC Scenario Store
**Path:** `packages/editor/src/store/use-hvac-scenarios.ts`

### 3. HVAC Sidebar Panel
**Path:** `packages/editor/src/components/ui/sidebar/panels/hvac-panel/index.tsx`

### 4. HVAC Library Index
**Path:** `packages/editor/src/lib/hvac/index.ts`

### 5. Visualization Controls and Related UI
**Path:** `packages/editor/src/components/ui/hvac/`

---

## Store Direction for V1

The store should cache results, not run async job orchestration.

Recommended scenario evolution:

```typescript
export interface HVACScenario {
  id: string
  name: string
  timestamp: number
  boundaryConditions: HVACBoundaryConditions
  zoneId?: string
  heatmapNodeId?: string

  resultType?: 'legacy-grid' | 'ginot-airflow'

  legacyResults?: {
    temperatureGrid: number[][]
    velocityGrid: number[][]
    averageTemperature: number
    pmv: number
    comfortScore: number
  }

  airflowResult?: {
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
}
```

Explicitly avoid:
- `pending` / `running` / `jobId` store machinery
- polling APIs in the store
- duplicating hook orchestration inside Zustand

---

## Implementation Steps

### Step 1: Update `use-hvac-analysis`

Replace the current flow:
- extract simple room geometry
- build `featureVector`
- call legacy route

with the refined flow:
1. find selected zone and level
2. detect one supply diffuser and one return diffuser
3. build `RoomGeometrySnapshot`
4. build `GINOTInput`
5. call migrated `callAIInference(...)`
6. transform the response into viewer/node data
7. create or update the active visualization node
8. cache the scenario result

The hook should remain the single place where these steps are coordinated.

### Step 2: Add Clear User-Facing Validation Errors

The hook should surface actionable errors when:
- no zone is selected
- no level is available
- no supply diffuser is found
- no return diffuser is found
- geometry generation fails
- API validation fails

Do not let these fail deep inside helper code without UI context.

### Step 3: Extend Scenario Caching, Not Job State

Update `useHVACScenarios` so it can cache:
- result type
- raw airflow arrays
- optional voxelized grids
- node ids / zone ids

Keep the API simple:
- create scenario
- update scenario boundary conditions
- set airflow result
- set legacy result
- select active scenario

The store should not start background polling or own cancellation logic in V1.

### Step 4: Update the HVAC Panel for Honest Fields

Update the panel and related HVAC UI so:
- supported GINOT fields are `speed` and `pressure`
- comfort KPI panels show only for legacy result types
- unsupported legacy labels are not shown for GINOT runs
- errors for missing diffusers or unsupported render modes are visible

Recommended UI changes:
- rename copy from "CFD simulation" to "airflow prediction" where appropriate
- show loading state while the synchronous request is in flight
- expose vector toggles only when vector data exists

### Step 5: Update Scenario Restore / Toggle Behavior

Current heatmap re-show logic assumes legacy grid data. Update it so cached airflow scenarios can:
- recreate the visualization node from cached airflow data
- restore the active field selection
- avoid rerunning inference when cached data is sufficient

### Step 6: Keep Legacy Paths Functional During Migration

The hook and store should support both:
- legacy grid scenarios
- new GINOT airflow scenarios

Migration expectations:
- legacy scenarios keep working until explicitly removed
- new code paths do not require deleting the old path first

---

## Recommended Hook Flow Sketch

```typescript
const geometry = buildRoomGeometrySnapshot(...)
const input = buildGINOTInput({
  geometry,
  boundaryConditions,
  supplyDiffuser,
  returnDiffuser,
})

const response = await callAIInference({
  load: Array.from(input.load),
  pc: Array.from(input.pc),
  xyt: Array.from(input.xyt),
  metadata: {
    zoneId,
    center: input.normalization.center,
    scale: input.normalization.scale,
    bounds: input.bounds,
  },
})

const transformed = transformGINOTResponse(response)
// create/update visualization node
// cache airflowResult in the scenario store
```

---

## Success Criteria

- [ ] `use-hvac-analysis` drives the full refined GINOT flow end to end
- [ ] `useHVACScenarios` caches airflow results without introducing async job orchestration
- [ ] HVAC UI presents speed/pressure for GINOT scenarios and keeps legacy KPI panels gated
- [ ] Cached airflow scenarios can be restored without rerunning inference
- [ ] Errors for missing geometry or diffusers are surfaced clearly in the UI

---

## Related Files

- `packages/editor/src/hooks/use-hvac-analysis.ts` - current orchestration path
- `packages/editor/src/store/use-hvac-scenarios.ts` - scenario cache
- `packages/editor/src/components/ui/sidebar/panels/hvac-panel/index.tsx` - current panel
- `plans/260318-2020-ginot-integration/phase-05-inference-client.md` - route/client migration
- `plans/260318-2020-ginot-integration/phase-06-response-transformer.md` - response semantics
