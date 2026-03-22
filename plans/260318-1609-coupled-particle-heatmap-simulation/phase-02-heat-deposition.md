# Phase 2: Add Heat Deposition from Particles to Heatmap Grid

**Priority:** High | **Status:** Complete | **Effort:** 2h

## Context

Particles carry temperature but don't currently deposit heat to the 3D grid. Need to add heat transfer mechanism.

## Requirements

- Each particle deposits heat to nearest grid cell per frame
- Deposition rate based on particle temperature difference from ambient
- Accumulate heat in grid over time with decay

## Schema Changes

Add to `ParticleSystemNode`:

```typescript
// Heat deposition settings
heatDepositionRate: z.number().default(0.1), // Heat added per particle per frame
ambientTemperature: z.number().default(293), // 20°C baseline
heatDecayRate: z.number().default(0.02), // Natural cooling to ambient
```

## Implementation Steps

### 1. Create `/packages/viewer/src/lib/heat-deposition.ts`

```typescript
import type { TemperatureField3D, ParticleData } from '@pascal-app/core'

interface HeatDepositionParams {
  particleData: ParticleData
  temperatureGrid3D: number[][][]
  gridResolution: [number, number, number]
  bounds: { min: [number, number, number]; max: [number, number, number] }
  depositionRate: number
  decayRate: number
  ambientTemp: number
  deltaTime: number
}

/**
 * Deposit heat from particles to 3D temperature grid
 */
export function depositHeatToGrid(params: HeatDepositionParams): void {
  const { particleData, temperatureGrid3D, gridResolution, bounds, depositionRate, decayRate, ambientTemp, deltaTime } = params
  const [nx, ny, nz] = gridResolution

  // 1. Apply decay to existing heat (cooling toward ambient)
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const current = temperatureGrid3D[k]?.[j]?.[i] ?? ambientTemp
        temperatureGrid3D[k]![j]![i] = current + (ambientTemp - current) * decayRate * deltaTime
      }
    }
  }

  // 2. Deposit heat from particles
  for (let p = 0; p < particleData.positions.length / 3; p++) {
    if (particleData.lifetimes[p]! <= 0) continue

    const x = particleData.positions[p * 3]!
    const y = particleData.positions[p * 3 + 1]!
    const z = particleData.positions[p * 3 + 2]!

    // Convert world position to grid coordinates
    const gx = Math.floor(((x - bounds.min[0]) / (bounds.max[0] - bounds.min[0])) * (nx - 1))
    const gy = Math.floor(((y - bounds.min[1]) / (bounds.max[1] - bounds.min[1])) * (ny - 1))
    const gz = Math.floor(((z - bounds.min[2]) / (bounds.max[2] - bounds.min[2])) * (nz - 1))

    // Clamp to grid bounds
    const cellX = Math.max(0, Math.min(nx - 1, gx))
    const cellY = Math.max(0, Math.min(ny - 1, gy))
    const cellZ = Math.max(0, Math.min(nz - 1, gz))

    // Get particle temperature (from colors or stored data)
    const particleTemp = getParticleTemperature(particleData, p)

    // Deposit heat
    const currentTemp = temperatureGrid3D[cellZ]?.[cellY]?.[cellX] ?? ambientTemp
    temperatureGrid3D[cellZ]![cellY]![cellX] = currentTemp + (particleTemp - ambientTemp) * depositionRate * deltaTime
  }
}

function getParticleTemperature(particleData: ParticleData, index: number): number {
  // Extract temperature from particle color or store separately
  // For now, use color-based estimation
  const r = particleData.colors[index * 3]!
  const g = particleData.colors[index * 3 + 1]!
  const b = particleData.colors[index * 3 + 2]!

  // Simple heuristic: red = hot, blue = cold
  const t = (r - b + 1) / 2 // 0-1 range
  return 288 + t * 15 // 288K-303K range
}
```

### 2. Integrate into particle system update loop

Modify `/packages/viewer/src/lib/particle-system.ts`:

```typescript
import { depositHeatToGrid } from './heat-deposition'

export function updateParticlePositions(...) {
  // ... existing position update code ...

  // After updating positions, deposit heat
  if (temperatureField && node.heatDepositionRate > 0) {
    depositHeatToGrid({
      particleData: buffers,
      temperatureGrid3D: temperatureField.data,
      gridResolution: temperatureField.gridResolution,
      bounds: temperatureField.bounds,
      depositionRate: node.heatDepositionRate,
      decayRate: node.heatDecayRate,
      ambientTemp: node.ambientTemperature,
      deltaTime,
    })
  }
}
```

### 3. Add heat accumulation field separate from temperature field

May need to add `HeatmapNode.heatAccumulationGrid3D` for temporary storage.

## Files to Create

- `/packages/viewer/src/lib/heat-deposition.ts`

## Files to Modify

- `/packages/core/src/schema/nodes/particle-system.ts` - Add deposition settings
- `/packages/viewer/src/lib/particle-system.ts` - Call deposition in update

## Success Criteria

- [ ] Visible heat trails where particles flow
- [ ] Heat accumulates over time along particle paths
- [ ] Heat gradually decays back to ambient
- [ ] Deposition rate is tunable via schema
- [ ] No performance degradation (>50fps maintained)
