import React, { useState, useCallback } from 'react';
import { Sample, PreprocessingStep, ModelResults } from './types';
import { parseCSV, DEMO_DATA_STRING } from './services/csvParser';
import { applyPreprocessingLogic, runPlsAnalysis } from './services/chemometrics';
import Header from './components/Header';
import Loader from './components/Loader';
import DataUploader from './components/DataUploader';
import SampleManager from './components/SampleManager';
import SpectraViewer from './components/SpectraViewer';
import PreprocessingEditor from './components/PreprocessingEditor';
import ModelGenerator, { ModelParams } from './components/ModelGenerator';
import ResultsViewer from './components/ResultsViewer';
import ModelPredictor from './components/ModelPredictor';
import Card from './components/Card';

type AppView = 'calibration' | 'prediction';

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
        parseCSV(file, (results) => {
            handleDataLoaded(results);
            setLoadingMessage(null);
        });
    };
    
    const handleLoadDemoData = () => {
        setLoadingMessage('Cargando datos de demostración...');
        setTimeout(() => {
            parseCSV(DEMO_DATA_STRING, (results) => {
                handleDataLoaded(results);
                setLoadingMessage(null);
            });
        }, 100);
    };

    const handleToggleSample = (index: number) => {
        setSamples(prev => prev.map((s, i) => i === index ? { ...s, active: !s.active } : s));
    };

    const handleToggleAllSamples = (active: boolean) => {
        setSamples(prev => prev.map(s => ({ ...s, active })));
    };

    const handleVisualizePreprocessing = () => {
        const activeSamples = samples.filter(s => s.active);
        if (activeSamples.length === 0) return;
        const processed = activeSamples.map(sample => ({
            ...sample,
            values: applyPreprocessingLogic(sample.values, preprocessingSteps)
        }));
        setProcessedSpectra(processed);
    };

    const handleResetVisualization = useCallback(() => {
        setProcessedSpectra(null);
    }, []);

    const handleRunModel = async (params: ModelParams) => {
        const activeSamples = samples.filter(s => s.active);
        if (activeSamples.length < 3) {
            alert('Se necesitan al menos 3 muestras activas para generar el modelo PLS y validación cruzada.');
            return;
        }
        setLoadingMessage(`Generando modelo ${params.type.toUpperCase()}...`);
        
        setTimeout(() => {
            try {
                const results = runPlsAnalysis(activeSamples, preprocessingSteps, params.nComponents);
                setModelResults(results);
            } catch (error) {
                console.error(`Error during ${params.type} run:`, error);
                const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
                alert(`Ocurrió un error al generar el modelo: ${errorMessage}`);
            } finally {
                setLoadingMessage(null);
            }
        }, 100);
    };
    
    const handleDeactivateOutliers = (outlierIds: (string|number)[]) => {
         setSamples(prev => prev.map(s => outlierIds.includes(s.id) ? { ...s, active: false } : s));
         if (modelResults) {
             setTimeout(() => {
                const params: ModelParams = { type: 'pls', nComponents: modelResults.nComponents };
                handleRunModel(params);
             }, 100);
         }
    }
    
    const activeSamples = samples.filter(s => s.active);
    const spectraToDisplay = processedSpectra ? processedSpectra.map(p => {
        const originalSample = samples.find(s => s.id === p.id);
        return { ...p, color: originalSample?.color || '#000000' };
    }) : activeSamples;

    return (
        <>
            {loadingMessage && <Loader message={loadingMessage} />}
            <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 font-sans">
                <Header />
                
                {/* Navigation Tabs */}
                <div className="bg-white border-b border-slate-200 sticky top-16 z-20">
                    <div className="max-w-[1920px] mx-auto px-4 lg:px-6 flex gap-8">
                        <button 
                            onClick={() => setCurrentView('calibration')}
                            className={`py-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${currentView === 'calibration' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h5"/><path d="M17 12h5"/><path d="M7 12a5 5 0 0 1 5-5 5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5Z"/></svg>
                            1. Entrenamiento & Calibración
                        </button>
                        <button 
                            onClick={() => setCurrentView('prediction')}
                            className={`py-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${currentView === 'prediction' ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            2. Predicción de Nuevas Muestras
                        </button>
                    </div>
                </div>

                <main className="flex-grow p-4 lg:p-6">
                    
                    {/* VISTA DE CALIBRACIÓN */}
                    {currentView === 'calibration' && (
                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 animate-fade-in">
                            {/* Controls Column */}
                            <div className="xl:col-span-1 flex flex-col gap-6">
                                <DataUploader onFileSelected={handleFileSelected} onLoadDemo={handleLoadDemoData} />
                                <SampleManager
                                    samples={samples}
                                    onToggle={handleToggleSample}
                                    onToggleAll={handleToggleAllSamples}
                                />
                            </div>

                            {/* Visualization Column */}
                            <div className="xl:col-span-3 flex flex-col gap-6">
                                <SpectraViewer
                                    wavelengths={wavelengths}
                                    samples={spectraToDisplay}
                                    isProcessed={!!processedSpectra}
                                    onReset={handleResetVisualization}
                                />
                                
                                <PreprocessingEditor
                                    steps={preprocessingSteps}
                                    setSteps={setPreprocessingSteps}
                                    onVisualize={handleVisualizePreprocessing}
                                    disabled={activeSamples.length === 0}
                                />
                                
                                <ModelGenerator 
                                    onRunModel={handleRunModel} 
                                    disabled={activeSamples.length < 3}
                                    activeSamples={activeSamples}
                                    preprocessingSteps={preprocessingSteps}
                                />
                                
                                {modelResults ? (
                                    <ResultsViewer 
                                        results={modelResults}
                                        propertyName={analyticalProperty}
                                        preprocessingSteps={preprocessingSteps}
                                        activeSamples={activeSamples.map(s => s.id)}
                                        onDeactivateOutliers={handleDeactivateOutliers}
                                        wavelengths={wavelengths}
                                    />
                                ) : (
                                    <Card>
                                        <div className="flex flex-col items-center justify-center h-48 text-slate-400 bg-slate-50/50 rounded-lg m-4 border border-dashed border-slate-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <p className="font-medium">Resultados del Modelo</p>
                                            <p className="text-sm">Genere un modelo PLS para ver el análisis estadístico.</p>
                                        </div>
                                    </Card>
                                )}
                            </div>
                        </div>
                    )}

                    {/* VISTA DE PREDICCIÓN */}
                    {currentView === 'prediction' && (
                        <div className="max-w-5xl mx-auto animate-fade-in">
                            <div className="mb-6 text-center">
                                <h2 className="text-2xl font-bold text-slate-800">Módulo de Predicción Independiente</h2>
                                <p className="text-slate-500 mt-2">Cargue un modelo previamente entrenado (.json) y un nuevo archivo de espectros (.csv) para calcular propiedades.</p>
                            </div>
                            <ModelPredictor />
                        </div>
                    )}

                </main>
            </div>
        </>
    );
};

export default App;