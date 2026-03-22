import { GinotMeshInferenceError } from './mesh-inference-errors'

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
  load: number[] | Float32Array
  pc: number[] | Float32Array
  xyt: number[] | Float32Array
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
 * Caller contract:
 * - inference responses may still be in normalized room coordinates
 * - viewer-facing node data should denormalize positions before storage/rendering
 */
export interface GinotInferenceResponse {
  positions: number[][]
  velocities: number[][]
  pressure: number[]
  speed: number[]
  bounds: {
    min: number[]
    max: number[]
  }
  metadata: {
    inletCenter: number[]
    outletCenter: number[]
    inletVelocity: number[]
  }
  inferenceId: string
  timestamp: number
}

export type MeshInferenceQuality = 'preview' | 'standard' | 'high'

/**
 * Diffuser input for mesh-based GINOT inference
 */
export interface DiffuserInput {
  id: string
  kind: 'supply' | 'return'
  center: [number, number, number]
  direction?: [number, number, number]
  airflowRate?: number
}

export interface MeshInferenceOptions {
  quality?: MeshInferenceQuality
  boundaryCount?: number
  interiorCount?: number
  returnGrid3D?: boolean
}

export interface MeshInferenceContext {
  projectId?: string
  levelId?: string
  zoneId?: string
}

/**
 * GINOT mesh inference request (multipart form data)
 */
export interface GinotMeshRequest {
  meshFile: Blob
  meshFilename?: string
  diffusers: DiffuserInput[]
  options?: MeshInferenceOptions
  context?: MeshInferenceContext
}

export interface GinotMeshResponseMetadata {
  inletCenter?: [number, number, number]
  outletCenter?: [number, number, number]
  inletVelocity?: [number, number, number]
  boundaryCount?: number
  interiorCount?: number
  quality?: string
  supplyDiffuserIds?: string[]
  returnDiffuserIds?: string[]
  modelSource?: string
  [key: string]: unknown
}

/**
 * GINOT mesh inference response (world-space positions)
 */
export interface GinotMeshResponse {
  positions: [number, number, number][]
  velocities: [number, number, number][]
  pressure: number[]
  speed: number[]
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
  metadata: GinotMeshResponseMetadata
  inferenceId: string
  timestamp: number
  computeTimeMs?: number
  requestId?: string
}

export interface GinotMeshClientOptions {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  requestId?: string
  timeoutMs?: number
}

type JsonRecord = Record<string, unknown>

type AbortContext = {
  signal: AbortSignal
  cleanup: () => void
  didTimeout: () => boolean
}

const AI_INFERENCE_API_URL =
  process.env.NEXT_PUBLIC_HVAC_INFERENCE_URL || '/api/hvac-inference'

const MESH_INFERENCE_API_URL = '/api/hvac-inference-mesh'
const DEFAULT_MESH_TIMEOUT_MS = 30_000

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null
}

function getRequestId(headers: Headers): string | undefined {
  const requestId = headers.get('x-request-id')
  return requestId?.trim() || undefined
}

function getValidationDetail(detail: unknown): string | undefined {
  if (!Array.isArray(detail)) {
    return undefined
  }

  const messages = detail
    .map((entry) => {
      if (!isJsonRecord(entry) || typeof entry.msg !== 'string') {
        return null
      }

      const location = Array.isArray(entry.loc)
        ? entry.loc.filter((part) => typeof part === 'string' || typeof part === 'number').join('.')
        : ''

      return location ? `${location}: ${entry.msg}` : entry.msg
    })
    .filter((message): message is string => !!message)

  return messages.length > 0 ? messages.join('; ') : undefined
}

function getErrorDetail(body: unknown): string | undefined {
  if (typeof body === 'string') {
    const detail = body.trim()
    return detail || undefined
  }

  if (!isJsonRecord(body)) {
    return undefined
  }

  if (typeof body.detail === 'string') {
    return body.detail
  }

  const validationDetail = getValidationDetail(body.detail)
  if (validationDetail) {
    return validationDetail
  }

  if (typeof body.message === 'string') {
    return body.message
  }

  if (typeof body.error === 'string') {
    return body.error
  }

  return undefined
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function createAbortContext(
  externalSignal?: AbortSignal,
  timeoutMs = DEFAULT_MESH_TIMEOUT_MS,
): AbortContext {
  const controller = new AbortController()
  let timedOut = false

  const abort = (reason?: unknown) => {
    if (!controller.signal.aborted) {
      controller.abort(reason)
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true
    abort(new Error('timeout'))
  }, timeoutMs)

  const handleExternalAbort = () => {
    abort(externalSignal?.reason)
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      handleExternalAbort()
    } else {
      externalSignal.addEventListener('abort', handleExternalAbort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId)
      externalSignal?.removeEventListener('abort', handleExternalAbort)
    },
    didTimeout: () => timedOut,
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function createMeshResponseError(
  response: Response,
  body: unknown,
  fallbackRequestId?: string,
): GinotMeshInferenceError {
  const detail = getErrorDetail(body) ?? `Mesh inference failed with status ${response.status}`
  const requestId = getRequestId(response.headers) ?? fallbackRequestId

  const kind =
    response.status === 400 || response.status === 422
      ? 'validation'
      : response.status === 504
        ? 'timeout'
        : response.status >= 500
          ? 'backend'
          : 'request'

  return new GinotMeshInferenceError(detail, {
    kind,
    status: response.status,
    detail,
    requestId,
    body,
  })
}

/**
 * Call AI surrogate model for HVAC prediction
 * As per PRD NFR-001: Response time < 10 seconds
 */
export async function callAIInference(
  request: AIInferenceRequest,
): Promise<AIInferenceResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

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

    return {
      temperatureGrid: data.temperatureGrid,
      velocityGrid: data.velocityGrid,
      averageTemperature: data.averageTemperature,
      pmv: data.pmv,
      comfortScore: data.comfortScore,
      inferenceId: data.inferenceId || crypto.randomUUID(),
      timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
      temperatureGrid3D: data.temperatureGrid3D,
      velocityGrid3D: data.velocityGrid3D,
      velocityGrid3DDirection: data.velocityGrid3DDirection,
      verticalLevels: data.verticalLevels,
      heightOffsets: data.heightOffsets,
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('AI inference timeout (>10s)')
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Call GINOT Neural Operator for HVAC airflow prediction
 */
export async function callGinotInference(
  request: GinotInferenceRequest,
): Promise<GinotInferenceResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)

  try {
    const loadArray = Array.isArray(request.load) ? request.load : Array.from(request.load)
    const pcArray = Array.isArray(request.pc) ? request.pc : Array.from(request.pc)
    const xytArray = Array.isArray(request.xyt) ? request.xyt : Array.from(request.xyt)

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

    return {
      positions: data.positions,
      velocities: data.velocities,
      pressure: data.pressure,
      speed: data.speed,
      bounds: data.bounds,
      metadata: data.metadata,
      inferenceId: data.inferenceId || crypto.randomUUID(),
      timestamp: typeof data.timestamp === 'number' ? data.timestamp : Date.now(),
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('GINOT inference timeout (>10s)')
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Call GINOT mesh endpoint for HVAC airflow prediction.
 */
export async function callGinotMeshInference(
  request: GinotMeshRequest,
  options: GinotMeshClientOptions = {},
): Promise<GinotMeshResponse> {
  const requestId = options.requestId ?? crypto.randomUUID()
  const abortContext = createAbortContext(options.signal, options.timeoutMs)
  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const formData = new FormData()
    formData.append(
      'meshFile',
      request.meshFile,
      request.meshFilename ?? 'analysis-room.stl',
    )
    formData.append('diffusers', JSON.stringify(request.diffusers))

    if (request.options) {
      formData.append('options', JSON.stringify(request.options))
    }

    if (request.context) {
      formData.append('context', JSON.stringify(request.context))
    }

    const response = await fetchImpl(MESH_INFERENCE_API_URL, {
      method: 'POST',
      body: formData,
      signal: abortContext.signal,
      headers: {
        'x-request-id': requestId,
      },
    })

    const body = await readResponseBody(response)
    if (!response.ok) {
      throw createMeshResponseError(response, body, requestId)
    }

    if (!isJsonRecord(body)) {
      throw new GinotMeshInferenceError('Mesh inference returned an invalid JSON body', {
        kind: 'backend',
        status: response.status,
        requestId,
        body,
      })
    }

    return {
      positions: Array.isArray(body.positions)
        ? (body.positions as GinotMeshResponse['positions'])
        : [],
      velocities: Array.isArray(body.velocities)
        ? (body.velocities as GinotMeshResponse['velocities'])
        : [],
      pressure: Array.isArray(body.pressure) ? (body.pressure as number[]) : [],
      speed: Array.isArray(body.speed) ? (body.speed as number[]) : [],
      bounds: isJsonRecord(body.bounds)
        ? {
            min: body.bounds.min as [number, number, number],
            max: body.bounds.max as [number, number, number],
          }
        : {
            min: [0, 0, 0],
            max: [0, 0, 0],
          },
      metadata: isJsonRecord(body.metadata)
        ? (body.metadata as GinotMeshResponseMetadata)
        : {},
      inferenceId:
        typeof body.inferenceId === 'string' ? body.inferenceId : crypto.randomUUID(),
      timestamp: typeof body.timestamp === 'number' ? body.timestamp : Date.now(),
      computeTimeMs:
        typeof body.computeTimeMs === 'number' ? body.computeTimeMs : undefined,
      requestId: getRequestId(response.headers) ?? requestId,
    }
  } catch (error) {
    if (error instanceof GinotMeshInferenceError) {
      throw error
    }

    if (isAbortError(error)) {
      throw new GinotMeshInferenceError(
        abortContext.didTimeout()
          ? 'GINOT mesh inference timeout (>30s)'
          : 'GINOT mesh inference cancelled',
        {
          kind: abortContext.didTimeout() ? 'timeout' : 'aborted',
          requestId,
          cause: error,
        },
      )
    }

    if (error instanceof TypeError) {
      throw new GinotMeshInferenceError('Failed to reach the HVAC mesh service', {
        kind: 'network',
        requestId,
        cause: error,
      })
    }

    throw new GinotMeshInferenceError('GINOT mesh inference failed', {
      kind: 'request',
      requestId,
      cause: error,
    })
  } finally {
    abortContext.cleanup()
  }
}
