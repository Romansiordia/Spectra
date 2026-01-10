
import React, { useState, useRef, useEffect } from 'react';
import Card from './Card';
import Button from './Button';
import { runPlsOptimization } from '../services/chemometrics';
import { OptimizationResult, Sample, PreprocessingStep } from '../types';

declare var Chart: any;

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
    const [optimizationData, setOptimizationData] = useState<OptimizationResult[] | null>(null);
    
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);

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
        setTimeout(() => {
            try {
                const maxLVs = Math.min(15, activeSamples.length - 1);
                const results = runPlsOptimization(activeSamples, preprocessingSteps, maxLVs);
                setOptimizationData(results);
            } catch (e) {
                console.error(e);
                alert("Error durante la optimización.");
            } finally {
                setIsOptimizing(false);
            }
        }, 50);
    };

    useEffect(() => {
        if (optimizationData && chartRef.current) {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
            }

            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                chartInstanceRef.current = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: optimizationData.map(d => d.components),
                        datasets: [
                            {
                                label: 'SEC (Calibración)',
                                data: optimizationData.map(d => d.sec),
                                borderColor: '#0ea5e9', // Sky 500
                                backgroundColor: '#0ea5e9',
                                tension: 0.1,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            },
                            {
                                label: 'SECV (Validación)',
                                data: optimizationData.map(d => d.secv),
                                borderColor: '#10b981', // Emerald 500
                                backgroundColor: '#10b981',
                                tension: 0.1,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: {
                            mode: 'index',
                            intersect: false,
                        },
                        plugins: {
                            legend: { labels: { color: '#64748b' } },
                            title: { display: true, text: 'Error vs. LVs', color: '#64748b' },
                            tooltip: {
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                titleColor: '#0f172a',
                                bodyColor: '#334155',
                                borderColor: '#e2e8f0',
                                borderWidth: 1,
                                padding: 10,
                                titleFont: { family: 'Inter', size: 13 },
                                callbacks: {
                                    footer: (tooltipItems: any[]) => {
                                        return 'Click para usar este valor.';
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { 
                                title: { display: true, text: 'Variables Latentes (LVs)', color: '#94a3b8' },
                                ticks: { color: '#64748b' },
                                grid: { color: '#e2e8f0' }
                            },
                            y: { 
                                title: { display: true, text: 'RMSE (Error)', color: '#94a3b8' },
                                ticks: { color: '#64748b' },
                                grid: { color: '#e2e8f0' }
                            }
                        },
                        onClick: (e: any, elements: any[]) => {
                            if (elements && elements.length > 0) {
                                const index = elements[0].index;
                                const selectedComps = optimizationData[index].components;
                                setNComponents(selectedComps.toString());
                            }
                        }
                    }
                });
            }
        }
        
        return () => {
             // Cleanup if needed
        };
    }, [optimizationData]);

    const suggestedLV = optimizationData 
        ? optimizationData.reduce((prev, curr) => curr.secv < prev.secv ? curr : prev).components 
        : null;

    return (
        <Card className="h-full">
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4 border-b border-slate-200 pb-3">
                    <div className="h-7 w-7 bg-brand-50 text-brand-600 border border-brand-100 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">3</div>
                    <h3 className="text-lg font-bold text-slate-800">Generación de Modelo (PLS)</h3>
                </div>
                
                <div className="flex-1 flex flex-col space-y-4">
                    <div className="grid grid-cols-2 gap-4 items-end">
                        <div>
                             <label htmlFor="lv-input" className="block text-xs font-bold text-slate-500 mb-1">Variables Latentes (LV)</label>
                            <input
                                type="number"
                                id="lv-input"
                                value={nComponents}
                                onChange={(e) => setNComponents(e.target.value)}
                                min="1"
                                max="20"
                                className="w-full bg-white border border-slate-300 text-slate-800 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm"
                            />
                        </div>
                        <Button variant="secondary" onClick={handleOptimize} disabled={disabled || isOptimizing} className="h-[38px] text-xs">
                            {isOptimizing ? 'Analizando...' : (
                                <>
                                    <OptimizeIcon /> Analizar Componentes
                                </>
                            )}
                        </Button>
                    </div>
                    
                    {optimizationData && (
                        <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 animate-fade-in shadow-inner">
                            <div className="h-48 relative">
                                <canvas ref={chartRef}></canvas>
                            </div>
                            {suggestedLV && (
                                <p className="text-xs text-center mt-2 text-slate-500">
                                    Mínimo error de validación en <span className="font-bold text-brand-600">{suggestedLV} LVs</span>.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="pt-2 mt-auto">
                        <Button onClick={handleRun} disabled={disabled} className="w-full">
                            <RunIcon />
                            Generar Modelo PLS Final
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default ModelGenerator;
