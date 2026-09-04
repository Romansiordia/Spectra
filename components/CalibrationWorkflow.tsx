import React, { useState } from 'react';
import { 
    Database, 
    Sliders, 
    ScatterChart, 
    Cpu, 
    ArrowRight, 
    CheckCircle2, 
    AlertCircle, 
    FileText, 
    RefreshCw,
    Sparkles,
    ChevronRight,
    TrendingUp
} from 'lucide-react';
import { Sample, PreprocessingStep, ModelResults } from '../types';
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

export type CalibrationTab = 'data' | 'preprocessing' | 'pca' | 'model';

interface CalibrationWorkflowProps {
    wavelengths: number[];
    samples: Sample[];
    analyticalProperty: string;
    preprocessingSteps: PreprocessingStep[];
    modelResults: ModelResults | null;
    processedSpectra: { id: string | number; values: number[] }[] | null;
    onFileSelected: (file: File) => void;
    setPreprocessingSteps: React.Dispatch<React.SetStateAction<PreprocessingStep[]>>;
    onVisualizePreprocessing: () => void;
    onResetVisualization: () => void;
    onToggleSample: (index: number) => void;
    onToggleAllSamples: (active: boolean) => void;
    onUpdateAnalyticalValue: (index: number, value: number) => void;
    onUpdatePropertyName: (name: string) => void;
    onRunModel: (params: ModelParams, samplesOverride?: Sample[]) => Promise<void>;
    onDeactivateOutliers: (outlierIds: (string | number)[]) => void;
    onIncludeAllSamples: () => void;
    onExportCleanDataset: () => void;
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
    onExportCleanDataset
}) => {
    const [activeTab, setActiveTab] = useState<CalibrationTab>('data');

    const activeSamples = samples.filter(s => s.active);
    const inactiveCount = samples.length - activeSamples.length;

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
            if (p.method === 'savgol1') return '1ª Deriv.';
            if (p.method === 'savgol2') return '2ª Deriv.';
            return p.method;
        }).join(' + ')
        : 'Espectros Crudos';

    const pcaSummary = inactiveCount > 0
        ? `${inactiveCount} muestra(s) excluida(s)`
        : activeSamples.length >= 3
            ? 'Listo para diagnóstico'
            : 'Requiere ≥ 3 muestras';

    const modelSummary = modelResults
        ? `R²: ${modelResults.r2?.toFixed(3) || '—'} | SEC: ${modelResults.sec?.toFixed(3) || '—'}`
        : 'No calibrado';

    const spectraToDisplay = processedSpectra ? processedSpectra.map(p => {
        const originalSample = samples.find(s => s.id === p.id);
        return { ...p, color: originalSample?.color || '#000000' };
    }) : activeSamples;

    // Lista de tarjetas del flujo
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
            id: 'model',
            number: 4,
            title: 'Modelo PLS & Resultados',
            subtitle: modelSummary,
            icon: <Cpu className="w-5 h-5" />,
            isComplete: modelResults !== null,
        }
    ];

    return (
        <div className="flex flex-col gap-6 animate-fade-in w-full max-w-7xl mx-auto">
            {/* ========================================================================= */}
            {/* 1. BARRA SUPERIOR DE TARJETAS / PESTAÑAS DE FLUJO                         */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
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
                                        <span className="font-mono font-bold text-white">{wavelengths.length} pts</span>
                                    </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-ui-border flex flex-col gap-2">
                                    <Button
                                        variant="primary"
                                        size="md"
                                        disabled={activeSamples.length < 3}
                                        onClick={() => setActiveTab('preprocessing')}
                                        className="w-full flex items-center justify-center gap-2 font-bold shadow-md"
                                    >
                                        Continuar a Preprocesamiento
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
            {/* PESTAÑA 2: Preprocesamiento Espectral                                     */}
            {/* ------------------------------------------------------------------------- */}
            {activeTab === 'preprocessing' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
                        {/* Lado Izquierdo: Panel de Control de Preprocesamiento */}
                        <div className="lg:col-span-2 flex flex-col gap-4">
                            <PreprocessingEditor
                                steps={preprocessingSteps}
                                setSteps={setPreprocessingSteps}
                                onVisualize={onVisualizePreprocessing}
                                disabled={activeSamples.length === 0}
                            />

                            <Card>
                                <div className="flex items-center gap-2 mb-2 text-ui-accent">
                                    <Sparkles className="w-4 h-4" />
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                                        Recomendación Analítica
                                    </h4>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                    Aplicar <strong className="text-slate-200">SNV</strong> o <strong className="text-slate-200">1ª Derivada Savitzky-Golay</strong> elimina el desplazamiento de la línea base causado por tamaño de partícula y resalta las bandas químicas antes de pasar al PCA.
                                </p>

                                <div className="mt-4 pt-3 border-t border-ui-border flex flex-col gap-2">
                                    <Button
                                        variant="primary"
                                        size="md"
                                        disabled={activeSamples.length < 3}
                                        onClick={() => setActiveTab('pca')}
                                        className="w-full flex items-center justify-center gap-2 font-bold shadow-md"
                                    >
                                        Continuar a Análisis PCA
                                        <ArrowRight className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setActiveTab('data')}
                                        className="w-full text-xs text-slate-400 hover:text-white border-ui-border"
                                    >
                                        ← Volver a Datos & Espectros
                                    </Button>
                                </div>
                            </Card>
                        </div>

                        {/* Lado Derecho: Visor Espectral Comparativo Amplio */}
                        <div className="lg:col-span-5 flex flex-col gap-4">
                            <SpectraViewer
                                wavelengths={wavelengths}
                                samples={spectraToDisplay}
                                isProcessed={!!processedSpectra}
                                onReset={onResetVisualization}
                                analyticalProperty={analyticalProperty}
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
                            onProceedToCalibration={() => setActiveTab('model')}
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
                            ← Volver a Preprocesamiento
                        </Button>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400">
                                {activeSamples.length} muestras activas listas para calibrar
                            </span>
                            <Button
                                variant="primary"
                                size="md"
                                disabled={activeSamples.length < 3}
                                onClick={() => setActiveTab('model')}
                                className="flex items-center gap-2 font-bold shadow-md text-xs"
                            >
                                Continuar a Generación de Modelo PLS
                                <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ------------------------------------------------------------------------- */}
            {/* PESTAÑA 4: Calibración PLS & Resultados Estadísticos                      */}
            {/* ------------------------------------------------------------------------- */}
            {activeTab === 'model' && (
                <div className="flex flex-col gap-6 animate-fade-in">
                    <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
                        {/* Panel Lateral: Generador de Modelo PLS y Optimización */}
                        <div className="lg:col-span-2 flex flex-col gap-4">
                            <ModelGenerator
                                onRunModel={onRunModel}
                                disabled={activeSamples.length < 3}
                                activeSamples={activeSamples}
                                preprocessingSteps={preprocessingSteps}
                            />

                            <Card>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                                    Resumen del Entrenamiento
                                </h4>
                                <div className="space-y-2 text-xs text-slate-400">
                                    <div className="flex justify-between py-1 border-b border-ui-border/50">
                                        <span>Muestras de calibración:</span>
                                        <span className="font-mono font-bold text-white">{activeSamples.length}</span>
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
                                        onClick={() => setActiveTab('pca')}
                                        className="w-full text-xs text-slate-400 hover:text-white border-ui-border"
                                    >
                                        ← Volver a Diagnóstico PCA
                                    </Button>
                                </div>
                            </Card>
                        </div>

                        {/* Panel Central: Visor de Resultados Estadísticos y Gráficos */}
                        <div className="lg:col-span-5 flex flex-col gap-6">
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
