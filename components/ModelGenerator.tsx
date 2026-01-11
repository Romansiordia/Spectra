
import React, { useState } from 'react';
import Card from './Card';
import Button from './Button';
import { runPlsOptimization } from '../services/chemometrics';
import { Sample, PreprocessingStep } from '../types';

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
        setTimeout(() => {
            try {
                const maxLVs = Math.min(15, activeSamples.length - 1);
                const results = runPlsOptimization(activeSamples, preprocessingSteps, maxLVs);
                
                if (results.length > 0) {
                    const bestResult = results.reduce((prev, curr) => curr.secv < prev.secv ? curr : prev);
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

    return (
        <Card className="h-full">
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4 border-b border-slate-200 pb-3">
                    <div className="h-7 w-7 bg-brand-50 text-brand-600 border border-brand-100 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">3</div>
                    <h3 className="text-lg font-bold text-slate-800">Generación de Modelo (PLS)</h3>
                </div>
                
                {/* Scrollable Content Area */}
                <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2 pb-2 min-h-0">
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
                    
                    {suggestedLV !== null && (
                         <div className="border border-green-200 rounded-lg p-3 bg-green-50 animate-fade-in shadow-inner text-center">
                            <p className="text-sm text-green-800">
                                <span className="font-bold">💡 Sugerencia:</span> El valor óptimo de LVs es <strong>{suggestedLV}</strong>.
                            </p>
                            <p className="text-xs text-green-600 mt-1">
                                El campo de entrada ha sido actualizado.
                            </p>
                        </div>
                    )}
                </div>

                {/* Static Footer with Final Button */}
                <div className="pt-4 border-t border-slate-200">
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