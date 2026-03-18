'use client'

import type { ParticleSystemNode, VelocityField3D, TemperatureField3D } from '@pascal-app/core'
import { useRegistry } from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useEffect } from 'react'
import type * as THREE from 'three'
import { ShaderMaterial, BufferGeometry, BufferAttribute, AdditiveBlending } from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'
import {
  createParticleBuffers,
  updateParticlePositions,
  updateParticleColors,
} from '../../../lib/particle-system'
import { particleVertexShader, particleFragmentShader } from '../../../lib/particle-shaders'
import { colorMaps } from '../../../lib/color-maps'
import { createTrailBuffers } from '../../../lib/particle-trails'
import { TrailRenderer } from './trail-renderer'
import {
  depositHeatToGrid,
  removeHeatAtDiffusers,
  temperatureFieldTo3DArray,
  temperatureFieldFrom3DArray,
} from '../../../lib/heat-deposition'

interface ParticleFlowRendererProps {
  node: ParticleSystemNode
  velocityField?: VelocityField3D
  temperatureField?: TemperatureField3D
  roomBounds: { min: [number, number, number]; max: [number, number, number] }
}

export const ParticleFlowRenderer = ({
  node,
  velocityField,
  temperatureField,
  roomBounds,
}: ParticleFlowRendererProps) => {
  const ref = useRef<THREE.Group>(null!)
  const particlesRef = useRef<THREE.Points>(null!)
  const { gl } = useThree()

  useRegistry(node.id, 'particle-system' as const, ref)
  const handlers = useNodeEvents(node, 'particle-system' as const)

  // Initialize particle buffers
  const particleBuffers = useMemo(() => {
    if (!node.emitters || node.emitters.length === 0) {
      // Create dummy emitter for initialization
      const dummyEmitters = [
        {
          id: 'dummy',
          position: [0, 2, 0] as [number, number, number],
          direction: [0, -1, 0] as [number, number, number],
          velocity: 0.5,
          temperature: 293,
          spreadAngle: Math.PI / 6,
          emissionRate: 100,
        },
      ]
      return createParticleBuffers(node.particleCount, dummyEmitters)
    }
    return createParticleBuffers(node.particleCount, node.emitters)
  }, [node.particleCount, node.emitters])

  // Initialize trail buffers
  const trailBuffers = useMemo(
    () => createTrailBuffers(node.particleCount, node.trailLength),
    [node.particleCount, node.trailLength],
  )

  // Convert temperature field to 3D array for heat deposition
  const heatGridRef = useRef<number[][][] | null>(null)
  if (temperatureField && !heatGridRef.current) {
    heatGridRef.current = temperatureFieldTo3DArray(temperatureField)
  }

  // Create geometry and material
  const { geometry, material } = useMemo(() => {
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(particleBuffers.geometry.position, 3))
    geom.setAttribute('color', new BufferAttribute(particleBuffers.geometry.color, 3))
    geom.setAttribute('lifetime', new BufferAttribute(particleBuffers.geometry.lifetime, 1))

    const mat = new ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        pointSize: { value: node.particleSize * 100 },
        time: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    })

    return { geometry: geom, material: mat }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  // Update loop
  useFrame((_, delta) => {
    if (!particlesRef.current || !node.enabled) return

    const cappedDelta = Math.min(delta, 0.1) // Prevent large jumps

    if (velocityField) {
      updateParticlePositions(
        particleBuffers.data,
        velocityField,
        node.attractors,
        node.emitters,
        {
          min: roomBounds.min,
          max: roomBounds.max,
        },
        cappedDelta,
        temperatureField,
        node.pressureField,
        { pressure: true, buoyancy: true },
      )
    }

    // Update colors based on temperature
    if (temperatureField && node.colorByTemperature) {
      const colorMapFn = colorMaps[node.colorScheme] || colorMaps.jet
      updateParticleColors(
        particleBuffers.data,
        temperatureField,
        node.colorScheme,
        colorMapFn!,
      )
    }

    // Heat deposition from particles to grid
    if (temperatureField && heatGridRef.current && velocityField) {
      const heatGrid = heatGridRef.current
      const gridResolution: [number, number, number] = temperatureField.gridResolution

      // Deposit heat from particles
      depositHeatToGrid({
        particleData: particleBuffers.data,
        temperatureGrid3D: heatGrid,
        gridResolution,
        bounds: {
          min: roomBounds.min,
          max: roomBounds.max,
        },
        depositionRate: node.heatDepositionRate,
        decayRate: node.heatDecayRate,
        ambientTemp: node.ambientTemperature,
        deltaTime: cappedDelta,
      })

      // Remove heat at return/exhaust diffusers
      if (node.attractors.some((a) => a.heatRemovalRate > 0)) {
        removeHeatAtDiffusers({
          temperatureGrid3D: heatGrid,
          gridResolution,
          bounds: {
            min: roomBounds.min,
            max: roomBounds.max,
          },
          attractors: node.attractors,
          ambientTemperature: node.ambientTemperature,
          deltaTime: cappedDelta,
        })
      }

      // Sync back to flat temperature field
      temperatureFieldFrom3DArray(heatGrid, temperatureField)
    }

    // Update geometry attributes
    const positionAttr = geometry.attributes.position as THREE.BufferAttribute
    const colorAttr = geometry.attributes.color as THREE.BufferAttribute
    const lifetimeAttr = geometry.attributes.lifetime as THREE.BufferAttribute

    positionAttr.needsUpdate = true
    colorAttr.needsUpdate = true
    lifetimeAttr.needsUpdate = true

    // Update time uniform
    if (material.uniforms.time) {
      material.uniforms.time.value += cappedDelta
    }
  })

  // Update material color scheme when it changes
  useEffect(() => {
    if (!material || !temperatureField || !node.colorByTemperature) return

    // Trigger color update in next frame
    const positionAttr = geometry.attributes.position as THREE.BufferAttribute
    positionAttr.needsUpdate = true
  }, [node.colorScheme, node.colorByTemperature, material, temperatureField, geometry])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (material) {
        // Adjust point size based on camera distance could go here
      }
    }

    gl.domElement.addEventListener('resize', handleResize)
    return () => gl.domElement.removeEventListener('resize', handleResize)
  }, [gl, material])

  return (
    <group ref={ref} {...handlers}>
      {node.showTrails && (
        <TrailRenderer
          trailBuffers={trailBuffers}
          positions={particleBuffers.data.positions}
          colors={particleBuffers.data.colors}
          enabled={node.enabled}
        />
      )}
      <points ref={particlesRef} geometry={geometry} material={material} />
    </group>
  )
}
