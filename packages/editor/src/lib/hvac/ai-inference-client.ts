/**
 * AI inference request payload
 */
export interface AIInferenceRequest {
  featureVector: number[]
  gridSize?: number
  verticalLevels?: number
}

/**
 * AI inference response from HVAC surrogate model
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
