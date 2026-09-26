import React, { useState, useMemo } from 'react';
import { 
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, ReferenceLine, Cell, BarChart, Bar, LabelList
} from 'recharts';
import { 
    Activity, AlertTriangle, CheckCircle2, XCircle, Filter, 
    Trash2, RotateCcw, ShieldAlert, Sparkles, SlidersHorizontal, 
    Info, Eye, Layers, Compass, HelpCircle, Target, ArrowRight, ShieldCheck
} from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { Sample, PreprocessingStep, PcaAnalysisModel, PcaScorePoint, RobpcaSampleType } from '../types';
import { runComprehensivePca } from '../services/chemometrics';

interface PcaAnalyzerProps {
    samples: Sample[];
    preprocessingSteps: PreprocessingStep[];
    onToggleSample: (index: number) => void;
    onExcludeOutliers: (outlierIds: (string | number)[]) => void;
    onIncludeAll: () => void;
    onProceedToCalibration?: () => void;
    analyticalProperty?: string;
}

export type PcaChartTab = 'scores' | 'robpca' | 'lof' | 'influence' | 'variance';

const PcaAnalyzer: React.FC<PcaAnalyzerProps> = ({
    samples,
    preprocessingSteps,
    onToggleSample,
    onExcludeOutliers,
    onIncludeAll,
    onProceedToCalibration,
    analyticalProperty = 'Propiedad'
}) => {
    const [selectedPCX, setSelectedPCX] = useState<number>(1);
    const [selectedPCY, setSelectedPCY] = useState<number>(2);
    const [activeTab, setActiveTab] = useState<PcaChartTab>('scores');
    const [selectedPoint, setSelectedPoint] = useState<PcaScorePoint | null>(null);
    const [outlierFilterTab, setOutlierFilterTab] = useState<'all' | 'robpca_critical' | 'lof' | 'good_leverage'>('all');

    // Calcular modelo de PCA con ROBPCA y LOF en tiempo real
    const pcaModel: PcaAnalysisModel | null = useMemo(() => {
        if (samples.length < 3) return null;
        return runComprehensivePca(samples, preprocessingSteps, 3);
    }, [samples, preprocessingSteps]);

    // 1. Datos para el gráfico de dispersión de Scores 2D clásico
    const scoresChartData = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.map(s => {
            const xVal = selectedPCX === 1 ? s.pc1 : (selectedPCX === 2 ? s.pc2 : (s.pc3 || 0));
            const yVal = selectedPCY === 1 ? s.pc1 : (selectedPCY === 2 ? s.pc2 : (selectedPCY === 3 ? (s.pc3 || 0) : s.pc2));
            
            // Asignación de color según ROBPCA y LOF
            let color = '#10b981'; // Regular (conforme)
            if (!s.active) {
                color = '#64748b'; // Inactiva
            } else if (s.robpcaType === 'bad_leverage' || (s.isLofOutlier && s.isOutlier)) {
                color = '#f43f5e'; // Crítico / Rojo
            } else if (s.robpcaType === 'orthogonal') {
                color = '#f59e0b'; // Falla física / Naranja
            } else if (s.robpcaType === 'good_leverage') {
                color = '#0284c7'; // Apalancamiento bueno / Azul brillante
            } else if (s.isLofOutlier || s.gh > 2.0) {
                color = '#fbbf24'; // Borde o densidad baja / Amarillo
            }

            return {
                id: s.id,
                x: Number(xVal.toFixed(4)),
                y: Number(yVal.toFixed(4)),
                gh: Number(s.gh.toFixed(2)),
                hotellingT2: Number(s.hotellingT2.toFixed(2)),
                qResidual: Number(s.qResidual.toFixed(4)),
                sd: Number(s.robpcaSD.toFixed(2)),
                od: Number(s.robpcaOD.toFixed(4)),
                robpcaType: s.robpcaType,
                lofScore: Number(s.lofScore.toFixed(2)),
                isOutlier: s.isOutlier,
                isRobpcaOutlier: s.isRobpcaOutlier,
                isLofOutlier: s.isLofOutlier,
                outlierReason: s.outlierReason,
                active: s.active,
                color,
                analyticalValue: s.analyticalValue
            };
        });
    }, [pcaModel, selectedPCX, selectedPCY]);

    // 2. Datos para el gráfico de diagnóstico ROBPCA (Hubert SD vs OD)
    const robpcaChartData = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.map(s => {
            let color = '#10b981'; // Regular
            if (!s.active) color = '#64748b';
            else if (s.robpcaType === 'good_leverage') color = '#0284c7';
            else if (s.robpcaType === 'orthogonal') color = '#f59e0b';
            else if (s.robpcaType === 'bad_leverage') color = '#f43f5e';

            return {
                id: s.id,
                x: Number(s.robpcaSD.toFixed(2)),
                y: Number(s.robpcaOD.toFixed(4)),
                sd: Number(s.robpcaSD.toFixed(2)),
                od: Number(s.robpcaOD.toFixed(4)),
                robpcaType: s.robpcaType,
                isOutlier: s.isRobpcaOutlier,
                lofScore: Number(s.lofScore.toFixed(2)),
                gh: Number(s.gh.toFixed(2)),
                active: s.active,
                color,
                outlierReason: s.outlierReason,
                analyticalValue: s.analyticalValue
            };
        });
    }, [pcaModel]);

    // 3. Datos para el gráfico de Local Outlier Factor (LOF)
    const lofChartData = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.map((s, idx) => {
            let color = '#10b981';
            if (!s.active) color = '#64748b';
            else if (s.isLofOutlier) color = '#f43f5e';
            else if (s.lofScore > 1.25) color = '#fbbf24';

            return {
                id: s.id,
                index: idx + 1,
                name: String(s.id),
                lofScore: Number(s.lofScore.toFixed(3)),
                threshold: pcaModel.lofThreshold,
                isOutlier: s.isLofOutlier,
                robpcaType: s.robpcaType,
                active: s.active,
                color,
                gh: Number(s.gh.toFixed(2)),
                outlierReason: s.outlierReason
            };
        });
    }, [pcaModel]);

    // 4. Datos para el gráfico de Influencia Clásica (Hotelling T2 vs Q)
    const influenceChartData = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.map(s => ({
            id: s.id,
            x: Number(s.hotellingT2.toFixed(2)),
            y: Number(s.qResidual.toFixed(4)),
            gh: Number(s.gh.toFixed(2)),
            isOutlier: s.isOutlier,
            outlierReason: s.outlierReason,
            active: s.active,
            color: !s.active ? '#64748b' : s.isOutlier ? '#f43f5e' : (s.gh > 2.0 ? '#fbbf24' : '#10b981')
        }));
    }, [pcaModel]);

    // 5. Datos de varianza explicada por cada PC
    const varianceChartData = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.varianceExplained.map((varPct, idx) => ({
            pc: `PC ${idx + 1}`,
            variance: Number(varPct.toFixed(2)),
            cumulative: Number(pcaModel.cumulativeVariance[idx].toFixed(2))
        }));
    }, [pcaModel]);

    // Listas filtradas de anomalías
    const activeOutliers = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.filter(s => s.isOutlier && s.active);
    }, [pcaModel]);

    const robpcaCriticalOutliers = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.filter(s => s.active && (s.robpcaType === 'bad_leverage' || s.robpcaType === 'orthogonal'));
    }, [pcaModel]);

    const lofOutliers = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.filter(s => s.active && s.isLofOutlier);
    }, [pcaModel]);

    const goodLeveragePoints = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.filter(s => s.active && s.robpcaType === 'good_leverage');
    }, [pcaModel]);

    const inactiveCount = samples.filter(s => !s.active).length;

    // ACCIONES DE EXCLUSIÓN
    // 1. Excluir críticos de ROBPCA (Bad leverage + Ortogonal, PROTEGIENDO el buen apalancamiento)
    const handleExcludeRobpcaCritical = () => {
        if (robpcaCriticalOutliers.length === 0) return;
        const ids = robpcaCriticalOutliers.map(s => s.id);
        onExcludeOutliers(ids);
    };

    // 2. Excluir anómalas de LOF
    const handleExcludeLof = () => {
        if (lofOutliers.length === 0) return;
        const ids = lofOutliers.map(s => s.id);
        onExcludeOutliers(ids);
    };

    // 3. Excluir todas las anómalas marcadas por el consenso
    const handleExcludeAllOutliers = () => {
        if (activeOutliers.length === 0) return;
        const idsToExclude = activeOutliers.map(s => s.id);
        onExcludeOutliers(idsToExclude);
    };

    // Toggle para una muestra individual
    const handleToggleSampleItem = (sampleId: string | number) => {
        const idx = samples.findIndex(s => s.id === sampleId);
        if (idx !== -1) {
            onToggleSample(idx);
        }
    };

    if (samples.length < 3) {
        return (
            <Card>
                <div className="flex flex-col items-center justify-center p-12 text-center">
                    <AlertTriangle className="h-12 w-12 text-amber-400 mb-3" />
                    <h3 className="text-lg font-bold text-slate-100">Datos insuficientes para Análisis PCA</h3>
                    <p className="text-sm text-slate-400 max-w-md mt-1">
                        Cargue al menos 3 muestras activas en la pestaña de calibración para generar la descomposición factorial multivariante.
                    </p>
                </div>
            </Card>
        );
    }

    if (!pcaModel) return null;

    const varX = pcaModel.varianceExplained[selectedPCX - 1] || 0;
    const varY = pcaModel.varianceExplained[selectedPCY - 1] || 0;

    // Obtener badge según tipo ROBPCA
    const getRobpcaBadge = (type: RobpcaSampleType) => {
        switch (type) {
            case 'regular':
                return {
                    label: 'Muestra Regular (Típica)',
                    desc: 'Espectro limpio y composición química central.',
                    bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                };
            case 'good_leverage':
                return {
                    label: 'Apalancamiento Bueno (¡Conservar!)',
                    desc: 'Extremo químico válido con espectro intacto. Amplía el rango de calibración PLS.',
                    bg: 'bg-sky-500/10 text-sky-400 border-sky-500/30'
                };
            case 'orthogonal':
                return {
                    label: 'Outlier Ortogonal (Falla Física)',
                    desc: 'Ruido óptico, artefacto de celda o lámpara. Se recomienda excluir.',
                    bg: 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                };
            case 'bad_leverage':
                return {
                    label: 'Apalancamiento Dañino (Outlier Crítico)',
                    desc: 'Anomalía química severa y espectro dañado. Debe eliminarse para no sesgar el modelo.',
                    bg: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                };
        }
    };

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            {/* ENCABEZADO Y RESUMEN ESTADÍSTICO SUPERIOR */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-ui-card p-5 rounded-xl border border-ui-border">
                <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                            Diagnóstico Multivariante & Quimiometría
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            ROBPCA (Hubert)
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                            Local Outlier Factor (LOF)
                        </span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        <Activity className="h-5 w-5 text-ui-accent" />
                        PCA Robusto & Detección de Anomalías
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 max-w-3xl">
                        Distinga entre <strong>puntos de apalancamiento buenos</strong> (que enriquecen la futura calibración PLS) y <strong>outliers dañinos o fallas físicas de lectura</strong> mediante el algoritmo ROBPCA y análisis de densidad local LOF.
                    </p>
                </div>

                {/* Acciones Rápidas */}
                <div className="flex items-center gap-2 flex-wrap">
                    {robpcaCriticalOutliers.length > 0 && (
                        <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={handleExcludeRobpcaCritical}
                            className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm flex items-center"
                            title="Excluir únicamente los apalancamientos dañinos y outliers ortogonales, protegiendo los buenos apalancamientos"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Excluir {robpcaCriticalOutliers.length} Crítica{robpcaCriticalOutliers.length > 1 ? 's' : ''} (ROBPCA)
                        </Button>
                    )}

                    {lofOutliers.length > 0 && robpcaCriticalOutliers.length === 0 && (
                        <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={handleExcludeLof}
                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm flex items-center"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Excluir {lofOutliers.length} Anómala{lofOutliers.length > 1 ? 's' : ''} (LOF)
                        </Button>
                    )}

                    {activeOutliers.length === 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                            <CheckCircle2 className="h-4 w-4" />
                            Lote Homogéneo (Sin Outliers Críticos)
                        </div>
                    )}

                    {inactiveCount > 0 && (
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={onIncludeAll}
                            className="text-xs border-slate-700 text-slate-300 hover:text-white flex items-center"
                            title="Reincorporar todas las muestras excluidas"
                        >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Reactivar Todas ({inactiveCount})
                        </Button>
                    )}

                    {onProceedToCalibration && (
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={onProceedToCalibration}
                            className="text-xs border-ui-accent/40 text-ui-accent hover:bg-ui-accent hover:text-slate-900 font-bold"
                        >
                            Continuar a Calibración PLS →
                        </Button>
                    )}
                </div>
            </div>

            {/* TARJETAS DE MÉTRICAS CLAVE CON ROBPCA Y LOF */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* 1. Muestras Totales */}
                <div className="bg-ui-card p-4 rounded-xl border border-ui-border">
                    <div className="text-[11px] uppercase font-bold text-slate-400 mb-1">Muestras del Lote</div>
                    <div className="text-2xl font-black text-slate-100 flex items-baseline gap-2">
                        {samples.length}
                        <span className="text-xs font-normal text-slate-400">({samples.filter(s => s.active).length} activas)</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                        {inactiveCount > 0 ? `${inactiveCount} muestra(s) excluida(s)` : '100% incluidas en modelado'}
                    </div>
                </div>

                {/* 2. Diagnóstico ROBPCA */}
                <div className="bg-ui-card p-4 rounded-xl border border-ui-border">
                    <div className="text-[11px] uppercase font-bold text-slate-400 mb-1 flex items-center justify-between">
                        <span>ROBPCA (Hubert)</span>
                        <span className="text-[10px] text-sky-400 font-bold">4 Cuadrantes</span>
                    </div>
                    <div className="text-2xl font-black flex items-baseline gap-2">
                        <span className={robpcaCriticalOutliers.length > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                            {robpcaCriticalOutliers.length}
                        </span>
                        <span className="text-xs font-normal text-slate-400">críticos / {pcaModel.robpcaSummary.goodLeverage} válidos</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1 truncate">
                        {pcaModel.robpcaSummary.goodLeverage > 0 
                            ? `✓ ${pcaModel.robpcaSummary.goodLeverage} punto(s) de buen apalancamiento`
                            : `${pcaModel.robpcaSummary.regular} regulares conformes`}
                    </div>
                </div>

                {/* 3. Detección LOF */}
                <div className="bg-ui-card p-4 rounded-xl border border-ui-border">
                    <div className="text-[11px] uppercase font-bold text-slate-400 mb-1 flex items-center justify-between">
                        <span>Densidad Local (LOF)</span>
                        <span className="text-[10px] text-purple-400">Umbral: {pcaModel.lofThreshold}</span>
                    </div>
                    <div className="text-2xl font-black flex items-baseline gap-2">
                        <span className={lofOutliers.length > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                            {lofOutliers.length}
                        </span>
                        <span className="text-xs font-normal text-slate-400">baja densidad</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                        {lofOutliers.length > 0 ? 'Muestras aisladas del cluster' : 'Distribución densa uniforme'}
                    </div>
                </div>

                {/* 4. Varianza Explicada */}
                <div className="bg-ui-card p-4 rounded-xl border border-ui-border">
                    <div className="text-[11px] uppercase font-bold text-slate-400 mb-1">Varianza (PC1+PC2)</div>
                    <div className="text-2xl font-black text-sky-400">
                        {((pcaModel.varianceExplained[0] || 0) + (pcaModel.varianceExplained[1] || 0)).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                        PC1: {(pcaModel.varianceExplained[0] || 0).toFixed(1)}% • PC2: {(pcaModel.varianceExplained[1] || 0).toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* ÁREA PRINCIPAL: GRÁFICO INTERACTIVO MULTI-MODELO + PANEL DE DETALLES */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Columna Izquierda / Central: Gráficos (2 columnas) */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <Card>
                        {/* Selector de tipo de gráfico */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ui-border pb-3 mb-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                    onClick={() => setActiveTab('scores')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                        activeTab === 'scores' 
                                            ? 'bg-ui-accent text-slate-900 shadow' 
                                            : 'text-slate-400 hover:text-white bg-ui-dark'
                                    }`}
                                >
                                    Scores 2D
                                </button>
                                <button
                                    onClick={() => setActiveTab('robpca')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                                        activeTab === 'robpca' 
                                            ? 'bg-emerald-500 text-slate-950 font-black shadow' 
                                            : 'text-slate-400 hover:text-white bg-ui-dark'
                                    }`}
                                >
                                    <ShieldCheck className="w-3.5 h-3.5" />
                                    ROBPCA (SD vs OD)
                                </button>
                                <button
                                    onClick={() => setActiveTab('lof')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                                        activeTab === 'lof' 
                                            ? 'bg-purple-500 text-white font-bold shadow' 
                                            : 'text-slate-400 hover:text-white bg-ui-dark'
                                    }`}
                                >
                                    <Target className="w-3.5 h-3.5" />
                                    LOF (Densidad)
                                </button>
                                <button
                                    onClick={() => setActiveTab('influence')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                        activeTab === 'influence' 
                                            ? 'bg-ui-accent text-slate-900 shadow' 
                                            : 'text-slate-400 hover:text-white bg-ui-dark'
                                    }`}
                                >
                                    Influencia (T² vs Q)
                                </button>
                                <button
                                    onClick={() => setActiveTab('variance')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                        activeTab === 'variance' 
                                            ? 'bg-ui-accent text-slate-900 shadow' 
                                            : 'text-slate-400 hover:text-white bg-ui-dark'
                                    }`}
                                >
                                    Varianza
                                </button>
                            </div>

                            {activeTab === 'scores' && (
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-400 font-medium">Eje X:</span>
                                    <select 
                                        value={selectedPCX} 
                                        onChange={(e) => setSelectedPCX(Number(e.target.value))}
                                        className="bg-ui-dark border border-ui-border rounded px-2 py-1 text-slate-200"
                                    >
                                        <option value={1}>PC 1 ({(pcaModel.varianceExplained[0] || 0).toFixed(1)}%)</option>
                                        <option value={2}>PC 2 ({(pcaModel.varianceExplained[1] || 0).toFixed(1)}%)</option>
                                        {pcaModel.varianceExplained.length > 2 && (
                                            <option value={3}>PC 3 ({(pcaModel.varianceExplained[2] || 0).toFixed(1)}%)</option>
                                        )}
                                    </select>

                                    <span className="text-slate-400 font-medium ml-1">Eje Y:</span>
                                    <select 
                                        value={selectedPCY} 
                                        onChange={(e) => setSelectedPCY(Number(e.target.value))}
                                        className="bg-ui-dark border border-ui-border rounded px-2 py-1 text-slate-200"
                                    >
                                        <option value={1}>PC 1 ({(pcaModel.varianceExplained[0] || 0).toFixed(1)}%)</option>
                                        <option value={2}>PC 2 ({(pcaModel.varianceExplained[1] || 0).toFixed(1)}%)</option>
                                        {pcaModel.varianceExplained.length > 2 && (
                                            <option value={3}>PC 3 ({(pcaModel.varianceExplained[2] || 0).toFixed(1)}%)</option>
                                        )}
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* RENDERIZADO DEL GRÁFICO ACTIVO */}
                        <div className="h-96 w-full relative">
                            {/* TAB 1: SCORES 2D */}
                            {activeTab === 'scores' && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                        <XAxis 
                                            type="number" 
                                            dataKey="x" 
                                            name={`PC ${selectedPCX}`}
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            label={{ 
                                                value: `PC ${selectedPCX} (${varX.toFixed(1)}% Varianza)`, 
                                                position: 'insideBottom', 
                                                offset: -10, 
                                                fill: '#94a3b8', 
                                                fontSize: 12 
                                            }} 
                                        />
                                        <YAxis 
                                            type="number" 
                                            dataKey="y" 
                                            name={`PC ${selectedPCY}`}
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            label={{ 
                                                value: `PC ${selectedPCY} (${varY.toFixed(1)}% Varianza)`, 
                                                angle: -90, 
                                                position: 'insideLeft', 
                                                fill: '#94a3b8', 
                                                fontSize: 12 
                                            }} 
                                        />
                                        <ReferenceLine x={0} stroke="#475569" strokeDasharray="2 2" />
                                        <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
                                        
                                        <Tooltip 
                                            cursor={{ strokeDasharray: '3 3' }}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const data = payload[0].payload;
                                                    const badge = getRobpcaBadge(data.robpcaType);
                                                    return (
                                                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-200 min-w-52">
                                                            <div className="font-bold text-slate-100 flex items-center justify-between gap-3 mb-1.5">
                                                                <span>ID: {data.id}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                                                                    {data.robpcaType === 'good_leverage' ? 'BUEN APALANCAMIENTO' :
                                                                     data.robpcaType === 'bad_leverage' ? 'OUTLIER DAÑINO' :
                                                                     data.robpcaType === 'orthogonal' ? 'OUTLIER ORTOGONAL' : 'REGULAR'}
                                                                </span>
                                                            </div>
                                                            <div className="text-slate-400">PC{selectedPCX}: <span className="text-slate-200 font-mono">{data.x}</span></div>
                                                            <div className="text-slate-400">PC{selectedPCY}: <span className="text-slate-200 font-mono">{data.y}</span></div>
                                                            <div className="text-slate-400">ROBPCA SD: <span className="text-slate-200 font-mono">{data.sd}</span> | OD: <span className="text-slate-200 font-mono">{data.od}</span></div>
                                                            <div className="text-slate-400">Factor LOF: <span className={`font-mono font-bold ${data.isLofOutlier ? 'text-amber-400' : 'text-slate-200'}`}>{data.lofScore}</span></div>
                                                            {data.outlierReason && (
                                                                <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[11px] font-medium text-slate-300">
                                                                    {data.outlierReason}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />

                                        <Scatter 
                                            data={scoresChartData} 
                                            onClick={(e) => {
                                                if (e && e.payload) {
                                                    const pt = pcaModel.scores.find(s => s.id === e.payload.id);
                                                    if (pt) setSelectedPoint(pt);
                                                }
                                            }}
                                        >
                                            {scoresChartData.map((entry, index) => (
                                                <Cell 
                                                    key={`cell-${index}`} 
                                                    fill={entry.color} 
                                                    stroke={entry.id === selectedPoint?.id ? '#ffffff' : (entry.isOutlier ? '#ffe4e6' : '#0f172a')}
                                                    strokeWidth={entry.id === selectedPoint?.id ? 2 : (entry.isOutlier ? 1.5 : 1)}
                                                    r={entry.id === selectedPoint?.id ? 8 : (entry.isOutlier ? 6.5 : 5)}
                                                    className="cursor-pointer transition-all hover:opacity-80"
                                                />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            )}

                            {/* TAB 2: ROBPCA (HUBERT DIAGNOSTIC PLOT SD vs OD) */}
                            {activeTab === 'robpca' && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 25, right: 25, bottom: 25, left: 25 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                        <XAxis 
                                            type="number" 
                                            dataKey="x" 
                                            name="Score Distance (SD)" 
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            label={{ 
                                                value: `Distancia de Score Robusta (SD) [Corte = ${pcaModel.robpcaCutoffSD.toFixed(2)}]`, 
                                                position: 'insideBottom', 
                                                offset: -12, 
                                                fill: '#94a3b8', 
                                                fontSize: 12 
                                            }} 
                                        />
                                        <YAxis 
                                            type="number" 
                                            dataKey="y" 
                                            name="Orthogonal Distance (OD)" 
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            label={{ 
                                                value: `Distancia Ortogonal Robusta (OD) [Corte = ${pcaModel.robpcaCutoffOD.toFixed(4)}]`, 
                                                angle: -90, 
                                                position: 'insideLeft', 
                                                fill: '#94a3b8', 
                                                fontSize: 12 
                                            }} 
                                        />
                                        
                                        {/* Líneas de corte de los 4 cuadrantes */}
                                        <ReferenceLine 
                                            x={pcaModel.robpcaCutoffSD} 
                                            stroke="#38bdf8" 
                                            strokeDasharray="4 4" 
                                            strokeWidth={1.5}
                                            label={{ value: 'Corte SD', fill: '#38bdf8', fontSize: 11, position: 'top' }} 
                                        />
                                        <ReferenceLine 
                                            y={pcaModel.robpcaCutoffOD} 
                                            stroke="#f43f5e" 
                                            strokeDasharray="4 4" 
                                            strokeWidth={1.5}
                                            label={{ value: 'Corte OD', fill: '#f43f5e', fontSize: 11, position: 'right' }} 
                                        />

                                        <Tooltip 
                                            cursor={{ strokeDasharray: '3 3' }}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    const badge = getRobpcaBadge(d.robpcaType);
                                                    return (
                                                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-200 max-w-xs">
                                                            <div className="font-bold text-slate-100 flex items-center justify-between mb-1.5">
                                                                <span>ID: {d.id}</span>
                                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badge.bg}`}>
                                                                    {badge.label}
                                                                </span>
                                                            </div>
                                                            <div>Score Distance (SD): <span className="font-mono text-slate-100 font-bold">{d.sd}</span> (Umbral: {pcaModel.robpcaCutoffSD.toFixed(2)})</div>
                                                            <div>Orthogonal Distance (OD): <span className="font-mono text-slate-100 font-bold">{d.od}</span> (Umbral: {pcaModel.robpcaCutoffOD.toFixed(4)})</div>
                                                            <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[11px] text-slate-300">
                                                                {badge.desc}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />

                                        <Scatter 
                                            data={robpcaChartData}
                                            onClick={(e) => {
                                                if (e && e.payload) {
                                                    const pt = pcaModel.scores.find(s => s.id === e.payload.id);
                                                    if (pt) setSelectedPoint(pt);
                                                }
                                            }}
                                        >
                                            {robpcaChartData.map((entry, index) => (
                                                <Cell 
                                                    key={`cell-rob-${index}`} 
                                                    fill={entry.color} 
                                                    r={entry.id === selectedPoint?.id ? 8 : (entry.isOutlier ? 7 : 5.5)}
                                                    stroke={entry.id === selectedPoint?.id ? '#ffffff' : (entry.isOutlier ? '#ffe4e6' : '#0f172a')}
                                                    strokeWidth={entry.id === selectedPoint?.id ? 2 : 1}
                                                    className="cursor-pointer"
                                                />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            )}

                            {/* TAB 3: LOCAL OUTLIER FACTOR (LOF) */}
                            {activeTab === 'lof' && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={lofChartData} margin={{ top: 25, right: 25, bottom: 25, left: 25 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                        <XAxis 
                                            dataKey="name" 
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 10 }}
                                            label={{ value: 'Muestras Analizadas', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 12 }}
                                        />
                                        <YAxis 
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            domain={[0, (dataMax: number) => Math.max(2.0, Math.ceil(dataMax * 1.2))]}
                                            label={{ value: 'Factor LOF (Densidad Relativa)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                                        />
                                        
                                        {/* Línea de umbral LOF */}
                                        <ReferenceLine 
                                            y={pcaModel.lofThreshold} 
                                            stroke="#f43f5e" 
                                            strokeDasharray="4 4" 
                                            strokeWidth={1.5}
                                            label={{ 
                                                value: `Umbral de Densidad Anómala (${pcaModel.lofThreshold.toFixed(2)})`, 
                                                fill: '#f43f5e', 
                                                fontSize: 11, 
                                                position: 'top' 
                                            }} 
                                        />
                                        <ReferenceLine 
                                            y={1.0} 
                                            stroke="#10b981" 
                                            strokeDasharray="2 2" 
                                            label={{ value: 'Densidad Típica (1.0)', fill: '#10b981', fontSize: 10, position: 'insideBottomRight' }} 
                                        />

                                        <Tooltip 
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-200">
                                                            <div className="font-bold text-slate-100 mb-1">Muestra ID: {d.id}</div>
                                                            <div>Factor LOF: <span className="font-mono font-bold text-slate-100">{d.lofScore}</span></div>
                                                            <div>Umbral de Outlier: <span className="font-mono text-rose-400 font-bold">{d.threshold}</span></div>
                                                            <div className="mt-1 pt-1 border-t border-slate-800 text-[11px]">
                                                                {d.isOutlier ? (
                                                                    <span className="text-rose-400 font-semibold">⚠ Densidad local anormalmente baja (espectro aislado)</span>
                                                                ) : (
                                                                    <span className="text-emerald-400 font-semibold">✓ Densidad coherente con el cluster</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />

                                        <Bar 
                                            dataKey="lofScore" 
                                            name="Factor LOF" 
                                            radius={[4, 4, 0, 0]}
                                            onClick={(e) => {
                                                if (e && e.id) {
                                                    const pt = pcaModel.scores.find(s => s.id === e.id);
                                                    if (pt) setSelectedPoint(pt);
                                                }
                                            }}
                                        >
                                            {lofChartData.map((entry, index) => (
                                                <Cell 
                                                    key={`cell-lof-${index}`} 
                                                    fill={entry.color} 
                                                    className="cursor-pointer hover:opacity-80"
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}

                            {/* TAB 4: INFLUENCIA CLÁSICA (T2 vs Q) */}
                            {activeTab === 'influence' && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                        <XAxis 
                                            type="number" 
                                            dataKey="x" 
                                            name="Hotelling T²" 
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            label={{ value: 'Apalancamiento Clásico (Hotelling T²)', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 12 }} 
                                        />
                                        <YAxis 
                                            type="number" 
                                            dataKey="y" 
                                            name="Residual Q" 
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            label={{ value: 'Residual Espectral (Q-Residual)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} 
                                        />
                                        
                                        <ReferenceLine 
                                            x={pcaModel.t2Limit99} 
                                            stroke="#f43f5e" 
                                            strokeDasharray="4 4" 
                                            label={{ value: 'Límite T² (99%)', fill: '#f43f5e', fontSize: 10, position: 'top' }} 
                                        />
                                        <ReferenceLine 
                                            y={pcaModel.qLimit99} 
                                            stroke="#f43f5e" 
                                            strokeDasharray="4 4" 
                                            label={{ value: 'Límite Q (99%)', fill: '#f43f5e', fontSize: 10, position: 'right' }} 
                                        />

                                        <Tooltip 
                                            cursor={{ strokeDasharray: '3 3' }}
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-200">
                                                            <div className="font-bold text-slate-100 mb-1">ID: {d.id}</div>
                                                            <div>Hotelling T²: <span className="font-mono text-slate-200">{d.x}</span> (Límite 99%: {pcaModel.t2Limit99.toFixed(2)})</div>
                                                            <div>Residual Q: <span className="font-mono text-slate-200">{d.y}</span> (Límite 99%: {pcaModel.qLimit99.toFixed(4)})</div>
                                                            <div>Mahalanobis (GH): <span className="font-mono font-bold text-sky-400">{d.gh}</span></div>
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />

                                        <Scatter 
                                            data={influenceChartData}
                                            onClick={(e) => {
                                                if (e && e.payload) {
                                                    const pt = pcaModel.scores.find(s => s.id === e.payload.id);
                                                    if (pt) setSelectedPoint(pt);
                                                }
                                            }}
                                        >
                                            {influenceChartData.map((entry, index) => (
                                                <Cell 
                                                    key={`cell-inf-${index}`} 
                                                    fill={entry.color} 
                                                    r={entry.isOutlier ? 7 : 5}
                                                    className="cursor-pointer"
                                                />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            )}

                            {/* TAB 5: VARIANZA EXPLICADA */}
                            {activeTab === 'variance' && (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={varianceChartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                                        <XAxis dataKey="pc" stroke="#94a3b8" tick={{ fill: '#94a3b8' }} />
                                        <YAxis stroke="#94a3b8" tick={{ fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
                                        <Tooltip 
                                            formatter={(val: any, name: string) => [
                                                `${val}%`, 
                                                name === 'variance' ? 'Varianza Individual' : 'Varianza Acumulada'
                                            ]}
                                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                                        />
                                        <Bar dataKey="variance" fill="#38bdf8" name="Varianza Individual" radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="variance" position="top" fill="#94a3b8" formatter={(v: number) => `${v}%`} fontSize={11} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Leyenda y Notas Técnicas según el gráfico activo */}
                        <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pt-3 border-t border-ui-border text-xs text-slate-400">
                            {activeTab === 'robpca' ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                                    <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full bg-[#10b981] inline-block shrink-0"></span>
                                        <div>
                                            <div className="text-slate-200 font-semibold text-[11px]">Regular</div>
                                            <div className="text-[10px] text-slate-500">Muestra típica</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full bg-[#0284c7] inline-block shrink-0"></span>
                                        <div>
                                            <div className="text-sky-300 font-semibold text-[11px]">Apalancamiento Bueno</div>
                                            <div className="text-[10px] text-sky-500 font-bold">¡Conservar para PLS!</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full bg-[#f59e0b] inline-block shrink-0"></span>
                                        <div>
                                            <div className="text-amber-300 font-semibold text-[11px]">Outlier Ortogonal</div>
                                            <div className="text-[10px] text-slate-500">Falla de espectro/lámpara</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="h-3 w-3 rounded-full bg-[#f43f5e] inline-block shrink-0"></span>
                                        <div>
                                            <div className="text-rose-300 font-semibold text-[11px]">Apalancamiento Malo</div>
                                            <div className="text-[10px] text-rose-500 font-bold">Descartar de inmediato</div>
                                        </div>
                                    </div>
                                </div>
                            ) : activeTab === 'lof' ? (
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-3 w-3 rounded-full bg-[#10b981]"></span>
                                            <span>Densidad Homogénea (LOF &le; 1.25)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-3 w-3 rounded-full bg-[#fbbf24]"></span>
                                            <span>Densidad Media</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-3 w-3 rounded-full bg-[#f43f5e]"></span>
                                            <span className="text-rose-400 font-semibold">Anomalía Local (LOF &gt; {pcaModel.lofThreshold})</span>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-slate-500 italic">
                                        * LOF &gt; 1 indica que el punto está más aislado que sus vecinos directos.
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap items-center justify-between gap-4 w-full">
                                    <div className="flex items-center gap-4 flex-wrap">
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-3 w-3 rounded-full bg-[#10b981]"></span>
                                            <span>Conforme (GH &le; 2.0)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-3 w-3 rounded-full bg-[#0284c7]"></span>
                                            <span>Extremo Bueno (ROBPCA)</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-3 w-3 rounded-full bg-[#f43f5e]"></span>
                                            <span className="font-semibold text-rose-400">Outlier / Crítico</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="h-3 w-3 rounded-full bg-[#64748b]"></span>
                                            <span>Excluida</span>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-slate-500 italic">
                                        * Haz clic sobre cualquier muestra para ver su diagnóstico completo.
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Columna Derecha: Panel de Diagnóstico de Muestra Seleccionada & Lista Filtrable de Outliers */}
                <div className="flex flex-col gap-4">
                    {/* Tarjeta de Detalle de Muestra Seleccionada */}
                    <Card>
                        <h3 className="text-sm font-bold text-slate-100 flex items-center justify-between mb-3 pb-2 border-b border-ui-border">
                            <span className="flex items-center gap-2">
                                <Eye className="h-4 w-4 text-ui-accent" />
                                Diagnóstico Quimiométrico
                            </span>
                            {selectedPoint && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getRobpcaBadge(selectedPoint.robpcaType).bg}`}>
                                    {selectedPoint.robpcaType.toUpperCase()}
                                </span>
                            )}
                        </h3>

                        {selectedPoint ? (
                            <div className="flex flex-col gap-3 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">ID de Muestra:</span>
                                    <span className="font-bold text-slate-100 text-sm font-mono">{selectedPoint.id}</span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Valor Analítico ({analyticalProperty}):</span>
                                    <span className="font-mono font-bold text-slate-200">
                                        {selectedPoint.analyticalValue !== undefined ? selectedPoint.analyticalValue : '-'}
                                    </span>
                                </div>

                                {/* Bloque ROBPCA */}
                                <div className="p-2.5 rounded-lg bg-ui-dark border border-ui-border space-y-1.5">
                                    <div className="text-[11px] font-bold text-slate-200 flex items-center justify-between">
                                        <span className="flex items-center gap-1 text-emerald-400">
                                            <ShieldCheck className="w-3.5 h-3.5" /> ROBPCA (Hubert)
                                        </span>
                                        <span className="font-semibold">{getRobpcaBadge(selectedPoint.robpcaType).label}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400">Distancia de Score (SD):</span>
                                        <span className={`font-mono font-bold ${selectedPoint.robpcaSD > pcaModel.robpcaCutoffSD ? 'text-sky-400' : 'text-slate-200'}`}>
                                            {selectedPoint.robpcaSD.toFixed(2)} <span className="text-slate-500 font-normal">/ corte {pcaModel.robpcaCutoffSD.toFixed(2)}</span>
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-400">Distancia Ortogonal (OD):</span>
                                        <span className={`font-mono font-bold ${selectedPoint.robpcaOD > pcaModel.robpcaCutoffOD ? 'text-rose-400' : 'text-slate-200'}`}>
                                            {selectedPoint.robpcaOD.toFixed(4)} <span className="text-slate-500 font-normal">/ corte {pcaModel.robpcaCutoffOD.toFixed(4)}</span>
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 leading-snug">
                                        {getRobpcaBadge(selectedPoint.robpcaType).desc}
                                    </div>
                                </div>

                                {/* Bloque LOF */}
                                <div className="p-2.5 rounded-lg bg-ui-dark border border-ui-border space-y-1">
                                    <div className="text-[11px] font-bold text-purple-400 flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            <Target className="w-3.5 h-3.5" /> Factor de Densidad Local (LOF)
                                        </span>
                                        <span className={`font-mono font-bold ${selectedPoint.isLofOutlier ? 'text-amber-400' : 'text-slate-300'}`}>
                                            {selectedPoint.lofScore.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400">
                                        {selectedPoint.isLofOutlier 
                                            ? `⚠ Densidad baja respecto a sus vecinos (Umbral: ${pcaModel.lofThreshold.toFixed(2)})` 
                                            : `✓ Densidad homogénea en el espacio de componentes (Umbral: ${pcaModel.lofThreshold.toFixed(2)})`}
                                    </div>
                                </div>

                                {/* Métricas clásicas */}
                                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/60 p-2 rounded border border-slate-800">
                                    <div>
                                        <span className="text-slate-400 block text-[10px]">Mahalanobis (GH):</span>
                                        <span className={`font-mono font-bold ${selectedPoint.gh > 3.0 ? 'text-rose-400' : 'text-slate-200'}`}>
                                            {selectedPoint.gh.toFixed(2)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-400 block text-[10px]">Hotelling T²:</span>
                                        <span className="font-mono text-slate-200">{selectedPoint.hotellingT2.toFixed(2)}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Estado de Calibración:</span>
                                    <span className={`px-2 py-0.5 rounded font-bold ${
                                        selectedPoint.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                    }`}>
                                        {selectedPoint.active ? 'ACTIVA (Entrena PLS)' : 'EXCLUIDA (Ignorada)'}
                                    </span>
                                </div>

                                {selectedPoint.outlierReason && (
                                    <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] leading-relaxed">
                                        <div className="font-bold flex items-center gap-1 mb-0.5">
                                            <ShieldAlert className="h-3.5 w-3.5" /> Diagnóstico:
                                        </div>
                                        {selectedPoint.outlierReason}
                                    </div>
                                )}

                                <Button
                                    variant={selectedPoint.active ? 'danger' : 'secondary'}
                                    size="sm"
                                    onClick={() => handleToggleSampleItem(selectedPoint.id)}
                                    className="w-full mt-2 font-bold text-xs"
                                >
                                    {selectedPoint.active ? (
                                        <>
                                            <XCircle className="h-3.5 w-3.5 mr-1.5" />
                                            Excluir Muestra de la Calibración
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                            Reincorporar a la Calibración
                                        </>
                                    )}
                                </Button>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-slate-400 text-xs">
                                <Info className="h-8 w-8 mx-auto mb-2 opacity-40" />
                                Haz clic sobre cualquier punto del gráfico para ver su diagnóstico analítico ROBPCA y LOF.
                            </div>
                        )}
                    </Card>

                    {/* Tabla Filtrable de Muestras Anómalas Detectadas */}
                    <Card>
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-ui-border">
                            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-rose-400" />
                                Diagnóstico de Muestras
                            </h3>
                            <span className="text-[10px] text-slate-400">
                                {activeOutliers.length} anomalía(s)
                            </span>
                        </div>

                        {/* Filtros rápidos de tabla */}
                        <div className="flex items-center gap-1 mb-3 pb-2 border-b border-slate-800 text-[10px] overflow-x-auto">
                            <button
                                onClick={() => setOutlierFilterTab('all')}
                                className={`px-2 py-1 rounded font-bold whitespace-nowrap ${
                                    outlierFilterTab === 'all' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Todas ({activeOutliers.length})
                            </button>
                            <button
                                onClick={() => setOutlierFilterTab('robpca_critical')}
                                className={`px-2 py-1 rounded font-bold whitespace-nowrap ${
                                    outlierFilterTab === 'robpca_critical' ? 'bg-rose-900/60 text-rose-200 border border-rose-500/40' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                ROBPCA Críticos ({robpcaCriticalOutliers.length})
                            </button>
                            <button
                                onClick={() => setOutlierFilterTab('lof')}
                                className={`px-2 py-1 rounded font-bold whitespace-nowrap ${
                                    outlierFilterTab === 'lof' ? 'bg-purple-900/60 text-purple-200 border border-purple-500/40' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                LOF ({lofOutliers.length})
                            </button>
                            <button
                                onClick={() => setOutlierFilterTab('good_leverage')}
                                className={`px-2 py-1 rounded font-bold whitespace-nowrap ${
                                    outlierFilterTab === 'good_leverage' ? 'bg-sky-900/60 text-sky-200 border border-sky-500/40' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                Buenos Apal. ({goodLeveragePoints.length})
                            </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                            {(() => {
                                let listToDisplay = pcaModel.scores.filter(s => s.isOutlier || s.robpcaType === 'good_leverage');
                                if (outlierFilterTab === 'robpca_critical') {
                                    listToDisplay = pcaModel.scores.filter(s => s.robpcaType === 'bad_leverage' || s.robpcaType === 'orthogonal');
                                } else if (outlierFilterTab === 'lof') {
                                    listToDisplay = pcaModel.scores.filter(s => s.isLofOutlier);
                                } else if (outlierFilterTab === 'good_leverage') {
                                    listToDisplay = pcaModel.scores.filter(s => s.robpcaType === 'good_leverage');
                                }

                                if (listToDisplay.length === 0) {
                                    return (
                                        <div className="text-center py-6 text-emerald-400 text-xs font-medium">
                                            <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-emerald-400 opacity-80" />
                                            No hay muestras en esta categoría.
                                        </div>
                                    );
                                }

                                return listToDisplay.map(sample => {
                                    const badge = getRobpcaBadge(sample.robpcaType);
                                    const isSelected = selectedPoint?.id === sample.id;

                                    return (
                                        <div 
                                            key={sample.id}
                                            onClick={() => setSelectedPoint(sample)}
                                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                                isSelected 
                                                    ? 'bg-slate-800 border-ui-accent shadow-sm' 
                                                    : 'bg-ui-dark border-ui-border hover:border-slate-600'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-bold text-slate-100 font-mono">{sample.id}</span>
                                                <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${badge.bg}`}>
                                                    {sample.robpcaType === 'good_leverage' ? 'BUENO (CONSERVAR)' :
                                                     sample.robpcaType === 'bad_leverage' ? 'DAÑINO' :
                                                     sample.robpcaType === 'orthogonal' ? 'ORTOGONAL' : 'REGULAR'}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-slate-400 truncate mb-1.5">
                                                {sample.outlierReason || badge.desc}
                                            </div>
                                            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                                                <span className="text-[10px] text-slate-400 font-mono">
                                                    SD: {sample.robpcaSD.toFixed(1)} | LOF: {sample.lofScore.toFixed(2)}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleSampleItem(sample.id);
                                                    }}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                        sample.active 
                                                            ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                                                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                                    }`}
                                                >
                                                    {sample.active ? 'Excluir' : 'Activar'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default PcaAnalyzer;
