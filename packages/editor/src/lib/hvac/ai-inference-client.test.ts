import { describe, expect, it } from 'bun:test'
import {
  callGinotMeshInference,
  type DiffuserInput,
  type GinotMeshRequest,
} from './ai-inference-client'
import { GinotMeshInferenceError } from './mesh-inference-errors'

describe('callGinotMeshInference', () => {
  it('sends the canonical mesh contract and preserves backend metadata', async () => {
    const response = await callGinotMeshInference(createMeshRequest(), {
      requestId: 'req_1',
      fetchImpl: async (url, init) => {
        expect(url).toBe('/api/hvac-inference-mesh')

        const headers = new Headers(init?.headers)
        expect(headers.get('x-request-id')).toBe('req_1')

        const formData = init?.body as FormData
        const meshFile = formData.get('meshFile')

        expect(meshFile).toBeInstanceOf(File)
        expect((meshFile as File).name).toBe('room.stl')
        expect(formData.get('diffusers')).toBe(JSON.stringify(createDiffusers()))
        expect(formData.get('options')).toBe(
          JSON.stringify({ quality: 'standard', boundaryCount: 5000 }),
        )
        expect(formData.get('context')).toBe(
          JSON.stringify({ projectId: 'current', zoneId: 'zone_1' }),
        )

        return new Response(
          JSON.stringify({
            positions: [[0, 0, 0]],
            velocities: [[1, 0, 0]],
            pressure: [101325],
            speed: [1],
            bounds: {
              min: [0, 0, 0],
              max: [1, 1, 1],
            },
            metadata: {
              quality: 'standard',
              supplyDiffuserIds: ['supply_1'],
            },
            inferenceId: 'ginot_1',
            timestamp: 1_710_000_000_000,
            computeTimeMs: 1200,
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'backend_req_1',
            },
          },
        )
      },
    })

    expect(response.inferenceId).toBe('ginot_1')
    expect(response.timestamp).toBe(1_710_000_000_000)
    expect(response.requestId).toBe('backend_req_1')
    expect(response.metadata.quality).toBe('standard')
    expect(response.metadata.supplyDiffuserIds).toEqual(['supply_1'])
  })

  it('normalizes JSON and text error responses into typed mesh errors', async () => {
    try {
      await callGinotMeshInference(createMeshRequest(), {
        requestId: 'req_json',
        fetchImpl: async () =>
          new Response(JSON.stringify({ detail: 'Mesh is not watertight' }), {
            status: 400,
            headers: {
              'content-type': 'application/json',
              'x-request-id': 'backend_req_json',
            },
          }),
      })

      throw new Error('Expected JSON mesh error')
    } catch (error) {
      if (!(error instanceof GinotMeshInferenceError)) {
        throw error
      }

      expect(error.kind).toBe('validation')
      expect(error.status).toBe(400)
      expect(error.detail).toBe('Mesh is not watertight')
      expect(error.requestId).toBe('backend_req_json')
    }

    try {
      await callGinotMeshInference(createMeshRequest(), {
        requestId: 'req_text',
        fetchImpl: async () =>
          new Response('backend unavailable', {
            status: 502,
            headers: {
              'content-type': 'text/plain',
            },
          }),
      })

      throw new Error('Expected text mesh error')
    } catch (error) {
      if (!(error instanceof GinotMeshInferenceError)) {
        throw error
      }

      expect(error.kind).toBe('backend')
      expect(error.status).toBe(502)
      expect(error.detail).toBe('backend unavailable')
      expect(error.requestId).toBe('req_text')
    }
  })

  it('distinguishes caller aborts from timeouts', async () => {
    const externalController = new AbortController()
    const abortableFetch = createAbortableFetch()

    const abortPromise = callGinotMeshInference(createMeshRequest(), {
      requestId: 'req_abort',
      signal: externalController.signal,
      fetchImpl: abortableFetch,
    })
    externalController.abort('cancelled-by-user')

    try {
      await abortPromise
      throw new Error('Expected caller abort')
    } catch (error) {
      if (!(error instanceof GinotMeshInferenceError)) {
        throw error
      }

      expect(error.kind).toBe('aborted')
      expect(error.requestId).toBe('req_abort')
    }

    try {
      await callGinotMeshInference(createMeshRequest(), {
        requestId: 'req_timeout',
        fetchImpl: abortableFetch,
        timeoutMs: 5,
      })

      throw new Error('Expected timeout abort')
    } catch (error) {
      if (!(error instanceof GinotMeshInferenceError)) {
        throw error
      }

      expect(error.kind).toBe('timeout')
      expect(error.requestId).toBe('req_timeout')
    }
  })
})

function createMeshRequest(): GinotMeshRequest {
  return {
    meshFile: new Blob(['solid room'], { type: 'model/stl' }),
    meshFilename: 'room.stl',
    diffusers: createDiffusers(),
    options: {
      quality: 'standard',
      boundaryCount: 5000,
    },
    context: {
      projectId: 'current',
      zoneId: 'zone_1',
    },
  }
}

function createDiffusers(): DiffuserInput[] {
  return [
    {
      id: 'supply_1',
      kind: 'supply',
      center: [0, 2, 0],
      direction: [0, -1, 0],
      airflowRate: 1.2,
    },
    {
      id: 'return_1',
      kind: 'return',
      center: [1, 2, 1],
    },
  ]
}

function createAbortableFetch(): typeof fetch {
  return (async (_url, init) => {
    return await new Promise((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) {
        return
      }

      if (signal.aborted) {
        reject(createAbortError())
        return
      }

      signal.addEventListener('abort', () => reject(createAbortError()), {
        once: true,
      })
    })
  }) as typeof fetch
}

function createAbortError(): Error {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}
