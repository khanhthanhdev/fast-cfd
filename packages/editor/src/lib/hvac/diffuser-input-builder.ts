/**
 * Build diffuser input for GINOT mesh inference from detected diffusers
 */

import type { DiffuserInput } from './ai-inference-client'
import type { DiffuserInfo } from './diffuser-detector'

function isFiniteVector3(vector: [number, number, number] | undefined): boolean {
  return !!vector && vector.every((value) => Number.isFinite(value))
}

function hasUsableDirection(diffuser: DiffuserInfo): boolean {
  if (!isFiniteVector3(diffuser.direction)) {
    return false
  }

  return Math.hypot(
    diffuser.direction[0],
    diffuser.direction[1],
    diffuser.direction[2],
  ) > 1e-6
}

function hasUsableAirflow(diffuser: DiffuserInfo): boolean {
  return Number.isFinite(diffuser.airflowRate) && diffuser.airflowRate > 0
}

/**
 * Convert detected diffusers to GINOT mesh inference input format.
 * Exhaust diffusers are sent as backend-compatible `return` outlets.
 */
export function buildDiffuserInput(diffusers: DiffuserInfo[]): DiffuserInput[] {
  return diffusers.map((diffuser) => ({
    id: diffuser.id,
    kind: diffuser.type === 'supply' ? 'supply' : 'return',
    center: diffuser.position,
    direction: hasUsableDirection(diffuser) ? diffuser.direction : undefined,
    airflowRate: hasUsableAirflow(diffuser) ? diffuser.airflowRate : undefined,
  }))
}

/**
 * Keep only diffuser kinds supported by the mesh backend.
 * Structural validation happens separately so invalid data does not get hidden.
 */
export function getValidDiffusersForInference(diffusers: DiffuserInfo[]): DiffuserInfo[] {
  return diffusers.filter(
    (diffuser) =>
      diffuser.type === 'supply' ||
      diffuser.type === 'return' ||
      diffuser.type === 'exhaust',
  )
}

/**
 * Validate the diffuser set before any mesh request is sent.
 */
export function validateDiffuserSet(diffusers: DiffuserInfo[]): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []
  const supplies = diffusers.filter((diffuser) => diffuser.type === 'supply')
  const returns = diffusers.filter(
    (diffuser) => diffuser.type === 'return' || diffuser.type === 'exhaust',
  )

  const seenIds = new Set<string>()
  for (const diffuser of diffusers) {
    if (!diffuser.id) {
      errors.push('Each diffuser must have a stable ID')
      continue
    }

    if (seenIds.has(diffuser.id)) {
      errors.push(`Duplicate diffuser ID "${diffuser.id}"`)
    } else {
      seenIds.add(diffuser.id)
    }

    if (!isFiniteVector3(diffuser.position)) {
      errors.push(`Diffuser "${diffuser.id}" has an invalid center`)
    }

    if (diffuser.direction && !isFiniteVector3(diffuser.direction)) {
      errors.push(`Diffuser "${diffuser.id}" has an invalid direction`)
    }

    if (
      !Number.isFinite(diffuser.airflowRate) ||
      diffuser.airflowRate < 0
    ) {
      errors.push(`Diffuser "${diffuser.id}" has an invalid airflow rate`)
    }
  }

  if (supplies.length === 0) {
    errors.push('At least one supply diffuser is required')
  }

  if (returns.length === 0) {
    errors.push('At least one return or exhaust diffuser is required')
  }

  if (
    supplies.length > 0 &&
    !supplies.some((diffuser) => hasUsableDirection(diffuser) || hasUsableAirflow(diffuser))
  ) {
    errors.push(
      'At least one supply diffuser must provide a usable direction or a positive airflow rate',
    )
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
