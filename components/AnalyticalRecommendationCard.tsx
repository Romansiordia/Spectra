import React, { useMemo, useState } from 'react';
import { Sparkles, CheckCircle2, ArrowRight, Zap, Info, ShieldCheck, Waves, Star, Award, Check } from 'lucide-react';
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

    // Diagnóstico espectral dinámico con ordenación 1, 2, 3 según mejor opción
    const diagnostic: SpectralDiagnostic = useMemo(() => {
        return diagnoseSpectralData(wavelengths, activeSamples);
    }, [wavelengths, activeSamples]);

    // Filtro de visualización (por defecto todas o opción específica)
    const [selectedTab, setSelectedTab] = useState<'all' | string>('all');
    // Estado para feedback visual inmediato tras pulsar cargar
    const [justLoadedId, setJustLoadedId] = useState<string | null>(null);

    // Etiqueta legible de cada paso
    const formatStepName = (step: PreprocessingStep) => {
        switch (step.method) {
            case 'snv': return 'SNV';
            case 'msc': return 'MSC';
            case 'detrend': return 'Detrend';
            case 'winisi2441': return 'WinISI 2,4,4,1';
            case 'winisi1441': return 'WinISI 1,4,4,1';
            case 'winisi1881': return 'WinISI 1,8,8,1';
            case 'winisi2861': return 'WinISI 2,8,6,1';
            case 'savgol1': return `1ª Deriv. SG (w=${step.params?.windowSize || 11})`;
            case 'savgol2': return `2ª Deriv. SG (w=${step.params?.windowSize || 11})`;
            case 'savgolsmooth': return `Suavizado SG (w=${step.params?.windowSize || 11})`;
            default: return step.method;
        }
    };

    // Combinaciones ordenadas estrictamente de acuerdo a la mejor opción (1, 2, 3)
    const combinationsToDisplay = useMemo(() => {
        if (!diagnostic.combinations || diagnostic.combinations.length === 0) return [];
        if (selectedTab === 'all') return diagnostic.combinations;
        return diagnostic.combinations.filter(c => c.id === selectedTab);
    }, [diagnostic.combinations, selectedTab]);

    // Verificar cuál combinación está actualmente activa en el visor espectral
    const activeCombinationId = useMemo(() => {
        if (!diagnostic.combinations) return null;
        for (const comb of diagnostic.combinations) {
            if (arePreprocessingStepsEqual(currentSteps, comb.steps)) {
                return comb.id;
            }
        }
        return null;
    }, [currentSteps, diagnostic.combinations]);

    const handleLoadCombination = (comb: RecommendedCombination) => {
        onApplyRecommendation(comb.steps);
        setJustLoadedId(comb.id);
        setTimeout(() => setJustLoadedId(null), 3500);
    };

    return (
        <Card className="border border-ui-accent/30 shadow-xl bg-gradient-to-b from-ui-card via-ui-card to-ui-dark/95">
            <div className="flex flex-col gap-3.5">
                {/* Cabecera con título e indicador de estado */}
                <div className="flex items-center justify-between gap-2 border-b border-ui-border/60 pb-2.5">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-ui-accent/10 border border-ui-accent/30 text-ui-accent">
                            <Sparkles className="w-4 h-4 animate-pulse text-ui-accent" />
                        </div>
                        <div>
                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5">
                                3 Combinaciones Óptimas
                                <span className="text-[10px] font-semibold text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded border border-amber-400/20">
                                    En orden 1, 2, 3
                                </span>
                            </h4>
                            <p className="text-[10px] text-slate-400">
                                Ordenadas de mayor a menor idoneidad según la física de tus espectros
                            </p>
                        </div>
                    </div>
                    {activeCombinationId ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/50 flex items-center gap-1 shrink-0 shadow-sm animate-pulse">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Opción {activeCombinationId.replace('comb-', '')} Activa
                        </span>
                    ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-ui-accent/15 text-ui-accent border border-ui-accent/30 flex items-center gap-1 shrink-0">
                            <Zap className="w-3 h-3" />
                            Auto-Evaluadas
                        </span>
                    )}
                </div>

                {/* Toast / Feedback inmediato tras pulsar cargar */}
                {justLoadedId && (
                    <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fade-in shadow-md">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>¡Opción {justLoadedId.replace('comb-', '')} cargada con éxito! Ya puedes ver su efecto en el gráfico de la derecha.</span>
                    </div>
                )}

                {/* Métricas de Diagnóstico Espectral en Tiempo Real */}
                <div className="grid grid-cols-4 gap-1 p-2 rounded-lg bg-ui-darkest/80 border border-ui-border/60 text-center">
                    <div className="flex flex-col items-center justify-center p-1">
                        <span className="text-[9px] uppercase font-semibold text-slate-400">Resolución</span>
                        <span className="text-[11px] font-mono font-bold text-slate-100">
                            Δλ {diagnostic.deltaLambda.toFixed(1)} nm
                        </span>
                        <span className="text-[8px] text-slate-400">
                            {diagnostic.deltaLambda <= 1.0 ? 'Alta Res.' : diagnostic.deltaLambda <= 3.5 ? 'Estándar' : 'Baja Dens.'}
                        </span>
                    </div>

                    <div className="flex flex-col items-center justify-center p-1 border-l border-ui-border/60">
                        <span className="text-[9px] uppercase font-semibold text-slate-400">Dispersión</span>
                        <span className={`text-[11px] font-bold ${
                            diagnostic.scatterLevel === 'high' ? 'text-amber-400' : diagnostic.scatterLevel === 'moderate' ? 'text-sky-300' : 'text-slate-300'
                        }`}>
                            {diagnostic.scatterLevel === 'high' ? 'Alta' : diagnostic.scatterLevel === 'moderate' ? 'Moderada' : 'Leve'}
                        </span>
                        <span className="text-[8px] text-slate-400">Efecto Partícula</span>
                    </div>

                    <div className="flex flex-col items-center justify-center p-1 border-l border-ui-border/60">
                        <span className="text-[9px] uppercase font-semibold text-slate-400">Ruido</span>
                        <span className={`text-[11px] font-bold ${
                            diagnostic.noiseLevel === 'high' ? 'text-rose-400' : diagnostic.noiseLevel === 'moderate' ? 'text-amber-300' : 'text-emerald-400'
                        }`}>
                            {diagnostic.noiseLevel === 'high' ? 'Notable' : diagnostic.noiseLevel === 'moderate' ? 'Medio' : 'Mínimo'}
                        </span>
                        <span className="text-[8px] text-slate-400">2ª Diferencia</span>
                    </div>

                    <div className="flex flex-col items-center justify-center p-1 border-l border-ui-border/60">
                        <span className="text-[9px] uppercase font-semibold text-slate-400">Línea Base</span>
                        <span className={`text-[11px] font-bold ${
                            diagnostic.baselineCurvature ? 'text-amber-400' : 'text-emerald-400'
                        }`}>
                            {diagnostic.baselineCurvature ? 'Curvatura' : 'Plana'}
                        </span>
                        <span className="text-[8px] text-slate-400">Deriva Óptica</span>
                    </div>
                </div>

                {/* Filtro / Pestañas en Orden 1, 2, 3 */}
                <div className="flex items-center gap-1 p-1 bg-ui-darkest/80 border border-ui-border/60 rounded-lg text-[11px]">
                    <button
                        type="button"
                        onClick={() => setSelectedTab('all')}
                        className={`flex-1 py-1.5 px-2 rounded-md font-bold transition-all text-center ${
                            selectedTab === 'all'
                                ? 'bg-ui-accent text-slate-950 shadow-md'
                                : 'text-slate-400 hover:text-white hover:bg-ui-dark'
                        }`}
                    >
                        Ver las 3
                    </button>
                    {(diagnostic.combinations || []).map((c) => {
                        const isActive = activeCombinationId === c.id;
                        const isRank1 = c.rank === 1;
                        return (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setSelectedTab(c.id)}
                                className={`flex-1 py-1.5 px-2 rounded-md font-bold transition-all flex items-center justify-center gap-1.5 text-center ${
                                    selectedTab === c.id
                                        ? isRank1
                                            ? 'bg-amber-400 text-slate-950 shadow-md'
                                            : 'bg-ui-accent text-slate-950 shadow-md'
                                        : isActive
                                            ? 'text-emerald-300 bg-emerald-950/40 border border-emerald-500/40 hover:text-emerald-200'
                                            : 'text-slate-300 hover:text-white hover:bg-ui-dark'
                                }`}
                                title={`${c.rankLabel}: ${c.name}`}
                            >
                                {isRank1 && <Star className="w-3 h-3 fill-amber-400 text-amber-500 inline" />}
                                #{c.rank} {c.rank === 1 ? 'Mejor' : c.rank === 2 ? 'Alternativa' : 'Opción 3'}
                            </button>
                        );
                    })}
                </div>

                {/* Lista de Tarjetas de Combinaciones: Con botones prominentes de alta visibilidad */}
                <div className="space-y-3 max-h-[460px] overflow-y-auto custom-scrollbar pr-1 pb-1">
                    {combinationsToDisplay.map((comb: RecommendedCombination) => {
                        const isActive = activeCombinationId === comb.id;
                        const isRank1 = comb.rank === 1;
                        const isRank2 = comb.rank === 2;

                        // Estilos y badges según ranking 1, 2, 3
                        const rankBadgeColor = isRank1
                            ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 border border-amber-300'
                            : isRank2
                                ? 'bg-gradient-to-r from-sky-400 to-cyan-500 text-slate-950 border border-sky-300'
                                : 'bg-gradient-to-r from-indigo-400 to-purple-500 text-slate-950 border border-indigo-300';

                        const rankIcon = isRank1 ? <Star className="w-3.5 h-3.5 fill-slate-950 text-slate-950" /> :
                                         isRank2 ? <Award className="w-3.5 h-3.5 text-slate-950" /> :
                                                   <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />;

                        return (
                            <div
                                key={comb.id}
                                className={`p-3 rounded-xl border transition-all ${
                                    isActive
                                        ? 'bg-emerald-950/25 border-emerald-400 shadow-lg ring-1 ring-emerald-400/50'
                                        : isRank1
                                            ? 'bg-ui-dark/80 border-amber-500/40 hover:border-amber-400 shadow-md'
                                            : 'bg-ui-dark/70 border-ui-border/80 hover:border-ui-accent/40 hover:bg-ui-dark/90'
                                }`}
                            >
                                {/* Cabecera de la combinación con Ranking Explícito */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className={`px-2 py-0.5 rounded-md font-black text-[10px] uppercase tracking-wider flex items-center gap-1 shadow-sm ${rankBadgeColor}`}>
                                                {rankIcon}
                                                {comb.rank === 1 ? 'Opción 1: MEJOR OPCIÓN' : comb.rank === 2 ? 'Opción 2: 2ª Mejor Opción' : 'Opción 3: Especializada'}
                                            </span>
                                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-ui-card text-ui-accent border border-ui-border">
                                                Idoneidad {comb.score}%
                                            </span>
                                        </div>
                                        <h5 className="text-[12px] font-bold text-slate-100 leading-tight">
                                            {comb.name}
                                        </h5>
                                    </div>

                                    {isActive && (
                                        <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/60 flex items-center gap-1 shrink-0 shadow-sm animate-pulse">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                            Activa
                                        </span>
                                    )}
                                </div>

                                {/* Badges de la secuencia de pasos */}
                                <div className="flex flex-wrap items-center gap-1.5 mb-2 bg-ui-darkest/70 p-2 rounded-lg border border-ui-border/50">
                                    <span className="text-[9px] text-slate-400 uppercase font-black mr-0.5">Tratamiento:</span>
                                    {comb.steps.map((st, sIdx) => (
                                        <React.Fragment key={sIdx}>
                                            {sIdx > 0 && <span className="text-slate-500 text-[11px] font-bold">+</span>}
                                            <span className="px-2 py-0.5 rounded text-[10.5px] font-mono font-bold bg-ui-card text-sky-200 border border-sky-400/30 shadow-sm">
                                                {formatStepName(st)}
                                            </span>
                                        </React.Fragment>
                                    ))}
                                </div>

                                {/* Enfoque & Fundamento Quimiométrico Dinámico */}
                                <div className="space-y-1 mb-3 text-[10.5px]">
                                    <p className="text-slate-300 leading-tight">
                                        <strong className="text-slate-100 font-semibold">Objetivo: </strong>{comb.focus}
                                    </p>
                                    <p className="text-slate-400 leading-tight text-[10px]">
                                        <strong className="text-slate-300 font-semibold">Fundamento: </strong>{comb.rationale}
                                    </p>
                                </div>

                                {/* BOTÓN DE CARGA PROMINENTE Y DE ALTA VISIBILIDAD */}
                                <div className="pt-1">
                                    {isActive ? (
                                        <div className="w-full py-2.5 px-3 rounded-lg bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 text-center shadow-[0_0_15px_rgba(16,185,129,0.25)]">
                                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                            ✓ Opción {comb.rank} Activa en el Visor y Editor
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={disabled || activeSamples.length === 0}
                                            onClick={() => handleLoadCombination(comb)}
                                            className={`w-full py-2.5 px-3 rounded-lg font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                                                isRank1
                                                    ? 'bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 shadow-amber-500/25 hover:shadow-amber-500/40 border border-amber-200'
                                                    : isRank2
                                                        ? 'bg-gradient-to-r from-sky-400 via-sky-300 to-cyan-500 hover:from-sky-300 hover:to-cyan-400 text-slate-950 shadow-sky-500/25 hover:shadow-sky-500/40 border border-sky-200'
                                                        : 'bg-gradient-to-r from-indigo-400 via-indigo-300 to-purple-400 hover:from-indigo-300 hover:to-purple-300 text-slate-950 shadow-indigo-500/25 hover:shadow-indigo-500/40 border border-indigo-200'
                                            }`}
                                        >
                                            <Zap className="w-4 h-4 fill-slate-950 text-slate-950 shrink-0" />
                                            <span>Cargar Opción {comb.rank} en el Visor y Editor</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Nota de libertad analítica para el usuario */}
                <div className="pt-2 border-t border-ui-border/60 flex items-start gap-1.5 text-[10px] text-slate-400 leading-tight">
                    <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                        <strong className="text-slate-300">Libertad analítica:</strong> Puedes cargar con un clic cualquiera de las 3 opciones ordenadas por idoneidad, o ajustar manualmente los parámetros en el editor superior.
                    </span>
                </div>

                {/* Botones de navegación en el flujo de calibración */}
                <div className="pt-2 border-t border-ui-border/60 flex flex-col gap-2">
                    <Button
                        variant="primary"
                        size="md"
                        disabled={activeSamples.length < 3}
                        onClick={onContinueToPca}
                        className="w-full flex items-center justify-center gap-2 font-black shadow-md text-xs py-2.5 bg-ui-accent text-slate-950 hover:brightness-110"
                    >
                        Continuar a Análisis PCA (Paso 3)
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onBackToData}
                        className="w-full text-xs text-slate-400 hover:text-white border-ui-border py-1"
                    >
                        ← Volver a Datos & Espectros (Paso 1)
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default AnalyticalRecommendationCard;
