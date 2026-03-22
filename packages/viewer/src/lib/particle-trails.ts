import { attribute } from 'three/tsl'
import { AdditiveBlending, BufferGeometry, LineBasicNodeMaterial, LineSegments } from 'three/webgpu'

export interface TrailBuffers {
  historyPositions: Float32Array
  historyAges: Float32Array
  writeHeads: Uint16Array
  lastActive: Uint8Array
  lastRespawnCounts: Uint32Array
  particleCount: number
  trailLength: number
}

export function createTrailBuffers(
  particleCount: number,
  trailLength: number,
): TrailBuffers {
  return {
    historyPositions: new Float32Array(particleCount * trailLength * 3),
    historyAges: new Float32Array(particleCount * trailLength),
    writeHeads: new Uint16Array(particleCount),
    lastActive: new Uint8Array(particleCount),
    lastRespawnCounts: new Uint32Array(particleCount),
    particleCount,
    trailLength,
  }
}

function clearParticleTrailHistory(
  trails: TrailBuffers,
  particleIndex: number,
): void {
  const trailStart = particleIndex * trails.trailLength
  trails.historyAges.fill(0, trailStart, trailStart + trails.trailLength)
  trails.writeHeads[particleIndex] = 0
}

export function updateTrails(
  trails: TrailBuffers,
  positions: Float32Array,
  lifetimes: Float32Array,
  respawnCounts: Uint32Array,
  deltaTime: number,
  fadeRate: number,
): void {
  const {
    historyPositions,
    historyAges,
    writeHeads,
    lastActive,
    lastRespawnCounts,
    particleCount,
    trailLength,
  } = trails
  const ageDecay = fadeRate * deltaTime

  for (let index = 0; index < historyAges.length; index++) {
    historyAges[index] = Math.max(0, (historyAges[index] ?? 0) - ageDecay)
  }

  for (let particleIndex = 0; particleIndex < particleCount; particleIndex++) {
    const isActive = (lifetimes[particleIndex] ?? 0) > 0
    const respawnCount = respawnCounts[particleIndex] ?? 0

    if (!isActive) {
      lastActive[particleIndex] = 0
      lastRespawnCounts[particleIndex] = respawnCount
      continue
    }

    if (
      (lastActive[particleIndex] ?? 0) === 0
      || respawnCount !== (lastRespawnCounts[particleIndex] ?? 0)
    ) {
      clearParticleTrailHistory(trails, particleIndex)
    }

    const writeIndex = writeHeads[particleIndex] ?? 0
    const trailIndex = particleIndex * trailLength + writeIndex
    const historyBase = trailIndex * 3
    const positionBase = particleIndex * 3

    historyPositions[historyBase] = positions[positionBase] ?? 0
    historyPositions[historyBase + 1] = positions[positionBase + 1] ?? 0
    historyPositions[historyBase + 2] = positions[positionBase + 2] ?? 0
    historyAges[trailIndex] = 1
    writeHeads[particleIndex] = (writeIndex + 1) % trailLength
    lastActive[particleIndex] = 1
    lastRespawnCounts[particleIndex] = respawnCount
  }
}

export function fillTrailGeometry(
  trails: TrailBuffers,
  particleColors: Float32Array,
  positionOut: Float32Array,
  colorOut: Float32Array,
  minAge: number = 0.05,
): number {
  const { historyPositions, historyAges, writeHeads, particleCount, trailLength } = trails
  let vertexCount = 0

  for (let particleIndex = 0; particleIndex < particleCount; particleIndex++) {
    const head = ((writeHeads[particleIndex] ?? 0) - 1 + trailLength) % trailLength

    for (let segment = 0; segment < trailLength - 1; segment++) {
      const newerSlot = (head - segment + trailLength) % trailLength
      const olderSlot = (head - segment - 1 + trailLength) % trailLength
      const newerIndex = particleIndex * trailLength + newerSlot
      const olderIndex = particleIndex * trailLength + olderSlot
      const newerAge = historyAges[newerIndex] ?? 0
      const olderAge = historyAges[olderIndex] ?? 0

      if (newerAge < minAge || olderAge < minAge) continue

      const newerBase = newerIndex * 3
      const olderBase = olderIndex * 3
      const positionBase = vertexCount * 3
      const colorBase = vertexCount * 4
      const red = particleColors[particleIndex * 3] ?? 1
      const green = particleColors[particleIndex * 3 + 1] ?? 1
      const blue = particleColors[particleIndex * 3 + 2] ?? 1

      positionOut[positionBase] = historyPositions[newerBase] ?? 0
      positionOut[positionBase + 1] = historyPositions[newerBase + 1] ?? 0
      positionOut[positionBase + 2] = historyPositions[newerBase + 2] ?? 0
      positionOut[positionBase + 3] = historyPositions[olderBase] ?? 0
      positionOut[positionBase + 4] = historyPositions[olderBase + 1] ?? 0
      positionOut[positionBase + 5] = historyPositions[olderBase + 2] ?? 0

      colorOut[colorBase] = red
      colorOut[colorBase + 1] = green
      colorOut[colorBase + 2] = blue
      colorOut[colorBase + 3] = newerAge * 0.45
      colorOut[colorBase + 4] = red
      colorOut[colorBase + 5] = green
      colorOut[colorBase + 6] = blue
      colorOut[colorBase + 7] = olderAge * 0.22

      vertexCount += 2
    }
  }

  return vertexCount
}

export function buildTrailGeometry(
  trails: TrailBuffers,
  particleColors: Float32Array,
  minAge: number = 0.05,
): { positions: Float32Array; colors: Float32Array; count: number } {
  const maxVertices = trails.particleCount * (trails.trailLength - 1) * 2
  const positions = new Float32Array(maxVertices * 3)
  const colors = new Float32Array(maxVertices * 4)
  const count = fillTrailGeometry(trails, particleColors, positions, colors, minAge)

  return {
    positions: positions.subarray(0, count * 3),
    colors: colors.subarray(0, count * 4),
    count,
  }
}

export function createTrailMesh(): {
  geometry: BufferGeometry
  material: LineBasicNodeMaterial
  mesh: LineSegments
} {
  const geometry = new BufferGeometry()

  const trailColorAttr = attribute<'vec4'>('trailColor', 'vec4')

  const material = new LineBasicNodeMaterial({
    colorNode: trailColorAttr.xyz,
    opacityNode: trailColorAttr.w,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  const mesh = new LineSegments(geometry, material)
  mesh.frustumCulled = false
  return { geometry, material, mesh }
}
