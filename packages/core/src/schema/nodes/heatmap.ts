import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const HeatmapDataSchema = z.object({
  // Grid dimensions (20x20 as per PRD)
  gridSize: z.number().default(20),

  // Temperature distribution (2D grid)
  temperatureGrid: z.array(z.array(z.number())),

  // Velocity magnitude grid
  velocityGrid: z.array(z.array(z.number())),

  // Velocity direction (optional, for vector visualization)
  velocityDirection: z
    .array(
      z.array(
        z.object({
          x: z.number(),
          y: z.number(),
          z: z.number(),
        }),
      ),
    )
    .optional(),

  // Scalar KPIs
  averageTemperature: z.number(),
  pmv: z.number(), // Predicted Mean Vote
  comfortScore: z.number(),

  // === 3D Volumetric Data (Phase 1: 3D CFD Support) ===

  // Vertical levels count for 3D grid
  verticalLevels: z.number().default(25),

  // Height offsets for each level (optional, for non-uniform sampling)
  heightOffsets: z.array(z.number()).optional(),

  // 3D Temperature distribution [z][y][x]
  temperatureGrid3D: z.array(z.array(z.array(z.number()))).optional(),

  // 3D Velocity magnitude [z][y][x]
  velocityGrid3D: z.array(z.array(z.array(z.number()))).optional(),

  // 3D Velocity direction [z][y][x] -> {x, y, z}
  velocityGrid3DDirection: z
    .array(
      z.array(
        z.array(
          z.object({
            x: z.number(),
            y: z.number(),
            z: z.number(),
          }),
        ),
      ),
    )
    .optional(),

  // === GINOT Neural Operator Fields (Phase 2: GINOT Integration) ===

  // Raw point cloud data from GINOT inference
  // Each point contains position + velocity + pressure + speed
  ginotPointCloud: z
    .array(
      z.object({
        position: z.tuple([z.number(), z.number(), z.number()]),
        velocity: z.tuple([z.number(), z.number(), z.number()]),
        pressure: z.number(),
        speed: z.number(),
      })
    )
    .optional(),

  // Scalar field: speed (velocity magnitude) at each point
  speedField: z.array(z.number()).optional(),

  // Scalar field: pressure at each point
  pressureField: z.array(z.number()).optional(),

  // GINOT-specific visualization type
  ginotVisualizationType: z
    .enum(['speed', 'pressure', 'velocity-vectors'])
    .optional(),
})

export type HeatmapData = z.infer<typeof HeatmapDataSchema>

export const HeatmapNode = BaseNode.extend({
  id: objectId('heatmap'),
  type: nodeType('heatmap'),

  // Reference to parent level/zone
  levelId: z.string().nullable().default(null),
  zoneId: z.string().nullable().default(null),

  // AI inference metadata
  inferenceId: z.string().optional(),
  inferenceTimestamp: z.number().optional(),

  // Visualization settings
  visualizationType: z
    .enum(['temperature', 'velocity', 'pmv', 'speed', 'pressure'])
    .default('temperature'),
  colorScheme: z
    .enum(['jet', 'viridis', 'plasma', 'coolwarm'])
    .default('jet'),
  opacity: z.number().min(0).max(1).default(0.7),

  // Data bounds for color mapping
  dataMin: z.number().optional(),
  dataMax: z.number().optional(),

  // Heat diffusion settings
  heatDiffusionEnabled: z.boolean().default(true),
  diffusionCoefficient: z.number().default(0.05),
  diffusionIterations: z.number().default(1),

  // The actual heatmap data
  data: HeatmapDataSchema,
})

export type HeatmapNode = z.infer<typeof HeatmapNode>
