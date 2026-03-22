import { Vector3 } from 'three'
import type { PressureField3D } from '@pascal-app/core'

// Physical constants for air at 20°C
const GRAVITY = 9.81 // m/s²
const THERMAL_EXPANSION = 1 / 295.15
const AIR_DENSITY = 1.204 // kg/m³ at 20°C

// Reusable temp vectors for sampling (avoid allocations in hot paths)
const _offsetXNeg = new Vector3(-0.1, 0, 0)
const _offsetXPos = new Vector3(0.1, 0, 0)
const _offsetYNeg = new Vector3(0, -0.1, 0)
const _offsetYPos = new Vector3(0, 0.1, 0)
const _offsetZNeg = new Vector3(0, 0, -0.1)
const _offsetZPos = new Vector3(0, 0, 0.1)

/**
 * Sample pressure field at a position using trilinear interpolation
 */
function samplePressure(
  position: Vector3,
  field: PressureField3D
): number {
  const [nx, ny, nz] = field.gridResolution
  const min = field.bounds.min
  const max = field.bounds.max

  // Normalize position to grid coordinates
  const gx = ((position.x - min[0]) / (max[0] - min[0])) * nx
  const gy = ((position.y - min[1]) / (max[1] - min[1])) * ny
  const gz = ((position.z - min[2]) / (max[2] - min[2])) * nz

  // Clamp to grid bounds
  const x0 = Math.floor(Math.max(0, Math.min(nx - 1, gx)))
  const y0 = Math.floor(Math.max(0, Math.min(ny - 1, gy)))
  const z0 = Math.floor(Math.max(0, Math.min(nz - 1, gz)))

  const idx = z0 * ny * nx + y0 * nx + x0
  return field.data[idx] ?? 0
}

/**
 * Sample pressure gradient at position using finite differences
 */
export function samplePressureGradient(
  position: Vector3,
  field: PressureField3D
): Vector3 {
  // Central difference for gradient (reuse temp vectors to avoid allocations)
  const pLeft = samplePressure(position.clone().add(_offsetXNeg), field)
  const pRight = samplePressure(position.clone().add(_offsetXPos), field)
  const pDown = samplePressure(position.clone().add(_offsetYNeg), field)
  const pUp = samplePressure(position.clone().add(_offsetYPos), field)
  const pBack = samplePressure(position.clone().add(_offsetZNeg), field)
  const pForward = samplePressure(position.clone().add(_offsetZPos), field)

  const dpdx = (pRight - pLeft) / 0.2
  const dpdy = (pUp - pDown) / 0.2
  const dpdz = (pForward - pBack) / 0.2

  // F = -∇P / ρ
  return new Vector3(-dpdx, -dpdy, -dpdz).divideScalar(AIR_DENSITY)
}

/**
 * Sample pressure gradient and write into output vector (zero-allocation)
 */
export function samplePressureGradientInto(
  out: Vector3,
  position: Vector3,
  field: PressureField3D
): void {
  const pLeft = samplePressure(position.clone().add(_offsetXNeg), field)
  const pRight = samplePressure(position.clone().add(_offsetXPos), field)
  const pDown = samplePressure(position.clone().add(_offsetYNeg), field)
  const pUp = samplePressure(position.clone().add(_offsetYPos), field)
  const pBack = samplePressure(position.clone().add(_offsetZNeg), field)
  const pForward = samplePressure(position.clone().add(_offsetZPos), field)

  const dpdx = (pRight - pLeft) / 0.2
  const dpdy = (pUp - pDown) / 0.2
  const dpdz = (pForward - pBack) / 0.2

  out.set(-dpdx / AIR_DENSITY, -dpdy / AIR_DENSITY, -dpdz / AIR_DENSITY)
}

/**
 * Apply buoyancy force based on temperature difference (Boussinesq approximation)
 */
export function applyBuoyancyForce(
  temperature: number,
  referenceTemp: number = 22
): Vector3 {
  // Warm air rises, cool air sinks
  const deltaT = temperature - referenceTemp
  const buoyancy = GRAVITY * THERMAL_EXPANSION * deltaT

  // Buoyancy acts in Y direction (up)
  return new Vector3(0, buoyancy, 0)
}

/**
 * Apply buoyancy force and write into output vector (zero-allocation)
 */
export function applyBuoyancyForceInto(
  out: Vector3,
  temperature: number,
  referenceTemp: number = 22
): void {
  const deltaT = temperature - referenceTemp
  const buoyancy = GRAVITY * THERMAL_EXPANSION * deltaT
  out.set(0, buoyancy, 0)
}

export interface ForceOptions {
  enablePressureGradient?: boolean
  enableBuoyancy?: boolean
  referenceTemp?: number
}

/**
 * Combine all forces on a particle
 */
export function calculateTotalForce(
  position: Vector3,
  temperature: number,
  pressureField?: PressureField3D,
  options: ForceOptions = {}
): Vector3 {
  const {
    enablePressureGradient = true,
    enableBuoyancy = true,
    referenceTemp = 22,
  } = options

  let force = new Vector3(0, 0, 0)

  // Pressure gradient
  if (pressureField && enablePressureGradient) {
    force.add(samplePressureGradient(position, pressureField))
  }

  // Buoyancy
  if (enableBuoyancy) {
    force.add(applyBuoyancyForce(temperature, referenceTemp))
  }

  return force
}

/**
 * Combine all forces and write into output vector (zero-allocation)
 */
export function calculateTotalForceInto(
  out: Vector3,
  position: Vector3,
  temperature: number,
  pressureField?: PressureField3D,
  options: ForceOptions = {}
): void {
  const {
    enablePressureGradient = true,
    enableBuoyancy = true,
    referenceTemp = 22,
  } = options

  out.set(0, 0, 0)

  // Pressure gradient
  if (pressureField && enablePressureGradient) {
    samplePressureGradientInto(out, position, pressureField)
  }

  // Buoyancy
  if (enableBuoyancy) {
    applyBuoyancyForceInto(_tempBuoyancy, temperature, referenceTemp)
    out.add(_tempBuoyancy)
  }
}

const _tempBuoyancy = new Vector3()
