import { describe, expect, it } from 'bun:test'
import type { DiffuserInfo } from './diffuser-detector'
import {
  buildDiffuserInput,
  getValidDiffusersForInference,
  validateDiffuserSet,
} from './diffuser-input-builder'

describe('diffuser-input-builder', () => {
  it('maps exhaust diffusers to return and keeps direction-only supply diffusers', () => {
    const diffusers = [
      createDiffuser({
        id: 'supply_1',
        type: 'supply',
        direction: [0, -1, 0],
        airflowRate: 0,
      }),
      createDiffuser({
        id: 'exhaust_1',
        type: 'exhaust',
      }),
    ]

    const candidateDiffusers = getValidDiffusersForInference(diffusers)
    const validation = validateDiffuserSet(candidateDiffusers)
    const input = buildDiffuserInput(candidateDiffusers)

    expect(validation).toEqual({
      valid: true,
      errors: [],
    })
    expect(input).toEqual([
      {
        id: 'supply_1',
        kind: 'supply',
        center: [1, 2, 3],
        direction: [0, -1, 0],
        airflowRate: undefined,
      },
      {
        id: 'exhaust_1',
        kind: 'return',
        center: [1, 2, 3],
        direction: [0, -1, 0],
        airflowRate: 0.5,
      },
    ])
  })

  it('fails duplicate IDs, invalid centers, and supply inputs with no usable flow', () => {
    const validation = validateDiffuserSet([
      createDiffuser({
        id: 'dup',
        type: 'supply',
        position: [Number.NaN, 2, 3],
        direction: [0, 0, 0],
        airflowRate: 0,
      }),
      createDiffuser({
        id: 'dup',
        type: 'return',
      }),
    ])

    expect(validation.valid).toBe(false)
    expect(validation.errors).toContain('Diffuser "dup" has an invalid center')
    expect(validation.errors).toContain('Duplicate diffuser ID "dup"')
    expect(validation.errors).toContain(
      'At least one supply diffuser must provide a usable direction or a positive airflow rate',
    )
  })
})

function createDiffuser(overrides: Partial<DiffuserInfo>): DiffuserInfo {
  return {
    id: 'diffuser_1',
    type: 'return',
    position: [1, 2, 3],
    direction: [0, -1, 0],
    airflowRate: 0.5,
    spreadAngle: Math.PI / 7,
    dimensions: [0.6, 0.15, 0.6],
    surface: 'ceiling',
    itemId: 'diffuser-in',
    name: 'Diffuser',
    metadata: {},
    ...overrides,
  }
}
