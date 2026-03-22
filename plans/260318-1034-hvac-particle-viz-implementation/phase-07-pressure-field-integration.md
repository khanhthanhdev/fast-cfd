# Phase 7: Pressure, Sink, and Secondary Forces

**Priority:** Medium
**Status:** Retargeted
**Effort:** 2-3 hours

## Context

**Related Files:**
- `packages/viewer/src/lib/particle-forces.ts`
- `packages/viewer/src/lib/particle-system.ts`
- `packages/core/src/schema/nodes/particle-system.ts`
- `packages/editor/src/components/ui/hvac/visualization-controls.tsx`

## Overview

Retarget secondary forces so they improve readability after the core supply-to-return loop is
working. Pressure gradients, buoyancy, and return-side sink shaping should refine the motion, not
replace the primary field-driven path.

## Retargeting Notes

- This phase is intentionally secondary. Do not use it to compensate for weak Phase 4 or 6 behavior.
- Every force should be individually toggleable for debugging and demos.
- Clamp force influence so particles still look like airflow, not orbiting debug points.

## Requirements

### Functional
1. Sample pressure or sink gradients where available
2. Apply buoyancy based on particle or local temperature
3. Strengthen return-side capture without causing abrupt snapping
4. Expose toggles and strength controls for debugging

### Non-functional
1. Minimal additional frame cost
2. Clear separation between core advection and optional secondary forces
3. Stable behavior when a field is missing

## Implementation Focus

1. **Update** `packages/viewer/src/lib/particle-forces.ts`
   - Separate pressure-gradient, buoyancy, and collector-sink contributions
   - Clamp each term so it cannot dominate the main field

2. **Update** `packages/viewer/src/lib/particle-system.ts`
   - Apply secondary forces after base field sampling and before integration
   - Keep the ordering explicit and easy to disable for debugging

3. **Update** `packages/editor/src/components/ui/hvac/visualization-controls.tsx`
   - Add toggles or strength sliders for secondary-force debugging
   - Default to conservative settings

## Acceptance Checklist

- [ ] Pressure and buoyancy can be enabled or disabled independently
- [ ] Return-side sink shaping improves capture without visible teleporting
- [ ] Secondary forces do not overwhelm the base supply-to-return path
- [ ] Performance cost stays inside the frame budget

## Success Criteria

- [ ] Warm particles rise subtly when appropriate
- [ ] Return capture feels stronger and cleaner with sink shaping enabled
- [ ] Debugging is easier because each force can be isolated

## Next Steps

Phase 8: finalize readability with trails, legend updates, and debug-only vector controls
