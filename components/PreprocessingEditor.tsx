
import React from 'react';
import Card from './Card';
import Button from './Button';
import { PreprocessingStep } from '../types';

interface PreprocessingEditorProps {
    steps: PreprocessingStep[];
    setSteps: React.Dispatch<React.SetStateAction<PreprocessingStep[]>>;
    onVisualize: () => void;
    disabled: boolean;
}

const PREPROCESSING_METHODS = {
    'none': { name: 'Ninguno', params: [] },
    'winisi2441': { name: '2,4,4,1 (2ª Derivada FOSS Estándar)', params: [] },
    'winisi1441': { name: '1,4,4,1 (1ª Derivada FOSS Granos)', params: [] },
    'winisi1881': { name: '1,8,8,1 (1ª Derivada Alta Res 0.5nm)', params: [] },
    'winisi2861': { name: '2,8,6,1 (2ª Derivada Compleja)', params: [] },
    'winisi_custom': {
        name: 'Personalizado (D, G, S1, S2)',
        params: [
            { id: 'derivative', name: 'D (Derivada)', type: 'number', default: 2 },
            { id: 'gap', name: 'G (Gap)', type: 'number', default: 4 },
            { id: 'smooth1', name: 'S1 (Suav. 1)', type: 'number', default: 4 },
            { id: 'smooth2', name: 'S2 (Suav. 2)', type: 'number', default: 1 },
        ],
    },
    'snv': { name: 'SNV (Standard Normal Variate)', params: [] },
    'detrend': { name: 'Detrend', params: [] },
    'msc': { name: 'MSC (Multiplicative Scatter Correction)', params: [] },
    'savgol1': {
        name: '1ª Derivada (Savitzky-Golay)',
        params: [
            { id: 'windowSize', name: 'Ventana (impar)', type: 'number', default: 11 },
            { id: 'polynomialOrder', name: 'Polinomio', type: 'number', default: 2 },
        ],
    },
    'savgol2': {
        name: '2ª Derivada (Savitzky-Golay)',
        params: [
            { id: 'windowSize', name: 'Ventana (impar)', type: 'number', default: 11 },
            { id: 'polynomialOrder', name: 'Polinomio', type: 'number', default: 2 },
        ],
    },
    'savgolsmooth': {
        name: 'Suavizado (Savitzky-Golay)',
        params: [
            { id: 'windowSize', name: 'Ventana (impar)', type: 'number', default: 11 },
            { id: 'polynomialOrder', name: 'Polinomio', type: 'number', default: 2 },
        ],
    },
};

const VisualizeIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.14 10.28-9.23-9.23a1.5 1.5 0 0 0-2.12 0l-9.23 9.23a1.5 1.5 0 0 0 0 2.12l9.23 9.23a1.5 1.5 0 0 0 2.12 0l9.23-9.23a1.5 1.5 0 0 0 0-2.12z"></path><path d="M12 22V2"></path></svg>
);
const AddIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
);
const RemoveIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
);


const PreprocessingEditor: React.FC<PreprocessingEditorProps> = ({ steps, setSteps, onVisualize, disabled }) => {

    const addStep = () => {
        const newStep: PreprocessingStep = { method: 'savgol1', params: {} };
        PREPROCESSING_METHODS['savgol1'].params.forEach(p => newStep.params[p.id] = p.default);
        setSteps([...steps, newStep]);
    };

    const removeStep = (index: number) => {
        setSteps(steps.filter((_, i) => i !== index));
    };

    const handleMethodChange = (index: number, newMethod: PreprocessingStep['method']) => {
        const newSteps = [...steps];
        newSteps[index].method = newMethod;
        newSteps[index].params = {};
        (PREPROCESSING_METHODS[newMethod].params as any[]).forEach(p => {
            newSteps[index].params[p.id] = p.default;
        });
        setSteps(newSteps);
    };

    const handleParamChange = (stepIndex: number, paramId: string, value: string) => {
        const newSteps = [...steps];
        newSteps[stepIndex].params[paramId] = parseFloat(value);
        setSteps(newSteps);
    };

    return (
        <Card className="p-3.5">
            <div className="flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-2.5 border-b border-ui-border pb-2">
                    <div className="flex items-center gap-2">
                        <div className="h-6 w-6 bg-ui-darkest text-ui-accent border border-ui-accent rounded-md flex items-center justify-center text-xs font-bold shadow-sm">2</div>
                        <h3 className="text-sm font-bold text-slate-100">Pre-procesamiento Manual</h3>
                    </div>
                    <Button onClick={onVisualize} disabled={disabled} size="sm" variant="primary" className="py-1 px-2.5 text-xs">
                        <VisualizeIcon />
                        Visualizar
                    </Button>
                </div>
                
                <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 max-h-44">
                    {steps.length === 0 ? (
                        <div className="text-center py-3 text-xs text-slate-400 bg-ui-dark/50 rounded-lg border border-dashed border-ui-border">
                            Sin preprocesamiento manual (Datos Crutos)
                        </div>
                    ) : (
                        steps.map((step, index) => {
                            const methodInfo = PREPROCESSING_METHODS[step.method] || PREPROCESSING_METHODS['none'];
                            return (
                                <div key={index} className="p-2 border border-ui-border rounded-lg bg-ui-dark shadow-sm">
                                    <div className="flex items-center justify-between gap-1.5">
                                        <select
                                            value={step.method}
                                            onChange={(e) => handleMethodChange(index, e.target.value as PreprocessingStep['method'])}
                                            className="w-full bg-ui-card border border-ui-border text-slate-100 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 shadow-sm"
                                        >
                                            {Object.entries(PREPROCESSING_METHODS).map(([key, value]) => (
                                                <option key={key} value={key}>{value.name}</option>
                                            ))}
                                        </select>
                                        <button 
                                            onClick={() => removeStep(index)} 
                                            className="p-1 text-slate-400 hover:text-red-400 transition-colors shrink-0"
                                            title="Eliminar paso"
                                        >
                                            <RemoveIcon />
                                        </button>
                                    </div>
                                    {methodInfo.params.length > 0 && (
                                        <div className={`grid gap-1.5 mt-2 ${methodInfo.params.length === 4 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                                            {(methodInfo.params as any[]).map(param => (
                                                <div key={param.id} className="text-[11px]">
                                                    <label htmlFor={`${param.id}-${index}`} className="text-slate-400 text-[10px] font-medium block truncate" title={param.name}>
                                                        {param.name}
                                                    </label>
                                                    <input
                                                        type={param.type}
                                                        id={`${param.id}-${index}`}
                                                        value={step.params[param.id] ?? ''}
                                                        onChange={(e) => handleParamChange(index, param.id, e.target.value)}
                                                        className="w-full bg-ui-card border border-ui-border text-slate-100 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono text-center"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
                
                <div className="pt-2">
                    <Button variant="secondary" size="sm" onClick={addStep} disabled={disabled} className="w-full py-1 text-xs">
                        <AddIcon /> Añadir Paso
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default PreprocessingEditor;
