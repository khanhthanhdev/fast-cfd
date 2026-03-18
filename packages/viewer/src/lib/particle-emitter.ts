import { Vector3 } from 'three'
import type { ParticleEmitter, ParticleAttractor } from '@pascal-app/core'
import type { ParticleData } from './particle-system'

export interface EmitterState {
  nextParticleIndex: number
  emittedCount: number
}

/**
 * Initialize emitter state for each emitter
 */
export function createEmitterStates(emitterCount: number): EmitterState[] {
  return Array.from({ length: emitterCount }, () => ({
    nextParticleIndex: 0,
    emittedCount: 0,
  }))
}

/**
 * Apply random spread to direction vector within cone angle
 */
export function applySpread(
  direction: [number, number, number],
  spreadAngle: number,
): [number, number, number] {
  const dir = new Vector3(direction[0], direction[1], direction[2]).normalize()

  // Random angle within cone
  const theta = Math.random() * spreadAngle
  const phi = Math.random() * Math.PI * 2

  // Create perpendicular vectors for rotation
  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)

  // Find perpendicular vectors
  const up = Math.abs(dir.y) < 0.99 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  const perp1 = new Vector3().crossVectors(dir, up).normalize()
  const perp2 = new Vector3().crossVectors(dir, perp1).normalize()

  // Rotate direction by theta, phi
  const rotated = dir.clone().multiplyScalar(cosTheta)
  rotated.add(perp1.multiplyScalar(sinTheta * Math.cos(phi)))
  rotated.add(perp2.multiplyScalar(sinTheta * Math.sin(phi)))

  return [rotated.x, rotated.y, rotated.z]
}

/**
 * Emit new particles from supply diffusers
 */
export function emitParticles(
  emitter: ParticleEmitter,
  emitterState: EmitterState,
  particleData: ParticleData,
  deltaTime: number,
  maxParticlesPerEmitter: number,
): void {
  const emitCount = Math.floor(emitter.emissionRate * deltaTime)

  for (let i = 0; i < emitCount; i++) {
    const idx = emitterState.nextParticleIndex % maxParticlesPerEmitter
    emitterState.nextParticleIndex++
    emitterState.emittedCount++

    const baseIdx = idx * 3

    // Position at emitter
    particleData.positions[baseIdx] = emitter.position[0]
    particleData.positions[baseIdx + 1] = emitter.position[1]
    particleData.positions[baseIdx + 2] = emitter.position[2]

    // Velocity with spread angle
    const dir = applySpread(emitter.direction, emitter.spreadAngle)
    particleData.velocities[baseIdx] = dir[0] * emitter.velocity
    particleData.velocities[baseIdx + 1] = dir[1] * emitter.velocity
    particleData.velocities[baseIdx + 2] = dir[2] * emitter.velocity

    // Full lifetime
    particleData.lifetimes[idx] = 1.0

    // Track which emitter spawned this particle
    particleData.emitterIndices[idx] = emitterState.emittedCount
  }
}

/**
 * Check if particle should be captured by attractor
 */
export function checkAttractorCapture(
  particlePos: Vector3,
  attractors: ParticleAttractor[],
): boolean {
  for (const attractor of attractors) {
    const dx = particlePos.x - attractor.position[0]
    const dy = particlePos.y - attractor.position[1]
    const dz = particlePos.z - attractor.position[2]
    const distSq = dx * dx + dy * dy + dz * dz
    const radiusSq = attractor.radius * attractor.radius

    if (distSq < radiusSq) {
      return true
    }
  }
  return false
}

/**
 * Apply attractor forces to particles
 */
export function applyAttractorForces(
  position: Vector3,
  velocity: Vector3,
  attractors: ParticleAttractor[],
): Vector3 {
  const result = velocity.clone()

  for (const attractor of attractors) {
    const toAttractor = new Vector3(
      attractor.position[0] - position.x,
      attractor.position[1] - position.y,
      attractor.position[2] - position.z
    )
    const distSq = toAttractor.lengthSq()
    const minDist = 0.1 // Prevent singularity

    if (distSq > minDist * minDist) {
      const dist = Math.sqrt(distSq)
      const force = attractor.strength / distSq
      result.add(toAttractor.normalize().multiplyScalar(force))
    }
  }

  return result
}

/**
 * Respawn particle at specific emitter position
 */
export function respawnParticleAtEmitter(
  particleIndex: number,
  particleData: ParticleData,
  emitter: ParticleEmitter,
): void {
  const baseIdx = particleIndex * 3

  // Add slight random offset to emitter position
  const offsetX = (Math.random() - 0.5) * 0.1
  const offsetY = (Math.random() - 0.5) * 0.1
  const offsetZ = (Math.random() - 0.5) * 0.1

  particleData.positions[baseIdx] = emitter.position[0] + offsetX
  particleData.positions[baseIdx + 1] = emitter.position[1] + offsetY
  particleData.positions[baseIdx + 2] = emitter.position[2] + offsetZ

  // Set velocity with spread
  const dir = applySpread(emitter.direction, emitter.spreadAngle)
  particleData.velocities[baseIdx] = dir[0] * emitter.velocity
  particleData.velocities[baseIdx + 1] = dir[1] * emitter.velocity
  particleData.velocities[baseIdx + 2] = dir[2] * emitter.velocity

  // Reset lifetime
  particleData.lifetimes[particleIndex] = 1.0
}
