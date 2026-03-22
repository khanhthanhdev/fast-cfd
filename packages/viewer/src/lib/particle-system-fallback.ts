import {
  ParticleSystemNode,
  type HeatmapNode,
  type ParticleAttractor,
  type ParticleEmitter,
  type ParticleSystemNodeType,
  type TemperatureField3D,
  type VelocityField3D,
} from '@pascal-app/core'

interface RoomBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Build velocity field from heatmap 3D velocity data.
 * Converts [y][z][x] nested arrays + optional direction grid
 * into the flat [vx,vy,vz,...] format used by the particle system.
 */
function buildVelocityFieldFromHeatmap(
  node: HeatmapNode,
  bounds: { min: [number, number, number]; max: [number, number, number] },
): VelocityField3D | undefined {
  const velocityGrid3D = node.data.velocityGrid3D
  const directionGrid = node.data.velocityGrid3DDirection

  if (!velocityGrid3D?.length) return undefined

  const ny = velocityGrid3D.length
  const nz = velocityGrid3D[0]?.length ?? 0
  const nx = velocityGrid3D[0]?.[0]?.length ?? 0

  if (!nx || !ny || !nz) return undefined

  const data: number[] = []

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const rawMag = velocityGrid3D[y]?.[z]?.[x]
        const magnitude: number = Number.isFinite(rawMag) ? (rawMag as number) : 0
        const direction = directionGrid?.[y]?.[z]?.[x]

        if (direction) {
          const dirLength = Math.hypot(direction.x, direction.y, direction.z) || 1
          const vx = (direction.x / dirLength) * magnitude
          const vy = (direction.y / dirLength) * magnitude
          const vz = (direction.z / dirLength) * magnitude
          data.push(
            Number.isFinite(vx) ? vx : 0,
            Number.isFinite(vy) ? vy : 0,
            Number.isFinite(vz) ? vz : 0,
          )
        } else {
          data.push(0, 0, 0)
        }
      }
    }
  }

  return {
    gridResolution: [nx, ny, nz],
    bounds,
    data,
  }
}

/**
 * Build temperature field from heatmap 3D temperature data.
 */
function buildTemperatureFieldFromHeatmap(
  node: HeatmapNode,
  bounds: { min: [number, number, number]; max: [number, number, number] },
): TemperatureField3D | undefined {
  const temperatureGrid3D = node.data.temperatureGrid3D

  if (!temperatureGrid3D?.length) return undefined

  const ny = temperatureGrid3D.length
  const nz = temperatureGrid3D[0]?.length ?? 0
  const nx = temperatureGrid3D[0]?.[0]?.length ?? 0

  if (!nx || !ny || !nz) return undefined

  const data: number[] = []

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const val = temperatureGrid3D[y]?.[z]?.[x]
        data.push(Number.isFinite(val) ? (val as number) : 22)
      }
    }
  }

  return {
    gridResolution: [nx, ny, nz],
    bounds,
    data,
  }
}

/**
 * Find velocity peaks in the velocity grid to use as emitter positions.
 * Scans top slice (ceiling) for supply diffusers and bottom for returns.
 */
function findVelocityPeaks(
  velocityGrid3D: number[][][],
  roomBounds: RoomBounds,
  roomHeight: number,
  type: 'supply' | 'return',
): { position: [number, number, number]; magnitude: number; direction: [number, number, number] }[] {
  const ny = velocityGrid3D.length
  const nz = velocityGrid3D[0]?.length ?? 0
  const nx = velocityGrid3D[0]?.[0]?.length ?? 0

  if (!nx || !ny || !nz) return []

  // For supply: scan top layers (ceiling-mounted diffusers)
  // For return: scan bottom/mid layers
  const targetY = type === 'supply'
    ? Math.max(0, ny - 2)
    : Math.min(ny - 1, 1)

  const width = roomBounds.maxX - roomBounds.minX
  const depth = roomBounds.maxZ - roomBounds.minZ

  let maxMagnitude = 0
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const mag = velocityGrid3D[targetY]?.[z]?.[x] ?? 0
      maxMagnitude = Math.max(maxMagnitude, mag)
    }
  }

  if (maxMagnitude < 0.01) return []

  const threshold = maxMagnitude * 0.4
  const peaks: { position: [number, number, number]; magnitude: number; direction: [number, number, number] }[] = []

  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) {
      const mag = velocityGrid3D[targetY]?.[z]?.[x] ?? 0

      if (mag >= threshold) {
        const worldX = roomBounds.minX + ((x + 0.5) / nx) * width
        const worldY = type === 'supply' ? roomHeight * 0.95 : roomHeight * 0.1
        const worldZ = roomBounds.minZ + ((z + 0.5) / nz) * depth

        peaks.push({
          position: [worldX, worldY, worldZ],
          magnitude: mag,
          direction: type === 'supply' ? [0, -1, 0] : [0, 1, 0],
        })
      }
    }
  }

  // Cluster nearby peaks into a single emitter
  if (peaks.length === 0) return []

  const clustered: typeof peaks = []
  const used = new Set<number>()
  const clusterRadius = Math.max(width, depth) / 6

  for (let i = 0; i < peaks.length; i++) {
    if (used.has(i)) continue
    used.add(i)

    let cx = peaks[i]!.position[0] * peaks[i]!.magnitude
    let cy = peaks[i]!.position[1] * peaks[i]!.magnitude
    let cz = peaks[i]!.position[2] * peaks[i]!.magnitude
    let totalMag = peaks[i]!.magnitude
    let count = 1

    for (let j = i + 1; j < peaks.length; j++) {
      if (used.has(j)) continue
      const dx = peaks[i]!.position[0] - peaks[j]!.position[0]
      const dz = peaks[i]!.position[2] - peaks[j]!.position[2]

      if (Math.hypot(dx, dz) < clusterRadius) {
        used.add(j)
        cx += peaks[j]!.position[0] * peaks[j]!.magnitude
        cy += peaks[j]!.position[1] * peaks[j]!.magnitude
        cz += peaks[j]!.position[2] * peaks[j]!.magnitude
        totalMag += peaks[j]!.magnitude
        count++
      }
    }

    clustered.push({
      position: [cx / totalMag, cy / totalMag, cz / totalMag],
      magnitude: totalMag / count,
      direction: peaks[i]!.direction,
    })
  }

  return clustered.slice(0, 4)
}

/**
 * Generate a fallback particle system from existing heatmap data.
 * Used when the heatmap has velocity/temperature grids but no stored particleSystem.
 */
export function generateFallbackParticleSystem(
  node: HeatmapNode,
  roomBounds: RoomBounds,
  roomHeight: number,
): ParticleSystemNodeType | null {
  const hasVelocityData = !!node.data.velocityGrid3D?.length
  const hasTemperatureData = !!node.data.temperatureGrid3D?.length
  const has2DVelocity = node.data.velocityGrid.length > 0
  const has2DTemperature = node.data.temperatureGrid.length > 0

  // Need at least some data to generate particles
  if (!hasVelocityData && !hasTemperatureData && !has2DVelocity && !has2DTemperature) {
    return null
  }

  const bounds: { min: [number, number, number]; max: [number, number, number] } = {
    min: [roomBounds.minX, 0, roomBounds.minZ],
    max: [roomBounds.maxX, roomHeight, roomBounds.maxZ],
  }

  const velocityField = buildVelocityFieldFromHeatmap(node, bounds)
  const temperatureField = buildTemperatureFieldFromHeatmap(node, bounds)

  // Try to find emitter/attractor positions from velocity peaks
  const emitters: ParticleEmitter[] = []
  const attractors: ParticleAttractor[] = []

  if (hasVelocityData) {
    const supplyPeaks = findVelocityPeaks(node.data.velocityGrid3D!, roomBounds, roomHeight, 'supply')
    const returnPeaks = findVelocityPeaks(node.data.velocityGrid3D!, roomBounds, roomHeight, 'return')

    for (let i = 0; i < supplyPeaks.length; i++) {
      const peak = supplyPeaks[i]!
      emitters.push({
        id: `fallback_emitter_${i}`,
        position: peak.position,
        direction: peak.direction,
        velocity: clamp(peak.magnitude * 0.8, 0.3, 1.5),
        temperature: node.data.averageTemperature - 3,
        spreadAngle: Math.PI / 7,
        emissionRate: 80,
        radius: 0.2,
      })
    }

    for (let i = 0; i < returnPeaks.length; i++) {
      const peak = returnPeaks[i]!
      attractors.push({
        id: `fallback_collector_${i}`,
        position: peak.position,
        strength: clamp(peak.magnitude * 0.6, 0.2, 1.0),
        radius: 0.5,
        heatRemovalRate: 0.15,
        removalRadius: 0.4,
        sinkStrength: 1,
      })
    }
  }

  // If no peaks found, create a simple center emitter
  if (emitters.length === 0) {
    const centerX = (roomBounds.minX + roomBounds.maxX) / 2
    const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2

    emitters.push({
      id: 'fallback_emitter_center',
      position: [centerX, roomHeight * 0.9, centerZ],
      direction: [0, -1, 0],
      velocity: 0.5,
      temperature: node.data.averageTemperature - 2,
      spreadAngle: Math.PI / 5,
      emissionRate: 80,
      radius: 0.25,
    })
  }

  // Get temperature range
  let minTemp = node.data.averageTemperature - 4
  let maxTemp = node.data.averageTemperature + 4

  if (hasTemperatureData) {
    const flat = node.data.temperatureGrid3D!.flat(2)
    const validTemps = flat.filter(Number.isFinite)
    if (validTemps.length > 0) {
      minTemp = Math.min(...validTemps)
      maxTemp = Math.max(...validTemps)
    }
  }

  if (minTemp === maxTemp) {
    minTemp -= 1
    maxTemp += 1
  }

  return ParticleSystemNode.parse({
    particleCount: clamp(800 + emitters.length * 500, 1200, 3000),
    particleSize: 0.034,
    particleLifetime: 8,
    emitters,
    attractors,
    velocityField,
    temperatureField,
    heatDepositionRate: 0.12,
    heatDecayRate: 0.03,
    ambientTemperature: node.data.averageTemperature,
    heatExchangeRate: 1.2,
    temperatureRange: [minTemp, maxTemp],
    colorByTemperature: true,
    colorScheme: 'jet',
    showTrails: false,
    trailLength: 12,
    trailFade: 2,
    particleOpacity: 0.8,
    enablePressure: false,
    enableBuoyancy: false,
    enableSink: true,
    sinkStrength: 0.8,
    enabled: true,
  })
}
