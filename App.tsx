import React, { useState, useCallback } from 'react';
import { Sample, PreprocessingStep, ModelResults } from './types';
import { parseCSV } from './services/csvParser';
import { parseDX } from './services/dxParser';
import { parseOPUS, textToWindows1252Bytes } from './services/opusParser';
import { parseFOSS } from './services/fossParser';
import { applyPreprocessingLogic, runPlsAnalysis } from './services/chemometrics';
import Header from './components/Header';
import Loader from './components/Loader';
import { ModelParams } from './components/ModelGenerator';
import ModelPredictor from './components/ModelPredictor';
import ModelValidator from './components/ModelValidator';
import QualityControl from './components/QualityControl';
import ErrorBoundary from './components/ErrorBoundary';
import CalibrationWorkflow from './components/CalibrationWorkflow';

type AppView = 'calibration' | 'prediction' | 'validation' | 'quality';

const App: React.FC = () => {
    const [currentView, setCurrentView] = useState<AppView>('calibration');
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [wavelengths, setWavelengths] = useState<number[]>([]);
    const [samples, setSamples] = useState<Sample[]>([]);
    const [analyticalProperty, setAnalyticalProperty] = useState<string>('Propiedad');
    const [preprocessingSteps, setPreprocessingSteps] = useState<PreprocessingStep[]>([]);
    const [modelResults, setModelResults] = useState<ModelResults | null>(null);
    const [processedSpectra, setProcessedSpectra] = useState<{ id: string | number; values: number[] }[] | null>(null);

    const handleDataLoaded = (data: { wavelengths: number[]; samples: Sample[]; analyticalProperty: string }) => {
        setWavelengths(data.wavelengths);
        setSamples(data.samples);
        setAnalyticalProperty(data.analyticalProperty);
        setModelResults(null);
        setProcessedSpectra(null);
        setPreprocessingSteps([]);
    };

    const handleFileSelected = (file: File) => {
        setLoadingMessage('Cargando datos...');

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const arrayBuffer = e.target?.result as ArrayBuffer;
                if (!arrayBuffer) {
                    throw new Error("No se pudieron leer los datos del archivo.");
                }

                const bytes = new Uint8Array(arrayBuffer);
                
                if (file.name.toLowerCase().endsWith('.nir')) {
                    parseFOSS(arrayBuffer, (results) => {
                        if (results) {
                            handleDataLoaded(results);
                        } else {
                            alert("No se pudo procesar el archivo .nir como FOSS binario.");
                        }
                        setLoadingMessage(null);
                    }, file.name);
                    return;
                }

                // Count binary control characters in the first 512 bytes to determine if it is binary
                let controlCharCount = 0;
                const checkLength = Math.min(bytes.length, 512);
                for (let i = 0; i < checkLength; i++) {
                    const b = bytes[i];
                    // Control characters (excluding tab 0x09, LF 0x0A, CR 0x0D)
                    if (b < 32 && b !== 9 && b !== 10 && b !== 13) {
                        controlCharCount++;
                    }
                }
                const isBinary = (controlCharCount / checkLength) > 0.02;
                
                let isRawBinaryOpus = false;
                let isTextOpus = false;
                let isJcamp = false;
                let text = "";

                if (isBinary) {
                    // Check for OPUS magic number (0x0A 0x0A or 0xFE 0xFE) in the first 128 bytes
                    for (let i = 0; i < Math.min(bytes.length - 1, 128); i++) {
                        if ((bytes[i] === 0x0A && bytes[i + 1] === 0x0A) || 
                            (bytes[i] === 0xFE && bytes[i + 1] === 0xFE)) {
                            isRawBinaryOpus = true;
                            break;
                        }
                    }
                } else {
                    const decoder = new TextDecoder('utf-8');
                    text = decoder.decode(bytes);
                    isJcamp = text.includes('##TITLE') || text.includes('##JCAMP');
                    isTextOpus = text.includes("þþ") || (text.includes("END") && /([A-Z0-9]{3})\s+END/i.test(text));
                }

                if (isRawBinaryOpus) {
                    // Es un archivo Bruker OPUS binario puro
                    parseOPUS(arrayBuffer, (results) => {
                        if (results) {
                            handleDataLoaded(results);
                        }
                        setLoadingMessage(null);
                    }, file.name);
                } else if (isTextOpus) {
                    // Es un archivo Bruker OPUS que se guardó o copió como texto (UTF-8 / ANSI)
                    // Reconstruimos los bytes binarios originales desde los caracteres de texto
                    const reconstructedBytes = textToWindows1252Bytes(text);
                    parseOPUS(reconstructedBytes.buffer, (results) => {
                        if (results) {
                            handleDataLoaded(results);
                        }
                        setLoadingMessage(null);
                    }, file.name);
                } else {
                    // Otros formatos de texto (JCAMP-DX o CSV/TXT de dos columnas)
                    if (isJcamp) {
                        parseDX(file, (results) => {
                            if (results) {
                                handleDataLoaded(results);
                            }
                            setLoadingMessage(null);
                        });
                    } else {
                        parseCSV(file, (results) => {
                            if (results) {
                                handleDataLoaded(results);
                            }
                            setLoadingMessage(null);
                        });
                    }
                }
            } catch (error: any) {
                console.error("Error al detectar formato:", error);
                alert(`Error al procesar el archivo: ${error.message}`);
                setLoadingMessage(null);
            }
        };

        reader.onerror = () => {
            alert("Error al leer el archivo.");
            setLoadingMessage(null);
        };

        reader.readAsArrayBuffer(file);
    };

    const handleToggleSample = (index: number) => {
        setSamples(prev => prev.map((s, i) => i === index ? { ...s, active: !s.active } : s));
    };

    const handleToggleAllSamples = (active: boolean) => {
        setSamples(prev => prev.map(s => ({ ...s, active })));
    };

    const handleUpdateAnalyticalValue = (index: number, value: number) => {
        setSamples(prev => prev.map((s, i) => i === index ? { ...s, analyticalValue: value } : s));
        setModelResults(null);
    };

    const handleUpdatePropertyName = (name: string) => {
        setAnalyticalProperty(name);
        setModelResults(null);
    };

    const handleVisualizePreprocessing = () => {
        const activeSamples = samples.filter(s => s.active);
        if (activeSamples.length === 0) return;

        // Calcular espectro de referencia (media) para MSC si es necesario
        let referenceSpectrum: number[] | undefined = undefined;
        const hasMsc = preprocessingSteps.some(s => s.method === 'msc');
        if (hasMsc) {
            const nPoints = activeSamples[0].values.length;
            referenceSpectrum = new Array(nPoints).fill(0);
            activeSamples.forEach(s => {
                s.values.forEach((v, i) => referenceSpectrum![i] += v);
            });
            referenceSpectrum = referenceSpectrum.map(v => v / activeSamples.length);
        }

        const processed = activeSamples.map(sample => ({
            ...sample,
            values: applyPreprocessingLogic(sample.values, preprocessingSteps, referenceSpectrum)
        }));
        setProcessedSpectra(processed);
    };

    const handleResetVisualization = useCallback(() => {
        setProcessedSpectra(null);
    }, []);

    const handleRunModel = async (params: ModelParams, samplesOverride?: Sample[]) => {
        // Usar las muestras pasadas directamente o las del estado
        const currentSamples = samplesOverride || samples;
        const activeSamplesToUse = currentSamples.filter(s => s.active);

        if (activeSamplesToUse.length < 3) {
            alert('Se necesitan al menos 3 muestras activas para generar el modelo.');
            return;
        }

        setLoadingMessage(`Generando modelo ${params.type.toUpperCase()}...`);
        
        // Timeout para permitir que el loader se muestre antes de la carga pesada de CPU
        setTimeout(() => {
            try {
                const results = runPlsAnalysis(activeSamplesToUse, preprocessingSteps, params.nComponents);
                setModelResults(results);
            } catch (error) {
                console.error(`Error during ${params.type} run:`, error);
                const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
                alert(`Error al generar el modelo: ${errorMessage}`);
            } finally {
                setLoadingMessage(null);
            }
        }, 50);
    };
    
    const handleDeactivateOutliers = (outlierIds: (string|number)[]) => {
         // Calcular las nuevas muestras inmediatamente para evitar usar el estado viejo
         const updatedSamples = samples.map(s => outlierIds.includes(s.id) ? { ...s, active: false } : s);
         
         // Actualizar el estado para la UI
         setSamples(updatedSamples);
         
         // Resetear visualización de pre-procesamiento si existía
         setProcessedSpectra(null);

         if (modelResults) {
             // Iniciar el recálculo inmediatamente con los nuevos datos inyectados
             const params: ModelParams = { type: 'pls', nComponents: modelResults.nComponents };
             handleRunModel(params, updatedSamples);
         }
    };

    const handleIncludeAllSamples = () => {
        setSamples(prev => prev.map(s => ({ ...s, active: true })));
        setProcessedSpectra(null);
    };

    const handleExportCleanDataset = () => {
        const activeSamples = samples.filter(s => s.active);
        if (activeSamples.length === 0) return;

        let csvContent = "Sample_ID," + wavelengths.join(",") + "," + analyticalProperty + "\n";
        
        activeSamples.forEach(sample => {
            const row = [sample.id, ...sample.values, sample.analyticalValue];
            csvContent += row.join(",") + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `dataset_limpio_${analyticalProperty}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    
    const activeSamples = samples.filter(s => s.active);
    const spectraToDisplay = processedSpectra ? processedSpectra.map(p => {
        const originalSample = samples.find(s => s.id === p.id);
        return { ...p, color: originalSample?.color || '#000000' };
    }) : activeSamples;

    return (
        <>
            {loadingMessage && <Loader message={loadingMessage} />}
            <div className="h-screen flex flex-col text-slate-100 font-sans bg-transparent overflow-hidden">
                <Header />
                <div className="flex-grow flex overflow-hidden">
                    {/* Sidebar */}
                    <aside className="w-20 bg-ui-darkest border-r border-ui-border flex flex-col items-center pt-16 pb-6 gap-6 z-40 shrink-0">
                    <button 
                        onClick={() => setCurrentView('calibration')}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${currentView === 'calibration' ? 'bg-ui-card border border-ui-accent text-ui-accent shadow-lg shadow-ui-accent/10' : 'text-slate-400 hover:text-white'}`}
                        title="Entrenamiento & Calibración (4 Fases)"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h5"/><path d="M17 12h5"/><path d="M7 12a5 5 0 0 1 5-5 5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5Z"/></svg>
                    </button>
                    <button 
                        onClick={() => setCurrentView('prediction')}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${currentView === 'prediction' ? 'bg-ui-card border border-ui-accent text-ui-accent' : 'text-slate-400 hover:text-white'}`}
                        title="Predicción"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </button>
                    <button 
                        onClick={() => setCurrentView('validation')}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${currentView === 'validation' ? 'bg-ui-card border border-ui-accent text-ui-accent' : 'text-slate-400 hover:text-white'}`}
                        title="Validación"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    </aside>

                    <main className="flex-grow flex flex-col min-w-0 overflow-y-auto relative">
                        <div className="flex-grow p-4 lg:p-6 pb-20">
                    
                    {currentView === 'calibration' && (
                        <ErrorBoundary fallbackTitle="Error al renderizar el flujo de entrenamiento y calibración.">
                            <CalibrationWorkflow 
                                wavelengths={wavelengths}
                                samples={samples}
                                analyticalProperty={analyticalProperty}
                                preprocessingSteps={preprocessingSteps}
                                modelResults={modelResults}
                                processedSpectra={processedSpectra}
                                onFileSelected={handleFileSelected}
                                setPreprocessingSteps={setPreprocessingSteps}
                                onVisualizePreprocessing={handleVisualizePreprocessing}
                                onResetVisualization={handleResetVisualization}
                                onToggleSample={handleToggleSample}
                                onToggleAllSamples={handleToggleAllSamples}
                                onUpdateAnalyticalValue={handleUpdateAnalyticalValue}
                                onUpdatePropertyName={handleUpdatePropertyName}
                                onRunModel={handleRunModel}
                                onDeactivateOutliers={handleDeactivateOutliers}
                                onIncludeAllSamples={handleIncludeAllSamples}
                                onExportCleanDataset={handleExportCleanDataset}
                            />
                        </ErrorBoundary>
                    )}

                     {currentView === 'prediction' && (
                        <div className="max-w-5xl mx-auto animate-fade-in">
                            <div className="mb-6 mt-4">
                                <h1 className="text-3xl font-black text-slate-100 uppercase tracking-wide">Gestión de Modelos</h1>
                                <p className="text-ui-accent font-semibold mt-2 text-sm tracking-wide">Sincronice y administre su librería de modelos predictivos.</p>
                            </div>
                            <ErrorBoundary fallbackTitle="Error al inicializar el Módulo de Predicción.">
                                <ModelPredictor />
                            </ErrorBoundary>
                        </div>
                    )}

                    {currentView === 'validation' && (
                        <div className="animate-fade-in">
                            <ErrorBoundary fallbackTitle="Error al inicializar el Módulo de Validación de Modelos (Recharts / Cálculo Estadístico).">
                                <ModelValidator />
                            </ErrorBoundary>
                        </div>
                    )}

                    {currentView === 'quality' && (
                        <ErrorBoundary fallbackTitle="Error en sección de Control de Calidad.">
                            <QualityControl 
                                wavelengths={wavelengths}
                                preprocessingSteps={preprocessingSteps}
                                onWavelengthsUpdate={setWavelengths}
                            />
                        </ErrorBoundary>
                    )}

                        </div>
                    </main>
                </div>
            </div>
        </>
    );
};

export default App;