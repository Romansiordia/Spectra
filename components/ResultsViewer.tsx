
import React, { useState, useRef, useEffect } from 'react';
import Card from './Card';
import Button from './Button';
import { ModelResults, PreprocessingStep, Sample } from '../types';
import { applyPreprocessingLogic } from '../services/chemometrics';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
    Activity, 
    AlertTriangle, 
    AlertCircle, 
    CheckCircle2, 
    Search, 
    SlidersHorizontal,
    Table as TableIcon,
    BarChart3,
    Check,
    XCircle,
    Eye,
    EyeOff,
    Sparkles,
    Download,
    FileCode,
    FileSpreadsheet,
    FileText,
    Copy,
    ChevronDown,
    ChevronUp,
    Layers,
    Cpu
} from 'lucide-react';
import { generateFossEqa, downloadFossEqaFile, extractWinISIMathTreatment } from '../services/fossEqa';

declare var Chart: any;

interface ResultsViewerProps {
    results: ModelResults;
    propertyName: string;
    preprocessingSteps: PreprocessingStep[];
    activeSamples: (string | number)[];
    activeSamplesData: Sample[];
    onDeactivateOutliers: (outlierIds: (string | number)[]) => void;
    wavelengths: number[];
    onExportCleanDataset: () => void;
    isRangeTrimmed?: boolean;
    fullWavelengthRange?: { min: number; max: number; count: number };
}

const StatCard = ({ label, value, subtext, colorClass }: { label: string, value: string | number, subtext?: string, colorClass: string }) => (
    <div className="bg-ui-dark p-5 rounded-xl border border-ui-border shadow-sm flex flex-col items-center justify-center hover:translate-y-[-2px] transition-transform duration-200">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</span>
        <span className={`text-3xl font-bold font-mono ${colorClass}`}>{value}</span>
        {subtext && <span className="text-xs text-slate-400 mt-2 bg-ui-darkest px-2 py-0.5 rounded-full">{subtext}</span>}
    </div>
);

const ResultsViewer: React.FC<ResultsViewerProps> = ({ 
    results, 
    propertyName, 
    preprocessingSteps, 
    activeSamples, 
    activeSamplesData, 
    onDeactivateOutliers, 
    wavelengths, 
    onExportCleanDataset,
    isRangeTrimmed,
    fullWavelengthRange
}) => {
    const [activeTab, setActiveTab] = useState('correlation');
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);
    
    // Residuals chart & table states
    const residualChartRef = useRef<HTMLCanvasElement>(null);
    const residualChartInstanceRef = useRef<any>(null);
    const [residualXAxis, setResidualXAxis] = useState<'actual' | 'predicted'>('actual');
    const [residualFilter, setResidualFilter] = useState<'all' | 'alerts' | 'critical' | 'selected'>('all');
    const [residualSearch, setResidualSearch] = useState('');
    const [showResidualTable, setShowResidualTable] = useState(true);
    
    const residuals = results.model.residuals;
    const [selectedOutliers, setSelectedOutliers] = useState<Set<string|number>>(new Set());
    const [manualSelection, setManualSelection] = useState<Set<string | number>>(new Set());

    // Estados para exportación FOSS (.EQA)
    const [showEqaPreview, setShowEqaPreview] = useState(false);
    const [eqaCopied, setEqaCopied] = useState(false);
    const [fossProductName, setFossProductName] = useState('Producto_NIR');

    const winisiMath = extractWinISIMathTreatment(preprocessingSteps);

    const getGeneratedEqaText = () => {
        return generateFossEqa({
            constituentName: propertyName || 'Propiedad',
            productName: fossProductName || 'Producto_NIR',
            modelResults: results,
            wavelengths: wavelengths,
            preprocessingSteps: preprocessingSteps,
            sampleCount: activeSamples.length
        });
    };

    const handleDownloadFossEqa = () => {
        const eqaText = getGeneratedEqaText();
        const safeName = (propertyName || 'Modelo').replace(/[^\w-]/g, '_');
        downloadFossEqaFile(eqaText, `${safeName}_PLS.eqa`);
    };

    const handleCopyEqa = () => {
        const eqaText = getGeneratedEqaText();
        navigator.clipboard.writeText(eqaText).then(() => {
            setEqaCopied(true);
            setTimeout(() => setEqaCopied(false), 2500);
        });
    };

    useEffect(() => {
        setSelectedOutliers(new Set());
        setManualSelection(new Set());
    }, [results]);

    useEffect(() => {
        if (typeof Chart === 'undefined' || !chartRef.current) return;

        if (!chartInstanceRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                const chartInstance = new Chart(ctx, {
                    type: 'scatter',
                    data: { datasets: [] },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        animation: false,
                        onClick: (evt: any) => {
                            if (!chartInstanceRef.current) return;
                            const points = chartInstanceRef.current.getElementsAtEventForMode(evt, 'point', { intersect: true }, true);
                            if (points.length > 0) {
                                const point = points[0];
                                const dataset = chartInstanceRef.current.data.datasets[point.datasetIndex];
                                const dataPoint = (dataset.data[point.index] as any);
                                if (dataPoint && dataPoint.id !== undefined) {
                                    const sampleId = dataPoint.id;
                                    setManualSelection(prev => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(sampleId)) newSet.delete(sampleId);
                                        else newSet.add(sampleId);
                                        return newSet;
                                    });
                                }
                            }
                        },
                        plugins: {
                            legend: { 
                                position: 'bottom',
                                labels: { usePointStyle: true, padding: 20, font: { family: 'Inter', size: 12 }, color: '#94a3b8' }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                titleColor: '#f8fafc',
                                bodyColor: '#f1f5f9',
                                borderColor: '#1e293b',
                                borderWidth: 1,
                                padding: 10,
                                callbacks: {
                                    title: (context: any) => `Muestra: ${context[0].dataset.data[context[0].dataIndex].id}`,
                                    label: (context: any) => `Ref ${context.parsed.x.toFixed(2)} / Pred ${context.parsed.y.toFixed(2)}`
                                }
                            }
                        },
                        scales: {
                            x: { title: { display: true, text: `Ref (${propertyName})`, color: '#94a3b8' }, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                            y: { title: { display: true, text: 'Pred (NIR)', color: '#94a3b8' }, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
                        }
                    }
                });
                chartInstanceRef.current = chartInstance;
            }
        }

        return () => {
            // Cleanup on unmount
        };
    }, [propertyName]); // Re-init if property changes (to update axis titles)

    useEffect(() => {
        const chartInstance = chartInstanceRef.current;
        if (chartInstance && results) {
            const allDataPoints = results.model.correlation.actual.map((act, i) => ({
                x: act,
                y: results.model.correlation.predicted[i],
                id: results.model.residuals[i].id,
                isOutlier: results.mahalanobis.distances.find(d => d.id === results.model.residuals[i].id)?.isOutlier || false
            })).filter(p => isFinite(p.x) && isFinite(p.y));

            if (allDataPoints.length > 0) {
                const inliersData = allDataPoints.filter(p => !p.isOutlier);
                const outliersData = allDataPoints.filter(p => p.isOutlier);

                let minVal = Infinity;
                let maxVal = -Infinity;
                for (let i = 0; i < allDataPoints.length; i++) {
                    const p = allDataPoints[i];
                    if (p.x < minVal) minVal = p.x;
                    if (p.y < minVal) minVal = p.y;
                    if (p.x > maxVal) maxVal = p.x;
                    if (p.y > maxVal) maxVal = p.y;
                }
                if (!isFinite(minVal)) minVal = 0;
                if (!isFinite(maxVal)) maxVal = 1;
                const padding = (maxVal - minVal) * 0.1 || 1;

                chartInstance.data.datasets = [
                    { label: 'Válidas', data: inliersData, backgroundColor: '#0ea5e9', pointRadius: (ctx: any) => manualSelection.has(ctx.raw?.id) ? 8 : 5 },
                    { label: 'Outliers', data: outliersData, backgroundColor: '#ef4444', pointStyle: 'triangle', pointRadius: (ctx: any) => manualSelection.has(ctx.raw?.id) ? 9 : 6 },
                    { type: 'line', label: '1:1', data: [{x: minVal - padding, y: minVal - padding}, {x: maxVal + padding, y: maxVal + padding}], borderColor: '#64748b', borderDash: [6, 6], pointRadius: 0, fill: false }
                ];
                
                chartInstance.options.scales.x.min = minVal - padding;
                chartInstance.options.scales.x.max = maxVal + padding;
                chartInstance.options.scales.y.min = minVal - padding;
                chartInstance.options.scales.y.max = maxVal + padding;
                chartInstance.update('none');
            }
        }
    }, [results, manualSelection, activeTab, propertyName]);

    // Métricas y análisis estadístico de residuos
    const sec = results.model.sec || 0.0001;
    const sec2 = sec * 2;
    const sec3 = sec * 3;
    const meanBias = residuals.length > 0 ? residuals.reduce((sum, r) => sum + r.residual, 0) / residuals.length : 0;
    const maxAbsResidual = residuals.length > 0 ? Math.max(...residuals.map(r => Math.abs(r.residual))) : 0;
    const warningResiduals = residuals.filter(r => Math.abs(r.residual) > sec2 && Math.abs(r.residual) <= sec3);
    const criticalResiduals = residuals.filter(r => Math.abs(r.residual) > sec3);
    const alertCount = warningResiduals.length + criticalResiduals.length;

    // Residuos filtrados para la tabla diagnóstica
    const filteredResiduals = residuals.filter(r => {
        if (residualSearch.trim()) {
            const q = residualSearch.toLowerCase().trim();
            if (!String(r.id).toLowerCase().includes(q)) return false;
        }
        const absRes = Math.abs(r.residual);
        if (residualFilter === 'critical') return absRes > sec3;
        if (residualFilter === 'alerts') return absRes > sec2;
        if (residualFilter === 'selected') return manualSelection.has(r.id);
        return true;
    });

    const handleSelectAllCritical = () => {
        setManualSelection(prev => {
            const next = new Set(prev);
            criticalResiduals.forEach(c => next.add(c.id));
            return next;
        });
    };

    const handleSelectAllAlerts = () => {
        setManualSelection(prev => {
            const next = new Set(prev);
            warningResiduals.forEach(w => next.add(w.id));
            criticalResiduals.forEach(c => next.add(c.id));
            return next;
        });
    };

    const handleClearSelection = () => {
        setManualSelection(new Set());
    };

    const toggleSampleSelection = (id: string | number) => {
        setManualSelection(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Efecto para renderizar el gráfico interactivo de Residuos (Lab vs NIR / Error)
    useEffect(() => {
        if (activeTab !== 'residuals' || typeof Chart === 'undefined') return;

        let animationFrameId: number;

        const initResidualChart = () => {
            if (!residualChartRef.current) return;
            const ctx = residualChartRef.current.getContext('2d');
            if (!ctx) return;

            if (residualChartInstanceRef.current) {
                residualChartInstanceRef.current.destroy();
                residualChartInstanceRef.current = null;
            }

            const points = results.model.residuals.map(r => {
                const xVal = residualXAxis === 'actual' ? r.actual : r.predicted;
                return {
                    x: xVal,
                    y: r.residual,
                    id: r.id,
                    actual: r.actual,
                    predicted: r.predicted,
                    residual: r.residual,
                    absRes: Math.abs(r.residual)
                };
            }).filter(p => isFinite(p.x) && isFinite(p.y));

            if (points.length === 0) return;

            const minX = Math.min(...points.map(p => p.x));
            const maxX = Math.max(...points.map(p => p.x));
            const xSpan = (maxX - minX) || 1;
            const xMinPadded = minX - xSpan * 0.06;
            const xMaxPadded = maxX + xSpan * 0.06;

            const normalPoints = points.filter(p => p.absRes <= sec2);
            const warningPoints = points.filter(p => p.absRes > sec2 && p.absRes <= sec3);
            const criticalPoints = points.filter(p => p.absRes > sec3);

            const maxAbsY = Math.max(sec3 * 1.25, ...points.map(p => p.absRes));
            const yMin = -maxAbsY * 1.15;
            const yMax = maxAbsY * 1.15;

            const chartInstance = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [
                        {
                            label: `Normal (≤ 2×SEC) [${normalPoints.length}]`,
                            data: normalPoints,
                            backgroundColor: '#0ea5e9',
                            borderColor: '#38bdf8',
                            pointRadius: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? 10 : 5,
                            pointHoverRadius: 9,
                            pointBorderWidth: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? 3 : 1,
                            pointBorderColor: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? '#ffffff' : '#38bdf8',
                        },
                        {
                            label: `Advertencia (2× a 3×SEC) [${warningPoints.length}]`,
                            data: warningPoints,
                            backgroundColor: '#f59e0b',
                            borderColor: '#fbbf24',
                            pointStyle: 'triangle',
                            pointRadius: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? 11 : 7,
                            pointHoverRadius: 10,
                            pointBorderWidth: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? 3 : 1,
                            pointBorderColor: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? '#ffffff' : '#fbbf24',
                        },
                        {
                            label: `Crítico / Outlier (> 3×SEC) [${criticalPoints.length}]`,
                            data: criticalPoints,
                            backgroundColor: '#ef4444',
                            borderColor: '#f87171',
                            pointStyle: 'rectRot',
                            pointRadius: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? 12 : 8,
                            pointHoverRadius: 11,
                            pointBorderWidth: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? 3 : 1,
                            pointBorderColor: (ctxPt: any) => manualSelection.has(ctxPt.raw?.id) ? '#ffffff' : '#f87171',
                        },
                        // Línea Zero (Y = 0)
                        {
                            type: 'line',
                            label: 'Línea Cero (Residuo = 0)',
                            data: [{ x: xMinPadded, y: 0 }, { x: xMaxPadded, y: 0 }],
                            borderColor: '#94a3b8',
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                        },
                        // +2 SEC
                        {
                            type: 'line',
                            label: `+2×SEC (+${sec2.toFixed(4)})`,
                            data: [{ x: xMinPadded, y: sec2 }, { x: xMaxPadded, y: sec2 }],
                            borderColor: '#f59e0b',
                            borderDash: [6, 4],
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                        },
                        // -2 SEC
                        {
                            type: 'line',
                            label: `-2×SEC (-${sec2.toFixed(4)})`,
                            data: [{ x: xMinPadded, y: -sec2 }, { x: xMaxPadded, y: -sec2 }],
                            borderColor: '#f59e0b',
                            borderDash: [6, 4],
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                        },
                        // +3 SEC
                        {
                            type: 'line',
                            label: `+3×SEC (+${sec3.toFixed(4)})`,
                            data: [{ x: xMinPadded, y: sec3 }, { x: xMaxPadded, y: sec3 }],
                            borderColor: '#ef4444',
                            borderDash: [4, 4],
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                        },
                        // -3 SEC
                        {
                            type: 'line',
                            label: `-3×SEC (-${sec3.toFixed(4)})`,
                            data: [{ x: xMinPadded, y: -sec3 }, { x: xMaxPadded, y: -sec3 }],
                            borderColor: '#ef4444',
                            borderDash: [4, 4],
                            borderWidth: 1.5,
                            pointRadius: 0,
                            fill: false,
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    responsive: true,
                    animation: false,
                    onClick: (evt: any) => {
                        if (!residualChartInstanceRef.current) return;
                        const pts = residualChartInstanceRef.current.getElementsAtEventForMode(evt, 'point', { intersect: true }, true);
                        if (pts.length > 0) {
                            const pt = pts[0];
                            const ds = residualChartInstanceRef.current.data.datasets[pt.datasetIndex];
                            const raw = ds.data[pt.index] as any;
                            if (raw && raw.id !== undefined) {
                                toggleSampleSelection(raw.id);
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                usePointStyle: true,
                                padding: 14,
                                font: { family: 'Inter', size: 11 },
                                color: '#94a3b8',
                                filter: (item: any) => {
                                    return !item.text.includes('-2×SEC') && !item.text.includes('-3×SEC');
                                }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            titleColor: '#f8fafc',
                            bodyColor: '#f1f5f9',
                            borderColor: '#334155',
                            borderWidth: 1,
                            padding: 12,
                            callbacks: {
                                title: (items: any) => {
                                    const raw = items[0]?.raw;
                                    return raw ? `Muestra: ${raw.id}` : '';
                                },
                                label: (item: any) => {
                                    const raw = item.raw;
                                    if (!raw || raw.actual === undefined) return item.dataset.label || '';
                                    const isCrit = raw.absRes > sec3;
                                    const isWarn = raw.absRes > sec2 && !isCrit;
                                    const status = isCrit ? '⚠️ CRÍTICO (> 3×SEC)' : isWarn ? '⚡ ADVERTENCIA (> 2×SEC)' : '✅ Normal (±2×SEC)';
                                    return [
                                        `Lab Real: ${raw.actual.toFixed(4)}`,
                                        `Predicho NIR: ${raw.predicted.toFixed(4)}`,
                                        `Residuo: ${raw.residual > 0 ? '+' : ''}${raw.residual.toFixed(4)}`,
                                        `Diagnóstico: ${status}`,
                                        manualSelection.has(raw.id) ? '● Muestra SELECCIONADA para exclusión' : 'Click para seleccionar/deseleccionar'
                                    ];
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            min: xMinPadded,
                            max: xMaxPadded,
                            title: {
                                display: true,
                                text: residualXAxis === 'actual' ? `Valor Laboratorio Real (${propertyName})` : `Valor Predicho NIR (${propertyName})`,
                                color: '#94a3b8',
                                font: { weight: 'bold' }
                            },
                            grid: { color: 'rgba(51, 65, 85, 0.4)' },
                            ticks: { color: '#94a3b8' }
                        },
                        y: {
                            min: yMin,
                            max: yMax,
                            title: {
                                display: true,
                                text: 'Residuo = Real - NIR Predicho',
                                color: '#94a3b8',
                                font: { weight: 'bold' }
                            },
                            grid: { color: 'rgba(51, 65, 85, 0.4)' },
                            ticks: { color: '#94a3b8' }
                        }
                    }
                }
            });

            residualChartInstanceRef.current = chartInstance;
        };

        animationFrameId = requestAnimationFrame(() => {
            initResidualChart();
        });

        return () => {
            cancelAnimationFrame(animationFrameId);
            if (residualChartInstanceRef.current) {
                residualChartInstanceRef.current.destroy();
                residualChartInstanceRef.current = null;
            }
        };
    }, [activeTab, results, manualSelection, propertyName, residualXAxis, sec2, sec3]);


    const handleExportConfig = () => {
        // Calcular espectro de referencia y desviación estándar para muestras limpias
        const rawSpectra = activeSamplesData.map(s => s.values);
        const numSamples = rawSpectra.length;
        
        const rawMeanSpectrum = rawSpectra[0]?.map((_, i) => 
            rawSpectra.reduce((sum, s) => sum + s[i], 0) / (numSamples || 1)
        ) || [];
        
        const spectra = rawSpectra.map(s => applyPreprocessingLogic(s, preprocessingSteps, rawMeanSpectrum));
        
        const meanSpectrum: number[] = [];
        const stdSpectrum: number[] = [];
        const numPoints = spectra[0]?.length || 0;

        for (let i = 0; i < numPoints; i++) {
            let sum = 0;
            for (let j = 0; j < numSamples; j++) {
                sum += spectra[j][i];
            }
            const mean = sum / numSamples;
            meanSpectrum.push(mean);

            let varianceSum = 0;
            for (let j = 0; j < numSamples; j++) {
                varianceSum += Math.pow(spectra[j][i] - mean, 2);
            }
            const std = Math.sqrt(varianceSum / (numSamples > 1 ? numSamples - 1 : 1));
            stdSpectrum.push(std);
        }

        const internalDistances: number[] = [];
        for (let j = 0; j < numSamples; j++) {
            let dist = 0;
            for (let i = 0; i < numPoints; i++) {
                const diff = spectra[j][i] - meanSpectrum[i];
                dist += diff * diff;
            }
            internalDistances.push(Math.sqrt(dist));
        }
        
        const meanDist = internalDistances.reduce((a, b) => a + b, 0) / (numSamples || 1);
        const stdDist = Math.sqrt(internalDistances.reduce((a, b) => a + Math.pow(b - meanDist, 2), 0) / (numSamples || 1));
        const resultThreshold = meanDist + (3 * stdDist) || 1.0;

        const isTrimmed = Boolean(isRangeTrimmed || (fullWavelengthRange && wavelengths.length < fullWavelengthRange.count));
        const spectralRange = {
            isTrimmed,
            trimmedRange: {
                min: wavelengths[0],
                max: wavelengths[wavelengths.length - 1],
                points: wavelengths.length
            },
            fullRange: fullWavelengthRange ? {
                min: fullWavelengthRange.min,
                max: fullWavelengthRange.max,
                points: fullWavelengthRange.count
            } : {
                min: wavelengths[0],
                max: wavelengths[wavelengths.length - 1],
                points: wavelengths.length
            },
            wavelengths: wavelengths
        };

        const config = { 
            date: new Date().toISOString(), 
            modelType: results.modelType, 
            nComponents: results.nComponents, 
            analyticalProperty: propertyName, 
            preprocessing: preprocessingSteps, 
            metrics: results.model,
            spectralRange,
            referenceData: {
                meanSpectrum,
                stdSpectrum,
                rawMeanSpectrum,
                numberOfSamples: numSamples,
                wavelengths: wavelengths,
                threshold: resultThreshold
            }
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
        const anchor = document.createElement('a'); anchor.href = dataStr; anchor.download = `modelo_${propertyName}.json`; anchor.click();
    };

    const handleDownloadPDF = () => {
        try {
            const doc = new jsPDF();
            
            // Header
            doc.setFontSize(22);
            doc.setTextColor(14, 165, 233); // Brand color
            doc.text('Reporte Técnico Quimiométrico', 14, 22);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139); // Slate 500
            doc.text(`Fecha de Generación: ${new Date().toLocaleString()}`, 14, 30);
            doc.text(`Propiedad Analizada: ${propertyName}`, 14, 35);
            doc.text(`Algoritmo: ${results.modelType.toUpperCase()}`, 14, 40);
            doc.text(`Componentes Principales: ${results.nComponents}`, 14, 45);

            // Pre-procesamiento
            doc.setFontSize(16);
            doc.setTextColor(15, 23, 42); // Slate 900
            doc.text('1. Pre-procesamiento', 14, 55);
            
            const preprocData = preprocessingSteps.map((step, i) => [i + 1, step.type, JSON.stringify(step.params)]);
            autoTable(doc, {
                startY: 60,
                head: [['#', 'Método Aplicado', 'Configuración']],
                body: preprocData,
                theme: 'striped',
                headStyles: { fillColor: [14, 165, 233] },
                margin: { left: 14, right: 14 }
            });

            // Métricas
            let currentY = (doc as any).lastAutoTable.finalY + 15;
            doc.setFontSize(16);
            doc.text('2. Métricas de Performance', 14, currentY);
            
            const metricsData = [
                ['R² (Coeficiente de Determinación)', results.model.r2.toFixed(4)],
                ['Q² (Validación Cruzada)', results.model.q2.toFixed(4)],
                ['SEC (Error Estándar de Calibración)', results.model.sec.toFixed(4)],
                ['SECV (Error Estándar de Validación)', results.model.secv.toFixed(4)],
                ['Pendiente (Slope)', results.model.slope.toFixed(4)],
                ['Offset (Intersección)', results.model.offset.toFixed(4)]
            ];
            
            autoTable(doc, {
                startY: currentY + 5,
                body: metricsData,
                theme: 'plain',
                styles: { cellPadding: 3, fontSize: 11 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 120 } },
                margin: { left: 14, right: 14 }
            });

            // Gráfico de Correlación
            currentY = (doc as any).lastAutoTable.finalY + 15;
            
            // Verificar si el gráfico cabe en la página, si no, nueva página
            if (currentY + 110 > doc.internal.pageSize.getHeight()) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(16);
            doc.text('3. Gráfico de Correlación (NIR vs Referencia)', 14, currentY);

            if (chartRef.current && chartInstanceRef.current) {
                try {
                    const chartInstance = chartInstanceRef.current;
                    
                    // Guardar colores originales
                    const originalOptions = JSON.parse(JSON.stringify({
                        xTicks: chartInstance.options.scales.x.ticks.color,
                        xTitle: chartInstance.options.scales.x.title.color,
                        xGrid: chartInstance.options.scales.x.grid.color,
                        yTicks: chartInstance.options.scales.y.ticks.color,
                        yTitle: chartInstance.options.scales.y.title.color,
                        yGrid: chartInstance.options.scales.y.grid.color,
                        legend: chartInstance.options.plugins.legend.labels.color
                    }));

                    // Aplicar colores de alto contraste para el PDF
                    chartInstance.options.scales.x.ticks.color = '#1e293b';
                    chartInstance.options.scales.x.title.color = '#1e293b';
                    chartInstance.options.scales.x.grid.color = '#e2e8f0';
                    chartInstance.options.scales.y.ticks.color = '#1e293b';
                    chartInstance.options.scales.y.title.color = '#1e293b';
                    chartInstance.options.scales.y.grid.color = '#e2e8f0';
                    chartInstance.options.plugins.legend.labels.color = '#1e293b';
                    
                    chartInstance.update('none');

                    // Capturar con fondo blanco
                    const canvas = chartRef.current;
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    if (tempCtx) {
                        tempCtx.fillStyle = '#FFFFFF';
                        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                        tempCtx.drawImage(canvas, 0, 0);
                        
                        const chartImage = tempCanvas.toDataURL('image/jpeg', 1.0);
                        doc.addImage(chartImage, 'JPEG', 14, currentY + 5, 180, 100);
                        currentY += 110;
                    }

                    // Restaurar colores
                    chartInstance.options.scales.x.ticks.color = originalOptions.xTicks;
                    chartInstance.options.scales.x.title.color = originalOptions.xTitle;
                    chartInstance.options.scales.x.grid.color = originalOptions.xGrid;
                    chartInstance.options.scales.y.ticks.color = originalOptions.yTicks;
                    chartInstance.options.scales.y.title.color = originalOptions.yTitle;
                    chartInstance.options.scales.y.grid.color = originalOptions.yGrid;
                    chartInstance.options.plugins.legend.labels.color = originalOptions.legend;
                    chartInstance.update('none');

                } catch (chartError) {
                    console.error("Error capturando gráfico:", chartError);
                    doc.setFontSize(10);
                    doc.setTextColor(239, 68, 68);
                    doc.text('Error: No se pudo renderizar el gráfico en el PDF.', 14, currentY + 10);
                    currentY += 20;
                }
            }

            // Residuos (Nueva Página)
            doc.addPage();
            doc.setFontSize(16);
            doc.setTextColor(15, 23, 42);
            doc.text('4. Resumen de Residuos (Top 50)', 14, 20);
            
            const residualsData = residuals.slice(0, 50).map(r => [
                r.id, 
                r.actual.toFixed(4), 
                r.predicted.toFixed(4), 
                r.residual.toFixed(4)
            ]);
            
            autoTable(doc, {
                startY: 25,
                head: [['ID Muestra', 'Valor Referencia', 'Predicción NIR', 'Residuo']],
                body: residualsData,
                theme: 'striped',
                headStyles: { fillColor: [14, 165, 233] },
                styles: { fontSize: 9 },
                margin: { left: 14, right: 14 }
            });

            doc.save(`Reporte_${propertyName}_${new Date().getTime()}.pdf`);
        } catch (pdfError) {
            console.error("Error generando PDF:", pdfError);
            alert("Hubo un error al generar el reporte PDF. Por favor, intente de nuevo.");
        }
    };

    const handleDeactivateManualClick = () => {
        if (manualSelection.size === 0) return;
        onDeactivateOutliers(Array.from(manualSelection));
    };

    const TabButton = ({ tabId, label, icon }: { tabId: string; label: string; icon?: React.ReactNode }) => (
        <button className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative ${activeTab === tabId ? 'text-ui-accent bg-ui-darkest border-b-2 border-ui-accent' : 'text-slate-400 hover:text-slate-100 hover:bg-ui-dark'}`} onClick={() => setActiveTab(tabId)}>
            {icon}{label}
        </button>
    );

    return (
        <Card noPadding className="overflow-hidden">
            <div className="bg-ui-card border-b border-ui-border">
                <div className="flex overflow-x-auto no-scrollbar">
                    <TabButton tabId="correlation" label="Gráfico" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18"></path></svg>} />
                    <TabButton tabId="residuals" label="Residuos" icon={<Activity className="w-4 h-4" />} />
                    <TabButton tabId="full-data" label="Exportar Modelos" icon={<Download className="w-4 h-4" />} />
                </div>
            </div>

            <div className="p-6 bg-ui-darkest min-h-[400px]">
                <div className={activeTab === 'correlation' ? 'block' : 'hidden'}>
                    <div className="flex flex-col gap-6 animate-fade-in">
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                            <StatCard label="R²" value={isFinite(results.model.r2) ? results.model.r2.toFixed(4) : '0.0000'} colorClass="text-sky-400" />
                            <StatCard label="Q²" value={isFinite(results.model.q2) ? results.model.q2.toFixed(4) : '0.0000'} colorClass="text-purple-400" />
                            <StatCard label="SEC" value={isFinite(results.model.sec) ? results.model.sec.toFixed(4) : '0.0000'} colorClass="text-ui-accent" />
                            <StatCard label="SECV" value={isFinite(results.model.secv) ? results.model.secv.toFixed(4) : '0.0000'} colorClass="text-ui-success" />
                            <StatCard label="Offset" value={results.model.offset != null && isFinite(results.model.offset) ? results.model.offset.toFixed(4) : '0.0000'} colorClass="text-amber-400" />
                        </div>

                        <div className="bg-ui-darkest p-4 rounded-xl border border-ui-border shadow-inner-dark h-[450px] relative">
                            <canvas ref={chartRef}></canvas>
                        </div>

                        <div className="bg-ui-card rounded-xl border border-ui-border p-6 flex justify-between items-center">
                            <div>
                                <h4 className="font-bold text-slate-100">Gestión de Outliers</h4>
                                <p className="text-sm text-slate-400">Seleccionados: {manualSelection.size}</p>
                            </div>
                            <Button onClick={handleDeactivateManualClick} disabled={manualSelection.size === 0} variant="danger">
                                Desactivar y Recalcular
                            </Button>
                        </div>
                    </div>
                </div>

                <div className={activeTab === 'residuals' ? 'block' : 'hidden'}>
                    <div className="flex flex-col gap-6 animate-fade-in">
                        {/* Métricas clave de residuales */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                            <StatCard 
                                label="SEC (Std Error)" 
                                value={isFinite(sec) ? sec.toFixed(4) : '0.0000'} 
                                subtext="Error estándar de calibración"
                                colorClass="text-sky-400" 
                            />
                            <StatCard 
                                label="Sesgo (Bias)" 
                                value={isFinite(meanBias) ? (meanBias > 0 ? `+${meanBias.toFixed(4)}` : meanBias.toFixed(4)) : '0.0000'} 
                                subtext="Error medio sistemático"
                                colorClass={Math.abs(meanBias) < sec * 0.1 ? "text-emerald-400" : "text-amber-400"} 
                            />
                            <StatCard 
                                label="Residuo Máximo" 
                                value={isFinite(maxAbsResidual) ? maxAbsResidual.toFixed(4) : '0.0000'} 
                                subtext={`Max desvío observado`}
                                colorClass="text-purple-400" 
                            />
                            <StatCard 
                                label="Alertas (> 2×SEC)" 
                                value={warningResiduals.length} 
                                subtext={`Límite: ±${sec2.toFixed(4)}`}
                                colorClass={warningResiduals.length > 0 ? "text-amber-400" : "text-emerald-400"} 
                            />
                            <StatCard 
                                label="Críticos (> 3×SEC)" 
                                value={criticalResiduals.length} 
                                subtext={`Límite: ±${sec3.toFixed(4)}`}
                                colorClass={criticalResiduals.length > 0 ? "text-red-400 font-bold" : "text-emerald-400"} 
                            />
                        </div>

                        {/* Card del Gráfico de Residuos */}
                        <div className="bg-ui-card rounded-xl border border-ui-border p-5 flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ui-border/60 pb-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-ui-accent" />
                                        <h3 className="font-bold text-slate-100 text-lg">
                                            Gráfico Diagnóstico de Residuos
                                        </h3>
                                        <span className="text-xs bg-ui-dark px-2.5 py-1 rounded-full text-slate-300 font-medium">
                                            {residuals.length} Muestras
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">
                                        Inspección de dispersión y homocedasticidad. Haz clic sobre los puntos en el gráfico para marcarlos para exclusión.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 bg-ui-darkest p-1 rounded-lg border border-ui-border self-start sm:self-auto">
                                    <span className="text-xs font-semibold text-slate-400 px-2">Eje X:</span>
                                    <button 
                                        type="button"
                                        onClick={() => setResidualXAxis('actual')}
                                        className={`px-3 py-1 text-xs rounded font-medium transition-all ${residualXAxis === 'actual' ? 'bg-ui-accent text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                    >
                                        Lab Real (Ref)
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setResidualXAxis('predicted')}
                                        className={`px-3 py-1 text-xs rounded font-medium transition-all ${residualXAxis === 'predicted' ? 'bg-ui-accent text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                                    >
                                        NIR Predicho
                                    </button>
                                </div>
                            </div>

                            {/* Canvas del Gráfico */}
                            <div className="bg-ui-darkest p-4 rounded-xl border border-ui-border shadow-inner-dark h-[440px] relative">
                                <canvas ref={residualChartRef}></canvas>
                            </div>

                            {/* Barra informativa de límites */}
                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-ui-darkest/70 p-3 rounded-lg border border-ui-border/60 text-slate-300">
                                <div className="flex flex-wrap items-center gap-4">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 rounded-full bg-[#0ea5e9] inline-block"></span>
                                        Normal (Dentro de ±2×SEC)
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 bg-[#f59e0b] inline-block transform rotate-45"></span>
                                        Advertencia (±2× a ±3×SEC)
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-3 h-3 bg-[#ef4444] inline-block"></span>
                                        Crítico / Outlier (&gt; 3×SEC)
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-400 font-mono">
                                    <span>2×SEC: <strong className="text-amber-400">±{sec2.toFixed(4)}</strong></span>
                                    <span>•</span>
                                    <span>3×SEC: <strong className="text-red-400">±{sec3.toFixed(4)}</strong></span>
                                </div>
                            </div>
                        </div>

                        {/* Barra de Gestión de Outliers y Selección Rápida */}
                        <div className="bg-ui-card rounded-xl border border-ui-border p-5 flex flex-wrap items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${manualSelection.size > 0 ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400' : 'bg-ui-dark border border-ui-border text-slate-400'}`}>
                                    <AlertTriangle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-100 text-sm">
                                        Gestión de Muestras Excluidas
                                    </h4>
                                    <p className="text-xs text-slate-400">
                                        {manualSelection.size === 0 
                                            ? 'Haz clic en los puntos del gráfico o casillas de la tabla para marcar muestras.' 
                                            : `${manualSelection.size} muestra(s) seleccionada(s) para ser desactivada(s) y recalcular.`}
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                {criticalResiduals.length > 0 && (
                                    <Button 
                                        type="button"
                                        onClick={handleSelectAllCritical} 
                                        variant="secondary" 
                                        size="sm"
                                        className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                                    >
                                        Marcar Críticos (&gt; 3×SEC) [{criticalResiduals.length}]
                                    </Button>
                                )}
                                {warningResiduals.length > 0 && (
                                    <Button 
                                        type="button"
                                        onClick={handleSelectAllAlerts} 
                                        variant="secondary" 
                                        size="sm"
                                        className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                                    >
                                        Marcar Todas las Alertas [{alertCount}]
                                    </Button>
                                )}
                                {manualSelection.size > 0 && (
                                    <Button 
                                        type="button"
                                        onClick={handleClearSelection} 
                                        variant="secondary" 
                                        size="sm"
                                    >
                                        Limpiar Selección
                                    </Button>
                                )}
                                <Button 
                                    onClick={handleDeactivateManualClick} 
                                    disabled={manualSelection.size === 0} 
                                    variant="danger"
                                    size="sm"
                                >
                                    Desactivar ({manualSelection.size}) y Recalcular
                                </Button>
                            </div>
                        </div>

                        {/* Tabla Diagnóstica con Búsqueda y Filtros */}
                        <div className="bg-ui-card rounded-xl border border-ui-border overflow-hidden">
                            <div className="p-4 bg-ui-dark/50 border-b border-ui-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <TableIcon className="w-5 h-5 text-ui-accent" />
                                    <div>
                                        <h4 className="font-bold text-slate-100 text-sm">
                                            Tabla Detallada de Residuos
                                        </h4>
                                        <p className="text-xs text-slate-400">
                                            Mostrando {filteredResiduals.length} de {residuals.length} muestras
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    {/* Buscador */}
                                    <div className="relative min-w-[200px]">
                                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="text"
                                            value={residualSearch}
                                            onChange={(e) => setResidualSearch(e.target.value)}
                                            placeholder="Buscar por ID..."
                                            className="w-full bg-ui-darkest border border-ui-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-ui-accent"
                                        />
                                    </div>

                                    {/* Filtros rápidos */}
                                    <div className="flex items-center gap-1 bg-ui-darkest p-1 rounded-lg border border-ui-border">
                                        <button
                                            type="button"
                                            onClick={() => setResidualFilter('all')}
                                            className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${residualFilter === 'all' ? 'bg-ui-accent text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                        >
                                            Todas ({residuals.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setResidualFilter('alerts')}
                                            className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${residualFilter === 'alerts' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                                        >
                                            Alertas ({alertCount})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setResidualFilter('critical')}
                                            className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${residualFilter === 'critical' ? 'bg-red-500/20 text-red-300 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                                        >
                                            Críticos ({criticalResiduals.length})
                                        </button>
                                        {manualSelection.size > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setResidualFilter('selected')}
                                                className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${residualFilter === 'selected' ? 'bg-purple-500/20 text-purple-300 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                                            >
                                                Marcadas ({manualSelection.size})
                                            </button>
                                        )}
                                    </div>

                                    {/* Botón Colapsar */}
                                    <button 
                                        type="button"
                                        onClick={() => setShowResidualTable(!showResidualTable)}
                                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-ui-darkest rounded-lg transition-colors border border-ui-border"
                                        title={showResidualTable ? "Ocultar tabla" : "Mostrar tabla"}
                                    >
                                        {showResidualTable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {showResidualTable && (
                                <div className="max-h-80 overflow-y-auto">
                                    <table className="w-full text-sm text-left text-slate-100">
                                        <thead className="bg-ui-dark text-slate-400 uppercase text-xs sticky top-0 z-10 border-b border-ui-border">
                                            <tr>
                                                <th className="px-4 py-3 w-10 text-center">
                                                    <span className="sr-only">Seleccionar</span>
                                                </th>
                                                <th className="px-4 py-3 font-semibold">ID Muestra</th>
                                                <th className="px-4 py-3 text-right font-semibold">Valor Real (Lab)</th>
                                                <th className="px-4 py-3 text-right font-semibold">Predicho (NIR)</th>
                                                <th className="px-4 py-3 text-right font-semibold">Residuo (Real - NIR)</th>
                                                <th className="px-4 py-3 text-right font-semibold">% Error</th>
                                                <th className="px-4 py-3 text-center font-semibold">Diagnóstico</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-ui-darkest">
                                            {filteredResiduals.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400 text-sm">
                                                        No se encontraron muestras que coincidan con el filtro seleccionado.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredResiduals.map(r => {
                                                    const absRes = Math.abs(r.residual);
                                                    const isCrit = absRes > sec3;
                                                    const isWarn = absRes > sec2 && !isCrit;
                                                    const isSelected = manualSelection.has(r.id);
                                                    const relError = Math.abs(r.actual) > 1e-6 
                                                        ? ((absRes / Math.abs(r.actual)) * 100).toFixed(2) 
                                                        : '0.00';

                                                    return (
                                                        <tr 
                                                            key={r.id} 
                                                            onClick={() => toggleSampleSelection(r.id)}
                                                            className={`cursor-pointer transition-colors ${
                                                                isSelected 
                                                                    ? 'bg-red-500/15 hover:bg-red-500/20' 
                                                                    : isCrit 
                                                                        ? 'bg-red-950/20 hover:bg-red-900/30' 
                                                                        : isWarn 
                                                                            ? 'bg-amber-950/20 hover:bg-amber-900/30' 
                                                                            : 'hover:bg-ui-dark/60'
                                                            }`}
                                                        >
                                                            <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                                                <input 
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={() => toggleSampleSelection(r.id)}
                                                                    className="h-4 w-4 rounded text-ui-accent bg-ui-darkest border-ui-border focus:ring-ui-accent focus:ring-offset-0 cursor-pointer"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-2.5 font-medium text-slate-200">
                                                                {r.id}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                                                                {r.actual.toFixed(4)}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                                                                {r.predicted.toFixed(4)}
                                                            </td>
                                                            <td className={`px-4 py-2.5 text-right font-mono font-bold ${
                                                                isCrit 
                                                                    ? 'text-red-400' 
                                                                    : isWarn 
                                                                        ? 'text-amber-400' 
                                                                        : 'text-sky-300'
                                                            }`}>
                                                                {r.residual > 0 ? `+${r.residual.toFixed(4)}` : r.residual.toFixed(4)}
                                                            </td>
                                                            <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400">
                                                                {relError}%
                                                            </td>
                                                            <td className="px-4 py-2.5 text-center">
                                                                {isCrit ? (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                                                                        <AlertCircle className="w-3 h-3" /> Crítico (&gt;3×SEC)
                                                                    </span>
                                                                ) : isWarn ? (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                                                        <AlertTriangle className="w-3 h-3" /> Advertencia (&gt;2×SEC)
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                                        <Check className="w-3 h-3" /> Normal
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={activeTab === 'full-data' ? 'block' : 'hidden'}>
                    <div className="flex flex-col gap-6 animate-fade-in">
                        {/* 1. Tarjeta Destacada: FOSS (.EQA) */}
                        <div className="bg-gradient-to-br from-ui-card via-ui-card to-sky-950/30 rounded-xl border border-sky-500/40 p-6 shadow-lg shadow-sky-950/20 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                                        <Cpu className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="text-base font-bold text-white tracking-tight">
                                                Ecuación de Calibración FOSS (.EQA)
                                            </h3>
                                            <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
                                                FOSS & WinISI
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                                            Formato estructurado de ecuación estándar para ser importado directamente en instrumentos 
                                            <strong className="text-white"> FOSS Infratec 1241 / Nova, NIRS DS2500, ProFoss</strong> y suites de software 
                                            <strong className="text-white"> WinISI II/III/4, ISIscan y FossManager</strong>.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setShowEqaPreview(!showEqaPreview)}
                                        className="text-xs flex items-center gap-1.5 border-slate-600 hover:border-slate-400"
                                    >
                                        <FileCode className="w-4 h-4 text-sky-400" />
                                        {showEqaPreview ? 'Ocultar Código' : 'Previsualizar EQA'}
                                        {showEqaPreview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="primary"
                                        size="sm"
                                        onClick={handleDownloadFossEqa}
                                        className="text-xs font-bold flex items-center gap-2 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-600 hover:to-cyan-600 shadow-md text-white"
                                    >
                                        <Download className="w-4 h-4" />
                                        Descargar Ecuación (.EQA)
                                    </Button>
                                </div>
                            </div>

                            {/* Campo de Matriz / Producto y Metadatos Clave */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-ui-border/60">
                                <div className="md:col-span-1">
                                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                                        Matriz / Producto en Equipo
                                    </label>
                                    <input
                                        type="text"
                                        value={fossProductName}
                                        onChange={(e) => setFossProductName(e.target.value)}
                                        placeholder="Ej. Harina, Trigo, Soja..."
                                        className="w-full bg-ui-darkest border border-ui-border rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-400 font-mono"
                                    />
                                </div>

                                <div className="md:col-span-3 flex flex-wrap items-center gap-2">
                                    <span className="px-2.5 py-1 rounded-lg bg-ui-darkest/90 border border-ui-border text-[11px] text-slate-300 font-mono">
                                        Tratamiento WinISI: <strong className="text-sky-300 font-bold">{winisiMath.mathCode}</strong>
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-ui-darkest/90 border border-ui-border text-[11px] text-slate-300 font-mono">
                                        Scatter: <strong className="text-cyan-300 font-bold">{winisiMath.scatter}</strong>
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-ui-darkest/90 border border-ui-border text-[11px] text-slate-300 font-mono">
                                        Rango: <strong className="text-white font-bold">{wavelengths.length > 0 ? wavelengths[0].toFixed(1) : 0} - {wavelengths.length > 0 ? wavelengths[wavelengths.length - 1].toFixed(1) : 0} nm</strong> ({wavelengths.length} pts)
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-ui-darkest/90 border border-ui-border text-[11px] text-slate-300 font-mono">
                                        Factores: <strong className="text-purple-300 font-bold">{results.nComponents} LV</strong>
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-ui-darkest/90 border border-ui-border text-[11px] text-slate-300 font-mono">
                                        B₀: <strong className="text-amber-300 font-bold">{(results.model.plsIntercept ?? results.model.offset ?? 0).toExponential(3)}</strong>
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-ui-darkest/90 border border-ui-border text-[11px] text-slate-300 font-mono">
                                        R²: <strong className="text-emerald-400 font-bold">{isFinite(results.model.r2) ? results.model.r2.toFixed(4) : '0.0000'}</strong>
                                    </span>
                                    <span className="px-2.5 py-1 rounded-lg bg-ui-darkest/90 border border-ui-border text-[11px] text-slate-300 font-mono">
                                        SECV: <strong className="text-sky-300 font-bold">{isFinite(results.model.secv) ? results.model.secv.toFixed(4) : '0.0000'}</strong>
                                    </span>
                                </div>
                            </div>

                            {/* Caja de Previsualización de Código EQA */}
                            {showEqaPreview && (
                                <div className="mt-4 pt-4 border-t border-ui-border/60 animate-fade-in">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                                            <FileCode className="w-4 h-4 text-sky-400" />
                                            <span>Contenido estructurado del archivo .EQA ({wavelengths.length + 42} líneas)</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleCopyEqa}
                                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-ui-darkest border border-ui-border hover:border-slate-500 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer"
                                        >
                                            {eqaCopied ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                    <span className="text-emerald-400 font-semibold">¡Copiado!</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                                                    <span>Copiar Contenido</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className="bg-ui-darkest rounded-xl border border-ui-border p-4 max-h-72 overflow-y-auto font-mono text-[11px] text-slate-300 leading-relaxed shadow-inner">
                                        <pre className="whitespace-pre">{getGeneratedEqaText()}</pre>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* 2. Grid de Otras Opciones de Exportación: JSON, CSV, PDF */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Tarjeta JSON */}
                            <div className="bg-ui-card rounded-xl border border-ui-border p-5 flex flex-col justify-between hover:border-slate-500 transition-colors">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                                            <FileCode className="w-5 h-5" />
                                        </div>
                                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                            Predicción Web
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-sm text-slate-100 mb-1">
                                        Modelo Quimiométrico (JSON)
                                    </h4>
                                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                        Exporta el modelo con coeficientes, matrices latentes y espectro medio para cargar en el módulo de predicción online de la app.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleExportConfig}
                                    className="w-full text-xs font-semibold flex items-center justify-center gap-2 border-slate-600 hover:border-slate-400"
                                >
                                    <Download className="w-4 h-4 text-purple-400" />
                                    Descargar Modelo JSON
                                </Button>
                            </div>

                            {/* Tarjeta CSV */}
                            <div className="bg-ui-card rounded-xl border border-ui-border p-5 flex flex-col justify-between hover:border-slate-500 transition-colors">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                                            <FileSpreadsheet className="w-5 h-5" />
                                        </div>
                                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                            {activeSamples.length} Muestras
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-sm text-slate-100 mb-1">
                                        Dataset Depurado (CSV)
                                    </h4>
                                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                        Exporta la matriz espectral de muestras calibradas sin outliers, junto con los valores analíticos de laboratorio.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={onExportCleanDataset}
                                    className="w-full text-xs font-semibold flex items-center justify-center gap-2 border-slate-600 hover:border-slate-400"
                                >
                                    <Download className="w-4 h-4 text-emerald-400" />
                                    Descargar Dataset (CSV)
                                </Button>
                            </div>

                            {/* Tarjeta PDF */}
                            <div className="bg-ui-card rounded-xl border border-ui-border p-5 flex flex-col justify-between hover:border-slate-500 transition-colors">
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                            Informe Técnico
                                        </span>
                                    </div>
                                    <h4 className="font-bold text-sm text-slate-100 mb-1">
                                        Reporte de Calibración (PDF)
                                    </h4>
                                    <p className="text-xs text-slate-400 leading-relaxed mb-4">
                                        Genera un informe analítico completo con gráficos de correlación, estadísticas de validación y tabla de residuales.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleDownloadPDF}
                                    className="w-full text-xs font-semibold flex items-center justify-center gap-2 border-slate-600 hover:border-slate-400"
                                >
                                    <Download className="w-4 h-4 text-amber-400" />
                                    Descargar Reporte PDF
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default ResultsViewer;
