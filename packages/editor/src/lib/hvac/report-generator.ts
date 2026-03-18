import type { HVACScenario } from '../../store/use-hvac-scenarios'
import type { RoomGeometry } from './feature-vector-builder'
import { getPMVLabel } from './utils'

export interface ReportData {
  projectName: string
  generatedAt: string
  roomGeometry: RoomGeometry
  scenarios: HVACScenario[]
}

/**
 * Generate a PDF report from HVAC simulation results
 * Uses browser print API - creates a new window with report content
 */
export async function generatePDFReport(data: ReportData): Promise<void> {
  const reportWindow = window.open('', '_blank')
  if (!reportWindow) {
    console.error('Failed to open report window - popup blocker may be active')
    return
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>HVAC Analysis Report - ${data.projectName}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            padding: 40px;
            line-height: 1.6;
            color: #1f2937;
          }
          h1 {
            color: #1e3a8a;
            font-size: 28px;
            margin-bottom: 8px;
          }
          h2 {
            color: #3b82f6;
            border-bottom: 2px solid #3b82f6;
            padding-bottom: 8px;
            margin-top: 32px;
            font-size: 20px;
          }
          h3 {
            color: #1f2937;
            font-size: 16px;
            margin-top: 16px;
          }
          .meta {
            color: #6b7280;
            font-size: 14px;
            margin-bottom: 24px;
            padding: 12px;
            background: #f9fafb;
            border-radius: 6px;
          }
          .scenario {
            page-break-inside: avoid;
            margin: 20px 0;
            padding: 20px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background: #fff;
          }
          .kpi-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin: 16px 0;
          }
          .kpi-card {
            padding: 16px;
            background: #f3f4f6;
            border-radius: 8px;
            text-align: center;
          }
          .kpi-value {
            font-size: 24px;
            font-weight: bold;
            color: #1e3a8a;
          }
          .kpi-label {
            font-size: 12px;
            color: #6b7280;
            margin-top: 4px;
          }
          .kpi-sublabel {
            font-size: 11px;
            color: #9ca3af;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
            font-size: 14px;
          }
          th, td {
            padding: 12px;
            text-align: left;
            border: 1px solid #e5e7eb;
          }
          th {
            background: #f3f4f6;
            font-weight: 600;
          }
          tr:nth-child(even) {
            background: #f9fafb;
          }
          .param-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin: 12px 0;
          }
          .param-item {
            padding: 8px 12px;
            background: #f9fafb;
            border-radius: 4px;
            font-size: 13px;
          }
          .param-label {
            color: #6b7280;
            font-size: 11px;
            text-transform: uppercase;
          }
          .param-value {
            font-weight: 600;
            color: #1f2937;
          }
          @media print {
            body {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
              padding: 20px;
            }
            .scenario {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <h1>HVAC Analysis Report</h1>
        <div class="meta">
          <div><strong>Project:</strong> ${data.projectName}</div>
          <div><strong>Generated:</strong> ${data.generatedAt}</div>
        </div>

        <h2>Room Geometry</h2>
        <table>
          <tr>
            <th>Parameter</th>
            <th>Value</th>
          </tr>
          <tr>
            <td>Length</td>
            <td>${data.roomGeometry.length.toFixed(2)} m</td>
          </tr>
          <tr>
            <td>Width</td>
            <td>${data.roomGeometry.width.toFixed(2)} m</td>
          </tr>
          <tr>
            <td>Height</td>
            <td>${data.roomGeometry.height.toFixed(2)} m</td>
          </tr>
          <tr>
            <td>Window Area</td>
            <td>${data.roomGeometry.windowArea.toFixed(2)} m²</td>
          </tr>
          <tr>
            <td>Wall Exposure Ratio</td>
            <td>${(data.roomGeometry.wallExposureRatio * 100).toFixed(1)}%</td>
          </tr>
        </table>

        <h2>Scenario Results</h2>
        ${data.scenarios.length === 0
          ? '<p style="color: #6b7280; font-style: italic;">No scenarios available.</p>'
          : data.scenarios.map((scenario) => `
          <div class="scenario">
            <h3>${scenario.name}</h3>

            <div class="param-grid">
              <div class="param-item">
                <div class="param-label">Supply Temperature</div>
                <div class="param-value">${scenario.boundaryConditions.supplyAirTemp}°C</div>
              </div>
              <div class="param-item">
                <div class="param-label">Airflow Rate</div>
                <div class="param-value">${scenario.boundaryConditions.airflowRate} m³/h</div>
              </div>
              <div class="param-item">
                <div class="param-label">Occupancy</div>
                <div class="param-value">${scenario.boundaryConditions.occupancy} people</div>
              </div>
              <div class="param-item">
                <div class="param-label">Outdoor Temperature</div>
                <div class="param-value">${scenario.boundaryConditions.outdoorTemp}°C</div>
              </div>
            </div>

            ${scenario.results
              ? `
              <div class="kpi-grid">
                <div class="kpi-card">
                  <div class="kpi-value">${scenario.results.averageTemperature.toFixed(1)}°C</div>
                  <div class="kpi-label">Avg Temperature</div>
                </div>
                <div class="kpi-card">
                  <div class="kpi-value">${scenario.results.pmv.toFixed(2)}</div>
                  <div class="kpi-label">PMV (Predicted Mean Vote)</div>
                  <div class="kpi-sublabel">${getPMVLabel(scenario.results.pmv)}</div>
                </div>
                <div class="kpi-card">
                  <div class="kpi-value">${(scenario.results.comfortScore * 100).toFixed(0)}%</div>
                  <div class="kpi-label">Comfort Score</div>
                  <div class="kpi-sublabel">${scenario.results.comfortScore > 0.8 ? 'Good' : 'Needs Improvement'}</div>
                </div>
              </div>
            `
              : '<p style="color: #6b7280; font-style: italic;">Simulation pending...</p>'
            }
          </div>
        `).join('')}

        <h2>Comparison Summary</h2>
        ${data.scenarios.filter(s => s.results).length === 0
          ? '<p style="color: #6b7280; font-style: italic;">No simulation results to compare.</p>'
          : `
          <table>
            <tr>
              <th>Scenario</th>
              <th>Avg Temp (°C)</th>
              <th>PMV</th>
              <th>Comfort Score</th>
            </tr>
            ${data.scenarios
              .filter((s) => s.results)
              .map(
                (scenario) => `
              <tr>
                <td><strong>${scenario.name}</strong></td>
                <td>${scenario.results!.averageTemperature.toFixed(1)}</td>
                <td>${scenario.results!.pmv.toFixed(2)}</td>
                <td>${(scenario.results!.comfortScore * 100).toFixed(0)}%</td>
              </tr>
            `,
              )
              .join('')}
          </table>
        `}

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>Generated by Fast CFD - AI-powered HVAC analysis platform</p>
        </div>
      </body>
    </html>
  `

  reportWindow.document.write(html)
  reportWindow.document.close()

  // Wait for content to load then print
  setTimeout(() => {
    reportWindow.focus()
    reportWindow.print()
  }, 250)
}

