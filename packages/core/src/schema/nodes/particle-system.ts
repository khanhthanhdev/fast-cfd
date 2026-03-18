import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const ParticleEmitterSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  direction: z.tuple([z.number(), z.number(), z.number()]),
  velocity: z.number(),
  temperature: z.number(),
  spreadAngle: z.number(),
  emissionRate: z.number(),
})

export const ParticleAttractorSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  strength: z.number(),
  radius: z.number(),
  // Heat removal settings
  heatRemovalRate: z.number().default(0),
  removalRadius: z.number().default(0.5),
})

export const VelocityField3DSchema = z.object({
  gridResolution: z.tuple([z.number(), z.number(), z.number()]),
  bounds: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  data: z.array(z.number()),
})

export const TemperatureField3DSchema = z.object({
  gridResolution: z.tuple([z.number(), z.number(), z.number()]),
  bounds: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  data: z.array(z.number()),
})

export const PressureField3DSchema = z.object({
  gridResolution: z.tuple([z.number(), z.number(), z.number()]),
  bounds: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  data: z.array(z.number()),
})

export const ParticleSystemNode = BaseNode.extend({
  id: objectId('particle-system'),
  type: nodeType('particle-system'),

  levelId: z.string().nullable().default(null),
  zoneId: z.string().nullable().default(null),

  particleCount: z.number().default(2000),
  particleSize: z.number().default(0.03),
  particleLifetime: z.number().default(300),

  emitters: z.array(ParticleEmitterSchema).default([]),
  attractors: z.array(ParticleAttractorSchema).default([]),

  velocityField: VelocityField3DSchema.optional(),
  temperatureField: TemperatureField3DSchema.optional(),
  pressureField: PressureField3DSchema.optional(),

  // Heat deposition settings
  heatDepositionRate: z.number().default(0.1),
  heatDecayRate: z.number().default(0.02),
  ambientTemperature: z.number().default(293),

  colorByTemperature: z.boolean().default(true),
  colorScheme: z.enum(['jet', 'viridis', 'plasma', 'coolwarm']).default('jet'),
  showTrails: z.boolean().default(false),
  trailLength: z.number().default(10),

  enabled: z.boolean().default(true),
})

export type ParticleSystemNode = z.infer<typeof ParticleSystemNode>
export type ParticleEmitter = z.infer<typeof ParticleEmitterSchema>
export type ParticleAttractor = z.infer<typeof ParticleAttractorSchema>
export type VelocityField3D = z.infer<typeof VelocityField3DSchema>
export type TemperatureField3D = z.infer<typeof TemperatureField3DSchema>
export type PressureField3D = z.infer<typeof PressureField3DSchema>
