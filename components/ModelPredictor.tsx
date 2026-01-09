import React, { useState, useRef } from 'react';
import Card from './Card';
import Button from './Button';
import { PreprocessingStep } from '../types';
import { applyPreprocessingLogic } from '../services/chemometrics';

declare var Papa: any;

interface SavedModel {
    analyticalProperty: string;
    metrics: {
        plsIntercept: number;
        coefficients: number[];
    };
    preprocessing: PreprocessingStep[];
}

const PredictIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

const ModelPredictor: React.FC = () => {
    const [model, setModel] = useState<SavedModel | null>(null);
    const [predictions, setPredictions] = useState<{id: string, value: number}[]>([]);
    
    const modelInputRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const handleModelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const json = JSON.parse(ev.target?.result as string);
                if (!json.metrics || !json.metrics.coefficients || json.metrics.plsIntercept === undefined) {
                    alert("El archivo JSON no parece ser un modelo válido de Spectra Pro.");
                    return;
                }
                setModel(json);
                setPredictions([]);
            } catch (err) {
                alert("Error al leer el archivo JSON.");
            }
        };
        reader.readAsText(file);
    };

    const handleDataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !model) return;

        Papa.parse(file, {
            header: false,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results: { data: any[][] }) => {
                const data = results.data;
                if (data.length < 2) return;

                // Asumimos formato: ID, w1, w2, ... (sin columna de propiedad al final necesariamente)
                // Pero debemos alinear las columnas. Por simplicidad, asumimos que el CSV de entrada
                // tiene el MISMO formato espectral que el de entrenamiento.
                
                const newPredictions: {id: string, value: number}[] = [];
                
                // Saltar header
                for (let i = 1; i < data.length; i++) {
                    const row = data[i];
                    const id = String(row[0]);
                    // Tomar valores espectrales. Asumimos que son todas las columnas excepto la primera (ID)
                    // Ojo: Si el CSV tiene columna de propiedad al final, el usuario debe saberlo.
                    // Aquí tomaremos tantas columnas como coeficientes tenga el modelo.
                    
                    const spectralValues = row.slice(1, 1 + model.metrics.coefficients.length);
                    
                    if (spectralValues.length !== model.metrics.coefficients.length) {
                        console.warn(`Muestra ${id} tiene longitud incorrecta. Se esperaban ${model.metrics.coefficients.length} puntos.`);
                        continue;
                    }
                    
                    if (spectralValues.some((v: any) => typeof v !== 'number')) continue;

                    // 1. Aplicar Pre-procesamiento guardado en el modelo
                    const processed = applyPreprocessingLogic(spectralValues as number[], model.preprocessing);

                    // 2. Aplicar Ecuación de Regresión: Y = B0 + X*B
                    let yPred = model.metrics.plsIntercept;
                    for(let k=0; k<processed.length; k++) {
                        yPred += processed[k] * model.metrics.coefficients[k];
                    }

                    newPredictions.push({ id, value: yPred });
                }
                setPredictions(newPredictions);
            }
        });
    };

    return (
        <Card>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                <PredictIcon />
                Predictor (Nuevas Muestras)
            </h2>
            <div className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-slate-200 rounded-lg bg-slate-50">
                        <h3 className="text-sm font-bold text-slate-700 mb-2">1. Cargar Modelo (.json)</h3>
                        <input type="file" ref={modelInputRef} onChange={handleModelUpload} accept=".json" className="hidden" />
                        <Button variant="secondary" onClick={() => modelInputRef.current?.click()} size="sm" className="w-full">
                            {model ? "Modelo Cargado" : "Seleccionar Archivo JSON"}
                        </Button>
                        {model && (
                            <div className="mt-2 text-xs text-green-600">
                                <div><strong>Propiedad:</strong> {model.analyticalProperty}</div>
                                <div><strong>Pre-proc:</strong> {model.preprocessing.length > 0 ? model.preprocessing.map(p => p.method).join(', ') : 'Ninguno'}</div>
                            </div>
                        )}
                    </div>

                    <div className={`p-4 border border-slate-200 rounded-lg bg-slate-50 ${!model ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="text-sm font-bold text-slate-700 mb-2">2. Cargar Muestras (.csv)</h3>
                        <input type="file" ref={csvInputRef} onChange={handleDataUpload} accept=".csv" className="hidden" />
                        <Button onClick={() => csvInputRef.current?.click()} size="sm" className="w-full" disabled={!model}>
                            Predecir CSV
                        </Button>
                        <p className="text-[10px] text-slate-500 mt-2">El CSV debe tener IDs en la col 1 y datos espectrales a continuación.</p>
                    </div>
                </div>

                {predictions.length > 0 && (
                    <div className="animate-fade-in">
                        <h3 className="text-sm font-bold text-slate-800 mb-3">Resultados de Predicción</h3>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-100 sticky top-0">
                                    <tr>
                                        <th className="px-4 py-2">ID Muestra</th>
                                        <th className="px-4 py-2 text-right">Valor Predicho</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {predictions.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-4 py-2 font-medium text-slate-700">{p.id}</td>
                                            <td className="px-4 py-2 text-right font-mono text-brand-600 font-bold">{p.value.toFixed(4)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="mt-4 flex justify-end">
                             <Button size="sm" variant="secondary" onClick={() => {
                                 const csv = "ID,Predicted_Value\n" + predictions.map(p => `${p.id},${p.value}`).join('\n');
                                 const blob = new Blob([csv], { type: 'text/csv' });
                                 const url = URL.createObjectURL(blob);
                                 const a = document.createElement('a');
                                 a.href = url;
                                 a.download = "predicciones.csv";
                                 a.click();
                             }}>Descargar Tabla</Button>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default ModelPredictor;