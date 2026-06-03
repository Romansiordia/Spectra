import React, { useState, useCallback } from 'react';
import { Sample, PreprocessingStep, ModelResults } from './types';
import { parseCSV } from './services/csvParser';
import { parseDX } from './services/dxParser';
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
import ModelValidator from './components/ModelValidator';
import QualityControl from './components/QualityControl';
import Card from './components/Card';

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
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext === 'dx' || ext === 'jdx') {
            parseDX(file, (results) => {
                if (results) {
                    handleDataLoaded(results);
                }
                setLoadingMessage(null);
            });
        } else {
            parseCSV(file, (results) => {
                handleDataLoaded(results);
                setLoadingMessage(null);
            });
        }
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
                    {/* Placeholder for icons like in the image */}
                    <button 
                        onClick={() => setCurrentView('calibration')}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${currentView === 'calibration' ? 'bg-ui-card border border-ui-accent text-ui-accent' : 'text-slate-400 hover:text-white'}`}
                        title="Entrenamiento & Calibración"
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
                    {/* 
                    <button 
                        onClick={() => setCurrentView('quality')}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${currentView === 'quality' ? 'bg-ui-card border border-ui-accent text-ui-accent' : 'text-slate-400 hover:text-white'}`}
                        title="Predicción Espectral"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </button>
                    */}
                </aside>

                    <main className="flex-grow flex flex-col min-w-0 overflow-y-auto relative">
                        <div className="flex-grow p-4 lg:p-6 pb-20">
                    
                    {currentView === 'calibration' && (
                        <div className="flex flex-col gap-6 animate-fade-in">
                            <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
                                <div className="flex flex-col gap-6 lg:col-span-2">
                                    <DataUploader onFileSelected={handleFileSelected} />
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
                                </div>

                                <div className="flex flex-col gap-6 lg:col-span-5">
                                    <SpectraViewer
                                        wavelengths={wavelengths}
                                        samples={spectraToDisplay}
                                        isProcessed={!!processedSpectra}
                                        onReset={handleResetVisualization}
                                    />
                                    <SampleManager
                                        samples={samples}
                                        onToggle={handleToggleSample}
                                        onToggleAll={handleToggleAllSamples}
                                    />
                                    <div>
                                        <div className="flex items-center gap-3 mb-4">
                                             <div className="h-7 w-7 bg-ui-darkest text-ui-accent border border-ui-accent rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">4</div>
                                             <h2 className="text-lg font-bold text-slate-100">Análisis de Resultados del Modelo</h2>
                                        </div>
                                        {modelResults ? (
                                            <ResultsViewer 
                                                results={modelResults}
                                                propertyName={analyticalProperty}
                                                preprocessingSteps={preprocessingSteps}
                                                activeSamples={activeSamples.map(s => s.id)}
                                                activeSamplesData={activeSamples}
                                                onDeactivateOutliers={handleDeactivateOutliers}
                                                wavelengths={wavelengths}
                                                onExportCleanDataset={handleExportCleanDataset}
                                            />
                                        ) : (
                                            <Card>
                                                <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-ui-dark rounded-lg border-2 border-dashed border-ui-border">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                    <p className="font-semibold text-slate-200 text-lg">Resultados del Modelo</p>
                                                    <p className="text-sm text-slate-400 mt-1">Genere un modelo en el paso 3 para ver el análisis estadístico aquí.</p>
                                                </div>
                                            </Card>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentView === 'prediction' && (
                        <div className="max-w-5xl mx-auto animate-fade-in">
                            <div className="mb-6 mt-4">
                                <h1 className="text-3xl font-black text-slate-100 uppercase tracking-wide">Gestión de Modelos</h1>
                                <p className="text-ui-accent font-semibold mt-2 text-sm tracking-wide">Sincronice y administre su librería de modelos predictivos.</p>
                            </div>
                            <ModelPredictor />
                        </div>
                    )}

                    {currentView === 'validation' && (
                        <div className="animate-fade-in">
                            <ModelValidator />
                        </div>
                    )}

                    {currentView === 'quality' && (
                        <QualityControl 
                            wavelengths={wavelengths}
                            preprocessingSteps={preprocessingSteps}
                            onWavelengthsUpdate={setWavelengths}
                        />
                    )}

                        </div>
                    </main>
                </div>
            </div>
        </>
    );
};

export default App;