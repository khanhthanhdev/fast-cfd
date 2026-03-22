# GINOT Backend API Specification

Complete backend API specification for GINOT (Graph-based Implicit Neural Operator) CFD simulation. The backend handles all computation; the frontend is purely for visualization.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    TYPESCRIPT FRONTEND                           │
│  (Next.js + React Three Fiber + Three.js)                       │
│                                                                  │
│  1. User places diffusers (supply/return) in 3D editor          │
│  2. Samples room geometry (boundary + interior points)          │
│  3. Builds normalized tensors (load, pc, xyt)                   │
│  4. POST /api/hvac-inference                                    │
│                                                                  │
│  ← Receives: positions, velocities, pressure, speed             │
│  ← Denormalizes positions to world coordinates                  │
│  ← Stores in HeatmapNode                                        │
│  ← Renders point cloud with color mapping                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP POST /api/hvac-inference
┌─────────────────────────────────────────────────────────────────┐
│                    PYTHON BACKEND (FastAPI)                      │
│                                                                  │
│  1. Load room mesh (STL/OBJ) OR receive pre-sampled geometry    │
│  2. Validate input tensors (load, pc, xyt)                      │
│  3. Run GINOT model inference                                   │
│  4. Post-process predictions                                    │
│  5. Return JSON response                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Key Principle:** Backend performs all CFD computation. Frontend only displays results.

---

## API Endpoint

### POST `/api/hvac-inference`

Primary endpoint for GINOT neural operator inference.

#### Request Headers

| Header | Value | Required |
|--------|-------|----------|
| `Content-Type` | `application/json` | Yes |
| `Accept` | `application/json` | Yes |

#### Request Body (`GinotInferenceRequest`)

```json
{
  "load": [0.1, 0.25, 0.0, 0.3, 0.25, 0.3, 0.0, -0.5, 0.0],
  "pc": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, ...],
  "xyt": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, ...],
  "metadata": {
    "boundaryCount": 5000,
    "interiorCount": 5000,
    "center": [5.0, 1.4, 5.0],
    "scale": 10.0
  }
}
```

**Request Schema:**

| Field | Type | Shape | Description | Normalized |
|-------|------|-------|-------------|------------|
| `load` | `Float32Array` | `[9]` | Boundary condition vector | Partial (see below) |
| `pc` | `Float32Array` | `[N*3]` | Boundary surface points (flattened) | Yes |
| `xyt` | `Float32Array` | `[M*3]` | Interior query points (flattened) | Yes |
| `metadata` | `object` | - | Optional metadata for debugging | - |

**Load Vector Layout (9 elements):**

| Index | Field | Description | Normalized | Range |
|-------|-------|-------------|------------|-------|
| 0-2 | `inlet_center` | Supply diffuser position [x, y, z] | Yes | [-1, 1] |
| 3-5 | `outlet_center` | Return diffuser position [x, y, z] | Yes | [-1, 1] |
| 6-8 | `inlet_velocity` | Air velocity vector [u, v, w] | **No** | [-10, 10] m/s |

**Point Clouds:**

| Field | Description | Typical Count | Shape |
|-------|-------------|---------------|-------|
| `pc` | Boundary surface samples | 5,000 - 100,000 | `[N, 3]` flattened |
| `xyt` | Interior query points | 5,000 - 50,000 | `[M, 3]` flattened |

**Metadata Object:**

| Field | Type | Description |
|-------|------|-------------|
| `boundaryCount` | `number` | Number of boundary points (N) |
| `interiorCount` | `number` | Number of interior points (M) |
| `center` | `[number, number, number]` | Room center for denormalization |
| `scale` | `number` | Room scale for denormalization |

---

### Response Body (`GinotInferenceResponse`)

```json
{
  "positions": [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6], ...],
  "velocities": [[0.5, -0.1, 0.0], [0.3, 0.2, -0.1], ...],
  "pressure": [101325.5, 101326.2, ...],
  "speed": [0.51, 0.37, ...],
  "bounds": {
    "min": [0.0, 0.0, 0.0],
    "max": [10.0, 2.8, 10.0]
  },
  "metadata": {
    "inletCenter": [5.0, 2.0, 5.0],
    "outletCenter": [5.0, 2.0, 8.0],
    "inletVelocity": [0.0, -0.5, 0.0]
  },
  "inferenceId": "ginot_abc123",
  "timestamp": 1711036800000,
  "computeTimeMs": 1250
}
```

**Response Schema:**

| Field | Type | Shape | Description |
|-------|------|-------|-------------|
| `positions` | `number[][]` | `[M][3]` | Query point coordinates (normalized) |
| `velocities` | `number[][]` | `[M][3]` | Velocity vectors [U, V, W] in m/s |
| `pressure` | `number[]` | `[M]` | Scalar pressure in Pa |
| `speed` | `number[]` | `[M]` | Velocity magnitude √(U²+V²+W²) |
| `bounds` | `object` | - | Room bounding box |
| `metadata` | `object` | - | Boundary condition metadata |
| `inferenceId` | `string` | - | Unique inference ID |
| `timestamp` | `number` | - | Unix timestamp (ms) |
| `computeTimeMs` | `number` | - | Server compute time |

**Response Field Details:**

| Field | Description | Units | Range |
|-------|-------------|-------|-------|
| `positions` | Query point coordinates (normalized to [-1, 1]) | - | [-1, 1] |
| `velocities` | 3D velocity vectors at each point | m/s | [-10, 10] |
| `pressure` | Static pressure field | Pascal (Pa) | [101000, 102000] |
| `speed` | Velocity magnitude (derived from velocities) | m/s | [0, 5] |

---

## Python Backend Implementation

### 2.1 FastAPI Application Structure

```python
# backend/app/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import numpy as np
import torch
import time
import uuid

app = FastAPI(title="GINOT CFD Inference API")

# Load trained GINOT model
from models.ginot import GINOTModel
ginot_model = GINOTModel.load_from_checkpoint("checkpoints/ginot_best.ckpt")
ginot_model.eval()
ginot_model.cuda()
```

### 2.2 Pydantic Schemas

```python
# backend/app/schemas.py
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class MetadataInput(BaseModel):
    boundaryCount: Optional[int] = None
    interiorCount: Optional[int] = None
    center: Optional[List[float]] = None
    scale: Optional[float] = None

class GinotInferenceRequest(BaseModel):
    load: List[float] = Field(..., min_length=9, max_length=9, description="9-element load vector")
    pc: List[float] = Field(..., description="Flattened boundary points [N*3]")
    xyt: List[float] = Field(..., description="Flattened interior points [M*3]")
    metadata: Optional[MetadataInput] = None

class Bounds(BaseModel):
    min: List[float]
    max: List[float]

class ResponseMetadata(BaseModel):
    inletCenter: List[float]
    outletCenter: List[float]
    inletVelocity: List[float]

class GinotInferenceResponse(BaseModel):
    positions: List[List[float]]
    velocities: List[List[float]]
    pressure: List[float]
    speed: List[float]
    bounds: Bounds
    metadata: ResponseMetadata
    inferenceId: str
    timestamp: int
    computeTimeMs: float
```

### 2.3 Input Validation

```python
# backend/app/validators.py
import numpy as np
from typing import Tuple, Dict

def validate_request(request: GinotInferenceRequest) -> Dict[str, any]:
    """
    Validate and reshape input tensors for GINOT model.
    """
    errors = []

    # Validate load vector shape
    if len(request.load) != 9:
        errors.append(f"Load vector must have 9 elements, got {len(request.load)}")

    # Validate pc shape (must be divisible by 3)
    if len(request.pc) % 3 != 0:
        errors.append(f"PC length must be divisible by 3, got {len(request.pc)}")

    # Validate xyt shape
    if len(request.xyt) % 3 != 0:
        errors.append(f"XYT length must be divisible by 3, got {len(request.xyt)}")

    # Check for NaN/Infinity
    if not all(np.isfinite(request.load)):
        errors.append("Load vector contains NaN or Infinity")
    if not all(np.isfinite(request.pc)):
        errors.append("PC contains NaN or Infinity")
    if not all(np.isfinite(request.xyt)):
        errors.append("XYT contains NaN or Infinity")

    # Minimum point counts
    boundary_count = len(request.pc) // 3
    interior_count = len(request.xyt) // 3

    if boundary_count < 100:
        errors.append(f"Too few boundary points: {boundary_count} (minimum 100)")
    if interior_count < 1:
        errors.append("No interior query points")

    # Validate load vector values
    # Normalized centers should be in [-2, 2] typically
    for i in range(6):
        if abs(request.load[i]) > 10:
            errors.append(f"Load[{i}] = {request.load[i]} outside normalized range")

    # Velocity should be reasonable for HVAC (0-10 m/s typical)
    for i in range(6, 9):
        if request.load[i] < -50 or request.load[i] > 50:
            errors.append(f"Load[{i}] = {request.load[i]} invalid velocity")

    if errors:
        raise ValueError("; ".join(errors))

    return {
        "boundary_count": boundary_count,
        "interior_count": interior_count,
    }

def reshape_tensors(request: GinotInferenceRequest) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    Reshape flat arrays to model-ready tensors.

    Returns:
        load: [1, 9]
        pc: [1, N, 3]
        xyt: [1, M, 3]
    """
    load = torch.tensor(request.load, dtype=torch.float32).unsqueeze(0)  # [1, 9]

    pc_array = np.array(request.pc, dtype=np.float32).reshape(-1, 3)
    pc = torch.from_numpy(pc_array).unsqueeze(0)  # [1, N, 3]

    xyt_array = np.array(request.xyt, dtype=np.float32).reshape(-1, 3)
    xyt = torch.from_numpy(xyt_array).unsqueeze(0)  # [1, M, 3]

    return load, pc, xyt
```

### 2.4 Model Inference

```python
# backend/app/inference.py
import torch
import numpy as np
from typing import Dict, Any

@torch.no_grad()
def run_inference(
    load: torch.Tensor,
    pc: torch.Tensor,
    xyt: torch.Tensor,
    model: torch.nn.Module,
    device: str = "cuda"
) -> Dict[str, Any]:
    """
    Run GINOT model inference and post-process results.

    Args:
        load: [1, 9] load vector
        pc: [1, N, 3] boundary points
        xyt: [1, M, 3] query points
        model: Trained GINOT model
        device: Device to run inference on

    Returns:
        Dictionary with positions, velocities, pressure, speed
    """
    # Move to device
    load = load.to(device)
    pc = pc.to(device)
    xyt = xyt.to(device)

    # Run inference
    model.eval()
    prediction = model(load, xyt, pc)  # [1, M, 4] = [U, V, W, pressure]

    # Extract fields
    pred_np = prediction.squeeze(0).cpu().numpy()  # [M, 4]

    velocities = pred_np[:, :3]  # [M, 3]
    pressure = pred_np[:, 3]     # [M]

    # Calculate speed (velocity magnitude)
    speed = np.sqrt(np.sum(velocities ** 2, axis=1))  # [M]

    # Query positions (from xyt)
    positions = xyt.squeeze(0).cpu().numpy()  # [M, 3]

    return {
        "positions": positions,
        "velocities": velocities,
        "pressure": pressure,
        "speed": speed,
    }
```

### 2.5 API Endpoint Implementation

```python
# backend/app/api.py
from fastapi import HTTPException
from app.schemas import GinotInferenceRequest, GinotInferenceResponse, Bounds, ResponseMetadata
from app.validators import validate_request, reshape_tensors
from app.inference import run_inference
import time
import uuid

@app.post("/api/hvac-inference", response_model=GinotInferenceResponse)
async def hvac_inference(request: GinotInferenceRequest):
    """
    Run GINOT neural operator inference for HVAC airflow simulation.

    Backend processes all CFD computation. Frontend only displays results.
    """
    start_time = time.time()

    try:
        # Validate input
        validation = validate_request(request)

        # Reshape tensors
        load, pc, xyt = reshape_tensors(request)

        # Run inference
        result = run_inference(
            load=load,
            pc=pc,
            xyt=xyt,
            model=ginot_model,
            device="cuda"
        )

        compute_time = (time.time() - start_time) * 1000  # ms

        # Build response
        # Positions returned normalized; frontend denormalizes using metadata.center/scale
        response = GinotInferenceResponse(
            positions=result["positions"].tolist(),      # [M][3] normalized
            velocities=result["velocities"].tolist(),    # [M][3] m/s
            pressure=result["pressure"].tolist(),        # [M] Pa
            speed=result["speed"].tolist(),              # [M] m/s
            bounds=Bounds(
                min=request.metadata.center if request.metadata?.center else [0, 0, 0],
                max=[
                    request.metadata.center[0] + request.metadata.scale if request.metadata else 10,
                    request.metadata.center[1] + request.metadata.scale if request.metadata else 3,
                    request.metadata.center[2] + request.metadata.scale if request.metadata else 10
                ]
            ),
            metadata=ResponseMetadata(
                inletCenter=request.load[:3],
                outletCenter=request.load[3:6],
                inletVelocity=request.load[6:9]
            ),
            inferenceId=f"ginot_{uuid.uuid4().hex[:8]}",
            timestamp=int(time.time() * 1000),
            computeTimeMs=round(compute_time, 2)
        )

        return response

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {str(e)}")
```

### 2.6 Alternative: Mesh-Based Input

For workflows where backend handles geometry sampling:

```python
# backend/app/api_mesh.py
import trimesh
from io import BytesIO
from fastapi import UploadFile

class MeshInferenceRequest(BaseModel):
    load: List[float]
    boundaryCount: int = 5000
    interiorCount: int = 5000

@app.post("/api/hvac-inference-mesh")
async def hvac_inference_from_mesh(
    request: MeshInferenceRequest,
    mesh_file: UploadFile
):
    """
    Alternative endpoint: Backend handles mesh loading and sampling.

    Frontend uploads STL/OBJ mesh file, backend:
    1. Loads and normalizes mesh
    2. Samples boundary (pc) and interior (xyt) points
    3. Runs GINOT inference
    4. Returns results
    """
    # Load mesh
    mesh_data = await mesh_file.read()
    mesh = trimesh.load(BytesIO(mesh_data), file_type=mesh_file.filename.split('.')[-1])

    # Normalize mesh
    center = mesh.bounds.mean(axis=0)
    scale = (mesh.bounds[1] - mesh.bounds[0]).max()

    mesh_norm = mesh.copy()
    mesh_norm.apply_translation(-center)
    mesh_norm.apply_scale(1.0 / scale)

    # Sample boundary points
    pc_boundary, _ = trimesh.sample.sample_surface(mesh_norm, request.boundaryCount)
    pc = torch.tensor(pc_boundary, dtype=torch.float32).unsqueeze(0)

    # Sample interior points (rejection sampling)
    interior_pts = sample_interior(mesh_norm, request.interiorCount)
    xyt = torch.tensor(interior_pts, dtype=torch.float32).unsqueeze(0)

    # Build load tensor
    load = torch.tensor(request.load, dtype=torch.float32).unsqueeze(0)

    # Run inference (same as above)
    result = run_inference(load, pc, xyt, ginot_model, device="cuda")

    # Denormalize positions for response
    original_positions = (result["positions"] * scale) + center

    return {
        "positions": original_positions.tolist(),  # World coordinates
        "velocities": result["velocities"].tolist(),
        "pressure": result["pressure"].tolist(),
        "speed": result["speed"].tolist(),
        "bounds": {
            "min": mesh.bounds[0].tolist(),
            "max": mesh.bounds[1].tolist()
        },
        # ... rest of response
    }

def sample_interior(mesh, count, max_attempts=10):
    """Sample points inside mesh volume using rejection sampling."""
    points = []
    attempts = 0

    while len(points) < count and attempts < max_attempts:
        # Random points in bounding box
        candidates = np.random.uniform(
            mesh.bounds[0], mesh.bounds[1],
            size=(count * 2, 3)
        )
        # Keep points inside mesh
        inside = mesh.contains(candidates)
        points.extend(candidates[inside].tolist())
        attempts += 1

    return np.array(points[:count])
```

---

## Data Flow

### Complete Request/Response Cycle

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Frontend Geometry Sampling                              │
├─────────────────────────────────────────────────────────────────┤
│ 1. User places diffusers in 3D editor                           │
│ 2. System extracts room geometry (Level + Zone)                 │
│ 3. Sample boundary surface → 5,000 points                       │
│ 4. Sample interior volume → 5,000 points                        │
│ 5. Compute normalization params: center, scale                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Frontend Tensor Building                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. Normalize boundary points: pc = (pts - center) / scale       │
│ 2. Normalize interior points: xyt = (pts - center) / scale      │
│ 3. Build load vector from diffuser data:                        │
│    - inletCenter (normalized)                                   │
│    - outletCenter (normalized)                                  │
│    - inletVelocity (raw m/s, NOT normalized)                    │
│ 4. Flatten to Float32Array for JSON transfer                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓ POST /api/hvac-inference
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Backend Validation                                      │
├─────────────────────────────────────────────────────────────────┤
│ 1. Validate load vector shape (= 9)                             │
│ 2. Validate pc shape (divisible by 3)                           │
│ 3. Validate xyt shape (divisible by 3)                          │
│ 4. Check for NaN/Infinity                                       │
│ 5. Validate value ranges                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Backend Tensor Reshaping                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. load: List[float] → torch.Tensor [1, 9]                      │
│ 2. pc: List[float] → torch.Tensor [1, N, 3]                     │
│ 3. xyt: List[float] → torch.Tensor [1, M, 3]                    │
│ 4. Move tensors to GPU (CUDA)                                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: GINOT Model Inference                                   │
├─────────────────────────────────────────────────────────────────┤
│ prediction = model(load, xyt, pc)                               │
│ Output shape: [1, M, 4] = [U, V, W, pressure]                   │
│                                                                 │
│ Model architecture:                                             │
│ - Geometry encoder (processes pc boundary)                      │
│ - Condition encoder (processes load)                            │
│ - Implicit neural operator (queries at xyt positions)           │
│ - Output: velocity field + pressure at query points             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: Backend Post-processing                                 │
├─────────────────────────────────────────────────────────────────┤
│ 1. Extract velocities: pred[:, :3] → [M, 3]                     │
│ 2. Extract pressure: pred[:, 3] → [M]                           │
│ 3. Calculate speed: sqrt(U² + V² + W²) → [M]                    │
│ 4. Keep positions from xyt (normalized)                         │
│ 5. Convert to JSON-serializable format                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Response JSON
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: Frontend Denormalization                                │
├─────────────────────────────────────────────────────────────────┤
│ 1. Receive response with normalized positions                   │
│ 2. Denormalize: world_pos = (norm_pos * scale) + center         │
│ 3. Build ginotPointCloud array:                                 │
│    [{ position: [x,y,z], velocity: [u,v,w], speed, pressure }]  │
│ 4. Store in HeatmapNode.data                                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 8: Three.js Visualization                                  │
├─────────────────────────────────────────────────────────────────┤
│ 1. Read ginotPointCloud from HeatmapNode                        │
│ 2. Build BufferGeometry with position/color attributes          │
│ 3. Color points by speed or pressure using colormap             │
│ 4. Render as THREE.Points with PointsMaterial                   │
│ 5. Interactive controls: rotate, zoom, slice height             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Normalization Contract

**CRITICAL:** Python backend and TypeScript frontend MUST use identical normalization.

### Center/Scale Computation

```python
# Python
center = [(bounds_min[0] + bounds_max[0]) / 2,
          (bounds_min[1] + bounds_max[1]) / 2,
          (bounds_min[2] + bounds_max[2]) / 2]
scale = max(bounds_max[0] - bounds_min[0],
            bounds_max[1] - bounds_min[1],
            bounds_max[2] - bounds_min[2])
```

```typescript
// TypeScript - MUST match exactly
const center: [number, number, number] = [
  (bounds.min[0] + bounds.max[0]) / 2,
  (bounds.min[1] + bounds.max[1]) / 2,
  (bounds.min[2] + bounds.max[2]) / 2,
]
const scale = Math.max(
  bounds.max[0] - bounds.min[0],
  bounds.max[1] - bounds.min[1],
  bounds.max[2] - bounds.min[2]
)
```

### Normalization Formula

```python
# Python
normalized_point = (world_point - center) / scale
```

```typescript
// TypeScript
const normalized = points.map(p => [
  (p[0] - center[0]) / scale,
  (p[1] - center[1]) / scale,
  (p[2] - center[2]) / scale,
])
```

### Denormalization Formula

```python
# Python
world_point = normalized_point * scale + center
```

```typescript
// TypeScript
const world = points.map(p => [
  p[0] * scale + center[0],
  p[1] * scale + center[1],
  p[2] * scale + center[2],
])
```

### Load Vector Special Cases

| Component | Normalized? | Reason |
|-----------|-------------|--------|
| `inlet_center` (indices 0-2) | Yes | Position, uses center/scale |
| `outlet_center` (indices 3-5) | Yes | Position, uses center/scale |
| `inlet_velocity` (indices 6-8) | **No** | Physical quantity in m/s |

---

## Error Handling

### Validation Errors (400 Bad Request)

```json
{
  "detail": "Load vector must have 9 elements, got 8"
}
```

```json
{
  "detail": "PC length must be divisible by 3, got 5001"
}
```

```json
{
  "detail": "Load vector contains NaN or Infinity"
}
```

### Server Errors (500 Internal Server Error)

```json
{
  "detail": "Inference failed: CUDA out of memory"
}
```

### Timeout Handling

Frontend sets 10-second timeout:

```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 10000)

try {
  const response = await fetch('/api/hvac-inference', {
    method: 'POST',
    signal: controller.signal,
  })
  clearTimeout(timeoutId)
  return await response.json()
} catch (error) {
  clearTimeout(timeoutId)
  if (error.name === 'AbortError') {
    throw new Error('GINOT inference timeout (>10s)')
  }
  throw error
}
```

Backend should complete inference within 5 seconds for typical cases (5K points).

---

## Performance Requirements

| Metric | Target | Notes |
|--------|--------|-------|
| Response time | < 10 seconds | NFR-001 |
| Typical inference (5K points) | < 2 seconds | GPU-accelerated |
| Maximum points (100K boundary + 50K interior) | < 10 seconds | High-end GPU |
| Concurrent requests | 10+ | With GPU queuing |

### Optimization Strategies

1. **Point Count Reduction**: Use adaptive sampling based on room size
2. **Batch Inference**: Process multiple rooms in single request
3. **Model Quantization**: INT8 inference for faster prediction
4. **GPU Memory Management**: Clear cache between requests

---

## Security Considerations

### Input Validation

- Validate all numeric ranges
- Reject NaN/Infinity values
- Limit maximum point counts (DoS protection)
- Sanitize file uploads for mesh-based endpoint

### Rate Limiting

```python
from fastapi_limiter import FastAPILimiter
from fastapi_limiter.depends import RateLimiter

@app.post("/api/hvac-inference", dependencies=[Depends(RateLimiter(times=10, seconds=60))])
async def hvac_inference(request: GinotInferenceRequest):
    ...
```

### Authentication

For production deployment:

```python
from fastapi import Depends, Header

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key not in ALLOWED_KEYS:
        raise HTTPException(status_code=401, detail="Invalid API key")

@app.post("/api/hvac-inference", dependencies=[Depends(verify_api_key)])
```

---

## Deployment

### Docker Configuration

```dockerfile
# backend/Dockerfile
FROM python:3.10-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Variables

```bash
# .env
GINOT_MODEL_PATH=checkpoints/ginot_best.ckpt
DEVICE=cuda
MAX_BOUNDARY_POINTS=100000
MAX_INTERIOR_POINTS=50000
INFERENCE_TIMEOUT_SECONDS=30
API_KEY=your-secret-key
```

### CORS Configuration

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3002", "https://editor.pascal.com"],
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)
```

---

## File Reference

| Component | File Path |
|-----------|-----------|
| **Frontend Types** | `packages/editor/src/lib/hvac/cfd-types.ts` |
| **API Client** | `packages/editor/src/lib/hvac/ai-inference-client.ts` |
| **Input Builder** | `packages/editor/src/lib/hvac/ginot-input-builder.ts` |
| **Point Sampler** | `packages/editor/src/lib/hvac/point-sampler.ts` |
| **Normalization** | `packages/editor/src/lib/hvac/normalization.ts` |
| **Heatmap Schema** | `packages/core/src/schema/nodes/heatmap.ts` |
| **Point Cloud Renderer** | `packages/viewer/src/components/renderers/heatmap/ginot-point-cloud.tsx` |
| **Analysis Hook** | `packages/editor/src/hooks/use-hvac-analysis.ts` |
| **Python Backend** | `backend/app/main.py` (to be created) |
| **Python Schemas** | `backend/app/schemas.py` (to be created) |
| **Python Validators** | `backend/app/validators.py` (to be created) |
| **Python Inference** | `backend/app/inference.py` (to be created) |

---

## Testing

### Test Request Payload

```json
{
  "load": [0, 0.25, 0, 0, 0.25, 0.25, 0, -0.5, 0],
  "pc": [],
  "xyt": [],
  "metadata": {
    "boundaryCount": 1000,
    "interiorCount": 1000,
    "center": [5, 1.4, 5],
    "scale": 10
  }
}
```

Generate mock pc/xyt arrays:

```python
import numpy as np

# Mock boundary points (box surface)
pc = np.random.uniform(-0.5, 0.5, size=(1000, 3)).flatten().tolist()

# Mock interior points
xyt = np.random.uniform(-0.5, 0.5, size=(1000, 3)).flatten().tolist()
```

### Expected Response

```json
{
  "positions": [[-0.1, 0.2, -0.3], ...],
  "velocities": [[0.5, -0.1, 0.0], ...],
  "pressure": [101325.5, ...],
  "speed": [0.51, ...],
  "bounds": {...},
  "metadata": {...},
  "inferenceId": "ginot_abc123",
  "timestamp": 1711036800000,
  "computeTimeMs": 1250
}
```

### Frontend Integration Test

```typescript
// Test denormalization
const center: [number, number, number] = [5, 1.4, 5]
const scale = 10

const normalizedPositions = [[0, 0, 0], [0.1, 0, 0]]
const denormalized = denormalizePoints(normalizedPositions, center, scale)

// Expected: [[5, 1.4, 5], [6, 1.4, 5]]
```

---

## Troubleshooting

### Issue: All points same color

**Cause:** Incorrect min/max bounds for color mapping

**Solution:**
```typescript
const { min, max } = getBounds(metricValues)
if (min === max) {
  // Handle edge case: all values identical
  return defaultColor
}
```

### Issue: Point cloud offset from room

**Cause:** Normalization mismatch between Python and TypeScript

**Solution:** Verify both use:
- `center = bounds.mean()` (not centroid)
- `scale = max_dimension` (not diagonal)

### Issue: velocities are zero

**Cause:** Model not loading correctly or wrong input shape

**Solution:** Check model checkpoint path, verify tensor shapes match training

### Issue: Inference timeout

**Cause:** Too many points or GPU memory issues

**Solution:** Reduce point counts, upgrade GPU, or increase timeout

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-21 | Initial specification |
| | | |

---

## Appendix A: Complete Example

### Frontend Request

```typescript
import { buildGinotInput } from '@/lib/hvac/ginot-input-builder'
import { callGinotInference } from '@/lib/hvac/ai-inference-client'

// Geometry from scene
const geometry = buildRoomGeometryFromScene(levelNode, zoneNode, nodes)

// Diffuser data
const diffusers = {
  supplyDiffusers: [{ position: [5, 2, 5], ... }],
  returnDiffusers: [{ position: [5, 2, 8], ... }],
}

// Build input tensors
const input = buildGinotInput(geometry, diffusers, {
  boundaryCount: 5000,
  interiorCount: 5000,
})

// Call API
const response = await callGinotInference({
  load: Array.from(input.load),
  pc: Array.from(input.pc),
  xyt: Array.from(input.xyt),
  metadata: input.metadata,
})

// Denormalize positions
const worldPositions = denormalizePoints(
  response.positions,
  input.metadata.center,
  input.metadata.scale
)

// Build point cloud data
const pointCloud = worldPositions.map((pos, i) => ({
  position: pos as [number, number, number],
  velocity: response.velocities[i] as [number, number, number],
  speed: response.speed[i],
  pressure: response.pressure[i],
}))
```

### Backend Processing

```python
# Receive request
request = GinotInferenceRequest(
    load=[0, 0.25, 0, 0, 0.25, 0.25, 0, -0.5, 0],
    pc=[...],  # 15000 floats
    xyt=[...],  # 15000 floats
)

# Validate
validate_request(request)  # Raises if invalid

# Reshape
load = torch.tensor(request.load).unsqueeze(0)  # [1, 9]
pc = torch.tensor(request.pc).reshape(-1, 3).unsqueeze(0)  # [1, 5000, 3]
xyt = torch.tensor(request.xyt).reshape(-1, 3).unsqueeze(0)  # [1, 5000, 3]

# Inference
with torch.no_grad():
    prediction = model(load.cuda(), xyt.cuda(), pc.cuda())  # [1, 5000, 4]

# Post-process
pred_np = prediction.cpu().numpy()[0]  # [5000, 4]
velocities = pred_np[:, :3]
pressure = pred_np[:, 3]
speed = np.sqrt(np.sum(velocities**2, axis=1))

# Response
return {
    "positions": xyt.cpu().numpy()[0].tolist(),
    "velocities": velocities.tolist(),
    "pressure": pressure.tolist(),
    "speed": speed.tolist(),
    ...
}
```
