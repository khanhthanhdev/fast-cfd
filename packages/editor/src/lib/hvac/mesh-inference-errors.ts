export type GinotMeshInferenceErrorKind =
  | 'validation'
  | 'request'
  | 'backend'
  | 'timeout'
  | 'aborted'
  | 'network'

type GinotMeshInferenceErrorOptions = {
  kind: GinotMeshInferenceErrorKind
  status?: number
  detail?: string
  requestId?: string
  errors?: string[]
  body?: unknown
  cause?: unknown
}

export class GinotMeshInferenceError extends Error {
  readonly kind: GinotMeshInferenceErrorKind
  readonly status?: number
  readonly detail?: string
  readonly requestId?: string
  readonly errors?: string[]
  readonly body?: unknown

  constructor(message: string, options: GinotMeshInferenceErrorOptions) {
    super(message, options.cause ? { cause: options.cause } : undefined)
    this.name = 'GinotMeshInferenceError'
    this.kind = options.kind
    this.status = options.status
    this.detail = options.detail
    this.requestId = options.requestId
    this.errors = options.errors
    this.body = options.body
  }
}

export function createGinotMeshValidationError(
  errors: string[],
): GinotMeshInferenceError {
  const detail = errors.join('; ')

  return new GinotMeshInferenceError(
    errors.length === 1
      ? (errors[0] ?? 'Invalid diffuser configuration')
      : 'Invalid diffuser configuration',
    {
      kind: 'validation',
      detail,
      errors,
    },
  )
}

export function isGinotMeshInferenceError(
  error: unknown,
): error is GinotMeshInferenceError {
  return error instanceof GinotMeshInferenceError
}

export function isGinotMeshInferenceAbort(error: unknown): boolean {
  return isGinotMeshInferenceError(error) && error.kind === 'aborted'
}

function appendRequestId(message: string, requestId?: string): string {
  return requestId ? `${message} Request ID: ${requestId}.` : message
}

export function formatGinotMeshInferenceError(error: unknown): string | null {
  if (!isGinotMeshInferenceError(error)) {
    if (error instanceof Error) {
      return error.message
    }

    return 'HVAC analysis failed.'
  }

  if (error.kind === 'aborted') {
    return null
  }

  const detail = error.detail?.trim()

  if (error.kind === 'validation') {
    if (!detail) {
      return 'The diffuser setup is invalid. Review the room inputs and try again.'
    }

    return `The diffuser setup is invalid: ${detail}.`
  }

  if (error.kind === 'timeout' || error.status === 504) {
    return appendRequestId(
      'HVAC analysis timed out. Try again with the standard room selection or retry when the backend is less busy.',
      error.requestId,
    )
  }

  if (error.kind === 'network') {
    return appendRequestId(
      'The editor could not reach the HVAC mesh service. Check that the proxy and backend are running, then retry.',
      error.requestId,
    )
  }

  if (error.status === 400 || error.status === 422) {
    return appendRequestId(
      detail
        ? `The HVAC mesh service rejected the room input: ${detail}.`
        : 'The HVAC mesh service rejected the room input. Review the room geometry and diffusers, then retry.',
      error.requestId,
    )
  }

  if (error.status === 500 || error.status === 502 || error.kind === 'backend') {
    return appendRequestId(
      detail
        ? `The HVAC mesh service failed while processing the request: ${detail}.`
        : 'The HVAC mesh service failed while processing the request. Retry in a moment.',
      error.requestId,
    )
  }

  return appendRequestId(
    detail ? `HVAC analysis failed: ${detail}.` : 'HVAC analysis failed.',
    error.requestId,
  )
}
