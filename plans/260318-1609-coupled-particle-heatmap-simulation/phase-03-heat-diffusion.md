# Phase 3: Add Heat Diffusion Between Grid Cells (CPU-based Laplacian)

**Priority:** High | **Status:** Complete | **Effort:** 3h

## Context

Heat needs to diffuse across adjacent grid cells using Laplacian operator for realistic thermal spread.

## Requirements

CPU-based heat diffusion:
- 3D Laplacian: ∂T/∂t = α∇²T
- Diffusion coefficient α tunable (0.01-0.1)
- Stable explicit Euler integration
- Zero-flux boundary conditions at walls

## Schema Changes

Add to `HeatmapNode`:

```typescript
// Heat diffusion settings
heatDiffusionEnabled: z.boolean().default(true),
diffusionCoefficient: z.number().default(0.05), // α in m²/s
diffusionIterations: z.number().default(1), // Sub-steps per frame
```

## Implementation Steps

### 1. Create `/packages/core/src/systems/heatmap/heat-diffusion.ts`

```typescript
interface DiffusionParams {
  temperatureGrid3D: number[][][]
  gridResolution: [number, number, number]
  cellSize: [number, number, number]
  diffusionCoefficient: number
  deltaTime: number
  iterations?: number
  ambientTemperature?: number
}

/**
 * Apply 3D heat diffusion using Laplacian operator
 * Uses explicit Euler integration with 7-point stencil
 */
export function diffuseHeat(params: DiffusionParams): void {
  const {
    temperatureGrid3D,
    gridResolution,
    cellSize,
    diffusionCoefficient,
    deltaTime,
    iterations = 1,
    ambientTemperature = 293
  } = params

  const [nx, ny, nz] = gridResolution
  const [dx, dy, dz] = cellSize

  // Precompute diffusion coefficients for stability
  const dt = deltaTime / iterations
  const cx = diffusionCoefficient * dt / (dx * dx)
  const cy = diffusionCoefficient * dt / (dy * dy)
  const cz = diffusionCoefficient * dt / (dz * dz)

  // Stability check: cx + cy + cz <= 0.5 for explicit Euler
  const stability = cx + cy + cz
  if (stability > 0.5) {
    console.warn(`Heat diffusion may be unstable: cx=${cx}, cy=${cy}, cz=${cz}`)
  }

  // Double buffer for simultaneous update
  let source = temperatureGrid3D
  const target = createGridCopy(temperatureGrid3D)

  for (let iter = 0; iter < iterations; iter++) {
    // Apply diffusion to interior cells
    for (let k = 1; k < nz - 1; k++) {
      for (let j = 1; j < ny - 1; j++) {
        for (let i = 1; i < nx - 1; i++) {
          const center = source[k]?.[j]?.[i] ?? ambientTemperature
          if (center === undefined) continue

          // 7-point Laplacian stencil
          const left = source[k]?.[j]?.[i - 1] ?? center
          const right = source[k]?.[j]?.[i + 1] ?? center
          const front = source[k]?.[j - 1]?.[i] ?? center
          const back = source[k]?.[j + 1]?.[i] ?? center
          const down = source[k - 1]?.[j]?.[i] ?? center
          const up = source[k + 1]?.[j]?.[i] ?? center

          // Laplacian: ∇²T = (T_left + T_right + T_front + T_back + T_down + T_up - 6*T_center)
          const laplacian =
            (left + right - 2 * center) * cx +
            (front + back - 2 * center) * cy +
            (down + up - 2 * center) * cz

          // Update: T_new = T_old + α * ∇²T
          target[k]![j]![i] = center + laplacian
        }
      }
    }

    // Apply zero-flux boundary conditions (Neumann)
    applyBoundaryConditions(target, ambientTemperature)

    // Swap buffers
    ;[source, target] = [target, source]
  }

  // Copy result back to original grid
  copyGrid(source, temperatureGrid3D)
}

function applyBoundaryConditions(grid: number[][][], ambient: number): void {
  // Zero-flux: dT/dn = 0 at boundaries
  // Implement by copying adjacent interior values to boundaries
  const nz = grid.length
  const ny = grid[0]?.length ?? 0
  const nx = grid[0]?.[0]?.length ?? 0

  // Floor and ceiling
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      grid[0]![j]![i] = grid[1]?.[j]?.[i] ?? ambient
      grid[nz - 1]![j]![i] = grid[nz - 2]?.[j]?.[i] ?? ambient
    }
  }

  // Walls (front/back, left/right)
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      grid[k]![j]![0] = grid[k]?.[j]?.[1] ?? ambient
      grid[k]![j]![nx - 1] = grid[k]?.[j]?.[nx - 2] ?? ambient
    }
    for (let i = 0; i < nx; i++) {
      grid[k]![0]![i] = grid[k]?.[1]?.[i] ?? ambient
      grid[k]![ny - 1]![i] = grid[k]?.[ny - 2]?.[i] ?? ambient
    }
  }
}

function createGridCopy(source: number[][][]): number[][][] {
  return source.map(level =>
    level.map(row => [...row])
  )
}

function copyGrid(source: number[][][], target: number[][][]): void {
  for (let k = 0; k < source.length; k++) {
    for (let j = 0; j < source[k]!.length; j++) {
      for (let i = 0; i < source[k]![j]!.length; i++) {
        target[k]![j]![i] = source[k]![j]![i]!
      }
    }
  }
}
```

### 2. Integrate into heatmap renderer update loop

Modify `/packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx`:

```typescript
import { diffuseHeat } from '@pascal-app/core/systems/heatmap/heat-diffusion'

useFrame((_, delta) => {
  if (node.heatDiffusionEnabled && node.data.temperatureGrid3D) {
    const gridSize = node.data.gridSize || 20
    const cellSize = [
      (roomBounds.maxX - roomBounds.minX) / gridSize,
      roomHeight / node.data.verticalLevels,
      (roomBounds.maxZ - roomBounds.minZ) / gridSize,
    ] as [number, number, number]

    diffuseHeat({
      temperatureGrid3D: node.data.temperatureGrid3D,
      gridResolution: [gridSize, node.data.verticalLevels, gridSize],
      cellSize,
      diffusionCoefficient: node.diffusionCoefficient,
      deltaTime: delta,
      iterations: node.diffusionIterations,
    })
  }
})
```

### 3. Add diffusion settings to schema

Modify `/packages/core/src/schema/nodes/heatmap.ts`:

```typescript
export const HeatmapDataSchema = z.object({
  // ... existing fields ...

  // Heat diffusion
  heatDiffusionEnabled: z.boolean().default(true),
  diffusionCoefficient: z.number().default(0.05),
  diffusionIterations: z.number().default(1),
})
```

## Files to Create

- `/packages/core/src/systems/heatmap/heat-diffusion.ts`

## Files to Modify

- `/packages/core/src/schema/nodes/heatmap.ts` - Add diffusion settings
- `/packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx` - Call diffusion

## Success Criteria

- [ ] Heat spreads from deposition points to neighboring cells
- [ ] Diffusion rate is physically plausible (visible but not instant)
- [ ] No numerical instability (no oscillations or explosions)
- [ ] 60fps maintained with diffusion on 20×20×10 grid
- [ ] Boundary conditions prevent heat loss at walls
