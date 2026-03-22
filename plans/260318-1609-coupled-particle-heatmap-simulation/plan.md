# Coupled Particle-Heatmap Simulation - Implementation Plan

**Status:** Complete
**Priority:** High
**Created:** 2026-03-18
**Completed:** 2026-03-18
**Parent:** [HVAC Particle Visualization](../260318-1034-hvac-particle-viz-implementation/plan.md)

## Overview

Real-time coupled simulation where particles flow from supply diffusers, carry temperature, deposit heat to 3D grid, and heat diffuses across cells with blue→green→red visualization.

## Implementation Phases

| Phase | File | Deliverable | Priority | Status |
|-------|------|-------------|----------|--------|
| 1 | `phase-01-fix-jet-colormap.md` | Fix jet colormap for accurate blue-green-red | High | Complete |
| 2 | `phase-02-heat-deposition.md` | Particle→grid heat deposition | High | Complete |
| 3 | `phase-03-heat-diffusion.md` | CPU-based Laplacian diffusion | High | Complete |
| 4 | `phase-04-increase-slice-density.md` | Increase heatmap slices 10→25 | Medium | Complete |
| 5 | `phase-05-return-diffuser-removal.md` | Return diffuser heat removal | Medium | Complete |

## Key Dependencies

- Existing particle system: `/packages/viewer/src/lib/particle-system.ts`
- Color maps: `/packages/viewer/src/lib/color-maps.ts`
- Heatmap renderer: `/packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx`
- Mock CFD generator: `/packages/editor/src/lib/hvac/mock-cfd-generator.ts`

## Architecture

```
Particles (supply temp) → Deposit heat → Heatmap Grid (3D)
                              ↓
                        Heat diffusion (Laplacian)
                              ↓
                    Remove heat (return diffusers)
                              ↓
                    Visualize (blue→green→red)
```

## Success Criteria

- Accurate blue (cold) → green (neutral) → red (hot) color transition
- Visible heat trails following particle paths
- Heat diffusion visible across adjacent grid cells
- 25 slice density for smoother visualization
- Return diffusers remove heat from grid
