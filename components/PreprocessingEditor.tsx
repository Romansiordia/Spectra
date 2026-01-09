
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

const EditIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-primary"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
);
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
        <Card>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><EditIcon />3. Pre-procesamiento</h2>
            <div className="space-y-3 mb-4">
                {steps.map((step, index) => {
                    const methodInfo = PREPROCESSING_METHODS[step.method];
                    return (
                        <div key={index} className="p-3 border border-gray-200 rounded-md bg-white">
                            <div className="flex items-center justify-between">
                                <select
                                    value={step.method}
                                    onChange={(e) => handleMethodChange(index, e.target.value as PreprocessingStep['method'])}
                                    className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand-primary"
                                >
                                    {Object.entries(PREPROCESSING_METHODS).map(([key, value]) => (
                                        <option key={key} value={key}>{value.name}</option>
                                    ))}
                                </select>
                                <button onClick={() => removeStep(index)} className="ml-2 p-1 text-gray-400 hover:text-red-500 transition-colors">
                                    <RemoveIcon />
                                </button>
                            </div>
                             {methodInfo.params.length > 0 && (
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                    {(methodInfo.params as any[]).map(param => (
                                        <div key={param.id} className="text-xs">
                                            <label htmlFor={`${param.id}-${index}`} className="text-gray-500">{param.name}</label>
                                            <input
                                                type={param.type}
                                                id={`${param.id}-${index}`}
                                                value={step.params[param.id] || ''}
                                                onChange={(e) => handleParamChange(index, param.id, e.target.value)}
                                                className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-xs mt-1 focus:outline-none focus:ring-1 focus:ring-brand-primary"
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-col gap-2">
                <Button onClick={onVisualize} disabled={disabled}><VisualizeIcon />Visualizar Pre-procesamiento</Button>
                <Button variant="secondary" onClick={addStep} disabled={disabled}><AddIcon />Añadir Paso</Button>
            </div>
        </Card>
    );
};

export default PreprocessingEditor;
