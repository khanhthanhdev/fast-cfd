# Phase 8: Trails, Legend, and Debug Controls

**Priority:** Medium
**Status:** Retargeted
**Effort:** 3-4 hours

## Context

**Related Files:**
- `packages/viewer/src/lib/particle-trails.ts`
- `packages/viewer/src/components/renderers/particles/trail-renderer.tsx`
- `packages/editor/src/components/ui/hvac/visualization-controls.tsx`
- `packages/editor/src/components/ui/hvac/heatmap-legend.tsx`
- `packages/viewer/src/components/renderers/heatmap/velocity-vectors.tsx`

## Overview

Retarget the final polish phase around readability. Trails, legends, density controls, and
debug-only vectors should help users read the particle flow without turning the scene into visual
noise.

## Retargeting Notes

- Trails are a readability aid, not a substitute for bad base motion.
- Vector arrows remain available for debugging but should stay off by default.
- The legend must explain both the scalar heatmap and the moving particles in one place.

## Requirements

### Functional
1. Render optional particle trails with smooth fading
2. Expose trail length, particle density, and particle size controls
3. Update legend text so users understand particle temperature and diffuser in/out behavior
4. Gate vector overlays behind an explicit debug toggle

### Non-functional
1. Keep trails within the performance budget
2. Avoid clutter in dense multi-diffuser scenes
3. Preserve heatmap readability under overlays

## Implementation Focus

1. **Update** `packages/viewer/src/lib/particle-trails.ts`
   - Keep trail storage bounded and allocation-free
   - Favor smooth fading over long noisy histories

2. **Update** `packages/viewer/src/components/renderers/particles/trail-renderer.tsx`
   - Render trails in a way that complements, not obscures, the particle layer
   - Keep the baseline path readable before turning trails on

3. **Update** `packages/editor/src/components/ui/hvac/visualization-controls.tsx`
   - Add particle density, size, and trail controls
   - Add a debug-only toggle for `velocity-vectors.tsx`

4. **Update** `packages/editor/src/components/ui/hvac/heatmap-legend.tsx`
   - Explain the relationship between particle color, supply or return role, and heatmap scale

## Acceptance Checklist

- [ ] Trails can be toggled on and off without artifacts
- [ ] Density and size controls help reduce clutter in dense rooms
- [ ] The legend explains particles and heatmap together
- [ ] Vector arrows are hidden by default and available for debugging only
- [ ] Trails stay within the agreed performance budget

## Success Criteria

- [ ] Users can read the scene without enabling debug overlays
- [ ] Trails improve flow comprehension without dominating the view
- [ ] Debug controls help engineering validation without leaking into the default UX

## Next Steps

Run a full vertical-slice review: one supply, one return, heatmap on, vectors off, and particle
motion as the primary flow cue
