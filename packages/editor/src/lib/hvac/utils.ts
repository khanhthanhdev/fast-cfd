/**
 * Get PMV comfort label based on ISO 7730
 */
export function getPMVLabel(pmv: number): string {
  if (pmv < -2) return 'Cold'
  if (pmv < -1) return 'Cool'
  if (pmv < 1) return 'Neutral'
  if (pmv < 2) return 'Warm'
  return 'Hot'
}

/**
 * Calculate polygon area using the shoelace formula
 */
export function calculatePolygonArea(polygon: Array<[number, number]>): number {
  if (polygon.length < 3) return 0
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i]
    const p2 = polygon[(i + 1) % polygon.length]
    if (!p1 || !p2) continue
    area += p1[0] * p2[1]
    area -= p2[0] * p1[1]
  }
  return Math.abs(area / 2)
}

/**
 * Calculate centroid of a polygon
 */
export function getPolygonCentroid(polygon: Array<[number, number]>): [number, number] {
  if (polygon.length === 0) return [0, 0]
  let x = 0
  let z = 0
  for (const [px, pz] of polygon) {
    x += px
    z += pz
  }
  return [x / polygon.length, z / polygon.length]
}

/**
 * Check if two polygons match by comparing centroids within a threshold
 */
export function polygonCentroidsMatch(
  a: Array<[number, number]>,
  b: Array<[number, number]>,
  threshold = 0.5,
): boolean {
  const centroidA = getPolygonCentroid(a)
  const centroidB = getPolygonCentroid(b)
  const dist = Math.sqrt(
    (centroidA[0] - centroidB[0]) ** 2 + (centroidA[1] - centroidB[1]) ** 2,
  )
  return dist < threshold
}

/**
 * Check if two polygons are equal within a threshold
 */
export function polygonsEqual(
  a: Array<[number, number]>,
  b: Array<[number, number]>,
  threshold = 0.01,
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]
    const bi = b[i]
    if (!ai || !bi) return false
    if (Math.abs(ai[0] - bi[0]) > threshold || Math.abs(ai[1] - bi[1]) > threshold) {
      return false
    }
  }
  return true
}
