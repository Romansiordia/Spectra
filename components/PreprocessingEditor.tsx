
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
    'savgol': {
        name: 'Savitzky-Golay',
        params: [
            { id: 'derivative', name: 'Orden Derivada', type: 'number', default: 1 },
            { id: 'windowSize', name: 'Tamaño Ventana (impar)', type: 'number', default: 5 },
            { id: 'polynomialOrder', name: 'Orden Polinomio', type: 'number', default: 2 },
        ],
    },
    'snv': { name: 'Standard Normal Variate (SNV)', params: [] },
    'msc': { name: 'Multiplicative Scatter Correction (MSC)', params: [] },
    'detrend': { name: 'Detrend', params: [] },
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
        const newStep: PreprocessingStep = { method: 'savgol', params: {} };
        PREPROCESSING_METHODS['savgol'].params.forEach(p => newStep.params[p.id] = p.default);
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
        <Card className="h-full">
            <div className="flex flex-col h-full">
                <div className="flex items-center justify-between gap-3 mb-4 border-b border-slate-200 pb-3">
                    <div className="flex items-center gap-3">
                        <div className="h-7 w-7 bg-brand-50 text-brand-600 border border-brand-100 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">2</div>
                        <h3 className="text-lg font-bold text-slate-800">Pre-procesamiento</h3>
                    </div>
                    <Button onClick={onVisualize} disabled={disabled} size="sm" variant="primary">
                        <VisualizeIcon />
                        Visualizar
                    </Button>
                </div>
                
                <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2 min-h-[8rem]">
                    {steps.map((step, index) => {
                        const methodInfo = PREPROCESSING_METHODS[step.method];
                        return (
                            <div key={index} className="p-3 border border-slate-200 rounded-lg bg-slate-50 shadow-sm">
                                <div className="flex items-center justify-between">
                                    <select
                                        value={step.method}
                                        onChange={(e) => handleMethodChange(index, e.target.value as PreprocessingStep['method'])}
                                        className="w-full bg-white border border-slate-300 text-slate-700 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 shadow-sm"
                                    >
                                        {Object.entries(PREPROCESSING_METHODS).map(([key, value]) => (
                                            <option key={key} value={key}>{value.name}</option>
                                        ))}
                                    </select>
                                    <button onClick={() => removeStep(index)} className="ml-2 p-1 text-slate-400 hover:text-red-500 transition-colors">
                                        <RemoveIcon />
                                    </button>
                                </div>
                                 {methodInfo.params.length > 0 && (
                                    <div className="grid grid-cols-3 gap-3 mt-3">
                                        {(methodInfo.params as any[]).map(param => (
                                            <div key={param.id} className="text-xs">
                                                <label htmlFor={`${param.id}-${index}`} className="text-slate-500 font-medium mb-1 block">{param.name}</label>
                                                <input
                                                    type={param.type}
                                                    id={`${param.id}-${index}`}
                                                    value={step.params[param.id] || ''}
                                                    onChange={(e) => handleParamChange(index, param.id, e.target.value)}
                                                    className="w-full bg-white border border-slate-300 text-slate-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                
                <div className="pt-4">
                    <Button variant="secondary" onClick={addStep} disabled={disabled} className="w-full">
                        <AddIcon />Añadir Paso
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default PreprocessingEditor;
