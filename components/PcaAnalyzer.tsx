import React, { useState, useMemo } from 'react';
import { 
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, 
    ResponsiveContainer, ReferenceLine, Cell, BarChart, Bar, LabelList
} from 'recharts';
import { 
    Activity, AlertTriangle, CheckCircle2, XCircle, Filter, 
    Trash2, RotateCcw, ShieldAlert, Sparkles, SlidersHorizontal, Info, Eye
} from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { Sample, PreprocessingStep, PcaAnalysisModel, PcaScorePoint } from '../types';
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
    const [filterOnlyOutliers, setFilterOnlyOutliers] = useState<boolean>(false);
    const [activeTab, setActiveTab] = useState<'scores' | 'influence' | 'variance'>('scores');
    const [selectedPoint, setSelectedPoint] = useState<PcaScorePoint | null>(null);

    // Calcular modelo de PCA en tiempo real
    const pcaModel: PcaAnalysisModel | null = useMemo(() => {
        if (samples.length < 3) return null;
        return runComprehensivePca(samples, preprocessingSteps, 3);
    }, [samples, preprocessingSteps]);

    // Puntos de datos para el gráfico de dispersión de Scores
    const scoresChartData = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.map(s => {
            const xVal = selectedPCX === 1 ? s.pc1 : (selectedPCX === 2 ? s.pc2 : (s.pc3 || 0));
            const yVal = selectedPCY === 1 ? s.pc1 : (selectedPCY === 2 ? s.pc2 : (selectedPCY === 3 ? (s.pc3 || 0) : s.pc2));
            return {
                id: s.id,
                x: Number(xVal.toFixed(4)),
                y: Number(yVal.toFixed(4)),
                gh: Number(s.gh.toFixed(2)),
                hotellingT2: Number(s.hotellingT2.toFixed(2)),
                qResidual: Number(s.qResidual.toFixed(4)),
                isOutlier: s.isOutlier,
                outlierReason: s.outlierReason,
                active: s.active,
                color: !s.active ? '#64748b' : s.isOutlier ? '#f43f5e' : (s.gh > 2.0 ? '#fbbf24' : '#38bdf8'),
                analyticalValue: s.analyticalValue
            };
        });
    }, [pcaModel, selectedPCX, selectedPCY]);

    // Puntos de datos para el gráfico de Influencia (Hotelling T2 vs Q-Residual)
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

    // Datos de varianza explicada por cada PC
    const varianceChartData = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.varianceExplained.map((varPct, idx) => ({
            pc: `PC ${idx + 1}`,
            variance: Number(varPct.toFixed(2)),
            cumulative: Number(pcaModel.cumulativeVariance[idx].toFixed(2))
        }));
    }, [pcaModel]);

    // Lista de muestras detectadas como anómalas
    const detectedOutliers = useMemo(() => {
        if (!pcaModel) return [];
        return pcaModel.scores.filter(s => s.isOutlier && s.active);
    }, [pcaModel]);

    const activeOutliersCount = detectedOutliers.length;
    const inactiveCount = samples.filter(s => !s.active).length;

    // Acción para excluir todas las anómalas activas
    const handleExcludeAllOutliers = () => {
        if (detectedOutliers.length === 0) return;
        const idsToExclude = detectedOutliers.map(s => s.id);
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

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            {/* ENCABEZADO Y RESUMEN ESTADÍSTICO SUPERIOR */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-ui-card p-5 rounded-xl border border-ui-border">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                            Diagnóstico Pre-Calibración
                        </span>
                        <span className="text-xs text-slate-400">• Algoritmo NIPALS Multivariante</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                        <Activity className="h-5 w-5 text-ui-accent" />
                        Análisis de Componentes Principales (PCA) & Detección de Outliers
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                        Inspeccione la dispersión espectral, detecte anomalías analíticas (GH &gt; 3.0 / Hotelling T² / Residual Q) y purifique el lote antes del modelado PLS.
                    </p>
                </div>

                {/* Acciones Rápidas */}
                <div className="flex items-center gap-2 flex-wrap">
                    {activeOutliersCount > 0 ? (
                        <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={handleExcludeAllOutliers}
                            className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm flex items-center"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Excluir {activeOutliersCount} Anómala{activeOutliersCount > 1 ? 's' : ''} (GH &gt; 3.0)
                        </Button>
                    ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                            <CheckCircle2 className="h-4 w-4" />
                            Lote Limpio (Sin Outliers extremos)
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

            {/* TARJETAS DE MÉTRICAS CLAVE */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-ui-card p-4 rounded-xl border border-ui-border">
                    <div className="text-[11px] uppercase font-bold text-slate-400 mb-1">Muestras Totales</div>
                    <div className="text-2xl font-black text-slate-100 flex items-baseline gap-2">
                        {samples.length}
                        <span className="text-xs font-normal text-slate-400">({samples.filter(s => s.active).length} activas)</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                        {inactiveCount > 0 ? `${inactiveCount} muestra(s) excluida(s)` : '100% incluidas'}
                    </div>
                </div>

                <div className="bg-ui-card p-4 rounded-xl border border-ui-border">
                    <div className="text-[11px] uppercase font-bold text-slate-400 mb-1">Muestras Anómalas</div>
                    <div className="text-2xl font-black text-rose-400 flex items-baseline gap-2">
                        {activeOutliersCount}
                        <span className="text-xs font-normal text-slate-400">/ {samples.filter(s => s.active).length}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                        {activeOutliersCount > 0 ? 'GH > 3.0 o T² al 99%' : 'Dentro de especificación'}
                    </div>
                </div>

                <div className="bg-ui-card p-4 rounded-xl border border-ui-border">
                    <div className="text-[11px] uppercase font-bold text-slate-400 mb-1">Varianza Explicada (PC1+PC2)</div>
                    <div className="text-2xl font-black text-sky-400">
                        {((pcaModel.varianceExplained[0] || 0) + (pcaModel.varianceExplained[1] || 0)).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                        PC1: {(pcaModel.varianceExplained[0] || 0).toFixed(1)}% • PC2: {(pcaModel.varianceExplained[1] || 0).toFixed(1)}%
                    </div>
                </div>

                <div className="bg-ui-card p-4 rounded-xl border border-ui-border">
                    <div className="text-[11px] uppercase font-bold text-slate-400 mb-1">Preprocesamiento Activo</div>
                    <div className="text-sm font-bold text-emerald-400 truncate">
                        {preprocessingSteps.length > 0 
                            ? preprocessingSteps.map(s => s.method.toUpperCase()).join(' + ')
                            : 'Espectro Crudo (Sin Tratar)'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">
                        {preprocessingSteps.length > 0 ? `${preprocessingSteps.length} filtro(s) aplicado(s)` : 'Recomendado: SNV o 1ª Derivada'}
                    </div>
                </div>
            </div>

            {/* ÁREA PRINCIPAL: GRÁFICO INTERACTIVO + PANEL DE DETALLES */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Columna Izquierda / Central: Gráficos (2 columnas) */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                    <Card>
                        {/* Selector de tipo de gráfico */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ui-border pb-3 mb-4">
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setActiveTab('scores')}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                        activeTab === 'scores' 
                                            ? 'bg-ui-accent text-slate-900 shadow' 
                                            : 'text-slate-400 hover:text-white bg-ui-dark'
                                    }`}
                                >
                                    Gráfico de Scores 2D
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
                                    Varianza por Componente
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
                                                    return (
                                                        <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-200">
                                                            <div className="font-bold text-slate-100 flex items-center justify-between gap-4 mb-1">
                                                                <span>ID: {data.id}</span>
                                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                                    !data.active ? 'bg-slate-700 text-slate-300' :
                                                                    data.isOutlier ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                                                    'bg-emerald-500/20 text-emerald-400'
                                                                }`}>
                                                                    {!data.active ? 'EXCLUIDA' : data.isOutlier ? 'OUTLIER' : 'CONFORME'}
                                                                </span>
                                                            </div>
                                                            <div className="text-slate-400">PC{selectedPCX}: <span className="text-slate-200 font-mono">{data.x}</span></div>
                                                            <div className="text-slate-400">PC{selectedPCY}: <span className="text-slate-200 font-mono">{data.y}</span></div>
                                                            <div className="text-slate-400">Mahalanobis (GH): <span className={`font-mono font-bold ${data.gh > 3.0 ? 'text-rose-400' : 'text-slate-200'}`}>{data.gh}</span></div>
                                                            {data.outlierReason && (
                                                                <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-rose-300 font-medium">
                                                                    ⚠ {data.outlierReason}
                                                                </div>
                                                            )}
                                                            <div className="text-[10px] text-sky-400 mt-1">Haz clic para seleccionar o excluir</div>
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
                                                    stroke={entry.isOutlier ? '#ffe4e6' : '#0f172a'}
                                                    strokeWidth={entry.isOutlier ? 1.5 : 1}
                                                    r={entry.isOutlier ? 7 : (entry.id === selectedPoint?.id ? 8 : 5)}
                                                    className="cursor-pointer transition-all hover:opacity-80"
                                                />
                                            ))}
                                        </Scatter>
                                    </ScatterChart>
                                </ResponsiveContainer>
                            )}

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
                                            label={{ value: 'Apalancamiento (Hotelling T²)', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 12 }} 
                                        />
                                        <YAxis 
                                            type="number" 
                                            dataKey="y" 
                                            name="Residual Q" 
                                            stroke="#94a3b8" 
                                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                                            label={{ value: 'Residual Espectral (Q-Residual)', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }} 
                                        />
                                        
                                        {/* Límites de confianza teóricos */}
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
                                                            {d.outlierReason && (
                                                                <div className="mt-1 pt-1 border-t border-slate-800 text-rose-400 font-bold">
                                                                    {d.outlierReason}
                                                                </div>
                                                            )}
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

                        {/* Leyenda y Notas Técnicas del Gráfico */}
                        <div className="flex flex-wrap items-center justify-between gap-4 mt-3 pt-3 border-t border-ui-border text-xs text-slate-400">
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <span className="h-3 w-3 rounded-full bg-[#38bdf8] inline-block"></span>
                                    <span>Conforme (GH &le; 2.0)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-3 w-3 rounded-full bg-[#fbbf24] inline-block"></span>
                                    <span>Borde (2.0 &lt; GH &le; 3.0)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-3 w-3 rounded-full bg-[#f43f5e] inline-block"></span>
                                    <span className="font-semibold text-rose-400">Outlier (GH &gt; 3.0)</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <span className="h-3 w-3 rounded-full bg-[#64748b] inline-block"></span>
                                    <span>Excluida (Inactiva)</span>
                                </div>
                            </div>
                            <div className="text-[11px] text-slate-500 italic">
                                * Estándar quimiométrico: GH &gt; 3.0 corresponde a distancia de Mahalanobis atípica.
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Columna Derecha: Panel de Diagnóstico de Muestra Seleccionada & Lista de Outliers */}
                <div className="flex flex-col gap-4">
                    {/* Tarjeta de Detalle de Muestra Seleccionada */}
                    <Card>
                        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 mb-3 pb-2 border-b border-ui-border">
                            <Eye className="h-4 w-4 text-ui-accent" />
                            Diagnóstico de Muestra
                        </h3>

                        {selectedPoint ? (
                            <div className="flex flex-col gap-3 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">ID de Muestra:</span>
                                    <span className="font-bold text-slate-100 text-sm">{selectedPoint.id}</span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Valor Analítico ({analyticalProperty}):</span>
                                    <span className="font-mono font-bold text-slate-200">
                                        {selectedPoint.analyticalValue !== undefined ? selectedPoint.analyticalValue : '-'}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Distancia Mahalanobis (GH):</span>
                                    <span className={`font-mono font-bold text-sm ${
                                        selectedPoint.gh > 3.0 ? 'text-rose-400' : (selectedPoint.gh > 2.0 ? 'text-amber-400' : 'text-emerald-400')
                                    }`}>
                                        {selectedPoint.gh.toFixed(2)}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Hotelling T²:</span>
                                    <span className="font-mono text-slate-200">{selectedPoint.hotellingT2.toFixed(2)}</span>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-slate-400">Residual Espectral (Q):</span>
                                    <span className="font-mono text-slate-200">{selectedPoint.qResidual.toFixed(4)}</span>
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
                                            <ShieldAlert className="h-3.5 w-3.5" /> Alerta Quimiométrica:
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
                                Haz clic sobre cualquier punto del gráfico para ver su diagnóstico analítico completo.
                            </div>
                        )}
                    </Card>

                    {/* Tabla de Muestras Anómalas Detectadas */}
                    <Card>
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-ui-border">
                            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-rose-400" />
                                Muestras Anómalas ({pcaModel.scores.filter(s => s.isOutlier).length})
                            </h3>
                            <span className="text-[10px] text-slate-400">GH &gt; 3.0</span>
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                            {pcaModel.scores.filter(s => s.isOutlier).length === 0 ? (
                                <div className="text-center py-6 text-emerald-400 text-xs font-medium">
                                    <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-emerald-400 opacity-80" />
                                    No se detectaron outliers estadísticos. El lote posee alta homogeneidad.
                                </div>
                            ) : (
                                pcaModel.scores
                                    .filter(s => s.isOutlier)
                                    .map(outlier => (
                                        <div 
                                            key={outlier.id}
                                            onClick={() => setSelectedPoint(outlier)}
                                            className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                                selectedPoint?.id === outlier.id 
                                                    ? 'bg-rose-500/20 border-rose-500/50' 
                                                    : 'bg-ui-dark border-ui-border hover:border-rose-500/30'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-bold text-slate-100">{outlier.id}</span>
                                                <span className="font-mono text-rose-400 font-bold">GH: {outlier.gh.toFixed(2)}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-400 truncate mb-1.5">
                                                {outlier.outlierReason || 'Fuera de rango'}
                                            </div>
                                            <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                                                <span className={`text-[10px] font-semibold ${outlier.active ? 'text-amber-400' : 'text-slate-500 line-through'}`}>
                                                    {outlier.active ? 'Activa en lote' : 'Ya excluida'}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleSampleItem(outlier.id);
                                                    }}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                        outlier.active 
                                                            ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                                                            : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                                    }`}
                                                >
                                                    {outlier.active ? 'Excluir' : 'Activar'}
                                                </button>
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default PcaAnalyzer;
