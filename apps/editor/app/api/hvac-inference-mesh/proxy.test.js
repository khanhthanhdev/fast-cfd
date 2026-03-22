import { describe, expect, it, mock } from 'bun:test'
import { proxyMeshInferenceRequest } from './proxy'

describe('proxyMeshInferenceRequest', () => {
  it('returns a 500 response when the mesh backend URL is missing', async () => {
    const request = new Request('http://localhost/api/hvac-inference-mesh', {
      method: 'POST',
      body: new FormData(),
    })

    const response = await proxyMeshInferenceRequest(request, {})

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      detail: 'HVAC_MESH_INFERENCE_URL is not configured',
    })
  })

  it('forwards the canonical multipart mesh contract to the upstream backend', async () => {
    const formData = new FormData()
    formData.append('meshFile', new File(['solid room'], 'room.stl'))
    formData.append(
      'diffusers',
      JSON.stringify([{ id: 'diffuser_1', kind: 'supply', center: [1, 2, 3] }]),
    )
    formData.append(
      'options',
      JSON.stringify({ quality: 'standard', boundaryCount: 5000 }),
    )
    formData.append(
      'context',
      JSON.stringify({ projectId: 'current', zoneId: 'zone_1' }),
    )

    const fetchImpl = mock(async (url, init) => {
      expect(url).toBe('http://backend.internal/api/hvac-inference-mesh')
      expect(init?.method).toBe('POST')

      const forwardedFormData = init?.body
      const meshFile = forwardedFormData.get('meshFile')

      expect(meshFile).toBeInstanceOf(File)
      expect(meshFile.name).toBe('room.stl')
      expect(await meshFile.text()).toBe('solid room')
      expect(forwardedFormData.get('diffusers')).toBe(
        JSON.stringify([{ id: 'diffuser_1', kind: 'supply', center: [1, 2, 3] }]),
      )
      expect(forwardedFormData.get('options')).toBe(
        JSON.stringify({ quality: 'standard', boundaryCount: 5000 }),
      )
      expect(forwardedFormData.get('context')).toBe(
        JSON.stringify({ projectId: 'current', zoneId: 'zone_1' }),
      )

      return new Response(
        JSON.stringify({
          positions: [[0, 0, 0]],
          velocities: [[1, 0, 0]],
          pressure: [101325],
          speed: [1],
          timestamp: 123,
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'backend_req_1',
          },
        },
      )
    })

    const request = new Request('http://localhost/api/hvac-inference-mesh', {
      method: 'POST',
      body: formData,
      headers: new Headers({
        Accept: 'application/json',
        'x-request-id': 'req_123',
      }),
    })

    const response = await proxyMeshInferenceRequest(request, {
      backendUrl: 'http://backend.internal/api/hvac-inference-mesh',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toBe('backend_req_1')
    expect(await response.json()).toEqual({
      positions: [[0, 0, 0]],
      velocities: [[1, 0, 0]],
      pressure: [101325],
      speed: [1],
      timestamp: 123,
    })
  })

  it('passes through upstream JSON errors without rewriting the status', async () => {
    const fetchImpl = mock(async () => {
      return new Response(JSON.stringify({ detail: 'Mesh is not watertight' }), {
        status: 400,
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'backend_req_2',
        },
      })
    })

    const request = new Request('http://localhost/api/hvac-inference-mesh', {
      method: 'POST',
      body: new FormData(),
    })

    const response = await proxyMeshInferenceRequest(request, {
      backendUrl: 'http://backend.internal/api/hvac-inference-mesh',
      fetchImpl,
    })

    expect(response.status).toBe(400)
    expect(response.headers.get('x-request-id')).toBe('backend_req_2')
    expect(await response.json()).toEqual({ detail: 'Mesh is not watertight' })
  })
})
