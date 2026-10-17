import React, { useMemo, useState } from 'react';
import { Sparkles, CheckCircle2, ArrowRight, Zap, Star, Award, ShieldCheck, Check } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { PreprocessingStep, Sample, SpectralDiagnostic, RecommendedCombination } from '../types';
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

    // Diagnóstico espectral dinámico ordenado por idoneidad (1, 2, 3)
    const diagnostic: SpectralDiagnostic = useMemo(() => {
        return diagnoseSpectralData(wavelengths, activeSamples);
    }, [wavelengths, activeSamples]);

    // Feedback visual momentáneo tras aplicar
    const [justLoadedId, setJustLoadedId] = useState<string | null>(null);

    // Formateo conciso de etiquetas de pasos de preprocesamiento
    const formatStepShort = (step: PreprocessingStep): string => {
        switch (step.method) {
            case 'snv': return 'SNV';
            case 'msc': return 'MSC';
            case 'detrend': return 'Detrend';
            case 'winisi2441': return 'WinISI 2,4,4,1';
            case 'winisi1441': return 'WinISI 1,4,4,1';
            case 'winisi1881': return 'WinISI 1,8,8,1';
            case 'winisi2861': return 'WinISI 2,8,6,1';
            case 'savgol1': return `1ª Deriv. SG`;
            case 'savgol2': return `2ª Deriv. SG`;
            case 'savgolsmooth': return `Suavizado SG`;
            default: return step.method;
        }
    };

    // Combinaciones (1, 2, 3) ordenadas
    const combinations: RecommendedCombination[] = useMemo(() => {
        return diagnostic.combinations || [];
    }, [diagnostic.combinations]);

    // Opción número 1 recomendada
    const bestOption = useMemo(() => {
        if (combinations.length === 0) return null;
        return combinations.find(c => c.rank === 1) || combinations[0];
    }, [combinations]);

    // Comprobar cuál de las 3 opciones coincide con los pasos activos actualmente
    const activeCombinationId = useMemo(() => {
        for (const comb of combinations) {
            if (arePreprocessingStepsEqual(currentSteps, comb.steps)) {
                return comb.id;
            }
        }
        return null;
    }, [currentSteps, combinations]);

    const isBestOptionActive = bestOption && activeCombinationId === bestOption.id;

    const handleLoadCombination = (comb: RecommendedCombination) => {
        onApplyRecommendation(comb.steps);
        setJustLoadedId(comb.id);
        setTimeout(() => setJustLoadedId(null), 2500);
    };

    return (
        <Card className="p-3 border border-ui-accent/30 shadow-xl bg-gradient-to-b from-ui-card via-ui-card to-ui-dark/95">
            <div className="flex flex-col gap-2">
                {/* Cabecera compacta */}
                <div className="flex items-center justify-between gap-2 border-b border-ui-border/60 pb-1.5">
                    <div className="flex items-center gap-1.5">
                        <div className="p-1 rounded-md bg-ui-accent/10 border border-ui-accent/30 text-ui-accent">
                            <Sparkles className="w-3.5 h-3.5 text-ui-accent" />
                        </div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
                            3 Opciones Óptimas
                        </h4>
                    </div>

                    {activeCombinationId ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 flex items-center gap-1 shrink-0 animate-fade-in">
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            Opción {activeCombinationId.replace('comb-', '')} Activa
                        </span>
                    ) : (
                        <span className="text-[10px] text-slate-400">
                            Recomendadas por espectro
                        </span>
                    )}
                </div>

                {/* BOTÓN PROMINENTE DE 1 CLIC: APLICAR MEJOR MODELO */}
                {bestOption && (
                    <div>
                        {isBestOptionActive ? (
                            <div className="w-full py-1.5 px-3 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 text-xs font-black uppercase tracking-wide flex items-center justify-center gap-2 shadow-sm">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span>Mejor Opción Activa (Opción 1 · {bestOption.score}%)</span>
                            </div>
                        ) : (
                            <button
                                type="button"
                                disabled={disabled || activeSamples.length === 0}
                                onClick={() => handleLoadCombination(bestOption)}
                                className="w-full py-2 px-3 rounded-lg font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 shadow-md shadow-amber-500/20 border border-amber-200 cursor-pointer active:scale-[0.99] transition-all disabled:opacity-50"
                            >
                                <Star className="w-4 h-4 fill-slate-950 text-slate-950 shrink-0" />
                                <span>Aplicar Mejor Opción (Opción 1 · {bestOption.score}%)</span>
                            </button>
                        )}
                    </div>
                )}

                {/* Feedback breve tras pulsar cargar */}
                {justLoadedId && (
                    <div className="py-1 px-2 rounded-md bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 text-[11px] font-semibold flex items-center gap-1.5 animate-fade-in">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Opción {justLoadedId.replace('comb-', '')} cargada correctamente.</span>
                    </div>
                )}

                {/* LISTA COMPACTA CON OPCIONES 1, 2, 3 (Sin lista larga ni pestañas confusas) */}
                <div className="flex flex-col gap-1.5">
                    {combinations.map((comb) => {
                        const isActive = activeCombinationId === comb.id;
                        const isRank1 = comb.rank === 1;
                        const isRank2 = comb.rank === 2;

                        const rankBadgeColor = isRank1
                            ? 'bg-amber-400 text-slate-950 font-black'
                            : isRank2
                                ? 'bg-sky-400 text-slate-950 font-black'
                                : 'bg-purple-400 text-slate-950 font-black';

                        const rankIcon = isRank1 ? <Star className="w-2.5 h-2.5 fill-slate-950" /> :
                                         isRank2 ? <Award className="w-2.5 h-2.5" /> :
                                                   <ShieldCheck className="w-2.5 h-2.5" />;

                        return (
                            <div
                                key={comb.id}
                                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border transition-all ${
                                    isActive
                                        ? 'bg-emerald-950/35 border-emerald-400/80 shadow-sm ring-1 ring-emerald-400/30'
                                        : isRank1
                                            ? 'bg-ui-dark/85 border-amber-500/40 hover:border-amber-400/60'
                                            : 'bg-ui-dark/70 border-ui-border/70 hover:border-ui-border'
                                }`}
                            >
                                {/* Lado Izquierdo: Rank + Porcentaje + Pipeline de Pasos */}
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {/* Badge con número de opción */}
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase flex items-center gap-1 shrink-0 ${rankBadgeColor}`}>
                                        {rankIcon}
                                        #{comb.rank}
                                    </span>

                                    {/* Porcentaje de idoneidad */}
                                    <span className={`text-[11px] font-black shrink-0 ${
                                        isRank1 ? 'text-amber-300' : isRank2 ? 'text-sky-300' : 'text-purple-300'
                                    }`}>
                                        {comb.score}%
                                    </span>

                                    {/* Pasos de preprocesamiento concisos */}
                                    <div className="flex items-center gap-1 min-w-0 truncate">
                                        <span className="text-[11px] font-medium text-slate-200 truncate" title={comb.name}>
                                            {comb.steps.map(s => formatStepShort(s)).join(' + ')}
                                        </span>
                                    </div>
                                </div>

                                {/* Lado Derecho: Botón Aplicar o Indicador Activa */}
                                <div className="shrink-0">
                                    {isActive ? (
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 flex items-center gap-1">
                                            <Check className="w-3 h-3 text-emerald-400" />
                                            Activa
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={disabled || activeSamples.length === 0}
                                            onClick={() => handleLoadCombination(comb)}
                                            className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide cursor-pointer transition-all active:scale-95 disabled:opacity-50 ${
                                                isRank1
                                                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-black shadow-sm'
                                                    : isRank2
                                                        ? 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-400/50'
                                                        : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/50'
                                            }`}
                                        >
                                            Aplicar
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Resumen Compacto de Diagnóstico Espectral en 1 sola Fila */}
                <div className="flex items-center justify-between px-2 py-1 rounded bg-ui-darkest/90 border border-ui-border/60 text-[10px] text-slate-400">
                    <span><strong className="text-slate-300 font-medium">Δλ:</strong> {diagnostic.deltaLambda.toFixed(1)}nm</span>
                    <span className="text-ui-border/80">•</span>
                    <span><strong className="text-slate-300 font-medium">Disp.:</strong> {diagnostic.scatterLevel === 'high' ? 'Alta' : diagnostic.scatterLevel === 'moderate' ? 'Media' : 'Leve'}</span>
                    <span className="text-ui-border/80">•</span>
                    <span><strong className="text-slate-300 font-medium">Ruido:</strong> {diagnostic.noiseLevel === 'high' ? 'Alto' : diagnostic.noiseLevel === 'moderate' ? 'Medio' : 'Bajo'}</span>
                    <span className="text-ui-border/80">•</span>
                    <span><strong className="text-slate-300 font-medium">Base:</strong> {diagnostic.baselineCurvature ? 'Curva' : 'Plana'}</span>
                </div>

                {/* Botones de Navegación al paso siguiente */}
                <div className="pt-1 border-t border-ui-border/60 flex flex-col gap-1.5">
                    <Button
                        variant="primary"
                        size="sm"
                        disabled={activeSamples.length < 3}
                        onClick={onContinueToPca}
                        className="w-full flex items-center justify-center gap-1.5 font-bold text-xs py-2 bg-ui-accent text-slate-950 hover:brightness-110 shadow-sm"
                    >
                        Continuar a Análisis PCA (Paso 3)
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onBackToData}
                        className="w-full text-[11px] text-slate-400 hover:text-white border-ui-border py-1"
                    >
                        ← Volver a Datos & Espectros
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default AnalyticalRecommendationCard;
