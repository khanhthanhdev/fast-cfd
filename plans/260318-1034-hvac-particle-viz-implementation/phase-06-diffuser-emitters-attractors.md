# Phase 6: Diffuser Emitters and Return Collectors

**Priority:** High
**Status:** Retargeted
**Effort:** 3-4 hours

## Context

**Related Files:**
- `packages/editor/src/lib/hvac/diffuser-detector.ts`
- `packages/editor/src/store/use-hvac-scenarios.ts`
- `packages/editor/src/lib/hvac/mock-cfd-generator.ts`
- `packages/viewer/src/lib/particle-emitter.ts`
- `packages/viewer/src/components/renderers/particles/particle-flow-renderer.tsx`
- `packages/core/src/schema/nodes/particle-system.ts`

## Overview

Retarget diffuser handling so supply diffusers are explicit particle sources and return or exhaust
diffusers are explicit collectors. This phase owns the most important user-visible behavior:
particles should clearly leave one set of diffusers and disappear into another.

## Retargeting Notes

- The schema still uses `attractors`; in the UX and docs these should be treated as return
  collectors or sinks.
- Existing emitter utilities should be reused, not replaced.
- Multi-diffuser behavior matters here because that is where visual ambiguity appears first.

## Requirements

### Functional
1. Detect or derive supply emitters and return collectors from HVAC scenario data
2. Spawn particles with diffuser direction, spread, temperature, and rate
3. Capture particles near return diffusers and recycle them cleanly
4. Balance particle budgets across multiple emitters so one diffuser does not starve the others
5. Support heat removal settings on return collectors

### Non-functional
1. No visible burst emission from frame-rate spikes
2. No per-frame buffer growth
3. Deterministic enough behavior for repeatable QA screenshots and demos

## Implementation Focus

1. **Update** `packages/editor/src/lib/hvac/diffuser-detector.ts`
   - Ensure supply vs return roles are available to the particle system
   - Keep role mapping stable across scene edits

2. **Update** `packages/editor/src/lib/hvac/mock-cfd-generator.ts`
   - Generate emitter and collector data that produces readable in/out motion
   - Include heat removal settings for return diffusers

3. **Update** `packages/viewer/src/lib/particle-emitter.ts`
   - Smooth emission over time
   - Preserve per-emitter ownership and reuse slots on respawn
   - Capture particles cleanly at return collectors

4. **Update** `packages/viewer/src/components/renderers/particles/particle-flow-renderer.tsx`
   - Wire emitter state, collector capture, and respawn order into the frame loop
   - Add minimal debug markers only if needed to validate diffuser roles

## Acceptance Checklist

- [ ] Supply diffusers continuously emit particles in the expected direction
- [ ] Return diffusers consistently collect nearby particles
- [ ] Respawn happens at supply diffusers rather than arbitrary room locations
- [ ] Multiple supply diffusers contribute visible flow simultaneously
- [ ] Heat removal settings on collectors feed Phase 5 coupling correctly

## Success Criteria

- [ ] Users can identify which diffusers are supplying and which are returning air from the particle motion alone
- [ ] Particle density remains balanced and steady in multi-diffuser rooms
- [ ] No visible popping, starvation, or runaway accumulation near returns

## Next Steps

Phase 7: add subtle secondary forces only after the core supply-to-return loop is already readable
