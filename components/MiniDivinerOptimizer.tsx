import React, { useState } from 'react';
import { Sparkles, Cpu, CheckCircle2, Award, Play, ArrowRight, ShieldAlert, BarChart2, Eye, ArrowLeft } from 'lucide-react';
import { Sample, PreprocessingStep, ModelResults } from '../types';
import { runMiniDiviner, DivinerResultItem } from '../services/chemometrics';
import Card from './Card';
import Button from './Button';

interface MiniDivinerOptimizerProps {
    samples: Sample[];
    onLoadModelAndSteps: (steps: PreprocessingStep[], results: ModelResults) => void;
    onContinueToPreprocessing?: () => void;
    onBackToData?: () => void;
    onDirectToModel?: (steps: PreprocessingStep[], results: ModelResults) => void;
}

export const MiniDivinerOptimizer: React.FC<MiniDivinerOptimizerProps> = ({
    samples,
    onLoadModelAndSteps,
    onContinueToPreprocessing,
    onBackToData,
    onDirectToModel
}) => {
    const [isCalculating, setIsCalculating] = useState(false);
    const [results, setResults] = useState<DivinerResultItem[] | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [appliedItem, setAppliedItem] = useState<DivinerResultItem | null>(null);

    const activeSamples = samples.filter(s => s.active);

    const handleRunDiviner = () => {
        if (activeSamples.length < 5) {
            alert("Se requieren al menos 5 muestras activas para ejecutar el cribado quimiométrico de Advicer.");
            return;
        }

        setIsCalculating(true);
        setTimeout(() => {
            try {
                const optimizedList = runMiniDiviner(activeSamples);
                setResults(optimizedList);
                if (optimizedList.length > 0) {
                    setSelectedId(optimizedList[0].id);
                }
            } catch (error: any) {
                console.error("Error en Advicer:", error);
                alert(`Error al ejecutar el optimizador Advicer: ${error.message}`);
            } finally {
                setIsCalculating(false);
            }
        }, 100);
    };

    const handleLoadSelected = (item: DivinerResultItem) => {
        setSelectedId(item.id);
        setAppliedItem(item);
        onLoadModelAndSteps(item.preprocessingSteps, item.modelResults);
    };

    const handleLoadAndInspect = (item: DivinerResultItem) => {
        handleLoadSelected(item);
        if (onContinueToPreprocessing) {
            onContinueToPreprocessing();
        }
    };

    const handleLoadAndGoToModel = (item: DivinerResultItem) => {
        setSelectedId(item.id);
        setAppliedItem(item);
        if (onDirectToModel) {
            onDirectToModel(item.preprocessingSteps, item.modelResults);
        } else {
            onLoadModelAndSteps(item.preprocessingSteps, item.modelResults);
        }
    };

    return (
        <div className="flex flex-col gap-6 animate-fade-in w-full">
            {/* Cabecera Explicativa Advisor */}
            <Card className="bg-gradient-to-r from-ui-card via-ui-card to-cyan-950/30 border-ui-accent/30 p-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-ui-accent/20 border border-ui-accent/40 text-ui-accent shrink-0">
                            <Sparkles className="w-7 h-7" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold text-white">Advisor</h3>
                            </div>
                            <p className="text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                                Advisor evalúa automáticamente las combinaciones matemáticas óptimas (SNV, MSC, Derivadas FOSS 1ª y 2ª) junto al número ideal de Factores PLS (LVs), minimizando el error de validación cruzada ($RMSECV$).
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto justify-end shrink-0">
                        <Button
                            variant="primary"
                            onClick={handleRunDiviner}
                            disabled={isCalculating || activeSamples.length < 5}
                            className="bg-gradient-to-r from-ui-accent to-cyan-500 hover:from-cyan-400 hover:to-ui-accent text-ui-darkest font-bold px-6 py-3 shadow-lg shadow-ui-accent/20 flex items-center gap-2 cursor-pointer"
                        >
                            {isCalculating ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-ui-darkest border-t-transparent rounded-full animate-spin" />
                                    Evaluando Modelos...
                                </>
                            ) : (
                                <>
                                    <Play className="w-4 h-4 fill-current" />
                                    Ejecutar Cribado Advisor
                                </>
                            )}
                        </Button>
                    </div>
                </div>

                {activeSamples.length < 5 && (
                    <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center gap-2 text-xs text-amber-300">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>Se necesitan al menos 5 muestras activas en el lote para realizar validación cruzada multimodelo confiable. Actualmente tienes {activeSamples.length} muestras activas.</span>
                    </div>
                )}
            </Card>

            {/* Aviso de Receta Activa si ya se seleccionó una */}
            {appliedItem && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">Receta Aplicada:</span>
                                <span className="font-bold text-white text-sm">{appliedItem.recipeName}</span>
                                <span className="px-2 py-0.5 rounded bg-ui-darkest border border-emerald-500/40 text-[11px] font-mono text-emerald-300">
                                    {appliedItem.components} LVs | SECV: {appliedItem.secv.toFixed(4)} | R²: {appliedItem.r2.toFixed(3)}
                                </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-0.5">
                                La configuración matemática ha sido cargada. Puedes avanzar al Paso 3 para inspeccionar visualmente los espectros transformados.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {onContinueToPreprocessing && (
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={onContinueToPreprocessing}
                                className="flex items-center gap-1.5 font-bold text-xs"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                Inspeccionar en Paso 3
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Resultados de la Optimización */}
            {results && results.length > 0 && (
                <div className="flex flex-col gap-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-ui-accent" />
                            <h4 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                                Ranking Quimiométrico Ordenado por Menor Error RMSECV ({results.length} combinaciones evaluadas)
                            </h4>
                        </div>
                        <span className="text-xs text-slate-400 font-mono">
                            Top 1 representa la mejor generalización en validación cruzada
                        </span>
                    </div>

                    <div className="bg-ui-card border border-ui-border rounded-xl overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-ui-darkest/80 text-[11px] font-mono text-slate-400 uppercase tracking-wider border-b border-ui-border">
                                        <th className="py-3 px-4 text-center">Rank</th>
                                        <th className="py-3 px-4">Receta de Preprocesamiento</th>
                                        <th className="py-3 px-4 text-center">LVs</th>
                                        <th className="py-3 px-4 text-right">RMSECV (SECV)</th>
                                        <th className="py-3 px-4 text-right">SEC (Cal.)</th>
                                        <th className="py-3 px-4 text-right">R² CV</th>
                                        <th className="py-3 px-4 text-right">Q²</th>
                                        <th className="py-3 px-4 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ui-border/60 text-xs font-mono">
                                    {results.map((item, idx) => {
                                        const rank = idx + 1;
                                        const isSelected = selectedId === item.id;
                                        
                                        // Código de colores semántico según el ranking
                                        let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
                                        let rowHighlight = isSelected ? 'bg-ui-accent/10 border-l-4 border-l-ui-accent' : 'hover:bg-ui-dark/60';
                                        
                                        if (rank === 1) {
                                            badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
                                            rowHighlight = isSelected ? 'bg-emerald-500/20 border-l-4 border-l-emerald-400' : 'bg-emerald-500/5 hover:bg-emerald-500/10';
                                        } else if (rank >= 2 && rank <= 5) {
                                            badgeColor = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
                                        } else if (rank > 5 && rank <= 10) {
                                            badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                                        }

                                        return (
                                            <tr key={item.id} className={`transition-colors ${rowHighlight}`}>
                                                <td className="py-3.5 px-4 text-center">
                                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs border ${badgeColor}`}>
                                                        {rank === 1 ? <Award className="w-3.5 h-3.5 text-emerald-400 mr-0.5" /> : null}
                                                        {rank}
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-100 font-sans">{item.recipeName}</span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {item.preprocessingSteps.length === 0 ? 'Espectro Crudo' : item.preprocessingSteps.map(s => s.method).join(' + ')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <span className="px-2 py-0.5 rounded bg-ui-darkest border border-ui-border text-slate-200">
                                                        {item.components} LV
                                                    </span>
                                                </td>
                                                <td className="py-3.5 px-4 text-right font-bold text-emerald-400 text-sm">
                                                    {item.secv.toFixed(4)}
                                                </td>
                                                <td className="py-3.5 px-4 text-right text-slate-300">
                                                    {item.sec.toFixed(4)}
                                                </td>
                                                <td className="py-3.5 px-4 text-right text-cyan-300 font-semibold">
                                                    {item.r2.toFixed(3)}
                                                </td>
                                                <td className="py-3.5 px-4 text-right text-slate-300">
                                                    {item.q2.toFixed(3)}
                                                </td>
                                                <td className="py-3.5 px-4 text-center">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        <Button
                                                            variant={rank === 1 ? 'primary' : 'secondary'}
                                                            onClick={() => handleLoadAndInspect(item)}
                                                            className={`text-xs px-2.5 py-1.5 cursor-pointer flex items-center gap-1 ${
                                                                rank === 1 
                                                                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white font-bold shadow-md shadow-emerald-500/20' 
                                                                    : 'bg-ui-dark border border-ui-border hover:border-ui-accent text-slate-200'
                                                            }`}
                                                            title="Aplica la receta y pasa al visor de preprocesamiento para inspeccionar el espectro"
                                                        >
                                                            <Eye className="w-3.5 h-3.5" />
                                                            {isSelected ? 'Cargado ✓' : 'Inspeccionar'}
                                                        </Button>

                                                        <Button
                                                            variant="secondary"
                                                            onClick={() => handleLoadAndGoToModel(item)}
                                                            className="text-xs px-2 py-1.5 cursor-pointer bg-ui-darkest border border-ui-border hover:border-emerald-400 text-slate-300 hover:text-white"
                                                            title="Aplica y salta directo a la calibración del modelo"
                                                        >
                                                            Calibrar →
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {!results && !isCalculating && (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-ui-card border border-ui-border rounded-xl">
                    <Cpu className="w-12 h-12 text-slate-500 mb-3 animate-pulse" />
                    <h4 className="text-base font-bold text-slate-200">Advisor está listo para el cribado</h4>
                    <p className="text-sm text-slate-400 max-w-md mt-1 mb-4">
                        Ejecuta la búsqueda multimodelo automática para identificar la mejor receta de preprocesamiento antes de inspeccionar los espectros.
                    </p>
                    <div className="flex items-center gap-3">
                        <Button
                            variant="primary"
                            onClick={handleRunDiviner}
                            disabled={activeSamples.length < 5}
                            className="bg-ui-accent text-ui-darkest font-bold px-6 py-2.5 shadow-lg shadow-ui-accent/20 cursor-pointer"
                        >
                            Iniciar Cribado Automático
                        </Button>
                        {onContinueToPreprocessing && (
                            <Button
                                variant="secondary"
                                onClick={onContinueToPreprocessing}
                                className="text-xs text-slate-300 border border-ui-border hover:border-slate-500"
                            >
                                Saltar a Preprocesamiento Manual →
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Barra Inferior de Navegación de Flujo */}
            <div className="flex items-center justify-between p-4 bg-ui-card border border-ui-border rounded-xl mt-2">
                <Button
                    variant="secondary"
                    size="md"
                    onClick={onBackToData}
                    className="flex items-center gap-2 text-xs font-semibold"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Volver a Datos & Espectros (Paso 1)
                </Button>

                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">
                        {appliedItem ? `Receta activa: ${appliedItem.recipeName}` : 'Paso 2: Guía de Screening'}
                    </span>
                    {onContinueToPreprocessing && (
                        <Button
                            variant="primary"
                            size="md"
                            onClick={onContinueToPreprocessing}
                            className="flex items-center gap-2 font-bold shadow-md text-xs cursor-pointer"
                        >
                            Continuar a Preprocesamiento & Inspección (Paso 3)
                            <ArrowRight className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
export default MiniDivinerOptimizer;
