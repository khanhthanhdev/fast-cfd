export { buildFeatureVector, extractRoomGeometry } from './feature-vector-builder'
export { callAIInference, callGinotInference } from './ai-inference-client'
export type { RoomGeometry } from './feature-vector-builder'
export type { AIInferenceRequest, AIInferenceResponse } from './ai-inference-client'
export type { GinotInferenceRequest, GinotInferenceResponse } from './ai-inference-client'
export {
  getPMVLabel,
  calculatePolygonArea,
  getPolygonCentroid,
  polygonCentroidsMatch,
  polygonsEqual,
} from './utils'

// GINOT integration
export {
  buildGinotInput,
  buildMockGinotInput,
  validateGinotInput,
  type GinotInputTensors,
  type GinotInputOptions,
} from './ginot-input-builder'
export {
  sampleBoundary,
  sampleInterior,
  generateAllSamples,
} from './point-sampler'
export {
  computeNormalization,
  normalizePoints,
  normalizePoint,
  denormalizePoints,
  denormalizePoint,
  normalizeLoadVector,
  parseLoadVector,
  validateLoadVector,
} from './normalization'
export {
  type RoomGeometrySnapshot,
  buildRoomGeometryFromScene,
  createMockBoxRoom,
} from './room-geometry-snapshot'
export {
  generateMockRoomGeometry,
  generateAllMockRooms,
  generateMockGinotResponse,
  generateGoldenCaseFixture,
  generateAllGoldenFixtures,
  TEST_ROOMS,
  type TestRoomConfig,
} from './mock-room-generator'
