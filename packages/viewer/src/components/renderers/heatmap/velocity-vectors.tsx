import { useMemo, useRef, useEffect } from 'react'
import { useRegistry, type HeatmapNode } from '@pascal-app/core'
import { type Group, ArrowHelper, Vector3, Color } from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'

interface VelocityVectorsProps {
  node: HeatmapNode
  roomBounds: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  }
  heightOffset?: number
  // Arrow styling
  arrowLength?: number
  arrowColor?: string
  minMagnitude?: number // Filter out velocities below this threshold
  // 3D support (Phase 1: 3D CFD)
  sliceIndex?: number
}

interface ArrowData {
  position: [number, number, number]
  direction: Vector3
  magnitude: number
}

// Reusable temp vectors to avoid allocations
const _tempVec1 = new Vector3()
const _tempVec2 = new Vector3()
const _tempColor = new Color()

/**
 * Renders velocity vector arrows showing airflow direction and magnitude
 * Uses object pooling to avoid GC pressure and memory leaks
 */
export const VelocityVectors = ({
  node,
  roomBounds,
  heightOffset = 0,
  arrowLength = 0.3,
  arrowColor = '#ffffff',
  minMagnitude = 0.1,
}: VelocityVectorsProps) => {
  const ref = useRef<Group>(null!)
  const arrowsRef = useRef<ArrowHelper[]>([])
  useRegistry(node.id, 'heatmap', ref)

  const vectors = useMemo(() => {
    const width = roomBounds.maxX - roomBounds.minX
    const depth = roomBounds.maxZ - roomBounds.minZ
    const gridSize = node.data.gridSize || 20
    const cellWidth = width / gridSize
    const cellDepth = depth / gridSize

    // Use velocityDirection if available, otherwise compute from velocityGrid
    const dirVectors: ArrowData[] = []

    if (node.data.velocityDirection) {
      // Use explicit direction vectors
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const dir = node.data.velocityDirection[i]?.[j]
          if (!dir) continue

          const magnitude = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2)
          if (magnitude < minMagnitude) continue

          const x = roomBounds.minX + (j + 0.5) * cellWidth
          const z = roomBounds.minZ + (i + 0.5) * cellDepth

          dirVectors.push({
            position: [x, heightOffset, z],
            direction: _tempVec1.set(dir.x, dir.y, dir.z).normalize().clone(),
            magnitude,
          })
        }
      }
    } else {
      // Infer direction from velocity magnitude gradient (simplified)
      const gridCenter = gridSize / 2

      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const velocity = node.data.velocityGrid[i]?.[j] ?? 0
          if (velocity < minMagnitude) continue

          const x = roomBounds.minX + (j + 0.5) * cellWidth
          const z = roomBounds.minZ + (i + 0.5) * cellDepth

          const di = i - gridCenter
          const dj = j - gridCenter
          const dir = _tempVec2.set(dj, 0, di).normalize().clone()

          dirVectors.push({
            position: [x, heightOffset, z],
            direction: dir,
            magnitude: velocity,
          })
        }
      }
    }

    return dirVectors
  }, [node.data, roomBounds, heightOffset, minMagnitude])

  const handlers = useNodeEvents(node, 'heatmap')

  // Update arrow pool - reuse existing arrows, create only if needed
  useEffect(() => {
    const group = ref.current
    if (!group) return

    const arrows = arrowsRef.current
    const color = _tempColor.set(arrowColor)

    // Remove excess arrows if we have more than needed
    while (arrows.length > vectors.length) {
      const arrow = arrows.pop()
      if (arrow) {
        group.remove(arrow)
        arrow.dispose()
      }
    }

    // Update existing arrows or create new ones
    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i]!
      const scaledLength = Math.min(vec.magnitude * arrowLength, 0.5)
      const headLength = scaledLength * 0.3
      const headWidth = scaledLength * 0.15

      if (i < arrows.length) {
        // Update existing arrow
        const arrow = arrows[i]!
        arrow.setDirection(vec.direction)
        arrow.position.set(...vec.position)
        arrow.setLength(scaledLength, headLength, headWidth)
        arrow.setColor(color)
      } else {
        // Create new arrow
        const arrow = new ArrowHelper(
          vec.direction,
          new Vector3(...vec.position),
          scaledLength,
          color,
          headLength,
          headWidth,
        )
        arrows.push(arrow)
        group.add(arrow)
      }
    }

    return () => {
      // Cleanup on unmount
      for (const arrow of arrows) {
        group.remove(arrow)
        arrow.dispose()
      }
      arrows.length = 0
    }
  }, [vectors, arrowColor, arrowLength])

  return <group ref={ref} {...handlers} />
}
