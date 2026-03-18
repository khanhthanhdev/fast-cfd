import { BufferGeometry, LineSegments, ShaderMaterial, AdditiveBlending } from 'three'

export interface TrailBuffers {
  /** Ring buffer of history positions: [particle][historySlot][xyz] */
  historyPositions: Float32Array
  /** Age of each history point (1.0 = fresh, 0.0 = expired) */
  historyAges: Float32Array
  /** Number of particles */
  particleCount: number
  /** Number of history slots per particle */
  trailLength: number
}

/**
 * Create trail buffer system for particle history tracking
 */
export function createTrailBuffers(
  particleCount: number,
  trailLength: number,
): TrailBuffers {
  return {
    historyPositions: new Float32Array(particleCount * trailLength * 3),
    historyAges: new Float32Array(particleCount * trailLength),
    particleCount,
    trailLength,
  }
}

/**
 * Shift history back one slot and insert current particle positions as newest entry.
 * Ages all trail points by fadeRate * deltaTime.
 */
export function updateTrails(
  trails: TrailBuffers,
  positions: Float32Array,
  deltaTime: number,
  fadeRate: number,
): void {
  const { historyPositions, historyAges, particleCount, trailLength } = trails

  for (let i = 0; i < particleCount; i++) {
    // Shift history back (oldest slot dropped)
    for (let j = trailLength - 1; j > 0; j--) {
      const srcIdx = (i * trailLength + (j - 1)) * 3
      const dstIdx = (i * trailLength + j) * 3
      historyPositions[dstIdx] = historyPositions[srcIdx]!
      historyPositions[dstIdx + 1] = historyPositions[srcIdx + 1]!
      historyPositions[dstIdx + 2] = historyPositions[srcIdx + 2]!

      historyAges[i * trailLength + j] = historyAges[i * trailLength + (j - 1)]!
    }

    // Insert current position as newest history point
    const baseIdx = i * 3
    const histIdx = i * trailLength * 3
    historyPositions[histIdx] = positions[baseIdx]!
    historyPositions[histIdx + 1] = positions[baseIdx + 1]!
    historyPositions[histIdx + 2] = positions[baseIdx + 2]!
    historyAges[i * trailLength] = 1.0
  }

  // Age all trail points
  for (let i = 0; i < historyAges.length; i++) {
    historyAges[i] = Math.max(0, historyAges[i]! - fadeRate * deltaTime)
  }
}

/**
 * Build line-segment geometry from trail history.
 * Only emits segments where both endpoints have sufficient age.
 * Also outputs per-vertex alpha for fading.
 */
export function buildTrailGeometry(
  trails: TrailBuffers,
  particleColors: Float32Array,
  minAge: number = 0.05,
): { positions: Float32Array; colors: Float32Array; count: number } {
  const { historyPositions, historyAges, particleCount, trailLength } = trails

  // Max possible segments: particleCount * (trailLength - 1), each segment = 2 vertices
  const maxVertices = particleCount * (trailLength - 1) * 2
  const posOut = new Float32Array(maxVertices * 3)
  const colOut = new Float32Array(maxVertices * 4) // RGBA

  let vertexCount = 0

  for (let i = 0; i < particleCount; i++) {
    for (let j = 0; j < trailLength - 1; j++) {
      const ageIdx1 = i * trailLength + j
      const ageIdx2 = i * trailLength + j + 1
      const age1 = historyAges[ageIdx1]!
      const age2 = historyAges[ageIdx2]!

      if (age1 < minAge || age2 < minAge) continue

      const idx1 = ageIdx1 * 3
      const idx2 = ageIdx2 * 3

      const vOff = vertexCount * 3
      // Vertex 1 (newer)
      posOut[vOff] = historyPositions[idx1]!
      posOut[vOff + 1] = historyPositions[idx1 + 1]!
      posOut[vOff + 2] = historyPositions[idx1 + 2]!
      // Vertex 2 (older)
      posOut[vOff + 3] = historyPositions[idx2]!
      posOut[vOff + 4] = historyPositions[idx2 + 1]!
      posOut[vOff + 5] = historyPositions[idx2 + 2]!

      // Color from particle's current color, alpha from age
      const cr = particleColors[i * 3]!
      const cg = particleColors[i * 3 + 1]!
      const cb = particleColors[i * 3 + 2]!

      const cOff = vertexCount * 4
      colOut[cOff] = cr
      colOut[cOff + 1] = cg
      colOut[cOff + 2] = cb
      colOut[cOff + 3] = age1 * 0.6 // Slightly transparent

      colOut[cOff + 4] = cr
      colOut[cOff + 5] = cg
      colOut[cOff + 6] = cb
      colOut[cOff + 7] = age2 * 0.6

      vertexCount += 2
    }
  }

  return {
    positions: posOut.subarray(0, vertexCount * 3),
    colors: colOut.subarray(0, vertexCount * 4),
    count: vertexCount,
  }
}

// --- Trail shaders ---

export const trailVertexShader = `
  attribute vec4 trailColor;
  varying vec4 vTrailColor;

  void main() {
    vTrailColor = trailColor;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`

export const trailFragmentShader = `
  varying vec4 vTrailColor;

  void main() {
    if (vTrailColor.a < 0.01) discard;
    gl_FragColor = vTrailColor;
  }
`

/**
 * Create a reusable LineSegments object with trail shaders
 */
export function createTrailMesh(): { geometry: BufferGeometry; material: ShaderMaterial; mesh: LineSegments } {
  const geometry = new BufferGeometry()
  const material = new ShaderMaterial({
    vertexShader: trailVertexShader,
    fragmentShader: trailFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const mesh = new LineSegments(geometry, material)
  mesh.frustumCulled = false
  return { geometry, material, mesh }
}
