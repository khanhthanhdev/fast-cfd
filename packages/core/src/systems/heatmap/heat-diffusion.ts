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
    ambientTemperature = 293,
  } = params

  const [nx, ny, nz] = gridResolution
  const [dx, dy, dz] = cellSize

  // Precompute diffusion coefficients for stability
  const dt = deltaTime / iterations
  const cx = (diffusionCoefficient * dt) / (dx * dx)
  const cy = (diffusionCoefficient * dt) / (dy * dy)
  const cz = (diffusionCoefficient * dt) / (dz * dz)

  // Stability check: cx + cy + cz <= 0.5 for explicit Euler
  const stability = cx + cy + cz
  if (stability > 0.5) {
    console.warn(
      `Heat diffusion may be unstable: cx=${cx.toFixed(4)}, cy=${cy.toFixed(4)}, cz=${cz.toFixed(4)}, sum=${stability.toFixed(4)}`,
    )
  }

  // Double buffer for simultaneous update
  let source = temperatureGrid3D
  let target = createGridCopy(temperatureGrid3D)

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
  return source.map((level) => level.map((row) => [...row]))
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
