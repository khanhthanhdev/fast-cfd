'use client'

import { useState } from 'react'
import { useHVACScenarios } from '../../../store/use-hvac-scenarios'
import { generatePDFReport } from '../../../lib/hvac/report-generator'
import { extractRoomGeometry } from '../../../lib/hvac/feature-vector-builder'
import { useScene, type LevelNode, type ZoneNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'

interface ExportReportButtonProps {
  projectName?: string
}

export const ExportReportButton = ({
  projectName = 'HVAC Analysis',
}: ExportReportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false)
  const { scenarios } = useHVACScenarios()
  const nodes = useScene((state) => state.nodes)
  const selection = useViewer((state) => state.selection)

  const handleExport = async () => {
    setIsExporting(true)

    try {
      // Extract room geometry from selected zone
      const zoneNode = selection.zoneId
        ? (nodes[selection.zoneId] as ZoneNode)
        : null
      const levelNode = selection.levelId
        ? (nodes[selection.levelId] as LevelNode)
        : null

      let roomGeometry = {
        length: 5,
        width: 4,
        height: 2.8,
        windowArea: 0,
        wallExposureRatio: 0,
      }

      if (zoneNode && levelNode) {
        roomGeometry = extractRoomGeometry(levelNode, zoneNode, nodes)
      }

      await generatePDFReport({
        projectName,
        generatedAt: new Date().toLocaleString(),
        roomGeometry,
        scenarios,
      })
    } catch (error) {
      console.error('Report export failed:', error)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting || scenarios.length === 0}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-sm text-white transition-colors hover:bg-emerald-700 disabled:bg-emerald-600/50 disabled:cursor-not-allowed"
      type="button"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      {isExporting ? 'Generating...' : 'Export PDF Report'}
    </button>
  )
}
