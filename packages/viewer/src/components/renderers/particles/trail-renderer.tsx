'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, type LineSegments } from 'three'
import type { TrailBuffers } from '../../../lib/particle-trails'
import {
  buildTrailGeometry,
  createTrailMesh,
  updateTrails,
} from '../../../lib/particle-trails'

interface TrailRendererProps {
  trailBuffers: TrailBuffers
  /** Live particle positions buffer (shared with particle system) */
  positions: Float32Array
  /** Live particle colors buffer (shared with particle system) */
  colors: Float32Array
  /** Fade rate (higher = trails disappear faster) */
  fadeRate?: number
  enabled?: boolean
}

export const TrailRenderer = ({
  trailBuffers,
  positions,
  colors,
  fadeRate = 2.0,
  enabled = true,
}: TrailRendererProps) => {
  const trailRef = useRef<LineSegments>(null!)

  const { geometry, material, mesh } = useMemo(() => createTrailMesh(), [])

  // Pre-allocate max-capacity buffers once to avoid GPU buffer leaks on growth
  const maxVertices = trailBuffers.particleCount * (trailBuffers.trailLength - 1) * 2
  const { posBuffer, colBuffer } = useMemo(() => ({
    posBuffer: new Float32Array(maxVertices * 3),
    colBuffer: new Float32Array(maxVertices * 4),
  }), [maxVertices])

  // Set up pre-allocated attributes once
  useMemo(() => {
    geometry.setAttribute('position', new BufferAttribute(posBuffer, 3))
    geometry.setAttribute('trailColor', new BufferAttribute(colBuffer, 4))
    geometry.setDrawRange(0, 0)
  }, [geometry, posBuffer, colBuffer])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame((_, delta) => {
    if (!enabled || !trailRef.current) return

    const cappedDelta = Math.min(delta, 0.1)

    // Record current particle positions into trail history
    updateTrails(trailBuffers, positions, cappedDelta, fadeRate)

    // Rebuild line-segment geometry from history
    const result = buildTrailGeometry(trailBuffers, colors)

    if (result.count === 0) {
      geometry.setDrawRange(0, 0)
      return
    }

    // Copy results into pre-allocated buffers
    posBuffer.set(result.positions)
    colBuffer.set(result.colors)

    const posAttr = geometry.getAttribute('position') as BufferAttribute
    const colAttr = geometry.getAttribute('trailColor') as BufferAttribute
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true

    geometry.setDrawRange(0, result.count)
  })

  return <primitive ref={trailRef} object={mesh} />
}
