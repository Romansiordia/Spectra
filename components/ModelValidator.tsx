import React, { useState, useMemo, useEffect } from 'react';
import { 
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Scatter, ReferenceLine, Label,
  ComposedChart, BarChart, Bar
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  AlertCircle, 
  Upload,
  ClipboardList,
  Target,
  Gauge,
  Table as TableIcon,
  Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

// --- Interfaces para Multianalito ---

interface SampleData {
  id: string | number;
  quimico: number;
  nir: number;
}

interface ParameterData {
  name: string;
  samples: SampleData[];
}

// --- Funciones Estadísticas ---

const calculateStatistics = (data: SampleData[]) => {
  const n = data.length;
  if (n < 2) return null;

  const sumX = data.reduce((acc, d) => acc + d.quimico, 0);
  const sumY = data.reduce((acc, d) => acc + d.nir, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numR = 0;
  let denRX = 0;
  let denRY = 0;
  let sumSqDiff = 0;
  let sumDiff = 0;

  data.forEach(d => {
    numR += (d.quimico - meanX) * (d.nir - meanY);
    denRX += Math.pow(d.quimico - meanX, 2);
    denRY += Math.pow(d.nir - meanY, 2);
    
    const diff = d.nir - d.quimico;
    sumSqDiff += Math.pow(diff, 2);
    sumDiff += diff;
  });

  // Cálculo de Pendiente (Slope): b = sum((x-meanX)(y-meanY)) / sum((x-meanX)^2)
  const slope = denRX > 0.000001 ? numR / denRX : 0;
  // Intercepto: a = meanY - slope * meanX
  const intercept = meanY - (slope * meanX);

  const denomR = Math.sqrt(denRX * denRY);
  const r = denomR > 0.000001 ? numR / denomR : 0;
  let r2 = Math.pow(r, 2);
  if (r2 > 1) r2 = 1.0;
  if (isNaN(r2) || r2 < 0) r2 = 0.0;

  const bias = sumDiff / n;
  const sep = Math.sqrt(Math.max(0, sumSqDiff / (n - 1)));
  
  const sdRef = Math.sqrt(Math.max(0, denRX / (n - 1)));
  const rpd = sep > 0.000001 ? sdRef / sep : 0;

  const diffs = data.map(d => d.nir - d.quimico);
  const meanDiff = sumDiff / n;
  
  let pValue = 1.0;
  const varianceDiff = diffs.reduce((a, b) => a + Math.pow(b - meanDiff, 2), 0) / (n - 1);
  const stdDiff = Math.sqrt(Math.max(0, varianceDiff));

  if (stdDiff > 0.000001) {
    const tValue = Math.abs(meanDiff / (stdDiff / Math.sqrt(n)));
    if (!isNaN(tValue) && tValue !== Infinity && tValue !== -Infinity) {
      pValue = 2 * (1 - normalCDF(tValue));
    }
  }

  if (isNaN(pValue) || pValue < 0) pValue = 0.0;
  if (pValue > 1) pValue = 1.0;

  // Generar puntos para la línea de tendencia y límites de control (+/- 1 SEP)
  const minX = Math.min(...data.map(d => d.quimico));
  const maxX = Math.max(...data.map(d => d.quimico));
  const trendLine = [
    { 
      quimico: minX, 
      trend: slope * minX + intercept,
      ucl: (slope * minX + intercept) + sep,
      lcl: (slope * minX + intercept) - sep
    },
    { 
      quimico: maxX, 
      trend: slope * maxX + intercept,
      ucl: (slope * maxX + intercept) + sep,
      lcl: (slope * maxX + intercept) - sep
    }
  ];

  return { r2, sep, bias, pValue, n, meanX, meanY, rpd, slope, intercept, trendLine };
};

function normalCDF(x: number) {
  if (isNaN(x)) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

const getOpportunityZones = (samples: SampleData[], overallSep: number) => {
  if (samples.length < 3) return [];

  const refs = samples.map(s => s.quimico);
  const minRef = Math.min(...refs);
  const maxRef = Math.max(...refs);
  const range = maxRef - minRef;

  if (range <= 0) return [];

  const numZones = 5;
  const step = range / numZones;
  const zones: {
    min: number;
    max: number;
    samples: SampleData[];
    label: string;
    bias: number;
    dispersion: number;
    status: 'success' | 'warning' | 'error' | 'neutral';
    statusText: string;
    description: string;
  }[] = [];

  for (let i = 0; i < numZones; i++) {
    const zMin = minRef + i * step;
    const zMax = minRef + (i + 1) * step;
    
    // Filter samples in range
    const zoneSamples = samples.filter(s => {
      if (i === numZones - 1) {
        return s.quimico >= zMin && s.quimico <= zMax;
      }
      return s.quimico >= zMin && s.quimico < zMax;
    });

    let label = "";
    if (i === 0) {
      label = `< ${zMax.toFixed(1)}%`;
    } else if (i === numZones - 1) {
      label = `> ${zMin.toFixed(1)}%`;
    } else {
      label = `${zMin.toFixed(1)}% - ${zMax.toFixed(1)}%`;
    }

    let bias = 0;
    let dispersion = 0;
    
    if (zoneSamples.length > 0) {
      const diffs = zoneSamples.map(s => s.nir - s.quimico);
      bias = diffs.reduce((a, b) => a + b, 0) / zoneSamples.length;
      
      if (zoneSamples.length >= 2) {
        const meanDiff = bias;
        dispersion = Math.sqrt(diffs.reduce((a, b) => a + Math.pow(b - meanDiff, 2), 0) / (zoneSamples.length - 1));
      } else {
        dispersion = diffs.length > 0 ? Math.abs(diffs[0]) : 0;
      }
    }

    let status: 'success' | 'warning' | 'error' | 'neutral' = 'neutral';
    let statusText = "Sin Datos Suficientes";
    let description = "Se requieren más muestras de calibración física en este rango para evaluar el comportamiento con precisión.";

    if (zoneSamples.length >= 1) {
      const sepThreshold = overallSep || 0.15;
      const absBias = Math.abs(bias);

      if (zoneSamples.length >= 2 && absBias > 1.25 * sepThreshold) {
        status = 'error';
        if (bias > 0) {
          statusText = "Debilidad Alta (Sobreestima)";
          description = "El modelo tiende sistemáticamente a predecir de más (sobreestimación sistemática) en este rango.";
        } else {
          statusText = "Debilidad Alta (Subestima)";
          description = "El modelo tiende sistemáticamente a predecir de menos (subestimación/quedarse corto) en este rango.";
        }
      } else if (zoneSamples.length >= 2 && dispersion > 1.35 * sepThreshold) {
        status = 'warning';
        statusText = "Debilidad Dispersa";
        description = "Mucha variabilidad/fluctuación residual. Zona afectada probablemente por matrices inestables, cambios de lote o molienda.";
      } else if (zoneSamples.length >= 2 && dispersion < 0.85 * sepThreshold && absBias < 0.45 * sepThreshold) {
        status = 'success';
        statusText = "Zona Confort / Alta Precisión";
        description = "Excelente consistencia y precisión del modelo. Errores mínimos y sesgo insignificante; excelente calibración.";
      } else {
        status = 'success';
        statusText = "Zona Estable";
        description = "Comportamiento calibrado y estable con errores normales distribuidos dentro del margen de tolerancia estándar.";
      }
    }

    zones.push({
      min: zMin,
      max: zMax,
      samples: zoneSamples,
      label,
      bias,
      dispersion,
      status,
      statusText,
      description
    });
  }

  return zones;
};

// --- Generador de Datos por Defecto (Simulados para cada Analito) ---

const generateDefaultParameters = (): ParameterData[] => {
  const numSamples = 30;
  
  // PROTEÍNA (Ref: 7.5 - 10.5)
  const proteinaSamples = Array.from({ length: numSamples }, (_, i) => {
    const quimico = 7.5 + Math.random() * 3.0;
    const noise = (Math.random() - 0.5) * 0.25;
    const nir = (quimico * 0.98) + noise + 0.15;
    return { id: `M-${23080001 + i}`, quimico: parseFloat(quimico.toFixed(2)), nir: parseFloat(nir.toFixed(2)) };
  });

  // GRASA (Ref: 1.5 - 3.8)
  const grasaSamples = Array.from({ length: numSamples }, (_, i) => {
    const quimico = 1.5 + Math.random() * 2.3;
    const noise = (Math.random() - 0.5) * 0.35;
    const nir = (quimico * 0.95) + noise + 0.25;
    return { id: `M-${23080001 + i}`, quimico: parseFloat(quimico.toFixed(2)), nir: parseFloat(nir.toFixed(2)) };
  });

  // HUMEDAD (Ref: 10.0 - 13.8)
  const humedadSamples = Array.from({ length: numSamples }, (_, i) => {
    const quimico = 11.5 + Math.random() * 2.3;
    const noise = (Math.random() - 0.5) * 0.20;
    const nir = (quimico * 0.99) + noise + 0.08;
    return { id: `M-${23080001 + i}`, quimico: parseFloat(quimico.toFixed(2)), nir: parseFloat(nir.toFixed(2)) };
  });

  // CENIZA (Ref: 0.1 - 2.5)
  const cenizaSamples = Array.from({ length: numSamples }, (_, i) => {
    const quimico = 0.5 + Math.random() * 2.0;
    const noise = (Math.random() - 0.5) * 0.18;
    const nir = (quimico * 0.97) + noise + 0.09;
    return { id: `M-${23080001 + i}`, quimico: parseFloat(quimico.toFixed(2)), nir: parseFloat(nir.toFixed(2)) };
  });

  // FIBRA (Ref: 1.8 - 4.2)
  const fibraSamples = Array.from({ length: numSamples }, (_, i) => {
    const quimico = 1.8 + Math.random() * 2.4;
    const noise = (Math.random() - 0.5) * 0.22;
    const nir = (quimico * 0.96) + noise + 0.12;
    return { id: `M-${23080001 + i}`, quimico: parseFloat(quimico.toFixed(2)), nir: parseFloat(nir.toFixed(2)) };
  });

  // ALMIDÓN (Ref: 63.0 - 69.5)
  const almidonSamples = Array.from({ length: numSamples }, (_, i) => {
    const quimico = 63.0 + Math.random() * 5.5;
    const noise = (Math.random() - 0.5) * 0.85;
    const nir = (quimico * 0.99) + noise + 0.40;
    return { id: `M-${23080001 + i}`, quimico: parseFloat(quimico.toFixed(2)), nir: parseFloat(nir.toFixed(2)) };
  });

  return [
    { name: 'PROTEÍNA', samples: proteinaSamples },
    { name: 'GRASA', samples: grasaSamples },
    { name: 'HUMEDAD', samples: humedadSamples },
    { name: 'CENIZA', samples: cenizaSamples },
    { name: 'FIBRA', samples: fibraSamples },
    { name: 'ALMIDÓN', samples: almidonSamples }
  ];
};

const renderActiveShape = (props: any) => {
  const { cx, cy, payload, fill } = props;
  if (!payload || !payload.id) return null;
  
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={fill} stroke="#ffffff" strokeWidth={2} />
      {/* Tooltip bubble for hovered point */}
      <rect x={cx - 35} y={cy - 35} width={70} height={20} rx={4} fill="#0ea5e9" opacity={0.9} />
      <text x={cx} y={cy - 21} textAnchor="middle" fill="#ffffff" fontSize={10} fontWeight="bold">
        {payload.id}
      </text>
    </g>
  );
};

// --- Tooltip de Dispersión Customizado ---
const CustomScatterTooltip = ({ active, payload, sep }: any) => {
  if (active && payload && payload.length) {
    const sample = payload[0].payload;
    if (!sample || sample.id === undefined || sample.quimico === undefined || sample.nir === undefined) {
      return null;
    }
    const diff = sample.nir - sample.quimico;
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs space-y-1.5 font-sans">
        <div className="font-extrabold text-[#38bdf8] pb-1 border-b border-white/10 uppercase tracking-wider text-[10px]">
          Muestra: {sample.id}
        </div>
        <div className="flex justify-between gap-6 text-slate-300">
          <span>Lab (Ref):</span>
          <span className="font-mono font-bold text-slate-100">{typeof sample.quimico === 'number' ? sample.quimico.toFixed(3) : '0.000'}%</span>
        </div>
        <div className="flex justify-between gap-6 text-slate-300">
          <span>NIR (Pred):</span>
          <span className="font-mono font-bold text-slate-100">{typeof sample.nir === 'number' ? sample.nir.toFixed(3) : '0.000'}%</span>
        </div>
        <div className="flex justify-between gap-6 text-slate-300">
          <span>Diferencia:</span>
          <span className={`font-mono font-bold ${Math.abs(diff) > (sep || 0.4) ? 'text-rose-400' : 'text-emerald-400'}`}>
            {diff >= 0 ? '+' : ''}{typeof diff === 'number' ? diff.toFixed(3) : '0.000'}%
          </span>
        </div>
        <div className="text-[9px] text-slate-400 border-t border-white/5 pt-1 text-center italic mt-1 font-bold">
          Ref: Haz clic sobre el punto para seleccionarla
        </div>
      </div>
    );
  }
  return null;
};

const ModelValidator: React.FC = () => {
  const [parameters, setParameters] = useState<ParameterData[]>([]);
  const [selectedParamIndex, setSelectedParamIndex] = useState<number>(0);
  const [isCustomData, setIsCustomData] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // Estados de manipulación de muestras para exclusión o selección interactiva
  const [excludedSamples, setExcludedSamples] = useState<{ [paramName: string]: string[] }>({});
  const [selectedSample, setSelectedSample] = useState<SampleData | null>(null);

  useEffect(() => {
    setParameters(generateDefaultParameters());
    setExcludedSamples({});
    setSelectedSample(null);
  }, []);

  const activeParameter = useMemo(() => {
    return parameters[selectedParamIndex] || null;
  }, [parameters, selectedParamIndex]);

  // Set de muestras deseleccionadas / excluidas de forma activa para este analito
  const activeExcludedSet = useMemo(() => {
    if (!activeParameter) return new Set<string>();
    return new Set((excludedSamples[activeParameter.name] || []).map(id => String(id)));
  }, [excludedSamples, activeParameter]);

  // Datos filtrados para cálculos y para pintar los activos en la gráfica
  const data = useMemo(() => {
    if (!activeParameter) return [];
    return activeParameter.samples.filter(s => !activeExcludedSet.has(String(s.id)));
  }, [activeParameter, activeExcludedSet]);

  const stats = useMemo(() => calculateStatistics(data), [data]);

  const histogramData = useMemo(() => {
    if (data.length === 0) return [];
    const diffs = data.map(d => d.nir - d.quimico);
    const min = Math.min(...diffs);
    const max = Math.max(...diffs);
    const range = max - min || 0.1;

    const numBins = Math.max(5, Math.min(10, Math.round(Math.sqrt(data.length))));
    const binWidth = range / numBins;

    const bins = Array.from({ length: numBins }, (_, i) => {
      const start = min + i * binWidth;
      const end = start + binWidth;
      return {
        start,
        end,
        name: `${start.toFixed(2)} a ${end.toFixed(2)}`,
        count: 0
      };
    });

    diffs.forEach(diff => {
      let placed = false;
      for (let i = 0; i < bins.length; i++) {
        const isLastBin = (i === bins.length - 1);
        if (diff >= bins[i].start && (isLastBin ? diff <= bins[i].end : diff < bins[i].end)) {
          bins[i].count++;
          placed = true;
          break;
        }
      }
      if (!placed && bins.length > 0) {
        if (diff < min) bins[0].count++;
        else if (diff > max) bins[bins.length - 1].count++;
      }
    });

    return bins;
  }, [data]);

  const diffStats = useMemo(() => {
    if (data.length === 0) return { max: 0, min: 0, meanAbs: 0, std: 0 };
    const diffs = data.map(d => d.nir - d.quimico);
    const max = Math.max(...diffs);
    const min = Math.min(...diffs);
    const sum = diffs.reduce((a, b) => a + b, 0);
    const mean = sum / data.length;
    const std = Math.sqrt(diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(1, data.length - 1));
    const meanAbs = diffs.reduce((a, b) => a + Math.abs(b), 0) / data.length;
    return { max, min, meanAbs, std };
  }, [data]);

  const handleDownloadPDF = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const today = new Date().toLocaleDateString('es-ES');
      const time = new Date().toLocaleTimeString('es-ES');
      const originalIndex = selectedParamIndex;

      // ==========================================
      // PÁGINA 1: RESUMEN CONFIGURADO MULTI-ANALITO
      // ==========================================
      
      // Decoraciones y bordes
      doc.setDrawColor(14, 165, 233); // Brand sky-500
      doc.setLineWidth(1);
      doc.rect(8, 8, 194, 281);
      
      // Cabecera Principal
      doc.setFontSize(22);
      doc.setTextColor(14, 165, 233);
      doc.setFont('helvetica', 'bold');
      doc.text('Reporte de Validación Externa NIR', 14, 24);
      
      doc.setFontSize(10);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.text('Módulo de Comparación Estadística de Modelos vs Vía Húmeda (Laboratorio)', 14, 30);

      // Bloque de Metadatos
      doc.setFillColor(248, 250, 252); // Slate 50
      doc.rect(14, 37, 182, 30, 'F');
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.setLineWidth(0.5);
      doc.rect(14, 37, 182, 30, 'D');
      
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.setFont('helvetica', 'bold');
      doc.text('INFORMACIÓN DE VALIDACIÓN:', 18, 43);
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Fecha del Reporte: ${today} a las ${time}`, 18, 49);
      doc.text(`Origen de Datos: ${isCustomData ? 'Archivo Excel/CSV Cargado por Usuario' : 'Simulación de Calibración Espectral'}`, 18, 54);
      doc.text(`Total Métodos de Enlace / Parámetros: ${parameters.length}`, 18, 59);
      
      doc.text(`Supervisor QC: romansiordias@gmail.com`, 110, 49);
      doc.text(`Instrumentación: FOSS NIR Predictor Engine`, 110, 54);
      doc.text(`Estado del Sistema: Validación Activa`, 110, 59);

      // Section 1: Executive Comparison Table
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('1. Consolidado de Parámetros Analizados (Ref vs Espectro)', 14, 78);
      
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('Indicadores quimiométricos de ajuste para cada uno de los analitos configurados.', 14, 83);

      // Generar filas para todos los parámetros cargados
      const overviewRows = parameters.map((param) => {
        const paramStats = calculateStatistics(param.samples);
        const rpd = paramStats?.rpd || 0;
        
        let desemp = "Insuficiente (<2.0)";
        if (rpd >= 3.0) desemp = "Excelente (C. Calidad)";
        else if (rpd >= 2.0) desemp = "Aceptable (Monitoreo)";
        
        return [
          param.name,
          `${param.samples.length}`,
          `${paramStats?.r2.toFixed(3) || '0.000'}`,
          `${paramStats?.sep.toFixed(3) || '0.000'}%`,
          `${paramStats?.bias.toFixed(3) || '0.000'}%`,
          `${rpd.toFixed(2)}`,
          `${paramStats?.slope.toFixed(3) || '0.000'}`,
          desemp
        ];
      });

      autoTable(doc, {
        startY: 87,
        head: [['Analito / Componente', 'Muestras', 'R²', 'SEP', 'Bias (Sesgo)', 'RPD', 'Pendiente', 'Diagnóstico NIR']],
        body: overviewRows,
        theme: 'striped',
        headStyles: { fillColor: [14, 165, 233] },
        bodyStyles: { fontSize: 8.5 },
        columnStyles: {
          0: { fontStyle: 'bold' },
          7: { fontStyle: 'bold' }
        },
        margin: { left: 14, right: 14 }
      });

      // Section 2: Interpretación
      let yAfterTable = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(12);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text('2. Criterios de Evaluación y Tolerancia Técnica', 14, yAfterTable);

      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      const introText = [
        "• Coeficiente de Determinación (R²): Medida del ajuste funcional de la recta. El valor ideal es 1.000; valores por encima de 0.90",
        "  demuestran que el modelo predice con alta precisión los cambios en las concentraciones de laboratorio.",
        "• SEP (Standard Error of Prediction): Mide la desviación promedio en las mismas unidades de concentración. Representa la",
        "  precisión real de las predicciones en comparación con la química convencional.",
        "• RPD (Ratio of Prediction to Deviation): Determina la robustez. Mayor a 3.0 es excelente para reemplazo directo de laboratorio.",
        "• Bias (Sesgo): Evalúa sesgo sistemático direccional. Se espera que promedie en ±0.05 para asegurar que no hay sobredosis constante."
      ];
      
      let textLineY = yAfterTable + 5;
      introText.forEach(line => {
        doc.text(line, 14, textLineY);
        textLineY += 4.5;
      });

      // Footer cover
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // Slate 400
      doc.text(`Página 1 de ${parameters.length + 1} - Reporte Consolidado de Validación NIR`, 14, 282);

      // ==========================================
      // PÁGINAS 2+: REPORTES INDIVIDUALES CON GRÁFICOS CAPTURADOS
      // ==========================================
      
      for (let i = 0; i < parameters.length; i++) {
        const param = parameters[i];
        const paramStats = calculateStatistics(param.samples);
        const diffs = param.samples.map(d => d.nir - d.quimico);
        const maxDiff = diffs.length > 0 ? Math.max(...diffs) : 0;
        const minDiff = diffs.length > 0 ? Math.min(...diffs) : 0;
        const sumDiffs = diffs.reduce((a, b) => a + b, 0);
        const meanDiff = diffs.length > 0 ? sumDiffs / diffs.length : 0;
        const mae = diffs.length > 0 ? diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length : 0;

        // Switch visual active tab so charts render active data properly!
        setSelectedParamIndex(i);
        // Wait briefly for Recharts redraw and animations to finish
        await new Promise(resolve => setTimeout(resolve, 250));

        doc.addPage();
        
        // Header de Analito
        doc.setFontSize(16);
        doc.setTextColor(14, 165, 233);
        doc.setFont('helvetica', 'bold');
        doc.text(`Resultados Detallados: ${param.name}`, 14, 16);
        
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.setFont('helvetica', 'normal');
        doc.text(`Evaluación e histograma residual de predicciones de laboratorio vs espectral`, 14, 21);
        
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.line(14, 23, 196, 23);

        // Tabla detallada para este analito
        const paramRows = [
          ['Muestras Registradas (n)', `${param.samples.length}`, 'Coeficiente R²', `${paramStats?.r2.toFixed(4) || '0.0000'}`],
          ['Pendiente (Slope)', `${paramStats?.slope.toFixed(4) || '0.0000'}`, 'Intercepto', `${paramStats?.intercept.toFixed(4) || '0.0000'}`],
          ['Error de Predicción SEP', `${paramStats?.sep.toFixed(4) || '0.0000'}%`, 'Media del Error (Bias)', `${paramStats?.bias.toFixed(4) || '0.0000'}%`],
          ['RPD (Desviación Relativa)', `${paramStats?.rpd.toFixed(2) || '0.00'}`, 'Residuo Máx Positivo', `+${maxDiff.toFixed(3)}%`],
          ['Residuo Máx Negativo', `${minDiff.toFixed(3)}%`, 'Error Absoluto MAE', `${mae.toFixed(3)}%`]
        ];

        autoTable(doc, {
          startY: 26,
          head: [['Métrica de Rendimiento', 'Valor', 'Parámetro de Ajuste', 'Valor']],
          body: paramRows,
          theme: 'grid',
          headStyles: { fillColor: [71, 85, 105] },
          bodyStyles: { fontSize: 8 },
          margin: { left: 14, right: 14 }
        });

        // Add both charts side-by-side or stacked
        const dispContainer = document.getElementById('chart-dispersion-container');
        const histContainer = document.getElementById('chart-histogram-container');
        
        let chartsY = (doc as any).lastAutoTable.finalY + 8;
        
        if (dispContainer) {
          try {
            const canvas = await html2canvas(dispContainer, {
              scale: 2,
              useCORS: true,
              backgroundColor: '#0a1d4a',
            });
            const imgData = canvas.toDataURL('image/png');
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'bold');
            doc.text(`A. Gráfico de Dispersión y Ajuste (Recta de Tendencia)`, 14, chartsY);
            doc.addImage(imgData, 'PNG', 14, chartsY + 3, 182, 85);
            chartsY += 93;
          } catch (err) {
            console.error("Error al capturar dispersión:", err);
            doc.setFontSize(10);
            doc.setTextColor(220, 38, 38);
            doc.text("[Gráfico de dispersión no disponible para exportación]", 14, chartsY + 10);
            chartsY += 15;
          }
        }

        if (histContainer) {
          try {
            const canvas = await html2canvas(histContainer, {
              scale: 2,
              useCORS: true,
              backgroundColor: '#0a1d4a',
            });
            const imgData = canvas.toDataURL('image/png');
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            doc.setFont('helvetica', 'bold');
            doc.text(`B. Histograma de Frecuencias de Errores Residuales`, 14, chartsY);
            doc.addImage(imgData, 'PNG', 14, chartsY + 3, 182, 80);
          } catch (err) {
            console.error("Error al capturar histograma:", err);
            doc.setFontSize(10);
            doc.setTextColor(220, 38, 38);
            doc.text("[Histograma de errores no disponible para exportación]", 14, chartsY + 10);
          }
        }

        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Página ${i + 2} de ${parameters.length + 1} - Reporte Consolidado por Parámetro`, 14, 285);
      }

      // Restore original index visual state
      setSelectedParamIndex(originalIndex);

      // Save PDF
      doc.save(`Reporte_Consolidado_NIR_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e: any) {
      console.error("Error completo de PDF:", e);
      alert(`Error al generar reporte PDF consolidado: ${e.message || e}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          
          // Read raw rows (2D array)
          const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
          parseMultiParameterRows(rows);
        } catch (error: any) {
          console.error("Error al procesar el archivo Excel:", error);
          alert(`Error al procesar el archivo Excel: ${error.message || error}`);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // It's a CSV
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          const rawRows = text.split(/\r?\n/).filter(r => r.trim() !== '');
          if (rawRows.length === 0) return;
          
          // Detect delimiter
          const firstRow = rawRows[0];
          const delimiter = firstRow.includes(';') ? ';' : (firstRow.includes('\t') ? '\t' : ',');
          
          const rows = rawRows.map(row => {
            return row.split(delimiter).map(cell => {
              return cell.trim().replace(/^["']|["']$/g, '');
            });
          });
          
          parseMultiParameterRows(rows);
        } catch (error: any) {
          console.error("Error al cargar el archivo CSV:", error);
          alert(`Error al procesar el archivo CSV: ${error.message || error}`);
        }
      };
      reader.readAsText(file);
    }
  };

  const parseMultiParameterRows = (rows: any[][]) => {
    if (rows.length < 2) {
      alert("El archivo no tiene suficientes filas para ser analizado.");
      return;
    }

    const cleanedRows = rows.filter(row => row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));
    if (cleanedRows.length < 2) return;

    // Helper para normalizar nombres y eliminar acentos
    const normalizeName = (name: string) => {
      return String(name || '')
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    let subHeaderIdx = -1;
    let mainHeaderIdx = -1;
    let hasDoubleHeader = false;

    // Detectar si hay doble cabecera (dos filas consecutivas al inicio con palabras clave en la segunda fila)
    for (let r = 1; r < Math.min(cleanedRows.length, 4); r++) {
      const row = cleanedRows[r];
      let matches = 0;
      row.forEach(cell => {
        const val = normalizeName(cell);
        if (
          val.includes("HUMEDA") || val.includes("LAB") || val.includes("VIA") || 
          val.includes("NIR") || val.includes("FOSS") || val.includes("PRED") || 
          val.includes("REF") || val.includes("QUIMICO")
        ) {
          matches++;
        }
      });

      // Si al menos 2 columnas tienen términos de método en filas inferiores, asumimos cabecera doble
      if (matches >= 2) {
        subHeaderIdx = r;
        mainHeaderIdx = r - 1;
        hasDoubleHeader = true;
        break;
      }
    }

    const parsedParams: ParameterData[] = [];

    if (hasDoubleHeader && subHeaderIdx !== -1) {
      // === CASO 1: DOBLE CABECERA ===
      const mainHeader = cleanedRows[mainHeaderIdx];
      const subHeader = cleanedRows[subHeaderIdx];
      
      const consolidatedMainHeader: string[] = [];
      let lastSeenHeader = "";
      for (let c = 0; c < subHeader.length; c++) {
        const cellVal = String(mainHeader[c] || '').trim();
        if (cellVal) {
          lastSeenHeader = cellVal.toUpperCase();
        }
        consolidatedMainHeader[c] = lastSeenHeader;
      }

      const paramMapping: { [name: string]: { quimicoCol: number; nirCol: number } } = {};

      for (let c = 1; c < subHeader.length; c++) {
        const rawName = consolidatedMainHeader[c];
        if (!rawName || rawName === 'ID') continue;

        const normalizedParamName = normalizeName(rawName);
        const subCell = normalizeName(subHeader[c]);
        
        if (!paramMapping[normalizedParamName]) {
          paramMapping[normalizedParamName] = { quimicoCol: -1, nirCol: -1 };
        }

        if (subCell.includes("HUMEDA") || subCell.includes("LAB") || subCell.includes("QUIMICO") || subCell.includes("REF") || subCell.includes("VIA")) {
          paramMapping[normalizedParamName].quimicoCol = c;
        } else if (subCell.includes("NIR") || subCell.includes("NI") || subCell.includes("FOSS") || subCell.includes("PRED") || subCell.includes("MODEL")) {
          paramMapping[normalizedParamName].nirCol = c;
        }
      }

      const paramNames = Object.keys(paramMapping).filter(name => {
        const mapping = paramMapping[name];
        return mapping.quimicoCol !== -1 && mapping.nirCol !== -1;
      });

      const sampleStartIdx = subHeaderIdx + 1;
      paramNames.forEach(pName => {
        const mapping = paramMapping[pName];
        const samples: SampleData[] = [];

        for (let r = sampleStartIdx; r < cleanedRows.length; r++) {
          const row = cleanedRows[r];
          if (!row || row.length <= Math.max(mapping.quimicoCol, mapping.nirCol)) continue;
          
          const sampleId = String(row[0] || `Muestra-${r - sampleStartIdx + 1}`).trim();
          const rawQ = String(row[mapping.quimicoCol] || '').replace(',', '.').trim();
          const rawN = String(row[mapping.nirCol] || '').replace(',', '.').trim();
          
          const quimico = parseFloat(rawQ);
          const nir = parseFloat(rawN);

          if (!isNaN(quimico) && !isNaN(nir)) {
            samples.push({ id: sampleId, quimico, nir });
          }
        }

        if (samples.length > 0) {
          parsedParams.push({ name: pName, samples });
        }
      });

    } else {
      // === CASO 2: CABECERA ÚNICA COMBINADA (O TABLA PLANA) ===
      const headerRow = cleanedRows[0];
      const numCols = headerRow.length;

      const colTypes: ('ID' | 'LAB' | 'NIR' | 'UNKNOWN')[] = [];
      const colCleanNames: string[] = [];

      for (let c = 0; c < numCols; c++) {
        const rawCell = String(headerRow[c] || '').trim();
        const normCell = normalizeName(rawCell);

        if (c === 0 || normCell === 'ID' || normCell === 'CODIGO' || normCell === 'MUESTRA' || normCell === 'SAMPLE') {
          colTypes.push('ID');
          colCleanNames.push('ID');
          continue;
        }

        // Determinar si la columna representa datos de Laboratorio (Referencia) o NIR (Predicción)
        let type: 'ID' | 'LAB' | 'NIR' | 'UNKNOWN' = 'UNKNOWN';
        const isNir = normCell.includes("NIR") || 
                      normCell.includes("FOSS") || 
                      normCell.includes("PRED") || 
                      normCell.includes("MODEL") || 
                      normCell.includes("ESPECTRO") ||
                      /\b(NI|NIR|FOSS|PRED|MODELO|MODEL|PREDICT|N)\b/i.test(rawCell.toUpperCase()) ||
                      rawCell.toUpperCase().endsWith(" NI") ||
                      rawCell.toUpperCase().endsWith(" NIR") ||
                      rawCell.toUpperCase().endsWith(" FOSS") ||
                      rawCell.toUpperCase().endsWith(" PRED") ||
                      rawCell.toUpperCase().endsWith(" N");

        const isLab = !isNir && (
                      normCell.includes("VIA HUMEDA") || 
                      normCell.includes("VIA HÚMEDA") || 
                      normCell.includes("LAB") || 
                      normCell.includes("VIA") || 
                      normCell.includes("REF") || 
                      normCell.includes("QUIMICO") || 
                      /\b(LA|LAB|REF|VIA|L|HUMEDA)\b/i.test(rawCell.toUpperCase()) ||
                      rawCell.toUpperCase().endsWith(" LA") ||
                      rawCell.toUpperCase().endsWith(" LAB") ||
                      rawCell.toUpperCase().endsWith(" L") ||
                      rawCell.toUpperCase().endsWith(" REF")
                    );

        if (isNir) {
          type = 'NIR';
        } else if (isLab) {
          type = 'LAB';
        }

        colTypes.push(type);

        // Extraer el nombre del analito eliminando términos de método (pero preservando HUMEDAD)
        let cleanName = normCell;
        const removeTerms = [
          "VIA HUMEDA", "VIA HÚMEDA", "VIA", "HUMEDA", "HUMEDO",
          "LAB", "LA", "REF", "QUIMICO", "QUÍMICO", "QUIM",
          "NIR", "NI", "FOSS", "PRED", "MODEL", "MODELO", "ESPECTRO", "PREDICT",
          "L", "N"
        ];
        
        removeTerms.forEach(term => {
          const regexStr = `\\b${term}\\b`;
          const regex = new RegExp(regexStr, 'gi');
          cleanName = cleanName.replace(regex, '');
        });

        // Limpiar espacios y numeración residuales
        cleanName = cleanName.replace(/[^A-Z0-9]/gi, ' ').replace(/\s+/g, ' ').trim();
        colCleanNames.push(cleanName || "ANALITO");
      }

      // Agrupar columnas identificadas por nombre de componente quimiométrico
      const paramMapping: { [name: string]: { quimicoCol: number; nirCol: number } } = {};

      for (let c = 1; c < numCols; c++) {
        const type = colTypes[c];
        const cleanName = colCleanNames[c];

        if (type === 'ID' || type === 'UNKNOWN') continue;

        const pName = cleanName === "ANALITO" || !cleanName ? "ANALITO GENERAL" : cleanName;

        if (!paramMapping[pName]) {
          paramMapping[pName] = { quimicoCol: -1, nirCol: -1 };
        }

        if (type === 'LAB') {
          paramMapping[pName].quimicoCol = c;
        } else if (type === 'NIR') {
          paramMapping[pName].nirCol = c;
        }
      }

      const validMappedParams = Object.keys(paramMapping).filter(pName => {
        return paramMapping[pName].quimicoCol !== -1 && paramMapping[pName].nirCol !== -1;
      });

      if (validMappedParams.length === 0) {
        // Rescate heurístico: si encontramos al menos un LabCol y un NirCol, emparejar por el índice de orden
        const labCols = colTypes.map((t, idx) => t === 'LAB' ? idx : -1).filter(idx => idx !== -1);
        const nirCols = colTypes.map((t, idx) => t === 'NIR' ? idx : -1).filter(idx => idx !== -1);

        if (labCols.length > 0 && nirCols.length > 0) {
          const pairsCount = Math.min(labCols.length, nirCols.length);
          for (let i = 0; i < pairsCount; i++) {
            const lCol = labCols[i];
            const nCol = nirCols[i];
            
            let pName = colCleanNames[lCol];
            if (pName === "ANALITO" || !pName) {
              pName = colCleanNames[nCol] !== "ANALITO" ? colCleanNames[nCol] : `ANALITO ${i + 1}`;
            }

            const samples: SampleData[] = [];
            for (let r = 1; r < cleanedRows.length; r++) {
              const row = cleanedRows[r];
              if (!row || row.length <= Math.max(lCol, nCol)) continue;

              const sampleId = String(row[0] || `Muestra-${r}`).trim();
              const rawQ = String(row[lCol] || '').replace(',', '.').trim();
              const rawN = String(row[nCol] || '').replace(',', '.').trim();
              
              const quimico = parseFloat(rawQ);
              const nir = parseFloat(rawN);

              if (!isNaN(quimico) && !isNaN(nir)) {
                samples.push({ id: sampleId, quimico, nir });
              }
            }

            if (samples.length > 0) {
              parsedParams.push({ name: pName.toUpperCase(), samples });
            }
          }
        }
      } else {
        // Construir datos a partir de columnas mapeadas
        validMappedParams.forEach(pName => {
          const mapping = paramMapping[pName];
          const samples: SampleData[] = [];

          for (let r = 1; r < cleanedRows.length; r++) {
            const row = cleanedRows[r];
            if (!row || row.length <= Math.max(mapping.quimicoCol, mapping.nirCol)) continue;

            const sampleId = String(row[0] || `Muestra-${r}`).trim();
            const rawQ = String(row[mapping.quimicoCol] || '').replace(',', '.').trim();
            const rawN = String(row[mapping.nirCol] || '').replace(',', '.').trim();
            
            const quimico = parseFloat(rawQ);
            const nir = parseFloat(rawN);

            if (!isNaN(quimico) && !isNaN(nir)) {
              samples.push({ id: sampleId, quimico, nir });
            }
          }

          if (samples.length > 0) {
            parsedParams.push({ name: pName.toUpperCase(), samples });
          }
        });
      }
    }

    if (parsedParams.length === 0) {
      alert("No se pudieron emparejar las columnas de Laboratorio y NIR de forma correcta. Asegúrese de que sus columnas incluyan términos descriptivos como 'LA', 'LAB', 'VIA HUMEDA' para el valor de referencia, y 'NIR', 'FOSS' o 'PRED' para el modelo.");
      return;
    }

    setParameters(parsedParams);
    setSelectedParamIndex(0);
    setExcludedSamples({});
    setSelectedSample(null);
    setIsCustomData(true);
  };

  const getRpdColor = (rpd: number | undefined) => {
    if (!rpd) return "bg-slate-400";
    if (rpd >= 3.0) return "bg-ui-success";
    if (rpd >= 2.0) return "bg-amber-500";
    return "bg-rose-500";
  };

  const StatCard = ({ title, value, unit, icon: Icon, description, color }: { title: string; value: any; unit?: string; icon: any; description: string; color: string }) => (
    <div className="bg-ui-card p-5 rounded-xl shadow-sm border border-ui-border flex flex-col justify-between h-full hover:shadow-md transition-shadow">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</span>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon size={16} className="text-white" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-slate-100">{typeof value === 'number' ? value.toFixed(2) : (value || '0.00')}</span>
          <span className="text-slate-400 text-xs font-medium">{unit}</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-400 leading-tight">{description}</p>
    </div>
  );

  return (
    <div className="p-0 font-sans text-slate-100 bg-transparent pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-100">Validación NIR Externa</h1>
          <p className="text-slate-400 text-sm mt-1">Análisis de rendimiento y precisión del modelo con regresión lineal vs laboratorio.</p>
        </div>
        
        <div className="flex gap-3 items-center">
          <button 
            onClick={() => setShowSummaryModal(true)} 
            className="flex items-center gap-2 bg-slate-800 text-slate-100 hover:bg-slate-700 px-5 py-2.5 rounded-lg transition-all font-bold text-xs border border-slate-700 uppercase tracking-wide shadow-sm"
            title="Ver Resumen de Validaciones"
          >
            <ClipboardList size={14} className="text-ui-accent" /> Resumen
          </button>
          <button 
            onClick={handleDownloadPDF} 
            disabled={isGeneratingPdf}
            className={`flex items-center gap-2 bg-slate-800 text-slate-100 hover:bg-slate-700 px-5 py-2.5 rounded-lg transition-all font-bold text-xs border border-slate-700 uppercase tracking-wide shadow-sm ${isGeneratingPdf ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Descargar Reporte Completo en PDF"
          >
            <Download size={14} className={isGeneratingPdf ? 'animate-spin' : 'text-ui-accent'} /> {isGeneratingPdf ? 'Generando PDF...' : 'Exportar PDF'}
          </button>
          <label className="flex items-center gap-2 bg-ui-accent text-[#0a1d4a] hover:bg-[#38bdf8] shadow-[0_0_15px_rgba(14,165,233,0.3)] px-5 py-2.5 rounded-lg transition-all font-bold text-xs cursor-pointer uppercase tracking-wide">
            <Upload size={14} /> Importar Excel / CSV
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <button 
            onClick={() => {
              setParameters(generateDefaultParameters()); 
              setIsCustomData(false);
              setSelectedParamIndex(0);
              setExcludedSamples({});
              setSelectedSample(null);
            }} 
            className="text-slate-400 bg-ui-card hover:bg-ui-darkest p-2.5 rounded-lg transition-colors border border-ui-border shadow-sm hover:text-white" 
            title="Restablecer Datos de Ejemplo"
          >
            <Activity size={18} />
          </button>
        </div>
      </header>

      <div className="space-y-6">
        {/* Selector de Parámetros */}
        {parameters.length > 0 && (
          <div className="bg-ui-card p-3 rounded-xl border border-ui-border flex flex-wrap items-center gap-2.5 shadow-sm animate-fade-in">
            <span className="text-slate-400 text-[11px] font-bold uppercase tracking-wider pl-2 pr-1 select-none">Analito Activo:</span>
            <div className="flex flex-wrap gap-2">
              {parameters.map((param, index) => {
                const isActive = index === selectedParamIndex;
                const paramStats = calculateStatistics(param.samples);
                const rpd = paramStats?.rpd || 0;
                
                let rpdBadgeBg = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                if (rpd >= 3) rpdBadgeBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                else if (rpd >= 2) rpdBadgeBg = "bg-amber-500/10 text-amber-400 border-amber-500/20";

                return (
                  <button
                    key={param.name}
                    onClick={() => {
                      setSelectedParamIndex(index);
                      setSelectedSample(null);
                    }}
                    className={`flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
                      isActive 
                        ? 'bg-ui-accent text-[#0a1d4a] border-[#38bdf8] shadow-md scale-102' 
                        : 'bg-ui-darkest text-slate-300 hover:text-white border-ui-border hover:bg-slate-800'
                    }`}
                  >
                    <span>{param.name}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${isActive ? 'bg-[#0a1d4a]/10 text-[#0a1d4a]' : 'bg-slate-800 text-slate-400'}`}>
                      {param.samples.length}
                    </span>
                    {paramStats && (
                      <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${isActive ? 'bg-white/20 text-[#0a1d4a] border-white/30' : rpdBadgeBg}`}>
                        RPD {rpd.toFixed(1)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Muestras" value={stats?.n || data.length} icon={ClipboardList} color="bg-indigo-600" description="Total de muestras analizadas." />
          <StatCard title="RPD" value={stats?.rpd} icon={Gauge} color={getRpdColor(stats?.rpd)} description="Capacidad predictiva del modelo." />
          <StatCard title="Pendiente" value={stats?.slope} icon={TrendingUp} color="bg-ui-accent" description="Inclinación de la recta (ideal 1.0)." />
          <StatCard title="SEP" value={stats?.sep} unit="%" icon={AlertCircle} color="bg-slate-700" description="Error total de predicción." />
          <StatCard title="Bias" value={stats?.bias} unit="%" icon={BarChart3} color="bg-blue-500" description="Desviación sistemática promedio." />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div id="chart-dispersion-container" className="lg:col-span-2 bg-ui-card p-6 rounded-xl shadow-card border border-ui-border">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-100">
              <TrendingUp size={20} className="text-ui-accent" />
              Dispersión y Línea de Tendencia
            </h2>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis type="number" dataKey="quimico" stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']}>
                    <Label value={`${activeParameter ? activeParameter.name : "Ref."} LAB (%)`} offset={-10} position="insideBottom" fill="#94a3b8" />
                  </XAxis>
                  <YAxis type="number" dataKey="nir" stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']}>
                    <Label value="Predicción NIR (%)" angle={-90} position="insideLeft" fill="#94a3b8" />
                  </YAxis>
                  <Tooltip content={<CustomScatterTooltip sep={stats?.sep || 0.4} />} cursor={{ strokeDasharray: '3 3' }} />
                  
                  {/* Línea Ideal de 45 grados */}
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#475569" strokeDasharray="5 5" label={{ position: 'top', value: 'Ideal (1:1)', fill: '#64748b', fontSize: 10 }} />
                  
                  {/* Puntos de Datos */}
                  <Scatter 
                    name="Muestras" 
                    data={data} 
                    fill="#0ea5e9" 
                    fillOpacity={0.6}
                    activeShape={renderActiveShape}
                    onClick={(node) => {
                      if (node && node.payload) {
                        setSelectedSample(node.payload);
                      } else if (node) {
                        setSelectedSample(node);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />

                  {/* Punto de Muestra Seleccionado Resaltado */}
                  {selectedSample && !activeExcludedSet.has(String(selectedSample.id)) && (
                    <Scatter 
                      name="Punto Seleccionado" 
                      data={[selectedSample]} 
                      fill="#f43f5e" 
                      r={9} 
                      stroke="#ffffff" 
                      strokeWidth={2.5} 
                      legendType="none"
                    />
                  )}
                  
                  {/* Línea de Tendencia calculada */}
                  <Line data={stats?.trendLine} dataKey="trend" stroke="#0ea5e9" strokeWidth={2.5} dot={false} activeDot={false} legendType="none" />
                  
                  {/* Límites de Control (+/- 1 SEP) */}
                  <Line data={stats?.trendLine} dataKey="ucl" stroke="#f43f5e" strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={false} legendType="none" />
                  <Line data={stats?.trendLine} dataKey="lcl" stroke="#f43f5e" strokeWidth={1} strokeDasharray="3 3" dot={false} activeDot={false} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-6">
            {/* --- CARD ACCIONES DE MUESTRA SELECCIONADA --- */}
            {selectedSample && (
              <div className="bg-slate-900 border border-ui-accent rounded-xl p-5 shadow-2xl animate-fade-in text-xs space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <h3 className="font-extrabold text-slate-100 flex items-center gap-1.5 text-sm uppercase tracking-tight">
                    <Target size={16} className="text-ui-accent animate-pulse" />
                    Muestra Seleccionada
                  </h3>
                  <button 
                    onClick={() => setSelectedSample(null)} 
                    className="text-slate-400 hover:text-white text-[13px] bg-slate-800 hover:bg-slate-700 w-5 h-5 rounded-full flex items-center justify-center font-extrabold"
                    title="Cerrar selección"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-slate-950/60 rounded-lg p-3 border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-slate-400 text-[10.5px]">
                    <span className="font-bold">ID Muestra:</span>
                    <span className="font-mono text-xs font-extrabold text-ui-accent bg-ui-accent/15 px-2 py-0.5 rounded border border-ui-accent/20">{selectedSample.id}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400 text-[10.5px]">
                    <span>Laboratorio (Lab):</span>
                    <span className="font-mono text-slate-200 font-bold">{selectedSample.quimico.toFixed(3)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400 text-[10.5px]">
                    <span>Predicción NIR:</span>
                    <span className="font-mono text-slate-200 font-bold">{selectedSample.nir.toFixed(3)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400 text-[10.5px]">
                    <span>Estatus:</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${activeExcludedSet.has(String(selectedSample.id)) ? 'bg-amber-500/10 text-amber-400 border border-amber-500/15' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'}`}>
                      {activeExcludedSet.has(String(selectedSample.id)) ? 'EXCLUIDO' : 'ACTIVO'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-400 text-[10.5px] pt-1 border-t border-white/5">
                    <span>Diferencia (Error):</span>
                    <span className={`font-mono font-bold ${(selectedSample.nir - selectedSample.quimico) >= 0 ? 'text-rose-400' : 'text-sky-400'}`}>
                      {((selectedSample.nir - selectedSample.quimico) >= 0 ? '+' : '')}{(selectedSample.nir - selectedSample.quimico).toFixed(3)}%
                    </span>
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => {
                      if (!activeParameter) return;
                      const sampleIdStr = String(selectedSample.id);
                      const isExcluded = activeExcludedSet.has(sampleIdStr);
                      
                      let updatedList = [...(excludedSamples[activeParameter.name] || [])];
                      if (isExcluded) {
                        updatedList = updatedList.filter(id => id !== sampleIdStr);
                      } else {
                        updatedList.push(sampleIdStr);
                      }
                      
                      setExcludedSamples({
                        ...excludedSamples,
                        [activeParameter.name]: updatedList
                      });
                    }}
                    className={`w-full py-2 px-3 rounded-lg text-[10.5px] font-extrabold font-sans transition-all text-center uppercase tracking-wider border flex items-center justify-center gap-1.5 ${
                      activeExcludedSet.has(String(selectedSample.id))
                        ? 'bg-emerald-500/15 hover:bg-emerald-500 text-emerald-400 hover:text-slate-950 border-emerald-500/20 cursor-pointer shadow-sm'
                        : 'bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-slate-950 border-amber-500/20 cursor-pointer shadow-sm'
                    }`}
                  >
                    {activeExcludedSet.has(String(selectedSample.id)) ? '✓ Re-Incluir en Validación' : '⚠ Excluir / Deseleccionar Muestra'}
                  </button>

                  <button
                    onClick={() => {
                      if (!activeParameter) return;
                      
                      if (confirmDeleteId === String(selectedSample.id)) {
                        const updatedSamples = activeParameter.samples.filter(s => String(s.id) !== String(selectedSample.id));
                        const updatedParams = parameters.map((param, idx) => {
                          if (idx === selectedParamIndex) {
                            return { ...param, samples: updatedSamples };
                          }
                          return param;
                        });
                        setParameters(updatedParams);
                        
                        // Limpiar de excluidos por si estaba ahí
                        const updatedExcluded = (excludedSamples[activeParameter.name] || []).filter(id => id !== String(selectedSample.id));
                        setExcludedSamples({
                          ...excludedSamples,
                          [activeParameter.name]: updatedExcluded
                        });

                        setSelectedSample(null);
                        setConfirmDeleteId(null);
                      } else {
                        setConfirmDeleteId(String(selectedSample.id));
                        setTimeout(() => setConfirmDeleteId(null), 3000);
                      }
                    }}
                    className={`w-full py-2 px-3 rounded-lg text-[10.5px] font-extrabold font-sans transition-all border text-center uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer ${
                      confirmDeleteId === String(selectedSample.id)
                        ? 'bg-red-600 text-white border-red-500 shadow-[0_0_15px_rgba(220,38,38,0.5)]'
                        : 'bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-slate-100 border-rose-500/20'
                    }`}
                  >
                    {confirmDeleteId === String(selectedSample.id) ? '¿Confirmar Borrado?' : '🗑 Borrar de Calibración'}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-ui-card p-6 rounded-xl shadow-card border border-ui-border">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-100">
                <ClipboardList size={20} className="text-ui-accent" />
                Estadísticos de Regresión
              </h2>
              <div className="space-y-4">
                <div className="p-4 bg-ui-darkest rounded-xl border border-ui-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">Estado RPD</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${getRpdColor(stats?.rpd)}`}>
                      {stats && stats.rpd >= 3 ? 'Excelente' : (stats && stats.rpd >= 2 ? 'Bueno' : 'Pobre')}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${getRpdColor(stats?.rpd)}`} style={{ width: `${stats ? Math.min(100, (stats.rpd / 4) * 100) : 0}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">RPD {stats?.rpd !== undefined ? stats.rpd.toFixed(2) : '0.00'}: Precisión relativa a la desviación estándar.</p>
                </div>

                <div className="overflow-hidden border border-ui-border rounded-lg text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-ui-darkest text-slate-400 uppercase text-[9px] font-bold">
                      <tr>
                        <th className="px-3 py-2">Parámetro</th>
                        <th className="px-3 py-2">Valor</th>
                        <th className="px-3 py-2 text-right">Ideal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-3 py-2 font-medium">Muestras Analizadas (n)</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.n || data.length}</td>
                        <td className="px-3 py-2 text-right text-slate-400">-</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Pendiente (Slope)</td>
                        <td className="px-3 py-2 font-bold text-ui-accent">{stats?.slope !== undefined ? stats.slope.toFixed(4) : '0.0000'}</td>
                        <td className="px-3 py-2 text-right text-slate-400">1.000</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Intercepto</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.intercept !== undefined ? stats.intercept.toFixed(3) : '0.000'}</td>
                        <td className="px-3 py-2 text-right text-slate-400">0.000</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">R²</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.r2 !== undefined ? stats.r2.toFixed(3) : '0.000'}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{"> 0.90"}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">SEP</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.sep !== undefined ? stats.sep.toFixed(3) : '0.000'}%</td>
                        <td className="px-3 py-2 text-right text-slate-400">Mínimo</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Bias</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.bias !== undefined ? stats.bias.toFixed(3) : '0.000'}%</td>
                        <td className="px-3 py-2 text-right text-slate-400">{"± 0.05"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-ui-dark p-6 rounded-xl text-white shadow-lg">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-[13px]">
                <Target size={18} className="text-ui-accent" />
                Análisis de Pendiente
              </h3>
              <div className="space-y-3">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  La pendiente (slope) mide la sensibilidad del modelo. Un valor de <strong>{stats?.slope !== undefined ? stats.slope.toFixed(2) : '0.00'}</strong> indica que el modelo {stats && stats.slope < 1 ? "infraestima" : "sobreestima"} los cambios en la concentración real. 
                </p>
                <div className="p-3 bg-ui-darkest rounded-lg border border-ui-border">
                  <p className="text-brand-300 text-[10px] font-bold uppercase mb-1">Ecuación de Regresión:</p>
                  <p className="text-[12px] font-mono text-white tracking-tight">
                    NIR = {stats?.slope !== undefined ? stats.slope.toFixed(2) : '0.00'}x {stats && stats.intercept >= 0 ? '+' : '-'} {stats ? Math.abs(stats.intercept).toFixed(2) : '0.00'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- DYNAMIC RESIDUALS HISTOGRAM --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div id="chart-histogram-container" className="lg:col-span-2 bg-ui-card p-6 rounded-xl shadow-card border border-ui-border">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-2 text-slate-100">
              <BarChart3 size={20} className="text-ui-accent" />
              Distribución de Diferencias (Histograma de Errores)
            </h2>
            <p className="text-slate-400 text-xs mb-6">Frecuencia de las diferencias (NIR - Referencia Quimiométrica) agrupadas en rangos equidistantes.</p>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogramData} margin={{ top: 20, right: 25, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} angle={-15} textAnchor="end" height={50} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} label={{ value: 'Frecuencia (Muestras)', angle: -90, position: 'insideLeft', offset: 0, fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    labelClassName="text-xs font-bold text-slate-300"
                    itemStyle={{ fontSize: '11px', color: '#0ea5e9' }}
                    formatter={(value) => [`${value} muestras`, 'Cantidad']}
                  />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-ui-card p-6 rounded-xl shadow-card border border-ui-border flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-100">
                <Activity size={20} className="text-indigo-400" />
                Estadísticas de Errores
              </h2>
              <div className="p-4 bg-ui-darkest rounded-xl border border-ui-border space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Error Máximo Positivo</span>
                  <span className="font-mono font-bold text-rose-500">+{diffStats.max.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Error Máximo Negativo</span>
                  <span className="font-mono font-bold text-amber-500">{diffStats.min.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Media del Error (Bias)</span>
                  <span className={`font-mono font-bold ${Math.abs(stats?.bias || 0) > 0.05 ? 'text-amber-500' : 'text-ui-success'}`}>
                    {(stats?.bias || 0).toFixed(3)}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">MAE (Error Absoluto Medio)</span>
                  <span className="font-mono font-bold text-slate-100">{diffStats.meanAbs.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Desv Est de Diferencias (n-1)</span>
                  <span className="font-mono font-bold text-slate-100">{diffStats.std.toFixed(3)}%</span>
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-slate-900/40 rounded-lg text-[11px] text-slate-400">
              <p className="leading-relaxed">
                El histograma muestra cuán balanceados están los errores. Una distribución simétrica y centrada en <strong>0.00</strong> nos dice que no hay sesgo o subdosage constante.
              </p>
            </div>
          </div>
        </div>

        {/* --- DIAGNÓSTICO DE ROBUSTEZ Y ZONAS DE DEBILIDAD --- */}
        {activeParameter && data.length >= 3 && (
          <div className="bg-ui-card p-6 rounded-xl shadow-card border border-ui-border animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-slate-100">
                  <Target size={20} className="text-ui-accent animate-pulse" />
                  Zonas de Debilidad y Áreas de Oportunidades ({activeParameter.name})
                </h2>
                <p className="text-slate-400 text-xs mt-1">
                  Análisis estadístico dinámico que segmenta el rango de concentraciones reales para identificar dónde el modelo es excelente o presenta sesgo mecánico.
                </p>
              </div>
              <div className="bg-slate-900/60 px-4 py-2 rounded-lg border border-slate-800 text-[10.5px] text-slate-400 flex flex-wrap gap-4 items-center">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Precisión Máxima</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> Dispersión/Matriz</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span> Sesgo de Predicción</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {getOpportunityZones(data, stats?.sep || 0.1).map((zone, idx) => {
                let borderClass = "border-slate-800";
                let badgeClass = "bg-slate-800 text-slate-400 border-slate-700";
                
                if (zone.status === 'success') {
                  if (zone.statusText.includes("Alta") || zone.statusText.includes("Excelente") || zone.statusText.includes("Confort")) {
                    borderClass = "border-l-4 border-l-emerald-500 border-t border-r border-b border-[#1e293b]";
                    badgeClass = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                  } else {
                    borderClass = "border-l-4 border-l-emerald-600/70 border-t border-r border-b border-[#1e293b]";
                    badgeClass = "bg-emerald-500/5 text-emerald-500/80 border-emerald-500/15";
                  }
                } else if (zone.status === 'warning') {
                  borderClass = "border-l-4 border-l-amber-500 border-t border-r border-b border-[#1e293b]";
                  badgeClass = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                } else if (zone.status === 'error') {
                  borderClass = "border-l-4 border-l-rose-500 border-t border-r border-b border-[#1e293b]";
                  badgeClass = "bg-rose-500/10 text-rose-400 border-rose-500/20";
                } else {
                  borderClass = "border-l-4 border-l-slate-600 border-t border-r border-b border-[#1e293b]";
                }

                return (
                  <div key={idx} className={`bg-slate-950/40 rounded-xl p-4 flex flex-col justify-between h-full border ${borderClass} hover:bg-slate-900/40 transition-all shadow-sm`}>
                    <div>
                      <div className="flex justify-between items-start gap-1 pb-3 border-b border-white/5">
                        <span className="font-mono font-bold text-xs text-ui-accent">
                          {zone.label}
                        </span>
                        <span className={`text-[8.5px] font-extrabold px-1.5 py-0.5 rounded border uppercase tracking-widest ${badgeClass}`}>
                          {zone.samples.length === 0 ? 'Vacío' : (zone.status === 'success' ? 'Preciso' : zone.status === 'warning' ? 'Disperso' : 'Sesgado')}
                        </span>
                      </div>
                      
                      <h4 className="text-xs font-extrabold text-slate-100 mt-3 uppercase tracking-tight flex items-center gap-1.5">
                        {zone.status === 'success' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>}
                        {zone.status === 'warning' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>}
                        {zone.status === 'error' && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>}
                        {zone.status === 'neutral' && <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0"></span>}
                        {zone.statusText}
                      </h4>
                      
                      <p className="text-[10px] text-slate-400 mt-2 leading-relaxed min-h-[55px]">
                        {zone.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 space-y-2.5 text-[10px]">
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Población</span>
                        <span className="font-bold text-slate-200 bg-slate-800 px-1.5 py-0.2 rounded font-mono">{zone.samples.length} muestras</span>
                      </div>
                      {zone.samples.length > 0 && (
                        <>
                          <div className="space-y-1">
                            <div className="flex justify-between text-slate-400">
                              <span>Tendencia de Sesgo (Bias)</span>
                              <span className={`font-mono font-bold ${zone.bias > 0 ? 'text-rose-400' : zone.bias < 0 ? 'text-sky-400' : 'text-slate-400'}`}>
                                {zone.bias >= 0 ? '+' : ''}{zone.bias.toFixed(3)}%
                              </span>
                            </div>
                            <div className="w-full bg-[#0a1530] h-2 rounded-full overflow-hidden relative border border-white/5">
                              {/* Marca central de cero sesgo */}
                              <div className="h-full absolute left-1/2 -ml-0.5 w-[1px] bg-slate-600 z-10" />
                              {zone.bias >= 0 ? (
                                <div 
                                  className="h-full bg-rose-500 rounded-r absolute"
                                  style={{
                                    left: '50%',
                                    width: `${Math.min(50, (zone.bias / (stats?.sep || 0.4)) * 50)}%`
                                  }}
                                />
                              ) : (
                                <div 
                                  className="h-full bg-sky-500 rounded-l absolute"
                                  style={{
                                    right: '50%',
                                    width: `${Math.min(50, (Math.abs(zone.bias) / (stats?.sep || 0.4)) * 50)}%`
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-slate-400">
                            <span>Dispersión Interna</span>
                            <span className="font-mono font-bold text-slate-300">
                              ±{zone.dispersion.toFixed(3)}%
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 p-3 bg-slate-900/30 rounded-xl text-[10.5px] text-slate-400 border border-slate-800/40 leading-relaxed">
              💡 <strong>Recomendación Técnica:</strong> Las zonas con <span className="text-rose-400 font-bold">Sesgo</span> o <span className="text-amber-400 font-bold">Dispersión</span> representan áreas de oportunidad donde el modelo de calibración se beneficiará al ingresar nuevas muestras físicas de dichos rangos específicos a la ecuación de ajuste espectral.
            </div>
          </div>
        )}

        {/* --- NUEVA TABLA DE DATOS DE VALIDACIÓN --- */}
        <div className="bg-ui-card p-6 rounded-xl shadow-card border border-ui-border animate-fade-in">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-100">
            <TableIcon size={20} className="text-ui-accent" />
            Tabla de Datos y Diferencias de Validación
          </h2>
          <div className="overflow-x-auto rounded-lg border border-ui-border">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-ui-darkest text-slate-500 uppercase text-[10px] font-bold sticky top-0">
                <tr>
                  <th className="px-6 py-4 border-b border-ui-border">ID Muestra</th>
                  <th className="px-6 py-4 border-b border-ui-border text-right">Químico (Ref) %</th>
                  <th className="px-6 py-4 border-b border-ui-border text-right">NIR (Pred) %</th>
                  <th className="px-6 py-4 border-b border-ui-border text-right">Diferencia %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(activeParameter?.samples || []).map((row) => {
                  const isExcluded = activeExcludedSet.has(String(row.id));
                  const isSelected = selectedSample?.id === row.id;
                  const diff = row.nir - row.quimico;
                  return (
                    <tr 
                      key={row.id} 
                      onClick={() => setSelectedSample(row)}
                      className={`cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-ui-accent/15 border-l-2 border-l-ui-accent' 
                          : isExcluded 
                            ? 'opacity-40 bg-slate-950/20 text-slate-500 hover:bg-slate-900/35' 
                            : 'hover:bg-ui-darkest'
                      }`}
                    >
                      <td className="px-6 py-3 font-medium text-slate-200 flex items-center gap-2">
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-ui-accent animate-pulse inline-block shrink-0"></span>}
                        <span className={isExcluded ? 'line-through text-slate-500' : ''}>{row.id}</span>
                        {isExcluded && (
                          <span className="text-[8.5px] font-extrabold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/15 uppercase tracking-wide shrink-0 font-sans">
                            Excluido
                          </span>
                        )}
                      </td>
                      <td className={`px-6 py-3 text-right font-mono text-slate-300 ${isExcluded ? 'line-through text-slate-500 font-normal' : ''}`}>{row.quimico.toFixed(3)}</td>
                      <td className={`px-6 py-3 text-right font-mono text-slate-300 ${isExcluded ? 'line-through text-slate-500' : ''}`}>{row.nir.toFixed(3)}</td>
                      <td className={`px-6 py-3 text-right font-mono font-bold ${
                        isExcluded 
                          ? 'text-slate-500 line-through' 
                          : Math.abs(diff) > (stats?.sep || 1) 
                            ? 'text-rose-400 font-extrabold' 
                            : 'text-ui-success'
                      }`}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
                {(!activeParameter || activeParameter.samples.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">
                      No hay datos cargados para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-ui-darkest font-bold">
                <tr>
                  <td className="px-6 py-3 text-slate-500 uppercase text-[10px]">Promedios</td>
                  <td className="px-6 py-3 text-right font-mono">{stats?.meanX !== undefined ? stats.meanX.toFixed(3) : '0.000'}</td>
                  <td className="px-6 py-3 text-right font-mono">{stats?.meanY !== undefined ? stats.meanY.toFixed(3) : '0.000'}</td>
                  <td className="px-6 py-3 text-right font-mono text-slate-100">{stats?.bias !== undefined ? stats.bias.toFixed(3) : '0.000'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-4 text-[11px] text-slate-400 italic">
            * La diferencia se calcula como (NIR - Químico). Los valores resaltados en rojo indican una desviación superior al SEP (Standard Error of Prediction).
          </p>
        </div>
      </div>

      {showSummaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-ui-card max-w-4xl w-full max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl border border-ui-border p-6 font-sans">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-extrabold text-slate-100 flex items-center gap-2">
                <ClipboardList className="text-ui-accent" size={24} /> Resumen de Validación por Parámetro
              </h2>
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="text-slate-400 hover:text-white transition-colors p-2"
              >
                ✕
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Parámetro</th>
                    <th className="px-4 py-3">Muestras</th>
                    <th className="px-4 py-3 text-right">R²</th>
                    <th className="px-4 py-3 text-right">SEP (%)</th>
                    <th className="px-4 py-3 text-right">Bias (%)</th>
                    <th className="px-4 py-3 text-right">RPD</th>
                    <th className="px-4 py-3 rounded-tr-lg">Desempeño</th>
                  </tr>
                </thead>
                <tbody>
                  {parameters.map((param, index) => {
                    const activeExcl = new Set((excludedSamples[param.name] || []).map(id => String(id)));
                    const filteredData = param.samples.filter(s => !activeExcl.has(String(s.id)));
                    const st = calculateStatistics(filteredData);
                    
                    if (!st) return null;
                    
                    let performance = "Excelente";
                    let perfColor = "text-emerald-400";
                    if (st.rpd < 2) {
                       performance = "Revisar";
                       perfColor = "text-red-400";
                    } else if (st.rpd < 3) {
                       performance = "Aceptable";
                       perfColor = "text-yellow-400";
                    }

                    return (
                      <tr key={index} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="px-4 py-4 font-bold text-slate-200">{param.name}</td>
                        <td className="px-4 py-4 text-slate-400">{st.n}</td>
                        <td className={`px-4 py-4 text-right font-mono font-medium ${st.r2 >= 0.9 ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {st.r2.toFixed(3)}
                        </td>
                        <td className="px-4 py-4 text-right font-mono text-slate-200">{st.sep.toFixed(3)}</td>
                        <td className="px-4 py-4 text-right font-mono text-slate-200">{st.bias.toFixed(3)}</td>
                        <td className="px-4 py-4 text-right font-mono text-slate-200">{st.rpd.toFixed(2)}</td>
                        <td className={`px-4 py-4 font-bold ${perfColor}`}>{performance}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setShowSummaryModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-100 px-6 py-2 rounded-lg font-bold text-sm border border-slate-600 transition-colors uppercase tracking-wide"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ModelValidator;