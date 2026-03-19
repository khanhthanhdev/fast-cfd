/**
 * Normalization utilities for GINOT tensor preparation
 *
 * These utilities match the Python reference implementation exactly:
 * - center = mean of mesh bounds (not centroid of volume)
 * - scale = maximum room dimension (not diagonal)
 * - Same normalization applied to: boundary points, query points, inlet/outlet centers
 * - Velocity values in load vector are NOT normalized
 */

/**
 * Compute normalization parameters from bounding box
 *
 * @param bounds - Bounding box with min/max arrays
 * @returns center point and scale factor
 */
export function computeNormalization(
  bounds: { min: number[]; max: number[] }
): { center: [number, number, number]; scale: number } {
  const center: [number, number, number] = [
    (bounds.min[0]! + bounds.max[0]!) / 2,
    (bounds.min[1]! + bounds.max[1]!) / 2,
    (bounds.min[2]! + bounds.max[2]!) / 2,
  ]

  const scale = Math.max(
    bounds.max[0]! - bounds.min[0]!,
    bounds.max[1]! - bounds.min[1]!,
    bounds.max[2]! - bounds.min[2]!
  )

  return { center, scale }
}

/**
 * Normalize an array of 3D points
 *
 * @param points - Array of [x, y, z] points
 * @param center - Normalization center
 * @param scale - Normalization scale
 * @returns Normalized points
 */
export function normalizePoints(
  points: number[][],
  center: [number, number, number],
  scale: number
): number[][] {
  return points.map((point) => [
    (point[0]! - center[0]) / scale,
    (point[1]! - center[1]) / scale,
    (point[2]! - center[2]) / scale,
  ])
}

/**
 * Normalize a single 3D point
 *
 * @param point - [x, y, z] point
 * @param center - Normalization center
 * @param scale - Normalization scale
 * @returns Normalized point
 */
export function normalizePoint(
  point: [number, number, number],
  center: [number, number, number],
  scale: number
): [number, number, number] {
  return [
    (point[0] - center[0]) / scale,
    (point[1] - center[1]) / scale,
    (point[2] - center[2]) / scale,
  ]
}

/**
 * Denormalize points back to world coordinates
 *
 * @param points - Array of normalized [x, y, z] points
 * @param center - Normalization center
 * @param scale - Normalization scale
 * @returns Points in world coordinates
 */
export function denormalizePoints(
  points: number[][],
  center: [number, number, number],
  scale: number
): number[][] {
  return points.map((point) => [
    point[0]! * scale + center[0],
    point[1]! * scale + center[1],
    point[2]! * scale + center[2],
  ])
}

/**
 * Denormalize a single point back to world coordinates
 *
 * @param point - Normalized [x, y, z] point
 * @param center - Normalization center
 * @param scale - Normalization scale
 * @returns Point in world coordinates
 */
export function denormalizePoint(
  point: [number, number, number],
  center: [number, number, number],
  scale: number
): [number, number, number] {
  return [
    point[0] * scale + center[0],
    point[1] * scale + center[1],
    point[2] * scale + center[2],
  ]
}

/**
 * Normalize the load vector (9-element GINOT input)
 *
 * The load vector contains:
 * - Indices 0-2: normalized inlet center [x, y, z]
 * - Indices 3-5: normalized outlet center [x, y, z]
 * - Indices 6-8: inlet velocity [u, v, w] in m/s (NOT normalized)
 *
 * @param inletCenter - Inlet center in world coordinates
 * @param outletCenter - Outlet center in world coordinates
 * @param inletVelocity - Inlet velocity vector [u, v, w] in m/s
 * @param center - Normalization center
 * @param scale - Normalization scale
 * @returns Normalized load vector [9]
 */
export function normalizeLoadVector(
  inletCenter: [number, number, number],
  outletCenter: [number, number, number],
  inletVelocity: [number, number, number],
  center: [number, number, number],
  scale: number
): Float32Array {
  const normalizedInletCenter = normalizePoint(inletCenter, center, scale)
  const normalizedOutletCenter = normalizePoint(outletCenter, center, scale)

  const load = new Float32Array(9)
  load[0] = normalizedInletCenter[0]
  load[1] = normalizedInletCenter[1]
  load[2] = normalizedInletCenter[2]
  load[3] = normalizedOutletCenter[0]
  load[4] = normalizedOutletCenter[1]
  load[5] = normalizedOutletCenter[2]
  load[6] = inletVelocity[0] // Velocity NOT normalized
  load[7] = inletVelocity[1]
  load[8] = inletVelocity[2]

  return load
}

/**
 * Parse a load vector back into components
 *
 * @param load - Load vector [9]
 * @param center - Normalization center (for denormalization)
 * @param scale - Normalization scale
 * @returns Object with inletCenter, outletCenter (world coords), and inletVelocity
 */
export function parseLoadVector(
  load: Float32Array | number[],
  center: [number, number, number],
  scale: number
): {
  inletCenter: [number, number, number]
  outletCenter: [number, number, number]
  inletVelocity: [number, number, number]
} {
  const normalizedInletCenter: [number, number, number] = [
    load[0]!,
    load[1]!,
    load[2]!,
  ]
  const normalizedOutletCenter: [number, number, number] = [
    load[3]!,
    load[4]!,
    load[5]!,
  ]

  return {
    inletCenter: denormalizePoint(normalizedInletCenter, center, scale),
    outletCenter: denormalizePoint(normalizedOutletCenter, center, scale),
    inletVelocity: [load[6]!, load[7]!, load[8]!],
  }
}

/**
 * Validate load vector shape and reasonable values
 *
 * @param load - Load vector to validate
 * @returns Validation result with errors if invalid
 */
export function validateLoadVector(
  load: Float32Array | number[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (load.length !== 9) {
    errors.push(`Expected load vector length 9, got ${load.length}`)
    return { valid: false, errors }
  }

  // Normalized centers should be in reasonable range [-2, 2] typically
  for (let i = 0; i < 6; i++) {
    if (Math.abs(load[i]!) > 10) {
      errors.push(`Load[${i}] = ${load[i]} seems outside normalized range`)
    }
  }

  // Velocities should be positive and reasonable for HVAC (0-10 m/s typical)
  for (let i = 6; i < 9; i++) {
    if (load[i]! < -50 || load[i]! > 50) {
      errors.push(`Load[${i}] = ${load[i]} seems like invalid velocity`)
    }
  }

  return { valid: errors.length === 0, errors }
}
