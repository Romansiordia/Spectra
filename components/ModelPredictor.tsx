
import React, { useState, useRef } from 'react';
import Card from './Card';
import Button from './Button';
import { PreprocessingStep } from '../types';
import { applyPreprocessingLogic, predictPLS } from '../services/chemometrics';

declare var Papa: any;

interface SavedModel {
    fileName: string; 
    analyticalProperty: string;
    metrics: {
        plsIntercept: number;
        coefficients: number[];
        referenceSpectrum?: number[];
        xMean?: number[];
        W?: number[][];
        T_inv_var?: number[];
    };
    preprocessing: PreprocessingStep[];
}

interface PredictionResult {
    id: string;
    values: { [key: string]: number }; 
    ghs: { [key: string]: number }; // Mapa de Distancias GH
}

const PredictIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
);

const TrashIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
);

const ModelPredictor: React.FC = () => {
    const [models, setModels] = useState<SavedModel[]>([]);
    const [predictions, setPredictions] = useState<PredictionResult[]>([]);
    
    const modelInputRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const handleModelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        const newModels: SavedModel[] = [];
        const fileArray = Array.from(files) as File[];

        // Procesar todos los archivos seleccionados
        const promises = fileArray.map(file => {
            return new Promise<void>((resolve) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const json = JSON.parse(ev.target?.result as string);
                        // Validación básica de la estructura del modelo
                        if (!json.metrics || !json.metrics.coefficients || json.metrics.plsIntercept === undefined) {
                            console.warn(`El archivo ${file.name} no es un modelo válido.`);
                        } else {
                            // Añadimos el nombre del archivo para referencia UI
                            newModels.push({ ...json, fileName: file.name });
                        }
                    } catch (err) {
                        console.error(`Error leyendo ${file.name}`, err);
                    }
                    resolve();
                };
                reader.readAsText(file);
            });
        });

        await Promise.all(promises);

        if (newModels.length > 0) {
            // Evitar duplicados basados en analyticalProperty
            setModels(prev => {
                const existingProps = new Set(prev.map(m => m.analyticalProperty));
                const uniqueNewModels = newModels.filter(m => !existingProps.has(m.analyticalProperty));
                if (uniqueNewModels.length < newModels.length) {
                    alert("Algunos modelos se omitieron porque ya existe una propiedad con ese nombre cargada.");
                }
                return [...prev, ...uniqueNewModels];
            });
            setPredictions([]); // Resetear predicciones anteriores si cambian los modelos
        } else {
            alert("No se pudieron cargar modelos válidos.");
        }
        
        // Limpiar input para permitir recargar los mismos archivos si se borran
        if (modelInputRef.current) modelInputRef.current.value = '';
    };

    const removeModel = (index: number) => {
        setModels(prev => prev.filter((_, i) => i !== index));
        setPredictions([]);
    };

    const handleDataUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || models.length === 0) return;

                Papa.parse(file, {
                    header: false,
                    dynamicTyping: true,
                    skipEmptyLines: true,
                    complete: (results: { data: any[][] }) => {
                        try {
                            const data = results.data;
                            if (data.length < 2) {
                                alert("El archivo CSV debe tener al menos una fila de encabezados y una de datos.");
                                return;
                            }

                            const newPredictions: PredictionResult[] = [];
                            let skippedCount = 0;
                            
                            // Iterar sobre las filas del CSV (muestras)
                            for (let i = 1; i < data.length; i++) {
                                const row = data[i];
                                if (!row || row.length < 2) {
                                    skippedCount++;
                                    continue;
                                }

                                const id = String(row[0]);
                                const resultRow: PredictionResult = { id, values: {}, ghs: {} };
                                let isValidRow = true;

                                for (const model of models) {
                                    const expectedLen = model.metrics.coefficients.length;
                                    const spectralValues = row.slice(1, 1 + expectedLen);
                                    
                                    if (spectralValues.length !== expectedLen) {
                                        console.warn(`Muestra ${id}: Columnas insuficientes (${spectralValues.length}/${expectedLen}) para ${model.analyticalProperty}`);
                                        isValidRow = false;
                                        break; 
                                    }
                                    
                                    const numericValues = spectralValues.map(v => Number(v));
                                    if (numericValues.some(v => isNaN(v))) {
                                        console.warn(`Muestra ${id}: Valores no numéricos encontrados para ${model.analyticalProperty}`);
                                        isValidRow = false;
                                        break;
                                    }

                                    const processed = applyPreprocessingLogic(numericValues, model.preprocessing, model.metrics.referenceSpectrum);
                                    const res = predictPLS(model.metrics as any, processed);

                                    resultRow.values[model.analyticalProperty] = res.prediction;
                                    resultRow.ghs[model.analyticalProperty] = res.gh;
                                }

                                if (isValidRow) {
                                    newPredictions.push(resultRow);
                                } else {
                                    skippedCount++;
                                }
                            }

                            if (newPredictions.length === 0 && data.length > 1) {
                                alert("No se pudo procesar ninguna muestra. Verifique que el CSV tenga el mismo número de columnas que el espectro con el que se entrenó el modelo.");
                            } else if (skippedCount > 0) {
                                console.info(`Se omitieron ${skippedCount} muestras no válidas.`);
                            }

                            setPredictions(newPredictions);
                        } catch (error) {
                            console.error("Error crítico procesando CSV:", error);
                            alert("Ocurrió un error inesperado al procesar el archivo.");
                        } finally {
                            if (csvInputRef.current) csvInputRef.current.value = '';
                        }
                    }
                });
    };

    const downloadResults = () => {
        if (predictions.length === 0 || models.length === 0) return;

        // Construir Headers Dinámicos
        const propertyNames = models.map(m => m.analyticalProperty);
        const headers = ["ID_Muestra", ...propertyNames].join(",");

        // Construir Filas
        const rows = predictions.map(p => {
            const values = propertyNames.map(prop => p.values[prop]?.toFixed(4) || "Error");
            return `${p.id},${values.join(",")}`;
        }).join("\n");

        const csvContent = `${headers}\n${rows}`;
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "predicciones_multiparametricas.csv";
        a.click();
    };

    return (
        <Card>
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-slate-800">
                <PredictIcon />
                Predictor Multiparamétrico
            </h2>
            <div className="space-y-6">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* SECCIÓN 1: CARGA DE MODELOS */}
                    <div className="p-4 border border-slate-200 rounded-lg bg-slate-50 flex flex-col">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-bold text-slate-700">1. Cargar Modelos (.json)</h3>
                            <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-bold">
                                {models.length} Cargados
                            </span>
                        </div>
                        
                        <input type="file" ref={modelInputRef} onChange={handleModelUpload} accept=".json" multiple className="hidden" />
                        <Button variant="secondary" onClick={() => modelInputRef.current?.click()} size="sm" className="w-full mb-3">
                            {models.length > 0 ? "+ Añadir más Modelos" : "Seleccionar Archivos JSON"}
                        </Button>

                        {/* Lista de Modelos Cargados */}
                        <div className="flex-1 overflow-y-auto max-h-32 custom-scrollbar bg-white border border-slate-200 rounded-md p-2 space-y-1">
                            {models.length === 0 ? (
                                <p className="text-xs text-slate-400 text-center italic py-2">Ningún modelo cargado</p>
                            ) : (
                                models.map((m, idx) => (
                                    <div key={idx} className="flex items-center justify-between text-xs bg-slate-50 p-1.5 rounded border border-slate-100">
                                        <div>
                                            <span className="font-bold text-slate-700 block">{m.analyticalProperty}</span>
                                            <span className="text-[10px] text-slate-500">{m.fileName} • {m.preprocessing.length ? 'Pre-proc' : 'Raw'}</span>
                                        </div>
                                        <button onClick={() => removeModel(idx)} className="text-slate-400 hover:text-red-500 p-1">
                                            <TrashIcon />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* SECCIÓN 2: CARGA DE ESPECTROS */}
                    <div className={`p-4 border border-slate-200 rounded-lg bg-slate-50 flex flex-col ${models.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                        <h3 className="text-sm font-bold text-slate-700 mb-2">2. Cargar Muestras (.csv)</h3>
                        <div className="flex-1 flex flex-col justify-center">
                            <input type="file" ref={csvInputRef} onChange={handleDataUpload} accept=".csv" className="hidden" />
                            <Button onClick={() => csvInputRef.current?.click()} size="sm" className="w-full" disabled={models.length === 0}>
                                Predecir CSV para {models.length} Propiedades
                            </Button>
                            <p className="text-[10px] text-slate-500 mt-3 text-center leading-relaxed">
                                El sistema aplicará el pre-procesamiento específico de cada modelo a las mismas muestras crudas.
                            </p>
                        </div>
                    </div>
                </div>

                {/* SECCIÓN 3: RESULTADOS */}
                {predictions.length > 0 && (
                    <div className="animate-fade-in">
                        <div className="flex justify-between items-end mb-3">
                            <h3 className="text-sm font-bold text-slate-800">Resultados Consolidados</h3>
                            <Button size="sm" variant="secondary" onClick={downloadResults} className="text-xs">
                                Descargar Tabla Completa
                            </Button>
                        </div>
                        
                        <div className="max-h-[500px] overflow-y-auto custom-scrollbar border border-slate-200 rounded-lg bg-white shadow-inner">
                            <table className="w-full text-sm text-left border-collapse">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-100 sticky top-0 shadow-sm z-10">
                                    <tr>
                                        <th className="px-6 py-3 font-bold border-b border-slate-200 bg-slate-100">ID Muestra</th>
                                        {/* Generar columnas dinámicas basadas en los modelos cargados */}
                                        {models.map((m, idx) => (
                                            <th key={idx} className="px-6 py-3 text-right font-bold border-b border-slate-200 bg-slate-100">
                                                {m.analyticalProperty}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {predictions.map((p, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-3 font-medium text-slate-700 border-r border-slate-100">{p.id}</td>
                                            {models.map((m, mIdx) => {
                                                const val = p.values[m.analyticalProperty];
                                                const gh = p.ghs[m.analyticalProperty];
                                                const isOutlier = gh > 3.0;
                                                
                                                return (
                                                    <td key={mIdx} className={`px-6 py-3 text-right font-mono ${isOutlier ? 'bg-red-50' : ''}`}>
                                                        <div className="flex flex-col items-end">
                                                            <span className={`text-sm ${isOutlier ? 'text-red-700 font-bold' : 'text-slate-700'}`}>
                                                                {val !== undefined ? val.toFixed(4) : '-'}
                                                            </span>
                                                            {gh !== undefined && (
                                                                <span className={`text-[9px] ${isOutlier ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                                                                    GH: {gh.toFixed(2)} {isOutlier ? '⚠️' : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default ModelPredictor;
