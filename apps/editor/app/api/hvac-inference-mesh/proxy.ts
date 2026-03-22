type MeshProxyOptions = {
  backendUrl?: string
  fetchImpl?: typeof fetch
}

const REQUEST_ID_HEADER = 'x-request-id'
const CORRELATION_ID_HEADER = 'x-correlation-id'

function buildForwardHeaders(request: Request): HeadersInit | undefined {
  const headers = new Headers()
  const accept = request.headers.get('accept')
  const requestId = request.headers.get(REQUEST_ID_HEADER)

  if (accept) {
    headers.set('accept', accept)
  }

  if (requestId) {
    headers.set(REQUEST_ID_HEADER, requestId)
  }

  return Array.from(headers.entries()).length > 0 ? headers : undefined
}

function buildPassthroughHeaders(
  upstreamResponse: Response,
  fallbackRequestId?: string,
): Headers {
  const headers = new Headers()
  const requestId =
    upstreamResponse.headers.get(REQUEST_ID_HEADER) ?? fallbackRequestId
  const correlationId = upstreamResponse.headers.get(CORRELATION_ID_HEADER)

  if (requestId) {
    headers.set(REQUEST_ID_HEADER, requestId)
  }

  if (correlationId) {
    headers.set(CORRELATION_ID_HEADER, correlationId)
  }

  return headers
}

function createJsonResponse(
  body: unknown,
  status: number,
  headers?: HeadersInit,
): Response {
  return Response.json(body, { status, headers })
}

async function readJsonLikeBody(response: Response): Promise<unknown> {
  return response
    .json()
    .catch(async () => ({ detail: (await response.text()) || 'Mesh inference request failed' }))
}

export async function proxyMeshInferenceRequest(
  request: Request,
  options: MeshProxyOptions,
): Promise<Response> {
  const backendUrl = options.backendUrl?.trim()
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? undefined

  if (!backendUrl) {
    return createJsonResponse(
      { detail: 'HVAC_MESH_INFERENCE_URL is not configured' },
      500,
    )
  }

  const formData = await request.formData()
  const fetchImpl = options.fetchImpl ?? fetch

  const upstreamResponse = await fetchImpl(backendUrl, {
    method: 'POST',
    body: formData,
    signal: request.signal,
    headers: buildForwardHeaders(request),
  })

  const contentType = upstreamResponse.headers.get('content-type') ?? 'application/json'
  const passthroughHeaders = buildPassthroughHeaders(upstreamResponse, requestId)

  if (contentType.includes('application/json')) {
    return createJsonResponse(
      await readJsonLikeBody(upstreamResponse),
      upstreamResponse.status,
      passthroughHeaders,
    )
  }

  return new Response(await upstreamResponse.arrayBuffer(), {
    status: upstreamResponse.status,
    headers: {
      'content-type': contentType,
      ...Object.fromEntries(passthroughHeaders.entries()),
    },
  })
}
