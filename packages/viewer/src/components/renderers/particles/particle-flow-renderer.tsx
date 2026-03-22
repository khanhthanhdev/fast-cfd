'use client'

import type {
  ParticleSystemNodeType,
  TemperatureField3D,
  VelocityField3D,
} from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import type * as THREE from 'three'
import {
  BufferAttribute,
  BufferGeometry,
  NormalBlending,
} from 'three'
import { colorMaps } from '../../../lib/color-maps'
import {
  createActiveHeatCellSet,
  depositHeatToGrid,
  removeHeatAtDiffusers,
  temperatureFieldFrom3DArray,
  temperatureFieldTo3DArray,
} from '../../../lib/heat-deposition'
import { createParticleNodeMaterial } from '../../../lib/particle-shaders'
import {
  createParticleBuffers,
  createParticleEmitterRuntime,
  emitParticlesFromEmitters,
  updateParticleColors,
  updateParticlePositions,
} from '../../../lib/particle-system'
import { createTrailBuffers } from '../../../lib/particle-trails'
import { TrailRenderer } from './trail-renderer'

interface ParticleFlowRendererProps {
  node: ParticleSystemNodeType
  velocityField?: VelocityField3D
  temperatureField?: TemperatureField3D
  roomBounds: { min: [number, number, number]; max: [number, number, number] }
  sharedHeatGridRef?: MutableRefObject<number[][][] | null>
  sharedActiveHeatCellIndicesRef?: MutableRefObject<Set<number> | null>
}

export const ParticleFlowRenderer = ({
  node,
  velocityField,
  temperatureField,
  roomBounds,
  sharedHeatGridRef,
  sharedActiveHeatCellIndicesRef,
}: ParticleFlowRendererProps) => {
  const pointsRef = useRef<THREE.Points>(null!)
  const localHeatGridRef = useRef<number[][][] | null>(null)
  const localActiveHeatCellIndicesRef = useRef<Set<number> | null>(null)
  const emitters = node.emitters ?? []
  const activeVelocityField = velocityField ?? node.velocityField
  const activeTemperatureField = temperatureField ?? node.temperatureField

  const particleBuffers = useMemo(
    () => createParticleBuffers(node.particleCount, emitters, node.particleLifetime, true),
    [emitters, node.particleCount, node.particleLifetime],
  )

  const emitterRuntime = useMemo(
    () => createParticleEmitterRuntime(node.particleCount, emitters, node.particleLifetime),
    [emitters, node.particleCount, node.particleLifetime],
  )

  const trailBuffers = useMemo(
    () => createTrailBuffers(node.particleCount, node.trailLength),
    [node.particleCount, node.trailLength],
  )

  useEffect(() => {
    if (!activeTemperatureField) {
      localHeatGridRef.current = null
      localActiveHeatCellIndicesRef.current = null
      return
    }

    const nextHeatGrid = temperatureFieldTo3DArray(activeTemperatureField)
    localHeatGridRef.current = nextHeatGrid
    localActiveHeatCellIndicesRef.current = createActiveHeatCellSet(
      nextHeatGrid,
      activeTemperatureField.gridResolution,
      node.ambientTemperature,
    )
  }, [activeTemperatureField, node.ambientTemperature])

  const { geometry, material } = useMemo(() => {
    const nextGeometry = new BufferGeometry()
    nextGeometry.setAttribute('position', new BufferAttribute(particleBuffers.geometry.position, 3))
    nextGeometry.setAttribute('color', new BufferAttribute(particleBuffers.geometry.color, 3))
    nextGeometry.setAttribute('lifetime', new BufferAttribute(particleBuffers.geometry.lifetime, 1))

    const nextMaterial = createParticleNodeMaterial(
      node.particleSize * 120,
      node.particleOpacity,
    )
    nextMaterial.blending = NormalBlending

    return {
      geometry: nextGeometry,
      material: nextMaterial,
    }
  }, [node.particleOpacity, node.particleSize, particleBuffers.geometry.color, particleBuffers.geometry.lifetime, particleBuffers.geometry.position])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useEffect(() => {
    if (material.uniforms.pointSize) {
      material.uniforms.pointSize.value = node.particleSize * 120
    }

    if (material.uniforms.opacity) {
      material.uniforms.opacity.value = node.particleOpacity
    }
  }, [material, node.particleOpacity, node.particleSize])

  useFrame((_, delta) => {
    if (!pointsRef.current || !node.enabled || emitters.length === 0) return

    const cappedDelta = Math.min(delta, 0.08)

    emitParticlesFromEmitters(
      particleBuffers.data,
      emitters,
      emitterRuntime,
      cappedDelta,
      node.particleLifetime,
    )

    updateParticlePositions(
      particleBuffers.data,
      activeVelocityField,
      node.attractors,
      emitters,
      roomBounds,
      cappedDelta,
      activeTemperatureField,
      node.pressureField,
      {
        pressure: node.enablePressure,
        buoyancy: node.enableBuoyancy,
        sink: node.enableSink,
        particleLifetime: node.particleLifetime,
        ambientTemperature: node.ambientTemperature,
        heatExchangeRate: node.heatExchangeRate,
        pressureStrength: node.pressureStrength,
        buoyancyStrength: node.buoyancyStrength,
        sinkStrength: node.sinkStrength,
      },
    )

    if (node.colorByTemperature) {
      const colorMapFn = colorMaps[node.colorScheme] ?? colorMaps.jet
      updateParticleColors(
        particleBuffers.data,
        activeTemperatureField,
        node.colorScheme,
        colorMapFn!,
        {
          min: node.temperatureRange[0],
          max: node.temperatureRange[1],
        },
      )
    }

    const heatGrid = sharedHeatGridRef?.current ?? localHeatGridRef.current

    if (activeTemperatureField && heatGrid) {
      let activeHeatCellIndices =
        sharedActiveHeatCellIndicesRef?.current ?? localActiveHeatCellIndicesRef.current

      if (!activeHeatCellIndices) {
        activeHeatCellIndices = createActiveHeatCellSet(
          heatGrid,
          activeTemperatureField.gridResolution,
          node.ambientTemperature,
        )

        if (sharedActiveHeatCellIndicesRef) {
          sharedActiveHeatCellIndicesRef.current = activeHeatCellIndices
        } else {
          localActiveHeatCellIndicesRef.current = activeHeatCellIndices
        }
      }

      depositHeatToGrid({
        particleData: particleBuffers.data,
        temperatureGrid3D: heatGrid,
        gridResolution: activeTemperatureField.gridResolution,
        bounds: roomBounds,
        depositionRate: node.heatDepositionRate,
        decayRate: node.heatDecayRate,
        ambientTemp: node.ambientTemperature,
        deltaTime: cappedDelta,
        activeCellIndices: activeHeatCellIndices,
      })

      if (node.attractors.some((attractor) => (attractor.heatRemovalRate ?? 0) > 0)) {
        removeHeatAtDiffusers({
          temperatureGrid3D: heatGrid,
          gridResolution: activeTemperatureField.gridResolution,
          bounds: roomBounds,
          attractors: node.attractors,
          ambientTemperature: node.ambientTemperature,
          deltaTime: cappedDelta,
          activeCellIndices: activeHeatCellIndices,
        })
      }

      temperatureFieldFrom3DArray(heatGrid, activeTemperatureField)
    }

    ;(geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true
    ;(geometry.attributes.lifetime as THREE.BufferAttribute).needsUpdate = true
  })

  if (!node.enabled || emitters.length === 0) {
    return null
  }

  return (
    <group>
      {node.showTrails && (
        <TrailRenderer
          trailBuffers={trailBuffers}
          positions={particleBuffers.data.positions}
          lifetimes={particleBuffers.data.lifetimes}
          respawnCounts={particleBuffers.data.respawnCounts}
          colors={particleBuffers.data.colors}
          fadeRate={node.trailFade}
          enabled={node.enabled}
        />
      )}
      <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
    </group>
  )
}
