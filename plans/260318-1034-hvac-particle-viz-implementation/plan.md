# HVAC Particle Visualization System - Implementation Plan

**Status:** Revised
**Priority:** High
**Created:** 2026-03-18
**Last Revised:** 2026-03-19
**Brainstorm Report:** [hvac-particle-viz-brainstorm-260318-0954-hybrid-particle-system.md](../reports/hvac-particle-viz-brainstorm-260318-0954-hybrid-particle-system.md)
**Related Follow-up:** [coupled-particle-heatmap-simulation](../260318-1609-coupled-particle-heatmap-simulation/plan.md)

## Goal

Make HVAC flow readable with moving heat particles that leave supply diffusers, travel through the
room, and get absorbed by return or exhaust diffusers. Keep the heatmap as the scalar background for
room temperature. Treat vector arrows as optional debug overlays, not the primary visualization.

## Refined Scope

- Emit particles from supply diffusers using diffuser direction, spread, velocity, and temperature
- Advect particles through the velocity field, or a mock fallback field when CFD data is missing
- Color particles by thermal state so users can read hot and cold flow at a glance
- Deposit and remove heat from the heatmap grid so the particles and heatmap stay coupled
- Capture and respawn particles at return diffusers to create a readable supply-to-return loop
- Remove vector glyphs from the default UX, while keeping them available for debug if needed

## Recommended Execution Order

1. Lock the particle schema around supply emitters, return collectors, particle lifetime, and
   thermal payload.
2. Build the diffuser emission and capture loop so motion clearly starts at supply and ends at
   return.
3. Render persistent moving particles efficiently with GPU-friendly buffers.
4. Advect particles through the HVAC velocity field and only add secondary forces that improve
   readability.
5. Couple the particles back into the heatmap so the scalar field and the moving flow tell the same
   story.
6. Add trails, fading, legends, and density controls so the overlay stays readable in dense scenes.

## Refined Phase Map

| Phase | File | Refined Deliverable | Priority | Notes |
|-------|------|---------------------|----------|-------|
| 1 | `phase-01-particle-system-schema.md` | Particle-first schema for emitters, collectors, lifetime, thermal payload, and visualization toggles | High | Data contract must support the full supply → room → return lifecycle |
| 2 | `phase-02-mock-cfd-generator.md` | Mock HVAC field generator aligned to diffuser in/out flow and baseline room temperature | High | Fallback until real CFD integration is available |
| 3 | `phase-03-gpu-particle-renderer.md` | GPU-friendly renderer for persistent moving heat particles | High | Replaces vector arrows as the main motion cue |
| 4 | `phase-04-velocity-field-advection.md` | Stable field-driven advection from supply toward return, including boundary handling | High | Focus on readable flow, not full CFD fidelity |
| 5 | `phase-05-temperature-coloring.md` | Temperature sampling, per-particle thermal state, and color consistency with the heatmap | High | Needed before particle motion feels like heat transport |
| 6 | `phase-06-diffuser-emitters-attractors.md` | Diffuser emission, return capture, respawn rules, and multi-diffuser balancing | High | Core behavior for diffuser in/out particle motion |
| 7 | `phase-07-pressure-field-integration.md` | Pressure and sink tuning for return behavior and secondary flow shaping | Medium | Add after the base loop is readable |
| 8 | `phase-08-trail-rendering.md` | Trails, fade rules, legends, density controls, and vector-debug toggle | Medium | Final UX polish and readability |

## Architecture

```text
Supply diffusers
  -> emit moving particles (position, direction, temperature, lifetime)
  -> advect through room velocity field
  -> sample and carry thermal state
  -> deposit heat into 3D heatmap grid
  -> cool down or get captured near return diffusers
  -> respawn at supply diffusers

Heatmap grid
  <- receives particle heat deposition and return-side heat removal
  <- remains the scalar room-temperature view
  <- no longer depends on vector glyphs for directional context
```

## Key Dependencies

- Existing heatmap infrastructure: `packages/viewer/src/components/renderers/heatmap/`
- Color maps: `packages/viewer/src/lib/color-maps.ts`
- Existing particle runtime: `packages/viewer/src/lib/particle-system.ts`
- Diffuser detection system: `packages/editor/src/lib/hvac/diffuser-detector.ts`
- HVAC scenarios store: `packages/editor/src/store/use-hvac-scenarios.ts`

## Success Metrics

- [ ] Users can follow supply-to-return airflow without enabling vector arrows
- [ ] Moving particles clearly show diffuser outflow and return capture in multi-diffuser rooms
- [ ] Particle colors stay consistent with heatmap temperatures
- [ ] Heatmap values change when particles deposit or remove heat
- [ ] 60fps with 2000+ particles on a mid-range GPU
- [ ] Density and trail controls keep the view readable under heavy flow

## Immediate Next Steps

1. Re-target phase docs 3-6 around supply emission, return capture, and heatmap coupling.
2. Build the smallest vertical slice first: one supply diffuser, one return diffuser, one room,
   moving particles, heat deposition, and no vector arrows in the default view.
3. Only after that slice reads clearly, layer on multi-diffuser behavior, pressure tuning, and
   trails.
