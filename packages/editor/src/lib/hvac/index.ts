export { buildFeatureVector, extractRoomGeometry } from './feature-vector-builder'
export { callAIInference } from './ai-inference-client'
export type { RoomGeometry } from './feature-vector-builder'
export type { AIInferenceRequest, AIInferenceResponse } from './ai-inference-client'
export {
  getPMVLabel,
  calculatePolygonArea,
  getPolygonCentroid,
  polygonCentroidsMatch,
  polygonsEqual,
} from './utils'
