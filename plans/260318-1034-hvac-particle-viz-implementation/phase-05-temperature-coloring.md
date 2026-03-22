# Phase 5: Thermal State and Heatmap Coupling

**Priority:** High
**Status:** Retargeted
**Effort:** 3-4 hours

## Context

**Related Files:**
- `packages/viewer/src/lib/particle-system.ts`
- `packages/viewer/src/lib/heat-deposition.ts`
- `packages/viewer/src/lib/color-maps.ts`
- `packages/editor/src/components/ui/hvac/heatmap-legend.tsx`
- `packages/core/src/schema/nodes/particle-system.ts`

## Overview

Retarget temperature handling so particles do not just sample a color from the room. They should
carry a thermal state from their supply diffuser, exchange heat with the room grid, and remain
visually consistent with the heatmap.

## Retargeting Notes

- Particle color must tell the same story as the heatmap, not compete with it.
- Return diffusers should remove heat from the grid as part of the same loop.
- Default behavior should favor intuitive blue-cool / warm-hot reading as defined by the active
  heatmap scheme.

## Requirements

### Functional
1. Initialize particle temperature from emitter temperature
2. Update particle temperature as particles move through the room
3. Deposit or remove heat from the 3D heatmap grid each frame
4. Color particles from the same scale and color scheme used by the heatmap
5. Make return diffusers act as heat sinks when configured

### Non-functional
1. Avoid per-particle object allocation during color or heat updates
2. Keep heat deposition stable enough to avoid noisy flicker
3. Keep particle and heatmap legends aligned in the UI

## Implementation Focus

1. **Update** `packages/viewer/src/lib/particle-system.ts`
   - Track per-particle thermal payload alongside position and lifetime
   - Blend emitter temperature, sampled room temperature, and decay rules deliberately

2. **Update** `packages/viewer/src/lib/heat-deposition.ts`
   - Deposit heat from particles into the grid
   - Remove heat near configured return collectors
   - Keep accumulation bounded so the room field stays readable

3. **Align** `packages/viewer/src/lib/color-maps.ts` and `packages/editor/src/components/ui/hvac/heatmap-legend.tsx`
   - Use the same min/max temperature ranges and labels for both layers
   - Ensure color interpretation remains stable when schemes change

## Acceptance Checklist

- [ ] Supply particles spawn with the expected supply temperature
- [ ] Particle colors evolve as they travel through warmer or cooler zones
- [ ] Heatmap values respond to particle deposition and return-side removal
- [ ] Particle colors and heatmap colors match for the same temperature range
- [ ] No obvious flicker from repeated deposition in place

## Success Criteria

- [ ] Users can read both flow direction and heat transport from the same scene
- [ ] Supply jets look thermally distinct from the surrounding room
- [ ] Return diffusers visibly remove heat from the field when configured

## Next Steps

Phase 6: tighten the diffuser emission and return collection loop, especially for multi-diffuser rooms
