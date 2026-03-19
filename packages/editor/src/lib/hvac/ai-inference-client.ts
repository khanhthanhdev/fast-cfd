/**
 * AI inference request payload (legacy 12-feature surrogate model)
 */
export interface AIInferenceRequest {
  featureVector: number[]
  gridSize?: number
  verticalLevels?: number
}

/**
 * AI inference response from legacy surrogate model
 */
export interface AIInferenceResponse {
  temperatureGrid: number[][]
  velocityGrid: number[][]
  averageTemperature: number
  pmv: number
  comfortScore: number
  inferenceId: string
  timestamp: number
  // 3D volumetric data (Phase 1: 3D CFD Support)
  temperatureGrid3D?: number[][][]
  velocityGrid3D?: number[][][]
  velocityGrid3DDirection?: { x: number; y: number; z: number }[][][]
  verticalLevels?: number
  heightOffsets?: number[]
}

/**
 * GINOT Neural Operator request payload
 */
export interface GinotInferenceRequest {
  /** Normalized load vector [9] */
  load: number[] | Float32Array
  /** Normalized boundary points [N*3] flattened */
  pc: number[] | Float32Array
  /** Normalized interior query points [M*3] flattened */
  xyt: number[] | Float32Array
  /** Optional metadata for debugging */
  metadata?: {
    boundaryCount?: number
    interiorCount?: number
    center?: [number, number, number]
    scale?: number
  }
}

/**
 * GINOT Neural Operator response
 *
 * Output contains airflow field data at the queried interior points:
 * - positions: normalized query point coordinates
 * - velocities: [U, V, W] velocity vectors at each point
 * - pressure: scalar pressure at each point
 * - speed: velocity magnitude at each point
 */
export interface GinotInferenceResponse {
  /** Normalized positions [N, 3] */
  positions: number[][]
  /** Velocity vectors [N, 3] */
  velocities: number[][]
  /** Scalar pressure [N] */
  pressure: number[]
  /** Velocity magnitude [N] */
  speed: number[]
  /** Bounds for denormalization */
  bounds: {
    min: number[]
    max: number[]
  }
  /** Metadata from inference */
  metadata: {
    inletCenter: number[]
    outletCenter: number[]
    inletVelocity: number[]
  }
  inferenceId: string
  timestamp: number
}

const AI_INFERENCE_API_URL =
  process.env.NEXT_PUBLIC_HVAC_INFERENCE_URL || '/api/hvac-inference'

/**
 * Call AI surrogate model for HVAC prediction
 * As per PRD NFR-001: Response time < 10 seconds
 */
export async function callAIInference(
  request: AIInferenceRequest,
): Promise<AIInferenceResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

  try {
    const response = await fetch(AI_INFERENCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        features: request.featureVector,
        gridSize: request.gridSize ?? 20,
        verticalLevels: request.verticalLevels ?? 10,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(
        `AI inference failed: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()
    clearTimeout(timeoutId)

    return {
      temperatureGrid: data.temperatureGrid,
      velocityGrid: data.velocityGrid,
      averageTemperature: data.averageTemperature,
      pmv: data.pmv,
      comfortScore: data.comfortScore,
      inferenceId: data.inferenceId || crypto.randomUUID(),
      timestamp: Date.now(),
      // 3D volumetric data
      temperatureGrid3D: data.temperatureGrid3D,
      velocityGrid3D: data.velocityGrid3D,
      velocityGrid3DDirection: data.velocityGrid3DDirection,
      verticalLevels: data.verticalLevels,
      heightOffsets: data.heightOffsets,
    }
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI inference timeout (>10s)')
    }

    throw error
  }
}

/**
 * Call GINOT Neural Operator for HVAC airflow prediction
 *
 * Sends normalized geometry tensors and receives airflow field predictions.
 * As per PRD NFR-001: Response time < 10 seconds
 */
export async function callGinotInference(
  request: GinotInferenceRequest,
): Promise<GinotInferenceResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

  try {
    // Convert Float32Array to regular arrays for JSON serialization
    const loadArray = Array.from(request.load)
    const pcArray = Array.from(request.pc)
    const xytArray = Array.from(request.xyt)

    const response = await fetch(AI_INFERENCE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        load: loadArray,
        pc: pcArray,
        xyt: xytArray,
        metadata: request.metadata,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(
        `GINOT inference failed: ${response.status} ${response.statusText}`,
      )
    }

    const data = await response.json()
    clearTimeout(timeoutId)

    return {
      positions: data.positions,
      velocities: data.velocities,
      pressure: data.pressure,
      speed: data.speed,
      bounds: data.bounds,
      metadata: data.metadata,
      inferenceId: data.inferenceId || crypto.randomUUID(),
      timestamp: Date.now(),
    }
  } catch (error) {
    clearTimeout(timeoutId)

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('GINOT inference timeout (>10s)')
    }

    throw error
  }
}
