# GINOT Backend Implementation Plan

Backend-first architecture for GINOT CFD simulation. All computation moves to Python backend; frontend is pure visualization.

---

## Architecture Decision

**Current State:** Frontend performs geometry sampling, tensor building, and some post-processing.

**Target State:** Backend handles all CFD computation:
- Mesh loading and normalization (optional)
- Boundary and interior point sampling (optional)
- Tensor validation
- GINOT model inference
- Post-processing and denormalization (optional)

**Frontend Responsibilities:**
- 3D editor UI (diffuser placement, room selection)
- API client (send tensors, receive results)
- Three.js visualization (point cloud rendering, heatmaps)
- User controls (metric selection, color schemes)

---

## Implementation Phases

### Phase 1: Backend API Setup

**Goal:** Deploy FastAPI application with GINOT inference endpoint.

**Tasks:**
1. Set up Python project structure
2. Define Pydantic schemas for request/response
3. Implement input validators
4. Load trained GINOT model
5. Create inference endpoint
6. Add CORS and rate limiting
7. Write unit tests for validation and inference

**Files to Create:**
```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── schemas.py           # Pydantic models
│   ├── validators.py        # Input validation
│   ├── inference.py         # Model inference logic
│   ├── api.py               # API endpoints
│   └── models/
│       └── ginot.py         # GINOT model definition
├── tests/
│   ├── test_validators.py
│   └── test_inference.py
├── requirements.txt
├── Dockerfile
└── .env.example
```

**Acceptance Criteria:**
- POST `/api/hvac-inference` returns valid response
- Validation rejects malformed requests with 400
- Inference completes in < 10 seconds
- CORS allows requests from frontend origin

---

### Phase 2: Mesh-Based Endpoint (Optional)

**Goal:** Backend handles geometry sampling from uploaded mesh.

**Tasks:**
1. Add file upload endpoint for STL/OBJ
2. Implement mesh loading with trimesh
3. Implement boundary surface sampling
4. Implement interior volume sampling (rejection)
5. Compute normalization parameters
6. Return denormalized world coordinates

**Endpoint:**
```python
POST /api/hvac-inference-mesh
Request: multipart/form-data
  - mesh_file: STL/OBJ file
  - load: JSON string (9-element array)
  - boundaryCount: int (default: 5000)
  - interiorCount: int (default: 5000)

Response: JSON with world-coordinate positions
```

**Acceptance Criteria:**
- Accepts STL and OBJ file formats
- Samples points uniformly on mesh surface
- Rejection sampling for interior points
- Returns positions in world coordinates

---

### Phase 3: Frontend Integration

**Goal:** Update frontend to use backend API.

**Tasks:**
1. Update `ai-inference-client.ts` types to match backend schema
2. Ensure normalization matches Python implementation exactly
3. Update `use-hvac-analysis.ts` hook to call new API
4. Add error handling for validation failures
5. Add loading states during inference
6. Test with real backend responses

**Files to Update:**
- `packages/editor/src/lib/hvac/cfd-types.ts` - Align types with backend
- `packages/editor/src/lib/hvac/ai-inference-client.ts` - Update API client
- `packages/editor/src/hooks/use-hvac-analysis.ts` - Integration point

**Acceptance Criteria:**
- Frontend successfully calls backend API
- Denormalized positions align with room geometry
- Velocity and pressure values display correctly
- Error messages shown for failed requests

---

### Phase 4: Production Deployment

**Goal:** Deploy backend to production environment.

**Tasks:**
1. Containerize with Docker
2. Set up GPU-enabled hosting (AWS EC2 G5, Lambda Labs, etc.)
3. Configure environment variables
4. Set up API key authentication
5. Configure rate limiting
6. Add request logging and monitoring
7. Set up auto-scaling

**Infrastructure:**
```yaml
# docker-compose.yml
version: '3.8'
services:
  ginot-api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - GINOT_MODEL_PATH=/app/checkpoints/ginot_best.ckpt
      - DEVICE=cuda
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

**Acceptance Criteria:**
- API accessible via HTTPS
- GPU acceleration enabled
- Concurrent requests handled
- Monitoring dashboard active

---

## Data Contracts

### Request Contract

Frontend sends:
```typescript
{
  load: Float32Array(9)     // Always 9 elements
  pc: Float32Array(N * 3)   // N boundary points
  xyt: Float32Array(M * 3)  // M interior points
  metadata?: {
    boundaryCount?: number
    interiorCount?: number
    center?: [number, number, number]
    scale?: number
  }
}
```

Backend expects:
- `load.length === 9` (validated)
- `pc.length % 3 === 0` (validated)
- `xyt.length % 3 === 0` (validated)
- All values finite (no NaN/Infinity)
- Boundary count >= 100 (validated)
- Interior count >= 1 (validated)

### Response Contract

Backend returns:
```json
{
  "positions": [[x, y, z], ...],   // Normalized [M][3]
  "velocities": [[u, v, w], ...],  // m/s [M][3]
  "pressure": [p, ...],            // Pa [M]
  "speed": [s, ...],               // m/s [M]
  "bounds": { "min": [...], "max": [...] },
  "metadata": {
    "inletCenter": [...],
    "outletCenter": [...],
    "inletVelocity": [...]
  },
  "inferenceId": "ginot_abc123",
  "timestamp": 1711036800000,
  "computeTimeMs": 1250
}
```

Frontend must:
- Denormalize positions using `metadata.center` and `metadata.scale`
- Build `ginotPointCloud` array for storage
- Update HeatmapNode with new data
- Trigger re-render of point cloud visualization

---

## Key Technical Decisions

### 1. Normalization Strategy

**Decision:** Frontend computes normalization; backend uses frontend's values.

**Rationale:** Frontend has direct access to room geometry. Backend receives pre-normalized tensors.

**Contract:** Both must use identical formulas:
```python
# Python
center = [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2]
scale = max(max[0]-min[0], max[1]-min[1], max[2]-min[2])
```

```typescript
// TypeScript
const center = [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2]
const scale = Math.max(max[0]-min[0], max[1]-min[1], max[2]-min[2])
```

### 2. Velocity Normalization

**Decision:** Velocity in load vector is NOT normalized.

**Rationale:** Velocity is a physical quantity independent of room size. Model was trained with raw m/s values.

**Contract:**
- Indices 0-5 (inlet/outlet centers): normalized to [-1, 1]
- Indices 6-8 (inlet velocity): raw m/s, typically [-5, 5]

### 3. Point Count Flexibility

**Decision:** Point counts are variable, not fixed.

**Rationale:** Different room sizes may benefit from adaptive sampling. Small rooms need fewer points.

**Limits:**
- Minimum boundary: 100 points
- Minimum interior: 1 point
- Recommended: 5,000 - 50,000
- Maximum: 100,000 boundary + 50,000 interior

### 4. Response Coordinate System

**Decision:** Backend returns normalized positions; frontend denormalizes.

**Rationale:** Frontend owns the world coordinate system. Backend is stateless.

**Contract:**
- `positions` in response are normalized [M][3]
- Frontend applies: `world = (normalized * scale) + center`

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Normalization mismatch | High | Medium | Unit tests comparing Python/TypeScript outputs |
| GPU memory exhaustion | Medium | Low | Point count limits, batch processing |
| API latency > 10s | High | Medium | Model optimization, quantization |
| Concurrent request conflicts | Medium | Medium | Request queuing, rate limiting |
| Frontend/backend type drift | Medium | High | Shared OpenAPI schema, contract tests |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Inference latency (p50) | < 2s | Backend monitoring |
| Inference latency (p99) | < 10s | Backend monitoring |
| Validation error rate | < 1% | API logs |
| Frontend integration errors | 0 | Error tracking |
| User-perceived latency | < 3s | Frontend RUM |

---

## Migration Path

### From Current Frontend-Heavy to Backend-First

**Current Flow:**
```
Frontend: Sample geometry → Build tensors → Call API → Post-process → Denormalize → Render
Backend:  (Pass-through or mock CFD)
```

**Target Flow:**
```
Frontend: Sample geometry → Build tensors → Call API → Denormalize → Render
Backend:  Validate → Infer → Post-process → Return
```

**Migration Steps:**
1. Deploy backend API alongside existing mock CFD
2. Add feature flag for backend vs mock
3. Enable for internal users first
4. A/B test performance
5. Gradual rollout to all users
6. Deprecate mock CFD (keep as fallback)

---

## Testing Strategy

### Backend Unit Tests

```python
# tests/test_validators.py
def test_validate_load_vector_wrong_length():
    with pytest.raises(ValueError, match="9 elements"):
        validate_request(GinotInferenceRequest(load=[0] * 8, pc=[], xyt=[]))

def test_validate_pc_not_divisible_by_3():
    with pytest.raises(ValueError, match="divisible by 3"):
        validate_request(GinotInferenceRequest(
            load=[0] * 9,
            pc=[0] * 100,  # Not divisible by 3
            xyt=[0] * 15
        ))

def test_validate_nan_in_load():
    with pytest.raises(ValueError, match="NaN"):
        validate_request(GinotInferenceRequest(
            load=[0] * 8 + [float('nan')],
            pc=[0] * 15,
            xyt=[0] * 15
        ))
```

### Backend Integration Tests

```python
# tests/test_inference.py
def test_inference_returns_valid_response():
    request = GinotInferenceRequest(
        load=[0] * 9,
        pc=[0.0] * 1500,  # 500 points
        xyt=[0.0] * 1500  # 500 points
    )
    response = client.post("/api/hvac-inference", json=request.dict())
    assert response.status_code == 200
    data = response.json()
    assert len(data["positions"]) == 500
    assert len(data["velocities"]) == 500
    assert len(data["pressure"]) == 500
    assert len(data["speed"]) == 500
    assert "inferenceId" in data
    assert "computeTimeMs" in data
```

### Frontend Contract Tests

```typescript
// tests/contract.test.ts
test('denormalizePoints matches Python formula', () => {
  const center: [number, number, number] = [5, 1.4, 5]
  const scale = 10
  const normalized = [[0, 0, 0], [0.1, 0, 0]]

  const denormalized = denormalizePoints(normalized, center, scale)

  // Expected: [[5, 1.4, 5], [6, 1.4, 5]]
  expect(denormalized[0]).toEqual([5, 1.4, 5])
  expect(denormalized[1]).toEqual([6, 1.4, 5])
})
```

---

## Open Questions

1. **Model checkpoint location:** Where is the trained GINOT model stored?
2. **GPU hosting provider:** Which cloud provider for GPU instances?
3. **Authentication method:** API keys, JWT, or OAuth?
4. **Point count defaults:** What are optimal defaults for different room sizes?
5. **Fallback strategy:** What happens if backend is unavailable?

---

## Next Steps

1. **Immediate:** Set up Python backend project structure
2. **Week 1:** Implement Phase 1 (basic API)
3. **Week 2:** Implement Phase 2 (mesh endpoint, optional)
4. **Week 3:** Implement Phase 3 (frontend integration)
5. **Week 4:** Implement Phase 4 (production deployment)

---

## Related Documents

- `ginot-backend-api-specification.md` - Complete API specification
- `ginot-backend-frontend-integration.md` - Integration guide
- `hvac-system-architecture.md` - Overall HVAC system architecture
