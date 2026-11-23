import { AnomalySeverity, AnomalyType } from '../types/energy';

export interface DetectableAnomalySpec {
  id: string;
  type: AnomalyType;
  variant: string;
  severity: AnomalySeverity;
  trigger: string;
  description: string;
}

/**
 * Authoritative specification of every anomaly vector & severity tier evaluated by VoltPulse IoT.
 * Kept aligned with src/utils/anomalyDetector.ts and api/telemetry/ingest.ts.
 */
export const DETECTABLE_ANOMALIES_CATALOG: DetectableAnomalySpec[] = [
  {
    id: 'lid-open-tamper',
    type: 'LID_OPEN_TAMPER',
    variant: 'Enclosure Lid Opened (Limit Switch)',
    severity: 'CRITICAL',
    trigger: 'lidOpen === true',
    description:
      'Meter enclosure limit switch reported the physical cover/lid is open (lidOpen: true), indicating unauthorized physical access to internal wiring, CT coils, or relay terminals.',
  },
  {
    id: 'unmetered-bypass-relay-off',
    type: 'UNMETERED_BYPASS',
    variant: 'Relay Tripped Current Bypass',
    severity: 'CRITICAL',
    trigger: 'Relay OFF & (I > 0.8 A or |P| > 100 W)',
    description:
      'Current greater than 0.8 A or active power magnitude above 100 W detected while the meter relay is confirmed OFF. Strong indicator of a physical line bridge, jumper wire, or welded relay contact bypass.',
  },
  {
    id: 'unmetered-bypass-neutral',
    type: 'UNMETERED_BYPASS',
    variant: 'Phase Angle / Neutral Tamper',
    severity: 'HIGH',
    trigger: 'Relay ON & S > 800 VA & I > 3.5 A & P < 40 W',
    description:
      'High apparent power (> 800 VA) and load current (> 3.5 A) recorded while registered active power remains below 40 W due to severe phase-angle distortion, typical of missing neutral or phase-inversion tampering.',
  },
  {
    id: 'current-shunt-theft',
    type: 'CURRENT_SHUNT_THEFT',
    variant: 'Sudden Load Collapse (CT Shunt)',
    severity: 'CRITICAL',
    trigger: 'Prev P > 1200 W -> P < 5 W while V > 200 V',
    description:
      'Active power abruptly collapses from above 1,200 W to below 5 W while grid voltage stays healthy (> 200 V), indicating possible CT coil bypass, shunt jumper installation, or magnetic tampering.',
  },
  {
    id: 'reverse-current',
    type: 'REVERSE_CURRENT',
    variant: 'Reverse Power Flow / Backfeed',
    severity: 'HIGH',
    trigger: 'P < -60 W or I < -0.3 A',
    description:
      'Negative active power (< -60 W) or negative current (< -0.3 A) measured at the meter terminals, indicating unapproved grid-tied generator/inverter backfeeding or reverse polarity wiring.',
  },
  {
    id: 'surge-spike',
    type: 'SURGE_SPIKE',
    variant: 'Overcurrent & Power Overload',
    severity: 'CRITICAL',
    trigger: 'I > 42 A or P > 9500 W',
    description:
      'Sustained current draw exceeding 42 A or active power exceeding 9,500 W above standard 40 A residential service rating, creating an acute thermal fire and breaker failure hazard.',
  },
  {
    id: 'overvoltage-critical',
    type: 'OVERVOLTAGE',
    variant: 'Critical Over-voltage Hazard',
    severity: 'CRITICAL',
    trigger: 'V >= 250 V',
    description:
      'Dangerous line over-voltage at or above 250 V, posing an immediate risk of insulation breakdown, electrical fire, and permanent damage to connected electronics.',
  },
  {
    id: 'overvoltage-warning',
    type: 'OVERVOLTAGE',
    variant: 'Over-voltage Warning',
    severity: 'MEDIUM',
    trigger: '242 V <= V < 250 V',
    description:
      'Elevated line voltage between 242 V and 249.9 V above the nominal operating band and approaching the 250 V critical over-voltage threshold.',
  },
  {
    id: 'undervoltage-critical',
    type: 'UNDERVOLTAGE',
    variant: 'Critical Under-voltage Sag',
    severity: 'CRITICAL',
    trigger: '0 V < V < 180 V',
    description:
      'Severe line voltage collapse below 180 V (above 0 V), indicating a dangerous brownout condition that risks motor compressor burnout and power supply failure.',
  },
  {
    id: 'undervoltage-warning',
    type: 'UNDERVOLTAGE',
    variant: 'Under-voltage Warning',
    severity: 'MEDIUM',
    trigger: '180 V <= V < 207 V',
    description:
      'Line voltage sagged into the 180 V - 206.9 V band below the standard 207 V lower nominal limit, causing brownout stress and degraded appliance performance.',
  },
  {
    id: 'voltage-drop-high-draw',
    type: 'VOLTAGE_DROP_HIGH_DRAW',
    variant: 'Severe Sag Under Heavy Load',
    severity: 'HIGH',
    trigger: '0 V < V < 190 V & I > 20 A',
    description:
      'Line voltage collapses below 190 V specifically while supplying more than 20 A, indicating excessive feeder impedance, corroded service splices, or illegal secondary tapping.',
  },
  {
    id: 'frequency-critical',
    type: 'FREQUENCY_INSTABILITY',
    variant: 'Extreme Grid Frequency Deviation',
    severity: 'CRITICAL',
    trigger: 'f > 0 Hz & (f <= 45.0 Hz or f >= 55.0 Hz)',
    description:
      'Grid frequency shifted to 45.0 Hz or lower, or 55.0 Hz or higher (nominal range: 49.5 - 50.5 Hz), indicating severe grid instability, out-of-sync generation, or frequency sensor fault.',
  },
  {
    id: 'frequency-high',
    type: 'FREQUENCY_INSTABILITY',
    variant: 'Severe Grid Frequency Deviation',
    severity: 'HIGH',
    trigger: '45.01 - 47.49 Hz or 52.51 - 54.99 Hz',
    description:
      'Grid frequency deviated sharply outside 47.5 - 52.5 Hz (nominal range: 49.5 - 50.5 Hz), signaling major frequency drift or unstable local generator oscillation.',
  },
  {
    id: 'frequency-medium',
    type: 'FREQUENCY_INSTABILITY',
    variant: 'Moderate Grid Frequency Deviation',
    severity: 'MEDIUM',
    trigger: '47.50 - 49.49 Hz or 50.51 - 52.50 Hz',
    description:
      'Grid frequency drifted outside the normal 49.5 - 50.5 Hz operating band within 47.5 - 52.5 Hz, requiring operator monitoring.',
  },
  {
    id: 'peak-power-critical',
    type: 'PEAK_POWER_EXCEEDED',
    variant: 'All-Time Peak Exceeded (> 200%)',
    severity: 'CRITICAL',
    trigger: 'P > Peak * 3.00 (> +200% above peak)',
    description:
      'Reported active power exceeded the meter’s historical all-time peak active power by more than 200%, indicating an extreme uncharacteristic demand surge or major unauthorized load connection.',
  },
  {
    id: 'peak-power-high',
    type: 'PEAK_POWER_EXCEEDED',
    variant: 'All-Time Peak Exceeded (100% - 200%)',
    severity: 'HIGH',
    trigger: 'Peak * 2.00 <= P <= Peak * 3.00 (+100% to +200%)',
    description:
      'Reported active power exceeded the meter’s historical all-time peak active power by 100% to 200%, indicating substantial new heavy load draw or circuit tapping.',
  },
  {
    id: 'peak-power-medium',
    type: 'PEAK_POWER_EXCEEDED',
    variant: 'All-Time Peak Exceeded (50% - 99%)',
    severity: 'MEDIUM',
    trigger: 'Peak * 1.50 <= P < Peak * 2.00 (+50% to +99%)',
    description:
      'Reported active power exceeded the meter’s historical all-time peak active power by 50% to 99%, marking a significant jump above established demand history.',
  },
  {
    id: 'peak-power-low',
    type: 'PEAK_POWER_EXCEEDED',
    variant: 'All-Time Peak Exceeded (20% - 49%)',
    severity: 'LOW',
    trigger: 'Peak * 1.20 <= P < Peak * 1.50 (+20% to +49%)',
    description:
      'Reported active power exceeded the meter’s historical all-time peak active power by 20% to 49%, logging a low-severity alert for new demand growth verification.',
  },
];

export interface CreatedGoogleDocResult {
  documentId: string;
  title: string;
  url: string;
  rowCount: number;
}

function getSeverityRgbColor(severity: AnomalySeverity) {
  switch (severity) {
    case 'CRITICAL':
      return { red: 0.725, green: 0.11, blue: 0.11 }; // #b91c1c
    case 'HIGH':
      return { red: 0.761, green: 0.255, blue: 0.047 }; // #c2410c
    case 'MEDIUM':
      return { red: 0.631, green: 0.384, blue: 0.027 }; // #a16207
    case 'LOW':
    default:
      return { red: 0.059, green: 0.463, blue: 0.431 }; // #0f766e
  }
}

export async function createAnomalyReferenceGoogleDoc(
  accessToken: string,
  options?: { title?: string; meterId?: string }
): Promise<CreatedGoogleDocResult> {
  if (!accessToken) {
    throw new Error('DOCS_AUTH_REQUIRED: Please connect your Google account to create a Google Doc.');
  }

  const docTitle =
    options?.title?.trim() ||
    `VoltPulse IoT — Detectable Anomalies Reference (${new Date().toISOString().slice(0, 10)})`;

  // 1. Create an empty Google Doc
  const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: docTitle }),
  });

  if (!createRes.ok) {
    const errBody = await createRes.json().catch(() => ({}));
    const msg = errBody?.error?.message || `HTTP ${createRes.status}`;
    if (createRes.status === 401 || createRes.status === 403) {
      throw new Error(`DOCS_AUTH_REQUIRED: Google Docs authorization expired or insufficient (${msg}).`);
    }
    throw new Error(`Failed to create Google Doc: ${msg}`);
  }

  const createdDoc = await createRes.json();
  const documentId: string = createdDoc.documentId;
  if (!documentId) {
    throw new Error('Google Docs API did not return a documentId.');
  }

  // 2. Insert document heading, summary, and an empty table
  const headingText = 'VoltPulse IoT — Detectable Anomalies Reference\n';
  const subtitleText =
    `Generated: ${new Date().toLocaleString()}` +
    (options?.meterId ? `  |  Reference Meter: ${options.meterId}` : '') +
    `\nComplete specification of all electrical, grid frequency, peak demand, and anti-theft anomalies detected by the VoltPulse telemetry engine, including severity tiers and diagnostic descriptions.\n\n`;

  const totalRows = DETECTABLE_ANOMALIES_CATALOG.length + 1; // +1 header row
  const totalCols = 3; // Anomaly Type | Severity | Description

  const structureRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: headingText + subtitleText,
            },
          },
          {
            updateParagraphStyle: {
              range: { startIndex: 1, endIndex: 1 + headingText.length },
              paragraphStyle: { namedStyleType: 'HEADING_1' },
              fields: 'namedStyleType',
            },
          },
          {
            updateTextStyle: {
              range: { startIndex: 1, endIndex: 1 + headingText.length - 1 },
              textStyle: {
                bold: true,
                foregroundColor: {
                  color: { rgbColor: { red: 0.067, green: 0.137, blue: 0.153 } },
                },
              },
              fields: 'bold,foregroundColor',
            },
          },
          {
            updateTextStyle: {
              range: {
                startIndex: 1 + headingText.length,
                endIndex: 1 + headingText.length + subtitleText.length - 1,
              },
              textStyle: {
                fontSize: { magnitude: 10, unit: 'PT' },
                foregroundColor: {
                  color: { rgbColor: { red: 0.278, green: 0.333, blue: 0.412 } },
                },
              },
              fields: 'fontSize,foregroundColor',
            },
          },
          {
            insertTable: {
              rows: totalRows,
              columns: totalCols,
              endOfSegmentLocation: { segmentId: '' },
            },
          },
        ],
      }),
    }
  );

  if (!structureRes.ok) {
    const errBody = await structureRes.json().catch(() => ({}));
    throw new Error(`Failed to initialize Google Doc table structure: ${errBody?.error?.message || structureRes.status}`);
  }

  // 3. Fetch document layout to get exact cell paragraph start indices
  const inspectRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!inspectRes.ok) {
    const errBody = await inspectRes.json().catch(() => ({}));
    throw new Error(`Failed to read Google Doc table layout: ${errBody?.error?.message || inspectRes.status}`);
  }

  const docSnapshot = await inspectRes.json();
  const bodyContent: any[] = docSnapshot?.body?.content || [];
  const tableEl = [...bodyContent].reverse().find((el) => Boolean(el?.table));
  if (!tableEl || typeof tableEl.startIndex !== 'number') {
    throw new Error('Could not locate the inserted anomaly table in the Google Doc.');
  }

  const tableStartIndex: number = tableEl.startIndex;
  const apiTableRows: any[] = tableEl.table?.tableRows || [];

  // Build matrix of text strings matching rows x cols
  const tableMatrix: string[][] = [
    ['Anomaly Type', 'Severity', 'Description'],
    ...DETECTABLE_ANOMALIES_CATALOG.map((item) => [
      `${item.type}\n(${item.variant})`,
      item.severity,
      `${item.description}\nTrigger: ${item.trigger}`,
    ]),
  ];

  // Collect cell locations for reverse-index insertion
  interface CellPatch {
    rowIndex: number;
    colIndex: number;
    startIndex: number;
    text: string;
    severity?: AnomalySeverity;
  }

  const cellPatches: CellPatch[] = [];
  for (let r = 0; r < apiTableRows.length && r < tableMatrix.length; r++) {
    const cells: any[] = apiTableRows[r]?.tableCells || [];
    for (let c = 0; c < cells.length && c < totalCols; c++) {
      const startIndex =
        cells[c]?.content?.[0]?.paragraph?.elements?.[0]?.startIndex ??
        cells[c]?.content?.[0]?.startIndex;
      if (typeof startIndex === 'number') {
        cellPatches.push({
          rowIndex: r,
          colIndex: c,
          startIndex,
          text: tableMatrix[r][c],
          severity: r > 0 ? DETECTABLE_ANOMALIES_CATALOG[r - 1].severity : undefined,
        });
      }
    }
  }

  // Sort strictly descending by startIndex so earlier cell indices never shift during batchUpdate
  cellPatches.sort((a, b) => b.startIndex - a.startIndex);

  const requests: any[] = [
    // Column widths sized for US Letter (468 PT printable width)
    {
      updateTableColumnProperties: {
        tableStartLocation: { index: tableStartIndex },
        columnIndices: [0],
        tableColumnProperties: {
          widthType: 'FIXED_WIDTH',
          width: { magnitude: 145, unit: 'PT' },
        },
        fields: 'widthType,width',
      },
    },
    {
      updateTableColumnProperties: {
        tableStartLocation: { index: tableStartIndex },
        columnIndices: [1],
        tableColumnProperties: {
          widthType: 'FIXED_WIDTH',
          width: { magnitude: 78, unit: 'PT' },
        },
        fields: 'widthType,width',
      },
    },
    {
      updateTableColumnProperties: {
        tableStartLocation: { index: tableStartIndex },
        columnIndices: [2],
        tableColumnProperties: {
          widthType: 'FIXED_WIDTH',
          width: { magnitude: 245, unit: 'PT' },
        },
        fields: 'widthType,width',
      },
    },
    // Header row styling (#112327 dark teal-slate)
    {
      updateTableCellStyle: {
        tableRange: {
          tableCellLocation: {
            tableStartLocation: { index: tableStartIndex },
            rowIndex: 0,
            columnIndex: 0,
          },
          rowSpan: 1,
          columnSpan: totalCols,
        },
        tableCellStyle: {
          backgroundColor: {
            color: { rgbColor: { red: 0.067, green: 0.137, blue: 0.153 } },
          },
          paddingTop: { magnitude: 7, unit: 'PT' },
          paddingBottom: { magnitude: 7, unit: 'PT' },
          paddingLeft: { magnitude: 8, unit: 'PT' },
          paddingRight: { magnitude: 8, unit: 'PT' },
        },
        fields: 'backgroundColor,paddingTop,paddingBottom,paddingLeft,paddingRight',
      },
    },
  ];

  // Alternating row shading and comfortable cell padding for data rows
  for (let r = 1; r < apiTableRows.length; r++) {
    const isShaded = r % 2 === 1;
    requests.push({
      updateTableCellStyle: {
        tableRange: {
          tableCellLocation: {
            tableStartLocation: { index: tableStartIndex },
            rowIndex: r,
            columnIndex: 0,
          },
          rowSpan: 1,
          columnSpan: totalCols,
        },
        tableCellStyle: {
          backgroundColor: {
            color: {
              rgbColor: isShaded
                ? { red: 0.957, green: 0.969, blue: 0.973 }
                : { red: 1, green: 1, blue: 1 },
            },
          },
          paddingTop: { magnitude: 6, unit: 'PT' },
          paddingBottom: { magnitude: 6, unit: 'PT' },
          paddingLeft: { magnitude: 8, unit: 'PT' },
          paddingRight: { magnitude: 8, unit: 'PT' },
        },
        fields: 'backgroundColor,paddingTop,paddingBottom,paddingLeft,paddingRight',
      },
    });
  }

  // Populate cells in descending index order and style each cell's text
  for (const patch of cellPatches) {
    requests.push({
      insertText: {
        location: { index: patch.startIndex },
        text: patch.text,
      },
    });

    const endIndex = patch.startIndex + patch.text.length;

    if (patch.rowIndex === 0) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: patch.startIndex, endIndex },
          textStyle: {
            bold: true,
            fontSize: { magnitude: 10, unit: 'PT' },
            foregroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
          },
          fields: 'bold,fontSize,foregroundColor',
        },
      });
    } else if (patch.colIndex === 0) {
      // Type line bold monospace; variant line regular muted
      const newlineIdx = patch.text.indexOf('\n');
      const codeEnd = newlineIdx > 0 ? patch.startIndex + newlineIdx : endIndex;
      requests.push({
        updateTextStyle: {
          range: { startIndex: patch.startIndex, endIndex: codeEnd },
          textStyle: {
            bold: true,
            fontSize: { magnitude: 9, unit: 'PT' },
            weightedFontFamily: { fontFamily: 'Roboto Mono' },
            foregroundColor: {
              color: { rgbColor: { red: 0.067, green: 0.137, blue: 0.153 } },
            },
          },
          fields: 'bold,fontSize,weightedFontFamily,foregroundColor',
        },
      });
      if (newlineIdx > 0 && codeEnd + 1 < endIndex) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: codeEnd + 1, endIndex },
            textStyle: {
              bold: false,
              fontSize: { magnitude: 8.5, unit: 'PT' },
              foregroundColor: {
                color: { rgbColor: { red: 0.278, green: 0.333, blue: 0.412 } },
              },
            },
            fields: 'bold,fontSize,foregroundColor',
          },
        });
      }
    } else if (patch.colIndex === 1 && patch.severity) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: patch.startIndex, endIndex },
          textStyle: {
            bold: true,
            fontSize: { magnitude: 9, unit: 'PT' },
            weightedFontFamily: { fontFamily: 'Roboto Mono' },
            foregroundColor: {
              color: { rgbColor: getSeverityRgbColor(patch.severity) },
            },
          },
          fields: 'bold,fontSize,weightedFontFamily,foregroundColor',
        },
      });
    } else {
      const triggerMarkerIdx = patch.text.indexOf('\nTrigger: ');
      const descEnd = triggerMarkerIdx > 0 ? patch.startIndex + triggerMarkerIdx : endIndex;
      requests.push({
        updateTextStyle: {
          range: { startIndex: patch.startIndex, endIndex: descEnd },
          textStyle: {
            fontSize: { magnitude: 9.5, unit: 'PT' },
            foregroundColor: {
              color: { rgbColor: { red: 0.118, green: 0.161, blue: 0.231 } },
            },
          },
          fields: 'fontSize,foregroundColor',
        },
      });
      if (triggerMarkerIdx > 0 && descEnd + 1 < endIndex) {
        requests.push({
          updateTextStyle: {
            range: { startIndex: descEnd + 1, endIndex },
            textStyle: {
              fontSize: { magnitude: 8.5, unit: 'PT' },
              weightedFontFamily: { fontFamily: 'Roboto Mono' },
              foregroundColor: {
                color: { rgbColor: { red: 0.278, green: 0.333, blue: 0.412 } },
              },
            },
            fields: 'fontSize,weightedFontFamily,foregroundColor',
          },
        });
      }
    }
  }

  const populateRes = await fetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!populateRes.ok) {
    const errBody = await populateRes.json().catch(() => ({}));
    throw new Error(`Failed to populate Google Doc table: ${errBody?.error?.message || populateRes.status}`);
  }

  return {
    documentId,
    title: docTitle,
    url: `https://docs.googleapis.com/document/d/${documentId}/edit`,
    rowCount: DETECTABLE_ANOMALIES_CATALOG.length,
  };
}
