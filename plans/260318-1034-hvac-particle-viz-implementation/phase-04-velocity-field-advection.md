# Phase 4: Supply-to-Return Velocity Field Advection

**Priority:** High
**Status:** Retargeted
**Effort:** 3-4 hours

## Context

**Related Files:**
- `packages/viewer/src/lib/particle-system.ts`
- `packages/viewer/src/lib/particle-emitter.ts`
- `packages/editor/src/lib/hvac/mock-cfd-generator.ts`
- `packages/core/src/schema/nodes/particle-system.ts`

## Overview

Retarget advection so particles leave supply diffusers with clear initial momentum, follow the room
velocity field, and converge toward return diffusers in a readable supply-to-return loop.

## Retargeting Notes

- Advection should prioritize clarity and continuity over physically complete CFD.
- The velocity field is the primary driver; pressure and buoyancy remain secondary in Phase 7.
- Default boundary behavior should keep particles in-bounds and moving, not bouncing unrealistically.

## Requirements

### Functional
1. Sample the velocity field smoothly at arbitrary particle positions
2. Blend emitter launch velocity with sampled room velocity
3. Apply return-side pull or sink shaping without overwhelming the field
4. Handle wall, floor, and ceiling boundaries without obvious jitter
5. Support a mock fallback field when full CFD data is unavailable

### Non-functional
1. No per-frame garbage in the particle loop
2. Stable behavior across varying grid resolutions
3. Predictable motion in the smallest vertical-slice test room

## Target Update Order

```text
sample field velocity
-> blend with current particle momentum
-> apply return-side sink shaping
-> integrate position
-> clamp or slide at boundaries
-> capture or respawn if inside a return volume
```

## Implementation Focus

1. **Harden** velocity sampling inside `packages/viewer/src/lib/particle-system.ts`
   - Keep trilinear interpolation stable near bounds
   - Extract into a helper only if it materially improves readability and reuse

2. **Update** emitter-to-field blending
   - Preserve directional launch energy near the supply
   - Prevent particles from instantly flattening into weak ambient flow

3. **Define** room-boundary behavior
   - Prefer clamp, slide, or damped redirection over visible ping-pong bouncing
   - Make return capture win over wall collision when both are near

4. **Validate** the fallback path
   - Mock field must still produce readable supply outflow and return convergence

## Acceptance Checklist

- [ ] Particles follow smooth paths through the room volume
- [ ] Supply jets remain directional near the diffuser face
- [ ] Particles converge toward returns instead of drifting aimlessly
- [ ] Boundary handling avoids jitter, teleporting, and repeated bounce artifacts
- [ ] Motion remains readable when CFD data is mocked

## Success Criteria

- [ ] One supply and one return diffuser produce an immediately understandable loop
- [ ] Multi-diffuser scenes still show distinct local streams
- [ ] Field sampling and integration remain within the frame budget

## Next Steps

Phase 5: couple particle thermal state and heatmap behavior so motion also reads as heat transport
