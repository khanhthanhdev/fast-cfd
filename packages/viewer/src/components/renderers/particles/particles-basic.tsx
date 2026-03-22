'use client'

import type { ParticleSystemNode } from '@pascal-app/core'
import { useRegistry } from '@pascal-app/core'
import { useRef, useMemo } from 'react'
import type * as THREE from 'three'
import { BufferGeometry, BufferAttribute } from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { createParticleBuffers } from '../../../lib/particle-system'
import { createParticleNodeMaterial } from '../../../lib/particle-shaders'

interface ParticlesBasicProps {
  node: ParticleSystemNode
}

/**
 * Basic particle system without physics simulation
 * For static particle visualization or simple effects
 */
export const ParticlesBasic = ({ node }: ParticlesBasicProps) => {
  const ref = useRef<THREE.Group>(null!)
  const particlesRef = useRef<THREE.Points>(null!)

  useRegistry(node.id, 'particle-system' as const, ref)
  const handlers = useNodeEvents(node, 'particle-system' as const)

  // Initialize particle buffers
  const { geometry, material } = useMemo(() => {
    const dummyEmitters = node.emitters.length > 0
      ? node.emitters
      : [
          {
            id: 'dummy',
            position: [0, 2, 0] as [number, number, number],
            direction: [0, -1, 0] as [number, number, number],
            velocity: 0.5,
            temperature: 22,
            spreadAngle: Math.PI / 6,
            emissionRate: 100,
            radius: 0.18,
          },
        ]

    const buffers = createParticleBuffers(
      node.particleCount,
      dummyEmitters,
      node.particleLifetime,
      true,
    )

    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(buffers.geometry.position, 3))
    geom.setAttribute('color', new BufferAttribute(buffers.geometry.color, 3))
    geom.setAttribute('lifetime', new BufferAttribute(buffers.geometry.lifetime, 1))

    const mat = createParticleNodeMaterial(
      node.particleSize * 100,
      node.particleOpacity ?? 0.8,
    )

    return { geometry: geom, material: mat }
  }, [node.emitters, node.particleCount, node.particleLifetime, node.particleOpacity, node.particleSize])

  return (
    <group ref={ref} {...handlers}>
      <points ref={particlesRef} geometry={geometry} material={material} />
    </group>
  )
}
