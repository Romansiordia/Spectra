import React, { useMemo } from 'react';
import { Sparkles, CheckCircle2, Sliders, ArrowRight, Zap, Activity, Info, BarChart2 } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { PreprocessingStep, Sample, SpectralDiagnostic } from '../types';
import { diagnoseSpectralData, arePreprocessingStepsEqual } from '../services/chemometrics';

interface AnalyticalRecommendationCardProps {
    wavelengths: number[];
    samples: Sample[];
    currentSteps: PreprocessingStep[];
    onApplyRecommendation: (steps: PreprocessingStep[]) => void;
    onContinueToPca: () => void;
    onBackToData: () => void;
    disabled?: boolean;
}

export const AnalyticalRecommendationCard: React.FC<AnalyticalRecommendationCardProps> = ({
    wavelengths,
    samples,
    currentSteps,
    onApplyRecommendation,
    onContinueToPca,
    onBackToData,
    disabled = false
}) => {
    const activeSamples = useMemo(() => samples.filter(s => s.active), [samples]);

    // Calcular diagnóstico espectral dinámico en tiempo real
    const diagnostic: SpectralDiagnostic = useMemo(() => {
        return diagnoseSpectralData(wavelengths, activeSamples);
    }, [wavelengths, activeSamples]);

    // Comprobar si los pasos actuales ya coinciden con la recomendación
    const isApplied = useMemo(() => {
        return arePreprocessingStepsEqual(currentSteps, diagnostic.recommendedSteps);
    }, [currentSteps, diagnostic.recommendedSteps]);

    // Etiqueta legible de cada paso sugerido
    const formatStepName = (step: PreprocessingStep) => {
        switch (step.method) {
            case 'snv': return 'SNV';
            case 'msc': return 'MSC';
            case 'detrend': return 'Detrend';
            case 'winisi2441': return 'WinISI 2,4,4,1';
            case 'winisi1441': return 'WinISI 1,4,4,1';
            case 'winisi1881': return 'WinISI 1,8,8,1';
            case 'winisi2861': return 'WinISI 2,8,6,1';
            case 'savgol1': return `1ª Derivada SG (w=${step.params?.windowSize || 11})`;
            case 'savgol2': return `2ª Derivada SG (w=${step.params?.windowSize || 11})`;
            case 'savgolsmooth': return `Suavizado SG (w=${step.params?.windowSize || 11})`;
            default: return step.method;
        }
    };

    return (
        <Card className="border border-ui-accent/30 shadow-lg bg-gradient-to-b from-ui-card to-ui-dark/95">
            <div className="flex flex-col gap-3">
                {/* Cabecera con título e indicador de estado dinámico */}
                <div className="flex items-center justify-between gap-2 border-b border-ui-border/60 pb-2.5">
                    <div className="flex items-center gap-2 text-ui-accent">
                        <Sparkles className="w-4 h-4 animate-pulse text-ui-accent" />
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                            Recomendación Analítica Dinámica
                        </h4>
                    </div>
                    {isApplied ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Aplicada
                        </span>
                    ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-ui-accent/15 text-ui-accent border border-ui-accent/30 flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            Auto-Detectada
                        </span>
                    )}
                </div>

                {/* Métricas de Diagnóstico Espectral en Tiempo Real */}
                <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-ui-darkest/70 border border-ui-border/50 text-center">
                    <div className="flex flex-col items-center justify-center p-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Paso Espectral</span>
                        <span className="text-xs font-mono font-bold text-slate-200">
                            Δλ {diagnostic.deltaLambda.toFixed(1)} nm
                        </span>
                        <span className="text-[9px] text-slate-400">
                            {diagnostic.deltaLambda <= 1.0 ? 'Alta Resolución' : diagnostic.deltaLambda <= 3.5 ? 'Res. Estándar' : 'Baja Densidad'}
                        </span>
                    </div>

                    <div className="flex flex-col items-center justify-center p-1 border-x border-ui-border/50">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Dispersión Luz</span>
                        <span className={`text-xs font-bold ${
                            diagnostic.scatterLevel === 'high' ? 'text-amber-400' : diagnostic.scatterLevel === 'moderate' ? 'text-sky-300' : 'text-slate-300'
                        }`}>
                            {diagnostic.scatterLevel === 'high' ? 'Alta (Partículas)' : diagnostic.scatterLevel === 'moderate' ? 'Moderada' : 'Leve'}
                        </span>
                        <span className="text-[9px] text-slate-400">Efecto Muestra</span>
                    </div>

                    <div className="flex flex-col items-center justify-center p-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-400">Ruido Señal</span>
                        <span className={`text-xs font-bold ${
                            diagnostic.noiseLevel === 'high' ? 'text-red-400' : diagnostic.noiseLevel === 'moderate' ? 'text-amber-300' : 'text-emerald-400'
                        }`}>
                            {diagnostic.noiseLevel === 'high' ? 'Notable' : diagnostic.noiseLevel === 'moderate' ? 'Controlado' : 'Mínimo'}
                        </span>
                        <span className="text-[9px] text-slate-400">2ª Diferencia</span>
                    </div>
                </div>

                {/* Título y Justificación Quimiométrica */}
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-200">Tratamiento Óptimo Sugerido:</span>
                    </div>
                    
                    {/* Badges de pasos sugeridos */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {diagnostic.recommendedSteps.map((step, idx) => (
                            <React.Fragment key={idx}>
                                {idx > 0 && <span className="text-slate-400 text-xs font-bold">+</span>}
                                <span className="px-2 py-0.5 rounded text-xs font-medium font-mono bg-ui-dark text-slate-200 border border-ui-border shadow-sm">
                                    {formatStepName(step)}
                                </span>
                            </React.Fragment>
                        ))}
                    </div>

                    <p className="text-[11px] text-slate-300 leading-snug pt-1">
                        {diagnostic.rationale}
                    </p>
                </div>

                {/* Botón de Aplicación Rápida con 1 Clic */}
                <div className="pt-2 border-t border-ui-border/60 flex flex-col gap-2">
                    {isApplied ? (
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium flex items-center justify-center gap-2 text-center">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span>Tratamiento recomendado activo en el visor</span>
                        </div>
                    ) : (
                        <Button
                            variant="primary"
                            size="sm"
                            disabled={disabled || activeSamples.length === 0}
                            onClick={() => onApplyRecommendation(diagnostic.recommendedSteps)}
                            className="w-full flex items-center justify-center gap-2 font-bold text-xs py-2 shadow-md bg-gradient-to-r from-ui-accent to-emerald-600 hover:from-ui-accent/90 hover:to-emerald-500 text-slate-900"
                        >
                            <Sparkles className="w-4 h-4" />
                            Cargar y Aplicar Tratamiento Sugerido
                        </Button>
                    )}

                    {/* Nota de libertad analítica para el usuario */}
                    <div className="flex items-start gap-1.5 text-[10px] text-slate-400 leading-tight">
                        <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span>
                            <strong className="text-slate-300">Libertad analítica:</strong> Puedes modificar parámetros, agregar o quitar pasos en el panel superior a voluntad.
                        </span>
                    </div>
                </div>

                {/* Botones de navegación en el flujo de calibración */}
                <div className="pt-2 border-t border-ui-border/60 flex flex-col gap-2">
                    <Button
                        variant="primary"
                        size="md"
                        disabled={activeSamples.length < 3}
                        onClick={onContinueToPca}
                        className="w-full flex items-center justify-center gap-2 font-bold shadow-md"
                    >
                        Continuar a Análisis PCA
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onBackToData}
                        className="w-full text-xs text-slate-400 hover:text-white border-ui-border"
                    >
                        ← Volver a Datos & Espectros
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default AnalyticalRecommendationCard;
