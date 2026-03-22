# Phase 3: GPU Heat Particle Renderer

**Priority:** High
**Status:** Retargeted
**Effort:** 4-6 hours

## Context

**Related Files:**
- `packages/viewer/src/components/renderers/particles/particle-flow-renderer.tsx`
- `packages/viewer/src/components/renderers/particles/particles-basic.tsx`
- `packages/viewer/src/lib/particle-system.ts`
- `packages/viewer/src/lib/particle-shaders.ts`
- `packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx`
- `packages/viewer/src/components/renderers/heatmap/velocity-vectors.tsx`

## Overview

Retarget the existing particle renderer so moving heat particles become the default HVAC direction
cue. The renderer should make supply outflow and return capture obvious without relying on vector
arrows in the default view.

## Retargeting Notes

- Reuse the existing particle renderer stack instead of creating a second visualization path.
- Treat `velocity-vectors.tsx` as debug-only after the particle overlay is readable.
- Optimize for clarity first: stable flow, readable density, and consistent layering over heatmaps.

## Requirements

### Functional
1. Render 2000-5000 particles at interactive frame rates
2. Show continuous supply emission and return-side disappearance or capture
3. Keep particles visible on top of the heatmap without washing out the scalar field
4. Support particle size, density, and trail toggles from viewer controls
5. Handle node enable/disable and room changes without stale buffers

### Non-functional
1. Follow existing React Three Fiber and viewer registration patterns
2. Avoid per-frame allocations in the hot loop
3. Keep material and geometry lifecycle explicit and disposable
4. Keep default visuals readable in multi-diffuser rooms

## Implementation Focus

1. **Update** `packages/viewer/src/components/renderers/particles/particle-flow-renderer.tsx`
   - Make the frame loop order explicit: emit or respawn, advect, update thermal state, capture,
     then sync geometry
   - Default to particle-first HVAC rendering
   - Keep vector overlays outside the main user path

2. **Update** `packages/viewer/src/lib/particle-system.ts`
   - Keep stable particle buffers for positions, velocities, lifetimes, emitter ownership, and
     thermal payload
   - Support reuse across node changes instead of full rebuilds where possible

3. **Update** `packages/viewer/src/lib/particle-shaders.ts`
   - Tune point size, opacity, and fade so the particles read as moving air rather than spark noise
   - Keep trail compatibility but do not require trails for the baseline view

4. **Keep** `packages/viewer/src/components/renderers/particles/particles-basic.tsx` minimal
   - Useful as fallback or isolated debug surface
   - Not the primary HVAC visualization target

## Acceptance Checklist

- [ ] Particle renderer is the default directional visualization for HVAC scenes
- [ ] Supply particles are visible immediately after enabling the node
- [ ] Return-side capture is visually obvious without auxiliary arrows
- [ ] Renderer remains stable when room bounds, emitters, or fields change
- [ ] Heatmap remains readable beneath the particle layer
- [ ] `velocity-vectors.tsx` can be disabled from the default experience

## Success Criteria

- [ ] Users can infer airflow direction from particles alone
- [ ] Particle motion reads clearly in a one-supply / one-return room before advanced tuning
- [ ] 60fps is maintained with 2000+ particles on a mid-range GPU
- [ ] No visible buffer reset artifacts during normal interaction

## Next Steps

Phase 4: stabilize supply-to-return field advection and room-boundary behavior
