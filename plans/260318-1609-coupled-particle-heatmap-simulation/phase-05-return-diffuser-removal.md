# Phase 5: Add Return Diffuser Heat Removal

**Priority:** Medium | **Status:** Complete | **Effort:** 1.5h

## Context

Return/exhaust diffusers should remove heat from the grid, completing the thermal circulation cycle.

## Requirements

- Return/exhaust diffusers extract heat from adjacent grid cells
- Negative heat deposition at return locations
- Creates realistic thermal circulation pattern
- Rate based on diffuser airflow capacity

## Schema Changes

Add to `ParticleAttractorSchema` in `/packages/core/src/schema/nodes/particle-system.ts`:

```typescript
export const ParticleAttractorSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  strength: z.number(),
  radius: z.number(),

  // Heat removal settings
  heatRemovalRate: z.number().default(0.15), // Heat extracted per frame
  removalRadius: z.number().default(0.5), // meters
})
```

## Implementation Steps

### 1. Extend heat deposition with removal function

Modify `/packages/viewer/src/lib/heat-deposition.ts`:

```typescript
interface HeatRemovalParams {
  temperatureGrid3D: number[][][]
  gridResolution: [number, number, number]
  bounds: { min: [number, number, number]; max: [number, number, number] }
  attractors: ParticleAttractor[]
  ambientTemperature: number
  deltaTime: number
}

/**
 * Remove heat at return/exhaust diffuser locations
 */
export function removeHeatAtDiffusers(params: HeatRemovalParams): void {
  const {
    temperatureGrid3D,
    gridResolution,
    bounds,
    attractors,
    ambientTemperature,
    deltaTime
  } = params

  const [nx, ny, nz] = gridResolution

  for (const attractor of attractors) {
    if (attractor.heatRemovalRate <= 0) continue

    // Convert attractor position to grid coordinates
    const ax = attractor.position[0]
    const ay = attractor.position[1]
    const az = attractor.position[2]

    const gx = Math.floor(((ax - bounds.min[0]) / (bounds.max[0] - bounds.min[0])) * (nx - 1))
    const gy = Math.floor(((ay - bounds.min[1]) / (bounds.max[1] - bounds.min[1])) * (ny - 1))
    const gz = Math.floor(((az - bounds.min[2]) / (bounds.max[2] - bounds.min[2])) * (nz - 1))

    // Spherical removal radius in grid cells
    const radiusCells = attractor.removalRadius / Math.min(
      (bounds.max[0] - bounds.min[0]) / nx,
      (bounds.max[1] - bounds.min[1]) / ny,
      (bounds.max[2] - bounds.min[2]) / nz
    )
    const radiusSq = radiusCells * radiusCells

    // Remove heat in spherical region around diffuser
    for (let k = Math.max(0, gz - Math.ceil(radiusCells)); k <= Math.min(nz - 1, gz + Math.ceil(radiusCells)); k++) {
      for (let j = Math.max(0, gy - Math.ceil(radiusCells)); j <= Math.min(ny - 1, gy + Math.ceil(radiusCells)); j++) {
        for (let i = Math.max(0, gx - Math.ceil(radiusCells)); i <= Math.min(nx - 1, gx + Math.ceil(radiusCells)); i++) {
          const dx = i - gx
          const dy = j - gy
          const dz = k - gz
          const distSq = dx * dx + dy * dy + dz * dz

          if (distSq <= radiusSq) {
            const currentTemp = temperatureGrid3D[k]?.[j]?.[i] ?? ambientTemperature

            // Linear interpolation: full removal at center, zero at edge
            const falloff = 1 - Math.sqrt(distSq / radiusSq)
            const removalAmount = (currentTemp - ambientTemperature) * attractor.heatRemovalRate * falloff * deltaTime

            temperatureGrid3D[k]![j]![i] = currentTemp - removalAmount
          }
        }
      }
    }
  }
}
```

### 2. Integrate into simulation update loop

In `/packages/viewer/src/lib/particle-system.ts` or heatmap renderer:

```typescript
// After heat deposition and diffusion
if (node.attractors && node.attractors.some(a => a.heatRemovalRate > 0)) {
  removeHeatAtDiffusers({
    temperatureGrid3D: temperatureField.data,
    gridResolution: temperatureField.gridResolution,
    bounds: temperatureField.bounds,
    attractors: node.attractors,
    ambientTemperature: node.ambientTemperature,
    deltaTime,
  })
}
```

### 3. Auto-create attractors from return diffusers

In `/packages/editor/src/lib/hvac/diffuser-detector.ts`, add helper:

```typescript
export function createAttractorsFromDiffusers(
  diffusers: DiffuserInfo[],
): ParticleAttractor[] {
  return diffusers
    .filter(d => d.type === 'return' || d.type === 'exhaust')
    .map(diffuser => ({
      id: `attractor-${diffuser.id}`,
      position: diffuser.position,
      strength: 5.0, // Attraction strength for particles
      radius: 0.5,   // Capture radius
      heatRemovalRate: 0.15,
      removalRadius: 0.8,
    }))
}
```

## Files to Modify

- `/packages/core/src/schema/nodes/particle-system.ts` - Add heatRemovalRate, removalRadius
- `/packages/viewer/src/lib/heat-deposition.ts` - Add removeHeatAtDiffusers function
- `/packages/editor/src/lib/hvac/diffuser-detector.ts` - Add attractor creation helper

## Success Criteria

- [ ] Heat decreases near return/exhaust diffusers
- [ ] Visible thermal flow from supply (hot) to return (cool)
- [ ] System reaches thermal equilibrium with balanced deposition/removal
- [ ] Removal radius creates smooth heat extraction zone
- [ ] Return diffusers attract particles AND remove heat
