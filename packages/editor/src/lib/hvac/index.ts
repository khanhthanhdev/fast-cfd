export { buildFeatureVector, extractRoomGeometry } from './feature-vector-builder'
export { callAIInference, callGinotInference, callGinotMeshInference } from './ai-inference-client'
export type { RoomGeometry } from './feature-vector-builder'
export type { AIInferenceRequest, AIInferenceResponse } from './ai-inference-client'
export type {
  DiffuserInput,
  GinotInferenceRequest,
  GinotInferenceResponse,
  GinotMeshClientOptions,
  GinotMeshRequest,
  GinotMeshResponse,
  MeshInferenceContext,
  MeshInferenceOptions,
  MeshInferenceQuality,
} from './ai-inference-client'
export {
  buildDiffuserInput,
  getValidDiffusersForInference,
  validateDiffuserSet,
} from './diffuser-input-builder'
export {
  createGinotMeshValidationError,
  formatGinotMeshInferenceError,
  GinotMeshInferenceError,
  isGinotMeshInferenceAbort,
  isGinotMeshInferenceError,
} from './mesh-inference-errors'
export {
  MESH_ANALYSIS_SUPERSEDED_REASON,
  MeshAnalysisRunCoordinator,
} from './mesh-analysis-run-coordinator'
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
export {
  buildGinotHeatmapGrids,
  type GinotHeatmapGrids,
} from './ginot-heatmap-builder'
export {
  exportSceneToStlBlob,
  buildExportScene,
  estimateFaceCount,
  type ExportScope,
} from './scene-stl-export'
export type { Bounds3D, Vector3Like, VelocityDirectionCell } from './cfd-types'
