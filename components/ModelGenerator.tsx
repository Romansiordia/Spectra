import React, { useState, useRef, useEffect } from 'react';
import Card from './Card';
import Button from './Button';
import { runPlsOptimization } from '../services/chemometrics';
import { OptimizationResult, Sample, PreprocessingStep } from '../types';

// Access to global variables from index.html
declare var Chart: any;

export type ModelParams = 
    | { type: 'pls'; nComponents: number };

interface ModelGeneratorProps {
    onRunModel: (params: ModelParams) => void;
    disabled: boolean;
    // We need access to samples and preprocessing steps to run optimization locally inside component
    // Alternatively, we could lift state up, but passing a callback or context is cleaner.
    // For now, let's assume this component triggers the main app to run model, 
    // but for optimization, we might need data. 
    // To solve this cleanly without prop drilling activeSamples everywhere if not present:
    // Let's rely on the parent updating, but wait... ModelGenerator in App.tsx doesn't receive data.
    // I need to modify App.tsx to pass samples/steps OR lift optimization to App.tsx.
    // Let's modify App.tsx to pass data here for optimization.
    activeSamples?: Sample[];
    preprocessingSteps?: PreprocessingStep[];
}

const GenerateIcon: React.FC = () => (
     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-primary">
        <circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>
    </svg>
);

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
        // Small timeout to allow UI to render spinner
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
                                borderColor: '#3B82F6', // Blue
                                backgroundColor: '#3B82F6',
                                tension: 0.1,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            },
                            {
                                label: 'SECV (Validación)',
                                data: optimizationData.map(d => d.secv),
                                borderColor: '#10B981', // Green
                                backgroundColor: '#10B981',
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
                            title: { display: true, text: 'Error vs. Número de Componentes (Click para seleccionar)' },
                            tooltip: {
                                callbacks: {
                                    footer: (tooltipItems: any[]) => {
                                        return 'Click para usar este valor.';
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { title: { display: true, text: 'Variables Latentes (LVs)' } },
                            y: { title: { display: true, text: 'RMSE (Error)' } }
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

    // Determine suggestion (min SECV)
    const suggestedLV = optimizationData 
        ? optimizationData.reduce((prev, curr) => curr.secv < prev.secv ? curr : prev).components 
        : null;

    return (
        <Card>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <GenerateIcon />
                4. Generación de Modelo (PLS)
            </h2>
            
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 items-end">
                    <div>
                         <label htmlFor="lv-input" className="block text-sm text-gray-500 mb-1">Variables Latentes (LV):</label>
                        <input
                            type="number"
                            id="lv-input"
                            value={nComponents}
                            onChange={(e) => setNComponents(e.target.value)}
                            min="1"
                            max="20"
                            className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary"
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
                    <div className="border rounded-md p-2 bg-gray-50 animate-fade-in">
                        <div className="h-48 relative">
                            <canvas ref={chartRef}></canvas>
                        </div>
                        {suggestedLV && (
                            <p className="text-xs text-center mt-2 text-gray-600">
                                Mínimo error de validación en <span className="font-bold text-brand-primary">{suggestedLV} LVs</span>.
                            </p>
                        )}
                    </div>
                )}

                <div className="pt-2">
                    <Button onClick={handleRun} disabled={disabled} className="w-full">
                        <RunIcon />
                        Generar Modelo PLS Final
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default ModelGenerator;