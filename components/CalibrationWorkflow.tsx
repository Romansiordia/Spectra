import React, { useState, useMemo } from 'react';
import { 
    Database, 
    Sliders, 
    ScatterChart, 
    Cpu, 
    ArrowRight, 
    CheckCircle2, 
    AlertCircle, 
    AlertTriangle,
    FileText, 
    RefreshCw,
    ChevronRight,
    TrendingUp,
    Table as TableIcon,
    Eye,
    EyeOff
} from 'lucide-react';
import {
    ScatterChart as RechartsScatterChart,
    Scatter,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    ReferenceLine,
    Legend
} from 'recharts';
import { Sample, PreprocessingStep, ModelResults } from '../types';
import { kennardStoneSplit, runComprehensivePca } from '../services/chemometrics';
import DataUploader from './DataUploader';
import PreprocessingEditor from './PreprocessingEditor';
import SpectraViewer from './SpectraViewer';
import SampleManager from './SampleManager';
import ModelGenerator, { ModelParams } from './ModelGenerator';
import ResultsViewer from './ResultsViewer';
import PcaAnalyzer from './PcaAnalyzer';
import Card from './Card';
import Button from './Button';
import ErrorBoundary from './ErrorBoundary';
import AnalyticalRecommendationCard from './AnalyticalRecommendationCard';

export type CalibrationTab = 'data' | 'preprocessing' | 'pca' | 'kennardstone' | 'model';

interface CalibrationWorkflowProps {
    wavelengths: number[];
    samples: Sample[];
    analyticalProperty: string;
    preprocessingSteps: PreprocessingStep[];
    modelResults: ModelResults | null;
    processedSpectra: { id: string | number; values: number[] }[] | null;
    onFileSelected: (file: File) => void;
    setPreprocessingSteps: React.Dispatch<React.SetStateAction<PreprocessingStep[]>>;
    onVisualizePreprocessing: (stepsOverride?: PreprocessingStep[]) => void;
    onResetVisualization: () => void;
    onToggleSample: (index: number) => void;
    onToggleAllSamples: (active: boolean) => void;
    onUpdateAnalyticalValue: (index: number, value: number) => void;
    onUpdatePropertyName: (name: string) => void;
    onRunModel: (params: ModelParams, samplesOverride?: Sample[]) => Promise<void>;
    onDeactivateOutliers: (outlierIds: (string | number)[]) => void;
    onIncludeAllSamples: () => void;
    onExportCleanDataset: () => void;
    onApplyWavelengthRange?: (startWl: number, endWl: number) => void;
    onResetWavelengthRange?: () => void;
    isRangeTrimmed?: boolean;
    fullWavelengthRange?: { min: number; max: number; count: number };
    useKennardStone: boolean;
    setUseKennardStone: React.Dispatch<React.SetStateAction<boolean>>;
    trainRatio: number;
    setTrainRatio: React.Dispatch<React.SetStateAction<number>>;
}

export const CalibrationWorkflow: React.FC<CalibrationWorkflowProps> = ({
    wavelengths,
    samples,
    analyticalProperty,
    preprocessingSteps,
    modelResults,
    processedSpectra,
    onFileSelected,
    setPreprocessingSteps,
    onVisualizePreprocessing,
    onResetVisualization,
    onToggleSample,
    onToggleAllSamples,
    onUpdateAnalyticalValue,
    onUpdatePropertyName,
    onRunModel,
    onDeactivateOutliers,
    onIncludeAllSamples,
    onExportCleanDataset,
    onApplyWavelengthRange,
    onResetWavelengthRange,
    isRangeTrimmed,
    fullWavelengthRange,
    useKennardStone,
    setUseKennardStone,
    trainRatio,
    setTrainRatio
}) => {
    const [activeTab, setActiveTab] = useState<CalibrationTab>('data');
    const [ksTableFilter, setKsTableFilter] = useState<'all' | 'train' | 'test'>('all');
    const [showKsTable, setShowKsTable] = useState<boolean>(true);

    const activeSamples = useMemo(() => samples.filter(s => s.active), [samples]);
    const inactiveCount = samples.length - activeSamples.length;

    const ksSplit = useMemo(() => {
        if (!useKennardStone || activeSamples.length < 5) {
            return { trainSamples: activeSamples, testSamples: [] };
        }
        return kennardStoneSplit(activeSamples, trainRatio, preprocessingSteps);
    }, [activeSamples, useKennardStone, trainRatio, preprocessingSteps]);

    const trainSamplesCount = ksSplit.trainSamples.length;
    const testSamplesCount = ksSplit.testSamples.length;
    const trainYs = ksSplit.trainSamples.map(s => s.analyticalValue);
    const testYs = ksSplit.testSamples.map(s => s.analyticalValue);
    const trainMinY = trainYs.length > 0 ? Math.min(...trainYs) : 0;
    const trainMaxY = trainYs.length > 0 ? Math.max(...trainYs) : 0;
    const trainMeanY = trainYs.length > 0 ? trainYs.reduce((a, b) => a + b, 0) / trainYs.length : 0;
    const testMinY = testYs.length > 0 ? Math.min(...testYs) : 0;
    const testMaxY = testYs.length > 0 ? Math.max(...testYs) : 0;
    const testMeanY = testYs.length > 0 ? testYs.reduce((a, b) => a + b, 0) / testYs.length : 0;
    const isDomainCovered = testYs.length === 0 || (testMinY >= trainMinY - 1e-9 && testMaxY <= trainMaxY + 1e-9);

    const ksAuditPca = useMemo(() => {
        if (activeSamples.length < 3) {
            return {
                trainPoints: [],
                testPoints: [],
                rows: [],
                varPC1: 0,
                varPC2: 0
            };
        }
        const pca = runComprehensivePca(activeSamples, preprocessingSteps, 2);
        if (!pca) {
            return {
                trainPoints: [],
                testPoints: [],
                rows: [],
                varPC1: 0,
                varPC2: 0
            };
        }
        const testIdSet = new Set(ksSplit.testSamples.map(s => s.id));
        const rows = pca.scores.map(score => {
            const isTest = useKennardStone && testIdSet.has(score.id);
            return {
                id: score.id,
                pc1: Number(score.pc1.toFixed(4)),
                pc2: Number(score.pc2.toFixed(4)),
                analyticalValue: score.analyticalValue ?? 0,
                set: isTest ? ('test' as const) : ('train' as const)
            };
        });
        return {
            trainPoints: rows.filter(r => r.set === 'train'),
            testPoints: rows.filter(r => r.set === 'test'),
            rows,
            varPC1: pca.varianceExplained[0] ?? 0,
            varPC2: pca.varianceExplained[1] ?? 0
        };
    }, [activeSamples, preprocessingSteps, ksSplit, useKennardStone]);

    const filteredKsRows = useMemo(() => {
        if (ksTableFilter === 'train') return ksAuditPca.rows.filter(r => r.set === 'train');
        if (ksTableFilter === 'test') return ksAuditPca.rows.filter(r => r.set === 'test');
        return ksAuditPca.rows;
    }, [ksAuditPca.rows, ksTableFilter]);

    // Calcular el resumen dinámico de cada tarjeta superior
    const dataSummary = samples.length > 0 
        ? `${activeSamples.length} de ${samples.length} activas`
        : 'Sin datos cargados';

    const prepSummary = preprocessingSteps.length > 0
        ? preprocessingSteps.map(p => {
            if (p.method === 'snv') return 'SNV';
            if (p.method === 'msc') return 'MSC';
            if (p.method === 'detrend') return 'Detrend';
            if (p.method === 'savgolsmooth') return 'SG Suav.';
            if (p.method === 'savgol1') return '1ª Deriv. SG';
            if (p.method === 'savgol2') return '2ª Deriv. SG';
            if (p.method === 'winisi2441') return '2,4,4,1';
            if (p.method === 'winisi1441') return '1,4,4,1';
            if (p.method === 'winisi1881') return '1,8,8,1';
            if (p.method === 'winisi2861') return '2,8,6,1';
            if (p.method === 'winisi_custom') {
                const d = p.params?.derivative ?? 2;
                const g = p.params?.gap ?? 4;
                const s1 = p.params?.smooth1 ?? 4;
                const s2 = p.params?.smooth2 ?? 1;
                return `${d},${g},${s1},${s2}`;
            }
            return p.method;
        }).join(' + ')
        : 'Espectros Crudos';

    const pcaSummary = inactiveCount > 0
        ? `${inactiveCount} muestra(s) excluida(s)`
        : activeSamples.length >= 3
            ? 'Listo para diagnóstico'
            : 'Requiere ≥ 3 muestras';

    const ksSummary = useKennardStone
        ? `${trainSamplesCount} Cal / ${testSamplesCount} Val (${(trainRatio * 100).toFixed(0)}%)`
        : 'Desactivada (100% Cal)';

    const modelSummary = modelResults
        ? modelResults.model?.testSet
            ? `R²: ${modelResults.model.r2.toFixed(3)} | R²v: ${modelResults.model.testSet.r2.toFixed(3)}`
            : `R²: ${modelResults.model?.r2?.toFixed(3) || '—'} | SEC: ${modelResults.model?.sec?.toFixed(3) || '—'}`
        : 'No calibrado';

    const spectraToDisplay = processedSpectra ? processedSpectra.map(p => {
        const originalSample = samples.find(s => s.id === p.id);
        return { ...p, color: originalSample?.color || '#000000' };
    }) : activeSamples;

    const handleApplyRecommendation = (recommendedSteps: PreprocessingStep[]) => {
        setPreprocessingSteps(recommendedSteps);
        onVisualizePreprocessing(recommendedSteps);
    };

    // Lista de tarjetas del flujo de calibración (5 pasos)
    const flowTabs: {
        id: CalibrationTab;
        number: number;
        title: string;
        subtitle: string;
        icon: React.ReactNode;
        isComplete: boolean;
        hasWarning?: boolean;
    }[] = [
        {
            id: 'data',
            number: 1,
            title: 'Datos & Espectros',
            subtitle: dataSummary,
            icon: <Database className="w-5 h-5" />,
            isComplete: activeSamples.length >= 3,
            hasWarning: samples.length > 0 && activeSamples.length < 3
        },
        {
            id: 'preprocessing',
            number: 2,
            title: 'Preprocesamiento',
            subtitle: prepSummary,
            icon: <Sliders className="w-5 h-5" />,
            isComplete: preprocessingSteps.length > 0,
        },
        {
            id: 'pca',
            number: 3,
            title: 'Análisis PCA & Outliers',
            subtitle: pcaSummary,
            icon: <ScatterChart className="w-5 h-5" />,
            isComplete: inactiveCount > 0,
            hasWarning: activeSamples.length < 3
        },
        {
            id: 'kennardstone',
            number: 4,
            title: 'División Kennard-Stone',
            subtitle: ksSummary,
            icon: <TrendingUp className="w-5 h-5" />,
            isComplete: useKennardStone,
        },
        {
            id: 'model',
            number: 5,
            title: 'Modelo PLS & Resultados',
            subtitle: modelSummary,
            icon: <Cpu className="w-5 h-5" />,
            isComplete: modelResults !== null,
        }
    ];

    return (
        <div className="flex flex-col gap-6 animate-fade-in w-full max-w-[1440px] mx-auto">
            {/* ========================================================================= */}
            {/* 1. BARRA SUPERIOR DE TARJETAS / PESTAÑAS DE FLUJO                         */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
                {flowTabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`group relative text-left p-4 rounded-xl border transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden shadow-sm ${
                                isActive
                                    ? 'bg-ui-card border-ui-accent ring-1 ring-ui-accent/50 shadow-lg shadow-ui-accent/10'
                                    : 'bg-ui-dark/80 hover:bg-ui-card/90 border-ui-border hover:border-slate-600'
                            }`}
                        >
                            {/* Borde superior activo */}
                            {isActive && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-ui-accent via-sky-400 to-cyan-300" />
                            )}

                            <div className="flex items-start justify-between w-full mb-2">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition-colors ${
                                            isActive
                                                ? 'bg-ui-accent text-ui-darkest font-black shadow-md'
                                                : tab.isComplete
                                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                    : 'bg-ui-darkest text-slate-400 border border-ui-border'
                                        }`}
                                    >
                                        {tab.number}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className={`text-sm font-bold tracking-tight ${isActive ? 'text-slate-100' : 'text-slate-300 group-hover:text-white'}`}>
                                            {tab.title}
                                        </span>
                                    </div>
                                </div>

                                <div className={`p-1.5 rounded-lg ${isActive ? 'text-ui-accent bg-ui-accent/10' : 'text-slate-400'}`}>
                                    {tab.icon}
                                </div>
                            </div>

                            {/* Subtítulo dinámico con badge de estado */}
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-ui-border/60 text-xs w-full">
                                <span 
                                    className={`font-mono text-[11px] truncate max-w-[190px] ${
                                        isActive ? 'text-ui-accent font-semibold' : 'text-slate-400'
                                    }`}
                                    title={tab.subtitle}
                                >
                                    {tab.subtitle}
                                </span>

                                {tab.isComplete ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                        <CheckCircle2 className="w-3 h-3" /> Listo
                                    </span>
                                ) : (
                                    <span className="text-[10px] font-medium text-slate-500 flex items-center gap-0.5">
                                        Paso {tab.number} <ChevronRight className="w-3 h-3 opacity-60" />
                                    </span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* ========================================================================= */}
            {/* 2. CONTENIDO DESPEJADO AL 100% PARA CADA PESTAÑA                          */}
            {/* ========================================================================= */}

            {/* ------------------------------------------------------------------------- */}
            {/* PESTAÑA 1: Carga & Exploración Espectral                                  */}
            {/* ------------------------------------------------------------------------- */}
            {activeTab === 'data' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                    {/* Zona Superior: Selector / Carga de archivos */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 flex flex-col gap-4">
                            <DataUploader onFileSelected={onFileSelected} />

                            <Card>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                                        Estado del Lote Espectral
                                    </h4>
                                    <span className="px-2 py-0.5 rounded bg-ui-darkest border border-ui-border text-[11px] font-mono text-ui-accent">
                                        {analyticalProperty}
                                    </span>
                                </div>
                                <div className="space-y-2 text-xs text-slate-300">
                                    <div className="flex justify-between py-1 border-b border-ui-border/50">
                                        <span className="text-slate-400">Muestras Totales:</span>
                                        <span className="font-mono font-bold text-white">{samples.length}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-ui-border/50">
                                        <span className="text-slate-400">Muestras Activas:</span>
                                        <span className="font-mono font-bold text-emerald-400">{activeSamples.length}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-ui-border/50">
                                        <span className="text-slate-400">Muestras Inactivas:</span>
                                        <span className="font-mono font-bold text-rose-400">{inactiveCount}</span>
                                    </div>
                                    <div className="flex justify-between py-1">
                                        <span className="text-slate-400">Puntos Espectrales (λ):</span>
                                        <div className="flex flex-col items-end">
                                            <span className={`font-mono font-bold ${isRangeTrimmed ? 'text-amber-400' : 'text-white'}`}>
                                                {wavelengths.length} pts
                                            </span>
                                            {wavelengths.length > 0 && (
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                    {wavelengths[0].toFixed(1)} - {wavelengths[wavelengths.length - 1].toFixed(1)} nm
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {isRangeTrimmed && (
                                        <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-300 flex items-center justify-between">
                                            <span>Recorte espectral activo (sin ruido exterior)</span>
                                            {onResetWavelengthRange && (
                                                <button
                                                    onClick={onResetWavelengthRange}
                                                    className="underline hover:text-white ml-2 font-semibold"
                                                >
                                                    Restablecer
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 pt-3 border-t border-ui-border flex flex-col gap-2">
                                    <Button
                                        variant="primary"
                                        size="md"
                                        disabled={activeSamples.length < 3}
                                        onClick={() => setActiveTab('preprocessing')}
                                        className="w-full flex items-center justify-center gap-2 font-bold shadow-md cursor-pointer"
                                    >
                                        Continuar a Preprocesamiento (Paso 2)
                                        <ArrowRight className="w-4 h-4" />
                                    </Button>
                                    {activeSamples.length < 3 && (
                                        <p className="text-[11px] text-amber-400/90 text-center">
                                            Cargue al menos 3 muestras para avanzar en la calibración.
                                        </p>
                                    )}
                                </div>
                            </Card>
                        </div>

                        {/* Zona Central: Visor Espectral en Pantalla Ancha */}
                        <div className="lg:col-span-2">
                            <SpectraViewer
                                wavelengths={wavelengths}
                                samples={activeSamples}
                                isProcessed={false}
                                onReset={onResetVisualization}
                                analyticalProperty={analyticalProperty}
                                onApplyWavelengthRange={onApplyWavelengthRange}
                                onResetWavelengthRange={onResetWavelengthRange}
                                isRangeTrimmed={isRangeTrimmed}
                                fullWavelengthRange={fullWavelengthRange}
                            />
                        </div>
                    </div>

                    {/* Zona Inferior: Tabla y Gestor de Muestras */}
                    <div>
                        <SampleManager
                            samples={samples}
                            onToggle={onToggleSample}
                            onToggleAll={onToggleAllSamples}
                            analyticalProperty={analyticalProperty}
                            onUpdateAnalyticalValue={onUpdateAnalyticalValue}
                            onUpdatePropertyName={onUpdatePropertyName}
                        />
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------------------- */}
            {/* PESTAÑA 2: Preprocesamiento Espectral (Inspección & Ajuste Fino)          */}
            {/* ------------------------------------------------------------------------- */}
            {activeTab === 'preprocessing' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Lado Izquierdo: Panel de Control de Preprocesamiento & 3 Combinaciones Óptimas */}
                        <div className="lg:col-span-5 flex flex-col gap-4">
                            <PreprocessingEditor
                                steps={preprocessingSteps}
                                setSteps={setPreprocessingSteps}
                                onVisualize={onVisualizePreprocessing}
                                disabled={activeSamples.length === 0}
                            />

                            <AnalyticalRecommendationCard
                                wavelengths={wavelengths}
                                samples={samples}
                                currentSteps={preprocessingSteps}
                                onApplyRecommendation={handleApplyRecommendation}
                                onContinueToPca={() => setActiveTab('pca')}
                                onBackToData={() => setActiveTab('data')}
                                disabled={activeSamples.length === 0}
                            />
                        </div>

                        {/* Lado Derecho: Visor Espectral Comparativo Amplio */}
                        <div className="lg:col-span-7 flex flex-col gap-4">
                            <SpectraViewer
                                wavelengths={wavelengths}
                                samples={spectraToDisplay}
                                isProcessed={!!processedSpectra}
                                onReset={onResetVisualization}
                                analyticalProperty={analyticalProperty}
                                onApplyWavelengthRange={onApplyWavelengthRange}
                                onResetWavelengthRange={onResetWavelengthRange}
                                isRangeTrimmed={isRangeTrimmed}
                                fullWavelengthRange={fullWavelengthRange}
                                preprocessingSummary={prepSummary}
                                canToggleProcessed={preprocessingSteps.length > 0}
                                onToggleProcessed={() => {
                                    if (processedSpectra) {
                                        onResetVisualization();
                                    } else {
                                        onVisualizePreprocessing();
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------------------- */}
            {/* PESTAÑA 3: Diagnóstico PCA & Detección de Outliers                         */}
            {/* ------------------------------------------------------------------------- */}
            {activeTab === 'pca' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                    <ErrorBoundary fallbackTitle="Error al inicializar el Módulo de Análisis PCA y Outliers.">
                        <PcaAnalyzer
                            samples={samples}
                            preprocessingSteps={preprocessingSteps}
                            onToggleSample={onToggleSample}
                            onExcludeOutliers={onDeactivateOutliers}
                            onIncludeAll={onIncludeAllSamples}
                            onProceedToCalibration={() => setActiveTab('kennardstone')}
                            analyticalProperty={analyticalProperty}
                        />
                    </ErrorBoundary>

                    {/* Botones de navegación al pie de PCA */}
                    <div className="flex items-center justify-between p-4 bg-ui-card border border-ui-border rounded-xl">
                        <Button
                            variant="secondary"
                            size="md"
                            onClick={() => setActiveTab('preprocessing')}
                            className="text-xs font-semibold"
                        >
                            ← Volver a Preprocesamiento (Paso 2)
                        </Button>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400">
                                {activeSamples.length} muestras activas listas para calibrar
                            </span>
                            <Button
                                variant="primary"
                                size="md"
                                disabled={activeSamples.length < 3}
                                onClick={() => setActiveTab('kennardstone')}
                                className="flex items-center gap-2 font-bold shadow-md text-xs"
                            >
                                Continuar a División Kennard-Stone (Paso 4)
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------------------- */}
            {/* PESTAÑA 4: División Kennard-Stone (Calibración vs Validación Externa)     */}
            {/* ------------------------------------------------------------------------- */}
            {activeTab === 'kennardstone' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                    <Card>
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-ui-border pb-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                    <ScatterChart className="h-5 w-5 text-ui-accent" />
                                    División de Datos (Algoritmo Kennard-Stone)
                                </h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                                    Selecciona de manera determinista y uniforme el conjunto de entrenamiento y el conjunto de prueba (validación externa ciega) cubriendo todo el espacio espectral sin huecos.
                                </p>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-ui-darkest border border-ui-border cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={useKennardStone}
                                        onChange={(e) => setUseKennardStone(e.target.checked)}
                                        className="rounded border-ui-border text-ui-accent focus:ring-ui-accent bg-ui-card w-4 h-4 cursor-pointer"
                                    />
                                    <span className="text-xs font-bold text-slate-200">
                                        Activar Validación Externa Kennard-Stone
                                    </span>
                                </label>
                            </div>
                        </div>

                        {useKennardStone ? (
                            activeSamples.length < 5 ? (
                                <div className="p-6 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                                    <div>
                                        <strong className="text-white block mb-0.5">Muestras insuficientes para división Kennard-Stone</strong>
                                        Se requieren al menos <strong>5 muestras activas</strong> para separar un conjunto de calibración y validación externa de manera estable (actualmente hay {activeSamples.length}).
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Configuración de Porcentaje */}
                                        <div className="bg-ui-darkest p-4 rounded-xl border border-ui-border flex flex-col justify-between">
                                            <div>
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                                                    Proporción del Lote
                                                </h4>
                                                <div className="flex justify-between text-xs mb-2 font-mono">
                                                    <span className="text-slate-400">Entrenamiento (Cal):</span>
                                                    <span className="text-ui-accent font-bold text-sm">{(trainRatio * 100).toFixed(0)}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0.5"
                                                    max="0.9"
                                                    step="0.05"
                                                    value={trainRatio}
                                                    onChange={(e) => setTrainRatio(parseFloat(e.target.value) || 0.75)}
                                                    className="w-full accent-ui-accent cursor-pointer mb-2"
                                                />
                                                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                                                    <span>50%</span>
                                                    <span>75%</span>
                                                    <span>90%</span>
                                                </div>
                                            </div>
                                            <div className="mt-4 pt-3 border-t border-ui-border/60 text-[11px] text-slate-400 flex justify-between">
                                                <span>Validación Ciega:</span>
                                                <strong className="text-amber-300 font-mono">{(100 - trainRatio * 100).toFixed(0)}%</strong>
                                            </div>
                                        </div>

                                        {/* Estadísticas Calculadas */}
                                        <div className="bg-ui-darkest p-4 rounded-xl border border-ui-border md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="p-3.5 bg-ui-card rounded-lg border border-sky-500/30 flex flex-col justify-center">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400">Set de Entrenamiento (Cal)</span>
                                                    <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
                                                </div>
                                                <div className="text-3xl font-black text-sky-400 font-mono">
                                                    {trainSamplesCount} <span className="text-xs font-normal text-slate-400">muestras</span>
                                                </div>
                                                <div className="text-[11px] text-slate-300 mt-1.5 font-mono">
                                                    Rango Y: {trainMinY.toFixed(2)} — {trainMaxY.toFixed(2)}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-mono">
                                                    Media Y: {trainMeanY.toFixed(2)}
                                                </div>
                                            </div>
                                            <div className="p-3.5 bg-ui-card rounded-lg border border-amber-500/30 flex flex-col justify-center">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] uppercase font-bold text-slate-400">Set de Validación Externa</span>
                                                    <span className="w-2.5 h-2.5 bg-amber-400 inline-block transform rotate-45" />
                                                </div>
                                                <div className="text-3xl font-black text-amber-400 font-mono">
                                                    {testSamplesCount} <span className="text-xs font-normal text-slate-400">muestras</span>
                                                </div>
                                                <div className="text-[11px] text-slate-300 mt-1.5 font-mono">
                                                    Rango Y: {testMinY.toFixed(2)} — {testMaxY.toFixed(2)}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-mono">
                                                    Media Y: {testMeanY.toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gráfico PCA de Auditoría Espacial (Calibración vs Validación Externa) */}
                                    <div className="bg-ui-darkest p-4 sm:p-5 rounded-xl border border-ui-border">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 border-b border-ui-border/60 pb-3">
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                                    <ScatterChart className="w-4 h-4 text-ui-accent" />
                                                    Mapa PCA del Espacio Espectral (PC1 vs PC2)
                                                </h4>
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    Auditoría visual de cobertura: las muestras de calibración (azul) deben envolver el dominio químico mientras las de validación externa (ámbar) evalúan la interpolación sin sesgo.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 shrink-0">
                                                <span>PC1: <strong className="text-slate-200">{ksAuditPca.varPC1.toFixed(1)}%</strong></span>
                                                <span>PC2: <strong className="text-slate-200">{ksAuditPca.varPC2.toFixed(1)}%</strong></span>
                                            </div>
                                        </div>

                                        <div className="h-[340px] w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <RechartsScatterChart margin={{ top: 15, right: 20, bottom: 20, left: 10 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                                    <XAxis
                                                        type="number"
                                                        dataKey="pc1"
                                                        name="PC1"
                                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                                        stroke="#334155"
                                                        label={{ value: `PC1 (${ksAuditPca.varPC1.toFixed(1)}%)`, position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 11 }}
                                                    />
                                                    <YAxis
                                                        type="number"
                                                        dataKey="pc2"
                                                        name="PC2"
                                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                                        stroke="#334155"
                                                        label={{ value: `PC2 (${ksAuditPca.varPC2.toFixed(1)}%)`, angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 11 }}
                                                    />
                                                    <ReferenceLine x={0} stroke="#475569" strokeDasharray="4 4" />
                                                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
                                                    <RechartsTooltip
                                                        cursor={{ strokeDasharray: '3 3', stroke: '#64748b' }}
                                                        content={({ active, payload }) => {
                                                            if (!active || !payload || payload.length === 0) return null;
                                                            const pt = payload[0].payload;
                                                            return (
                                                                <div className="bg-slate-900/95 border border-slate-700 rounded-lg p-3 shadow-xl text-xs space-y-1">
                                                                    <div className="font-bold text-slate-100 border-b border-slate-700 pb-1">
                                                                        Muestra: {pt.id}
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-4">
                                                                        <span className="text-slate-400">Conjunto:</span>
                                                                        <span className={`font-bold ${pt.set === 'test' ? 'text-amber-400' : 'text-sky-400'}`}>
                                                                            {pt.set === 'test' ? 'Validación Externa' : 'Calibración (Train)'}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-4">
                                                                        <span className="text-slate-400">{analyticalProperty}:</span>
                                                                        <span className="font-mono text-slate-200">{Number(pt.analyticalValue).toFixed(3)}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between gap-4 font-mono text-[11px] text-slate-400 pt-0.5">
                                                                        <span>PC1: {pt.pc1}</span>
                                                                        <span>PC2: {pt.pc2}</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }}
                                                    />
                                                    <Legend
                                                        verticalAlign="top"
                                                        height={30}
                                                        formatter={(value) => <span className="text-xs text-slate-300 font-medium">{value}</span>}
                                                    />
                                                    <Scatter
                                                        name={`Calibración / Entrenamiento (${ksAuditPca.trainPoints.length})`}
                                                        data={ksAuditPca.trainPoints}
                                                        fill="#0ea5e9"
                                                        fillOpacity={0.85}
                                                        stroke="#38bdf8"
                                                        strokeWidth={1}
                                                    />
                                                    <Scatter
                                                        name={`Validación Externa Ciega (${ksAuditPca.testPoints.length})`}
                                                        data={ksAuditPca.testPoints}
                                                        fill="#f59e0b"
                                                        fillOpacity={0.95}
                                                        stroke="#fef3c7"
                                                        strokeWidth={1.5}
                                                        shape="diamond"
                                                    />
                                                </RechartsScatterChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Banner de Auditoría de Dominio Químico */}
                                    {isDomainCovered ? (
                                        <div className="p-4 bg-sky-950/20 border border-sky-500/30 rounded-xl text-xs text-sky-200 flex items-start gap-3">
                                            <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
                                            <div>
                                                <strong className="text-white block mb-0.5">Auditoría de Dominio Químico Conforme:</strong>
                                                El conjunto de entrenamiento cubre los extremos de {analyticalProperty} ({trainMinY.toFixed(2)} – {trainMaxY.toFixed(2)}), asegurando que todas las muestras de validación externa ({testMinY.toFixed(2)} – {testMaxY.toFixed(2)}) se evalúen dentro del dominio calibrado sin extrapolación ciega.
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-3">
                                            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                                            <div>
                                                <strong className="text-white block mb-0.5">Aviso de Extremo Analítico en Validación:</strong>
                                                Kennard-Stone divide por distancia espectral pura; alguna muestra de validación externa ({testMinY.toFixed(2)} – {testMaxY.toFixed(2)}) queda ligeramente fuera del rango químico de entrenamiento ({trainMinY.toFixed(2)} – {trainMaxY.toFixed(2)}). Revisa esas muestras en la tabla inferior o ajusta la proporción.
                                            </div>
                                        </div>
                                    )}

                                    {/* Tabla de Inspección de Asignación de Muestras */}
                                    <div className="bg-ui-darkest rounded-xl border border-ui-border overflow-hidden">
                                        <div className="p-3.5 bg-ui-card/60 border-b border-ui-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <TableIcon className="w-4 h-4 text-ui-accent" />
                                                <h4 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                                                    Asignación de Muestras ({filteredKsRows.length})
                                                </h4>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1 bg-ui-darkest p-1 rounded-lg border border-ui-border text-xs">
                                                    <button
                                                        type="button"
                                                        onClick={() => setKsTableFilter('all')}
                                                        className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${ksTableFilter === 'all' ? 'bg-ui-accent text-white' : 'text-slate-400 hover:text-slate-200'}`}
                                                    >
                                                        Todas ({ksAuditPca.rows.length})
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setKsTableFilter('train')}
                                                        className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${ksTableFilter === 'train' ? 'bg-sky-500/20 text-sky-300 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                                                    >
                                                        Calibración ({ksAuditPca.trainPoints.length})
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setKsTableFilter('test')}
                                                        className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer ${ksTableFilter === 'test' ? 'bg-amber-500/20 text-amber-300 font-bold' : 'text-slate-400 hover:text-slate-200'}`}
                                                    >
                                                        Validación ({ksAuditPca.testPoints.length})
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowKsTable(prev => !prev)}
                                                    className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg border border-ui-border bg-ui-darkest cursor-pointer"
                                                    title={showKsTable ? 'Ocultar tabla' : 'Mostrar tabla'}
                                                >
                                                    {showKsTable ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>

                                        {showKsTable && (
                                            <div className="max-h-60 overflow-y-auto">
                                                <table className="w-full text-xs text-left text-slate-200">
                                                    <thead className="bg-ui-dark text-slate-400 uppercase text-[10px] sticky top-0 border-b border-ui-border">
                                                        <tr>
                                                            <th className="px-4 py-2.5 font-semibold">ID Muestra</th>
                                                            <th className="px-4 py-2.5 font-semibold">Conjunto Asignado</th>
                                                            <th className="px-4 py-2.5 text-right font-semibold">{analyticalProperty}</th>
                                                            <th className="px-4 py-2.5 text-right font-semibold">PC1</th>
                                                            <th className="px-4 py-2.5 text-right font-semibold">PC2</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-ui-border/40">
                                                        {filteredKsRows.map(row => (
                                                            <tr key={row.id} className="hover:bg-ui-card/40 transition-colors">
                                                                <td className="px-4 py-2 font-medium text-slate-100">{row.id}</td>
                                                                <td className="px-4 py-2">
                                                                    {row.set === 'test' ? (
                                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold text-[11px]">
                                                                            Validación Externa
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-semibold text-[11px]">
                                                                            Calibración (Train)
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-2 text-right font-mono text-slate-300">{row.analyticalValue.toFixed(3)}</td>
                                                                <td className="px-4 py-2 text-right font-mono text-slate-400">{row.pc1.toFixed(3)}</td>
                                                                <td className="px-4 py-2 text-right font-mono text-slate-400">{row.pc2.toFixed(3)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="p-8 text-center bg-ui-darkest rounded-xl border border-ui-border text-slate-400">
                                <p className="text-sm font-semibold text-slate-200 mb-1">La división Kennard-Stone está desactivada</p>
                                <p className="text-xs text-slate-400 max-w-md mx-auto">
                                    Activa la casilla superior si deseas separar un conjunto de validación ciega independiente. Actualmente se utilizará el 100% de las muestras activas ({activeSamples.length}) para calibración con validación cruzada.
                                </p>
                            </div>
                        )}
                    </Card>

                    {/* Botones de navegación al pie de Kennard-Stone */}
                    <div className="flex items-center justify-between p-4 bg-ui-card border border-ui-border rounded-xl">
                        <Button
                            variant="secondary"
                            size="md"
                            onClick={() => setActiveTab('pca')}
                            className="text-xs font-semibold"
                        >
                            ← Volver a PCA & Outliers (Paso 3)
                        </Button>
                        <Button
                            variant="primary"
                            size="md"
                            disabled={activeSamples.length < 5 && useKennardStone}
                            onClick={() => setActiveTab('model')}
                            className="flex items-center gap-2 font-bold shadow-md text-xs"
                        >
                            Continuar a Modelo PLS (Paso 5)
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------------------- */}
            {/* PESTAÑA 5: Calibración PLS & Resultados Estadísticos                      */}
            {/* ------------------------------------------------------------------------- */}
            {activeTab === 'model' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                        {/* Panel Lateral: Generador de Modelo PLS y Optimización */}
                        <div className="lg:col-span-4 xl:col-span-3 flex flex-col gap-4">
                            <ModelGenerator
                                onRunModel={onRunModel}
                                disabled={activeSamples.length < 3 || (useKennardStone && ksSplit.trainSamples.length < 3)}
                                activeSamples={useKennardStone && activeSamples.length >= 5 ? ksSplit.trainSamples : activeSamples}
                                preprocessingSteps={preprocessingSteps}
                                useKennardStone={useKennardStone}
                                trainRatio={trainRatio}
                            />

                            <Card>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                    Resumen del Entrenamiento
                                </h4>
                                <div className="space-y-2 text-xs text-slate-400">
                                    <div className="flex justify-between py-1 border-b border-ui-border/50">
                                        <span>Muestras de entrenamiento:</span>
                                        <span className="font-mono font-bold text-white">
                                            {useKennardStone && activeSamples.length >= 5 ? ksSplit.trainSamples.length : activeSamples.length}
                                        </span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-ui-border/50">
                                        <span>Validación externa (KS):</span>
                                        <span className={`font-mono font-bold ${useKennardStone && ksSplit.testSamples.length > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                            {useKennardStone && ksSplit.testSamples.length > 0
                                                ? `${ksSplit.testSamples.length} (${(100 - trainRatio * 100).toFixed(0)}%)`
                                                : 'Desactivada'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-ui-border/50">
                                        <span>Outliers descartados:</span>
                                        <span className="font-mono font-bold text-rose-400">{inactiveCount}</span>
                                    </div>
                                    <div className="flex justify-between py-1 border-b border-ui-border/50">
                                        <span>Preprocesamiento:</span>
                                        <span className="font-mono text-ui-accent truncate max-w-[130px]" title={prepSummary}>
                                            {prepSummary}
                                        </span>
                                    </div>
                                    <div className="flex justify-between py-1">
                                        <span>Propiedad:</span>
                                        <span className="font-mono text-slate-200">{analyticalProperty}</span>
                                    </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-ui-border flex flex-col gap-2">
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setActiveTab('kennardstone')}
                                        className="w-full text-xs text-slate-400 hover:text-white border-ui-border"
                                    >
                                        ← Volver a Kennard-Stone (Paso 4)
                                    </Button>
                                </div>
                            </Card>
                        </div>

                        {/* Panel Central: Visor de Resultados Estadísticos y Gráficos */}
                        <div className="lg:col-span-8 xl:col-span-9 flex flex-col gap-6">
                            {modelResults ? (
                                <ErrorBoundary fallbackTitle="Error al renderizar los resultados de calibración.">
                                    <ResultsViewer
                                        results={modelResults}
                                        propertyName={analyticalProperty}
                                        preprocessingSteps={preprocessingSteps}
                                        activeSamples={activeSamples.map(s => s.id)}
                                        activeSamplesData={activeSamples}
                                        onDeactivateOutliers={onDeactivateOutliers}
                                        wavelengths={wavelengths}
                                        onExportCleanDataset={onExportCleanDataset}
                                        isRangeTrimmed={isRangeTrimmed}
                                        fullWavelengthRange={fullWavelengthRange}
                                    />
                                </ErrorBoundary>
                            ) : (
                                <Card>
                                    <div className="flex flex-col items-center justify-center py-16 px-6 text-slate-400 bg-ui-dark rounded-xl border-2 border-dashed border-ui-border text-center">
                                        <div className="w-16 h-16 rounded-full bg-ui-darkest/80 border border-ui-border flex items-center justify-center text-ui-accent mb-4">
                                            <Cpu className="w-8 h-8 opacity-70" />
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-200 mb-1">
                                            Listo para Calibrar el Modelo PLS
                                        </h3>
                                        <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                                            Seleccione las Variables Latentes (LVs) en el panel izquierdo o presione 
                                            <strong className="text-ui-accent"> "Optimizar LVs"</strong> para ejecutar la validación cruzada automática con el lote depurado.
                                        </p>
                                        <div className="flex items-center gap-2 text-xs text-slate-500">
                                            <span>Muestras activas: {activeSamples.length}</span>
                                            <span>•</span>
                                            <span>Pretratamiento: {prepSummary}</span>
                                        </div>
                                    </div>
                                </Card>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalibrationWorkflow;
