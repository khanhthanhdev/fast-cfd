PRODUCT REQUIREMENTS DOCUMENT (PRD)
HVAC AI Fast Performance Prediction Platform
Version: 1.0 (AIR AI Youth Challenge Edition)
Owner: Product + Engineering
Status: Ready for Development

1. Product Context
1.1 Vision
Develop an AI-powered Indoor Climate Digital Twin that enables engineers, building managers, and designers to rapidly evaluate indoor thermal comfort and airflow performance using AI surrogate modeling derived from CFD data.
The system democratizes building environmental analysis by transforming complex CFD simulations into real-time AI predictions.
This supports:
Healthier indoor environments
Reduced HVAC energy waste
Faster sustainable building design decisions

1.2 Objective
Build a fast indoor climate prediction tool capable of completing the full workflow in under 15 minutes:
Create or import room geometry
Configure HVAC conditions
Run AI-based airflow prediction
Evaluate comfort and air distribution
Generate a decision report

1.3 Problem Statement
Indoor air quality and thermal comfort are critical for:
Worker productivity
Health and wellbeing
Energy consumption of buildings
However, existing analysis methods are limited.
Current limitations
Method
Limitation
CFD simulation
Too slow for early design
Excel estimation
Too simplified
BIM tools
Lack airflow intelligence
Traditional HVAC design
No airflow visualization

Result:
Overdesigned systems
Energy inefficiency
Poor comfort conditions
Slow decision cycles

1.4 Opportunity
AI surrogate models trained on high-fidelity CFD simulations can:
Predict airflow distribution instantly
Estimate comfort metrics
Enable scenario comparison
Support sustainable building design
The platform enables data-driven HVAC decisions accessible to non-CFD engineers.

2. Target Users
Primary Users
HVAC Presales Engineers
Evaluate HVAC system configurations
Demonstrate comfort improvements to clients
Building Designers
Optimize room airflow distribution
Validate diffuser placement
Facility Managers
Assess indoor comfort issues

Secondary Users
Sustainability consultants
Architecture firms
Smart building startups
Indoor air quality researchers

3. Product Scope (MVP)
3.1 In Scope
The MVP focuses on single-room indoor climate analysis.
Geometry
Manual rectangular room drawing
Basic image-to-geometry import
Ceiling height configuration
HVAC Boundary Configuration
Supply air temperature
Airflow rate
Diffuser location
Occupancy level
Outdoor temperature
AI Prediction
AI surrogate inference
Temperature distribution
Airflow velocity distribution
Visualization
3D room preview
Heatmap rendering
Comfort KPI display
Reporting
Scenario comparison
PDF report export

3.2 Out of Scope (Future Phase)
Multi-room airflow coupling
Transient simulations
Detailed CFD mesh
Energy consumption modeling
BIM integration
Building digital twin integration

4. User Workflow
Step 1 — Create Geometry
User creates the room model:
Options:
Draw rectangle-based room
Upload floorplan image
Parameters:
Room length
Room width
Room height
Window area (optional)

Step 2 — Define HVAC Parameters
User configures HVAC conditions:
Inputs:
Supply air temperature
Airflow rate
Diffuser position (x, y, z)
Occupancy level
Outdoor temperature

Step 3 — Run AI Simulation
System performs the following pipeline:
Validate inputs
Convert geometry to feature vector
Send request to AI inference service
Receive prediction results
Expected response time:
< 10 seconds

Step 4 — Visualization
System renders:
Temperature heatmap
Air velocity distribution
Comfort indicators
Users can:
Compare scenarios
Identify airflow dead zones
Evaluate comfort improvement

Step 5 — Export Report
System generates a professional HVAC analysis report containing:
Room geometry
HVAC configuration
Comfort KPIs
Scenario comparison
Export format:
PDF

5. Functional Requirements
Geometry
FR-001
System must support rectangular room geometry creation.
FR-002
System must allow basic geometry import from image.

HVAC Configuration
FR-003
System must support HVAC boundary parameter input.
FR-004
System must validate parameter ranges before inference.

AI Inference
FR-005
System must convert geometry and boundary parameters into an AI feature vector.
FR-006
System must call the AI inference API.
FR-007
System must return predictions within 10 seconds.

Visualization
FR-008
System must render temperature heatmaps.
FR-009
System must render velocity distribution.
FR-010
System must display comfort KPIs.

Scenario Management
FR-011
System must allow scenario duplication.
FR-012
System must support side-by-side scenario comparison.

Reporting
FR-013
System must export PDF reports.

6. Non-Functional Requirements
Performance
NFR-001
AI inference time < 10 seconds.
NFR-002
End-to-end workflow < 15 minutes.
NFR-003
Visualization rendering < 1 second.

Scalability
NFR-004
Backend services must be stateless.
NFR-005
Inference service must be containerized.

Security
NFR-006
All API communication must use HTTPS.
NFR-007
Input validation must prevent invalid AI execution.

7. AI Integration Specification
7.1 AI Input Vector (v1)
[
RoomLength,
RoomWidth,
RoomHeight,
WindowArea,
WallExposureRatio,
SupplyTemp,
AirflowRate,
Occupancy,
OutdoorTemp,
DiffuserX,
DiffuserY,
DiffuserZ
]


7.2 AI Output
TemperatureGrid (20x20)
VelocityMagnitudeGrid (20x20)
AverageTemperature
PMV
ComfortScore


7.3 AI Model Constraints
The AI model is valid only within the trained parameter range.
Limitations:
Steady-state prediction
Single-zone airflow
No transient dynamics

8. Data Model
Project
project_id
created_at
geometry
boundary_parameters
ai_input_vector
ai_output
kpis


Scenario
scenario_id
project_id
scenario_name
reference_scenario


9. Acceptance Criteria
The MVP is considered complete when:
All functional requirements FR-001 → FR-013 implemented
AI predictions within ±10% deviation vs CFD
Stable operation under 5 concurrent users
Report usable in real HVAC consultation scenarios

10. Development Sprint Plan
Sprint 1
Geometry engine
Boundary configuration UI
Basic visualization

Sprint 2
AI inference integration
KPI calculation
Heatmap rendering

Sprint 3
Scenario comparison
PDF reporting
Performance optimization

11. Impact (AIR AI Challenge Alignment)
The platform contributes to:
Climate impact
Reducing HVAC oversizing
Improving ventilation efficiency
Supporting energy-efficient buildings
Health impact
Better thermal comfort
Improved indoor air quality awareness
Visualization of airflow distribution
Accessibility
The system enables non-CFD engineers to use advanced simulation intelligence.

✅ Key improvement for AIR challenge
Your tool is now positioned as:
AI-powered indoor climate intelligence for healthier and more energy-efficient buildings.


