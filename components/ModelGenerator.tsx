
import React, { useState } from 'react';
import Card from './Card';
import Button from './Button';
import { runPlsOptimization } from '../services/chemometrics';
import { Sample, PreprocessingStep, OptimizationResult } from '../types';
import { 
    Activity, 
    Table as TableIcon, 
    Maximize2, 
    X, 
    CheckCircle2, 
    Info, 
    TrendingDown,
    Sliders,
    Layers,
    HelpCircle
} from 'lucide-react';

export type ModelParams = 
    | { type: 'pls'; nComponents: number };

interface ModelGeneratorProps {
    onRunModel: (params: ModelParams) => void;
    disabled: boolean;
    activeSamples?: Sample[];
    preprocessingSteps?: PreprocessingStep[];
}

const RunIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
);

const OptimizeIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>
    </svg>
);

const ModelGenerator: React.FC<ModelGeneratorProps> = ({ onRunModel, disabled, activeSamples, preprocessingSteps }) => {
    const [nComponents, setNComponents] = useState('5');
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [suggestedLV, setSuggestedLV] = useState<number | null>(null);
    const [optResults, setOptResults] = useState<OptimizationResult[] | null>(null);
    const [viewMode, setViewMode] = useState<'both' | 'chart' | 'table'>('both');
    const [hoveredResult, setHoveredResult] = useState<OptimizationResult | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const handleRun = () => {
        const lv = parseInt(nComponents);
        if (!isNaN(lv) && lv > 0 && lv <= 20) {
            onRunModel({ type: 'pls', nComponents: lv });
        } else {
            alert('Por favor, introduzca un número válido de variables latentes (1-20).');
        }
    };

    const handleOptimize = async () => {
        if (!activeSamples || !preprocessingSteps || activeSamples.length < 3) {
            alert("Se requieren al menos 3 muestras activas para optimizar.");
            return;
        }

        setIsOptimizing(true);
        setSuggestedLV(null);
        setHoveredResult(null);

        setTimeout(() => {
            try {
                const maxLVs = Math.min(15, activeSamples.length - 1);
                const results = runPlsOptimization(activeSamples, preprocessingSteps, maxLVs);
                
                if (results.length > 0) {
                    const bestResult = results.reduce((prev, curr) => curr.secv < prev.secv ? curr : prev);
                    setOptResults(results);
                    setSuggestedLV(bestResult.components);
                    setNComponents(bestResult.components.toString());
                } else {
                    alert("No se pudo determinar un valor óptimo.");
                }

            } catch (e) {
                console.error(e);
                alert("Error durante la optimización.");
            } finally {
                setIsOptimizing(false);
            }
        }, 50);
    };

    // Cálculos para la escala del gráfico SVG (normalización de 0 a 1)
    const currentLVNum = parseInt(nComponents) || 5;
    const bestOptResult = optResults ? optResults.find(r => r.components === suggestedLV) : null;

    // Calcular cotas mínimas y máximas para los ejes del SVG
    let minErr = 0;
    let maxErr = 1;
    if (optResults && optResults.length > 0) {
        const allSec = optResults.map(r => r.sec);
        const allSecv = optResults.map(r => r.secv);
        minErr = Math.min(...allSec, ...allSecv);
        maxErr = Math.max(...allSec, ...allSecv);
        // Margen del 12% para que las líneas respiren
        const range = maxErr - minErr || 0.01;
        minErr = Math.max(0, minErr - range * 0.12);
        maxErr = maxErr + range * 0.12;
    }

    // Dimensiones SVG internas
    const svgWidth = 320;
    const svgHeight = 120;
    const padX = 28;
    const padY = 16;
    const plotW = svgWidth - padX * 2;
    const plotH = svgHeight - padY * 2;

    const getX = (comp: number, total: number) => {
        if (total <= 1) return padX + plotW / 2;
        return padX + ((comp - 1) / (total - 1)) * plotW;
    };

    const getY = (val: number) => {
        const span = maxErr - minErr || 1;
        const normalized = (val - minErr) / span;
        return padY + (1 - normalized) * plotH;
    };

    // Puntos para líneas polyline SVG
    const secvPoints = optResults ? optResults.map(r => `${getX(r.components, optResults.length)},${getY(r.secv)}`).join(' ') : '';
    const secPoints = optResults ? optResults.map(r => `${getX(r.components, optResults.length)},${getY(r.sec)}`).join(' ') : '';

    return (
        <>
            <Card className="h-full">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4 border-b border-ui-border pb-3">
                        <div className="h-7 w-7 bg-ui-darkest text-ui-accent border border-ui-accent rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">
                            3
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-slate-100">Generación de Modelo (PLS)</h3>
                            <p className="text-[11px] text-slate-400 truncate">Regresión quimiométrica multivariable</p>
                        </div>
                    </div>
                    
                    {/* Scrollable Content Area */}
                    <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2 pb-2 min-h-0">
                        {/* Selector de LVs y Botón de Optimización */}
                        <div className="grid grid-cols-2 gap-3 items-end">
                            <div>
                                <label htmlFor="lv-input" className="block text-xs font-bold text-slate-400 mb-1 flex items-center gap-1">
                                    <span>Variables Latentes (LV)</span>
                                    <span className="text-[10px] text-ui-accent font-normal">(1-20)</span>
                                </label>
                                <input
                                    type="number"
                                    id="lv-input"
                                    value={nComponents}
                                    onChange={(e) => setNComponents(e.target.value)}
                                    min="1"
                                    max="20"
                                    className="w-full bg-ui-card border border-ui-border text-slate-100 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono shadow-sm"
                                />
                            </div>
                            <Button 
                                variant="secondary" 
                                onClick={handleOptimize} 
                                disabled={disabled || isOptimizing} 
                                className="h-[38px] text-xs font-bold flex items-center justify-center gap-1.5 border-ui-accent/30 hover:border-ui-accent text-slate-200"
                            >
                                {isOptimizing ? (
                                    <span className="flex items-center gap-1.5 animate-pulse text-ui-accent">
                                        <Activity size={14} className="animate-spin" />
                                        Evaluando CV...
                                    </span>
                                ) : (
                                    <>
                                        <OptimizeIcon />
                                        Optimizar LVs
                                    </>
                                )}
                            </Button>
                        </div>
                        
                        {/* PANEL HÍBRIDO DE RESULTADOS DE OPTIMIZACIÓN (GRÁFICO + TABLA) */}
                        {optResults && optResults.length > 0 && suggestedLV !== null && (
                            <div className="bg-ui-darkest/90 border border-ui-border rounded-xl p-3.5 space-y-3 animate-fade-in shadow-inner">
                                {/* Encabezado del Diagnóstico con Controles de Vista */}
                                <div className="flex items-center justify-between border-b border-ui-border/70 pb-2.5">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                                        <div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-xs font-extrabold text-slate-100">
                                                    Óptimo: <span className="text-emerald-400 font-mono">{suggestedLV} LVs</span>
                                                </span>
                                                <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30">
                                                    Mín. Error
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-mono">
                                                RMSECV: <span className="text-emerald-400 font-bold">{bestOptResult?.secv.toFixed(4)}</span> | SEC: {bestOptResult?.sec.toFixed(4)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Selector de Modo (Gráfico / Tabla / Ambos) y Botón Expandir */}
                                    <div className="flex items-center gap-1 bg-ui-card p-0.5 rounded-lg border border-ui-border">
                                        <button
                                            type="button"
                                            onClick={() => setViewMode('chart')}
                                            className={`p-1 rounded text-[10px] font-bold transition-colors ${viewMode === 'chart' ? 'bg-ui-accent text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                            title="Ver solo Mini-Gráfico"
                                        >
                                            <Activity size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setViewMode('table')}
                                            className={`p-1 rounded text-[10px] font-bold transition-colors ${viewMode === 'table' ? 'bg-ui-accent text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                            title="Ver solo Mini-Tabla"
                                        >
                                            <TableIcon size={12} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setViewMode('both')}
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors ${viewMode === 'both' ? 'bg-ui-accent text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white'}`}
                                            title="Ver Híbrido (Gráfico + Tabla)"
                                        >
                                            Ambos
                                        </button>
                                        <div className="w-[1px] h-3 bg-ui-border mx-0.5" />
                                        <button
                                            type="button"
                                            onClick={() => setIsDetailModalOpen(true)}
                                            className="p-1 rounded text-slate-400 hover:text-ui-accent transition-colors"
                                            title="Expandir a Pantalla Completa"
                                        >
                                            <Maximize2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                {/* Leyenda técnica interactiva */}
                                <div className="flex items-center justify-between text-[9.5px] px-1 text-slate-400">
                                    <div className="flex items-center gap-3">
                                        <span className="flex items-center gap-1">
                                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
                                            <span className="text-slate-300 font-medium">RMSECV (Val. Cruzada)</span>
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <span className="w-2.5 h-0.5 bg-sky-400 inline-block border-t border-dashed border-sky-400"></span>
                                            <span className="text-slate-400">SEC (Calibración)</span>
                                        </span>
                                    </div>
                                    <span className="text-[9px] text-slate-500 italic">Clic en un punto para seleccionar</span>
                                </div>

                                {/* 1. MINI-GRÁFICO INTERACTIVO (CURVA DE CODO / SCREE PLOT) */}
                                {(viewMode === 'chart' || viewMode === 'both') && (
                                    <div className="bg-ui-card/80 rounded-lg p-2 border border-ui-border/60 relative">
                                        <svg 
                                            viewBox={`0 0 ${svgWidth} ${svgHeight}`} 
                                            className="w-full h-[115px] overflow-visible select-none"
                                        >
                                            {/* Líneas guía horizontales (grid sutil) */}
                                            <line x1={padX} y1={padY} x2={svgWidth - padX} y2={padY} stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
                                            <line x1={padX} y1={padY + plotH / 2} x2={svgWidth - padX} y2={padY + plotH / 2} stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
                                            <line x1={padX} y1={svgHeight - padY} x2={svgWidth - padX} y2={svgHeight - padY} stroke="#334155" strokeWidth="0.8" />

                                            {/* Etiquetas del eje Y (máximo y mínimo) */}
                                            <text x={padX - 4} y={padY + 3} textAnchor="end" fill="#64748b" fontSize="8" fontFamily="monospace">
                                                {maxErr.toFixed(3)}
                                            </text>
                                            <text x={padX - 4} y={svgHeight - padY + 3} textAnchor="end" fill="#64748b" fontSize="8" fontFamily="monospace">
                                                {minErr.toFixed(3)}
                                            </text>

                                            {/* Línea SEC (Calibración) */}
                                            <polyline 
                                                fill="none" 
                                                stroke="#38bdf8" 
                                                strokeWidth="1.5" 
                                                strokeDasharray="4 3" 
                                                strokeOpacity="0.8"
                                                points={secPoints} 
                                            />

                                            {/* Línea RMSECV (Validación Cruzada) */}
                                            <polyline 
                                                fill="none" 
                                                stroke="#10b981" 
                                                strokeWidth="2.2" 
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                points={secvPoints} 
                                            />

                                            {/* Puntos y zonas de clic para cada LV */}
                                            {optResults.map((r) => {
                                                const cx = getX(r.components, optResults.length);
                                                const cySecv = getY(r.secv);
                                                const isOptimal = r.components === suggestedLV;
                                                const isSelected = r.components === currentLVNum;
                                                const isHovered = hoveredResult?.components === r.components;

                                                return (
                                                    <g 
                                                        key={r.components}
                                                        className="cursor-pointer"
                                                        onClick={() => setNComponents(r.components.toString())}
                                                        onMouseEnter={() => setHoveredResult(r)}
                                                        onMouseLeave={() => setHoveredResult(null)}
                                                    >
                                                        {/* Línea vertical en hover o seleccionado */}
                                                        {(isSelected || isHovered) && (
                                                            <line 
                                                                x1={cx} 
                                                                y1={padY} 
                                                                x2={cx} 
                                                                y2={svgHeight - padY} 
                                                                stroke={isSelected ? "#0ea5e9" : "#64748b"} 
                                                                strokeWidth={isSelected ? 1.5 : 0.8} 
                                                                strokeDasharray="2 2"
                                                            />
                                                        )}

                                                        {/* Halo verde si es el óptimo */}
                                                        {isOptimal && (
                                                            <circle 
                                                                cx={cx} 
                                                                cy={cySecv} 
                                                                r={8} 
                                                                fill="#10b981" 
                                                                fillOpacity="0.25" 
                                                                className="animate-pulse" 
                                                            />
                                                        )}

                                                        {/* Anillo de selección si es la LV actual */}
                                                        {isSelected && (
                                                            <circle 
                                                                cx={cx} 
                                                                cy={cySecv} 
                                                                r={6.5} 
                                                                fill="none" 
                                                                stroke="#ffffff" 
                                                                strokeWidth="1.8" 
                                                            />
                                                        )}

                                                        {/* Punto central RMSECV */}
                                                        <circle 
                                                            cx={cx} 
                                                            cy={cySecv} 
                                                            r={isOptimal ? 4.5 : 3.5} 
                                                            fill={isOptimal ? "#34d399" : (isSelected ? "#0ea5e9" : "#10b981")} 
                                                            stroke="#0f172a" 
                                                            strokeWidth="1.2" 
                                                        />

                                                        {/* Etiqueta del número de LV en el eje X */}
                                                        <text 
                                                            x={cx} 
                                                            y={svgHeight - padY + 11} 
                                                            textAnchor="middle" 
                                                            fill={isSelected ? "#38bdf8" : (isOptimal ? "#34d399" : "#94a3b8")} 
                                                            fontSize={isSelected || isOptimal ? "8.5" : "7.5"} 
                                                            fontWeight={isSelected || isOptimal ? "bold" : "normal"}
                                                            fontFamily="monospace"
                                                        >
                                                            {r.components}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                        </svg>

                                        {/* Tooltip flotante con datos al pasar el cursor */}
                                        {hoveredResult && (
                                            <div className="absolute top-1.5 right-2 bg-slate-950/95 border border-ui-border px-2 py-1 rounded shadow-lg text-[10px] font-mono pointer-events-none z-10 flex items-center gap-2">
                                                <span className="font-bold text-slate-200">LV {hoveredResult.components}:</span>
                                                <span className="text-emerald-400">RMSECV {hoveredResult.secv.toFixed(4)}</span>
                                                <span className="text-slate-400">|</span>
                                                <span className="text-sky-300">SEC {hoveredResult.sec.toFixed(4)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 2. MINI-TABLA COMPACTA DE VALORES */}
                                {(viewMode === 'table' || viewMode === 'both') && (
                                    <div className="border border-ui-border rounded-lg overflow-hidden bg-ui-card/60">
                                        <div className="max-h-[110px] overflow-y-auto custom-scrollbar">
                                            <table className="w-full text-left text-[10.5px]">
                                                <thead className="bg-ui-darkest/90 text-slate-400 text-[9px] uppercase font-bold sticky top-0 border-b border-ui-border/60">
                                                    <tr>
                                                        <th className="px-2.5 py-1">LV</th>
                                                        <th className="px-2.5 py-1 text-right text-emerald-400">RMSECV</th>
                                                        <th className="px-2.5 py-1 text-right text-sky-400">SEC (Cal)</th>
                                                        <th className="px-2 py-1 text-center">Estado</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-ui-border/40 font-mono">
                                                    {optResults.map((r) => {
                                                        const isOptimal = r.components === suggestedLV;
                                                        const isSelected = r.components === currentLVNum;

                                                        return (
                                                            <tr 
                                                                key={r.components}
                                                                onClick={() => setNComponents(r.components.toString())}
                                                                className={`cursor-pointer transition-colors ${
                                                                    isSelected 
                                                                        ? 'bg-ui-accent/15 text-white font-bold' 
                                                                        : (isOptimal ? 'bg-emerald-500/10 text-emerald-300 font-semibold' : 'text-slate-300 hover:bg-slate-800/60')
                                                                }`}
                                                            >
                                                                <td className="px-2.5 py-1">
                                                                    <div className="flex items-center gap-1">
                                                                        {isSelected && <span className="text-ui-accent font-sans text-xs">▶</span>}
                                                                        <span>{r.components}</span>
                                                                    </div>
                                                                </td>
                                                                <td className={`px-2.5 py-1 text-right ${isOptimal ? 'text-emerald-400 font-bold' : ''}`}>
                                                                    {r.secv.toFixed(4)}
                                                                </td>
                                                                <td className="px-2.5 py-1 text-right text-slate-400">
                                                                    {r.sec.toFixed(4)}
                                                                </td>
                                                                <td className="px-2 py-1 text-center font-sans text-[9px]">
                                                                    {isOptimal ? (
                                                                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                                                            Óptimo
                                                                        </span>
                                                                    ) : (
                                                                        isSelected ? (
                                                                            <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-bold">
                                                                                Activo
                                                                            </span>
                                                                        ) : (
                                                                            <span className="text-slate-600 hover:text-slate-400">Elegir</span>
                                                                        )
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Nota Quimiométrica de Apoyo */}
                                <div className="p-2 bg-slate-900/60 rounded-lg border border-slate-800 flex items-start gap-1.5 text-[10px] text-slate-300">
                                    <Info size={13} className="text-ui-accent shrink-0 mt-0.5" />
                                    <span>
                                        El mínimo de RMSECV evita el sobreajuste. Puedes seleccionar directamente cualquier LV haciendo clic en la curva o en la tabla.
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Static Footer with Final Button */}
                    <div className="pt-4 border-t border-ui-border">
                        <Button onClick={handleRun} disabled={disabled} className="w-full font-bold shadow-md">
                            <RunIcon />
                            Generar Modelo PLS ({nComponents} LVs)
                        </Button>
                    </div>
                </div>
            </Card>

            {/* ========================================================================= */}
            {/* MODAL DE DETALLE COMPLETO DE OPTIMIZACIÓN (EXPANDIDO)                      */}
            {/* ========================================================================= */}
            {isDetailModalOpen && optResults && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-ui-card border border-ui-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b border-ui-border bg-ui-darkest/70">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-ui-accent/10 text-ui-accent border border-ui-accent/20">
                                    <Activity size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        Diagnóstico de Optimización de Variables Latentes
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-mono font-bold border border-emerald-500/30">
                                            Óptimo: {suggestedLV} LVs
                                        </span>
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        Evaluación iterativa LOOCV (Leave-One-Out) vs Error de Calibración
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsDetailModalOpen(false)}
                                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                            {/* Panel con Gráfico Ampliado y Tabla Lado a Lado */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                {/* Gráfico Ampliado */}
                                <div className="lg:col-span-7 bg-ui-darkest rounded-xl p-4 border border-ui-border space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                            <TrendingDown size={15} className="text-emerald-400" />
                                            Curva de Codo (RMSECV vs LVs)
                                        </h4>
                                        <div className="flex items-center gap-3 text-xs">
                                            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                                                <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block"></span>
                                                RMSECV
                                            </span>
                                            <span className="flex items-center gap-1.5 text-sky-400 font-medium">
                                                <span className="w-3 h-0.5 bg-sky-400 inline-block border-t border-dashed border-sky-400"></span>
                                                SEC
                                            </span>
                                        </div>
                                    </div>

                                    {/* SVG Grande */}
                                    <div className="bg-ui-card rounded-lg p-3 border border-ui-border/50">
                                        <svg viewBox="0 0 450 180" className="w-full h-[220px] overflow-visible">
                                            {/* Grids */}
                                            <line x1="40" y1="20" x2="430" y2="20" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
                                            <line x1="40" y1="95" x2="430" y2="95" stroke="#334155" strokeWidth="0.5" strokeDasharray="3 3" />
                                            <line x1="40" y1="160" x2="430" y2="160" stroke="#334155" strokeWidth="1" />

                                            {/* Eje Y */}
                                            <text x="34" y="24" textAnchor="end" fill="#94a3b8" fontSize="9" fontFamily="monospace">{maxErr.toFixed(3)}</text>
                                            <text x="34" y="99" textAnchor="end" fill="#64748b" fontSize="9" fontFamily="monospace">{((maxErr + minErr) / 2).toFixed(3)}</text>
                                            <text x="34" y="163" textAnchor="end" fill="#94a3b8" fontSize="9" fontFamily="monospace">{minErr.toFixed(3)}</text>

                                            {/* Polyline SEC */}
                                            <polyline 
                                                fill="none" 
                                                stroke="#38bdf8" 
                                                strokeWidth="2" 
                                                strokeDasharray="4 4"
                                                points={optResults.map(r => {
                                                    const x = 40 + ((r.components - 1) / (optResults.length - 1 || 1)) * 390;
                                                    const y = 20 + (1 - (r.sec - minErr) / (maxErr - minErr || 1)) * 140;
                                                    return `${x},${y}`;
                                                }).join(' ')} 
                                            />

                                            {/* Polyline RMSECV */}
                                            <polyline 
                                                fill="none" 
                                                stroke="#10b981" 
                                                strokeWidth="3" 
                                                strokeLinecap="round"
                                                points={optResults.map(r => {
                                                    const x = 40 + ((r.components - 1) / (optResults.length - 1 || 1)) * 390;
                                                    const y = 20 + (1 - (r.secv - minErr) / (maxErr - minErr || 1)) * 140;
                                                    return `${x},${y}`;
                                                }).join(' ')} 
                                            />

                                            {/* Puntos y etiquetas */}
                                            {optResults.map(r => {
                                                const x = 40 + ((r.components - 1) / (optResults.length - 1 || 1)) * 390;
                                                const y = 20 + (1 - (r.secv - minErr) / (maxErr - minErr || 1)) * 140;
                                                const isOpt = r.components === suggestedLV;
                                                const isSel = r.components === currentLVNum;

                                                return (
                                                    <g 
                                                        key={r.components} 
                                                        className="cursor-pointer"
                                                        onClick={() => {
                                                            setNComponents(r.components.toString());
                                                        }}
                                                    >
                                                        {isOpt && (
                                                            <circle cx={x} cy={y} r="10" fill="#10b981" fillOpacity="0.25" className="animate-pulse" />
                                                        )}
                                                        {isSel && (
                                                            <circle cx={x} cy={y} r="8" fill="none" stroke="#ffffff" strokeWidth="2" />
                                                        )}
                                                        <circle cx={x} cy={y} r={isOpt ? 5 : 4} fill={isOpt ? "#34d399" : (isSel ? "#0ea5e9" : "#10b981")} stroke="#0f172a" strokeWidth="1.5" />
                                                        
                                                        {/* Número en eje X */}
                                                        <text 
                                                            x={x} 
                                                            y="174" 
                                                            textAnchor="middle" 
                                                            fill={isSel ? "#38bdf8" : (isOpt ? "#34d399" : "#94a3b8")} 
                                                            fontSize={isSel || isOpt ? "10" : "9"} 
                                                            fontWeight={isSel || isOpt ? "bold" : "normal"}
                                                            fontFamily="monospace"
                                                        >
                                                            {r.components}
                                                        </text>
                                                    </g>
                                                );
                                            })}
                                        </svg>
                                    </div>
                                    <p className="text-[11px] text-slate-400">
                                        Observa cómo el SEC desciende continuamente, mientras que el RMSECV alcanza un punto de codo mínimo y comienza a oscilar o subir cuando el modelo empieza a sobreajustarse.
                                    </p>
                                </div>

                                {/* Tabla Completa de Valores */}
                                <div className="lg:col-span-5 bg-ui-darkest rounded-xl p-4 border border-ui-border space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                                        <TableIcon size={15} className="text-ui-accent" />
                                        Tabla Comparativa Detallada
                                    </h4>

                                    <div className="border border-ui-border rounded-lg overflow-hidden bg-ui-card">
                                        <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-ui-darkest text-slate-400 text-[10px] uppercase font-bold sticky top-0 border-b border-ui-border">
                                                    <tr>
                                                        <th className="px-3 py-2">LV</th>
                                                        <th className="px-3 py-2 text-right text-emerald-400">RMSECV</th>
                                                        <th className="px-3 py-2 text-right text-sky-400">SEC (Cal)</th>
                                                        <th className="px-3 py-2 text-center">Acción</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-ui-border font-mono">
                                                    {optResults.map((r, idx) => {
                                                        const isOptimal = r.components === suggestedLV;
                                                        const isSelected = r.components === currentLVNum;

                                                        return (
                                                            <tr 
                                                                key={r.components}
                                                                className={`transition-colors ${
                                                                    isSelected 
                                                                        ? 'bg-ui-accent/20 text-white font-bold' 
                                                                        : (isOptimal ? 'bg-emerald-500/15 text-emerald-300 font-semibold' : 'text-slate-300 hover:bg-slate-800')
                                                                }`}
                                                            >
                                                                <td className="px-3 py-2">
                                                                    <div className="flex items-center gap-1.5">
                                                                        {isSelected && <span className="text-ui-accent">▶</span>}
                                                                        <span>{r.components} LVs</span>
                                                                        {isOptimal && (
                                                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-300 font-bold">
                                                                                Óptimo
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className={`px-3 py-2 text-right ${isOptimal ? 'text-emerald-400 font-bold' : ''}`}>
                                                                    {r.secv.toFixed(4)}
                                                                </td>
                                                                <td className="px-3 py-2 text-right text-slate-400">
                                                                    {r.sec.toFixed(4)}
                                                                </td>
                                                                <td className="px-3 py-2 text-center font-sans">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setNComponents(r.components.toString());
                                                                        }}
                                                                        className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all ${
                                                                            isSelected 
                                                                                ? 'bg-ui-accent text-slate-950 shadow-sm' 
                                                                                : 'bg-slate-800 hover:bg-ui-accent hover:text-slate-950 text-slate-300'
                                                                        }`}
                                                                    >
                                                                        {isSelected ? 'Seleccionada' : 'Seleccionar'}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="text-[11px] text-slate-400 space-y-1">
                                        <p>
                                            • <strong>Regla de Parsimonia:</strong> Si dos cantidades de LVs tienen un RMSECV prácticamente igual, siempre se prefiere la menor para mayor robustez de rutina.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-ui-border bg-ui-darkest/70 flex items-center justify-between">
                            <div className="text-xs text-slate-400">
                                Variable Latente actualmente seleccionada: <strong className="text-ui-accent font-mono text-sm">{nComponents} LVs</strong>
                            </div>
                            <div className="flex items-center gap-3">
                                <Button 
                                    variant="secondary" 
                                    size="sm" 
                                    onClick={() => setIsDetailModalOpen(false)}
                                >
                                    Cerrar Diagnóstico
                                </Button>
                                <Button 
                                    size="sm" 
                                    onClick={() => {
                                        setIsDetailModalOpen(false);
                                        handleRun();
                                    }}
                                    className="font-bold shadow-md"
                                >
                                    <RunIcon />
                                    Aplicar y Calibrar ({nComponents} LVs)
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ModelGenerator;
