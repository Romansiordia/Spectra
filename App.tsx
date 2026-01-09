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
import Card from './components/Card';

const App: React.FC = () => {
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
        // Simulate async loading for UX
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
        
        // Timeout para permitir que la UI muestre el loader
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
         // Automatically rerun model after deactivating if results exist
         if (modelResults) {
             // Defer execution
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
            <div className="min-h-screen flex flex-col bg-gray-50 text-gray-800">
                <Header />
                <main className="flex-grow p-4 lg:p-6 grid grid-cols-1 xl:grid-cols-4 gap-4 lg:gap-6">
                    {/* Controls Column */}
                    <div className="xl:col-span-1 flex flex-col gap-4 lg:gap-6">
                        <DataUploader onFileSelected={handleFileSelected} onLoadDemo={handleLoadDemoData} />
                        <SampleManager
                            samples={samples}
                            onToggle={handleToggleSample}
                            onToggleAll={handleToggleAllSamples}
                        />
                    </div>

                    {/* Visualization Column */}
                    <div className="xl:col-span-3 flex flex-col gap-4 lg:gap-6">
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
                        
                        {/* Modified to accept data for internal optimization */}
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
                                <div className="flex items-center justify-center h-40">
                                    <p className="text-gray-400">Genere un modelo PLS para ver los resultados estadísticos (R, SEC, SECV).</p>
                                </div>
                            </Card>
                        )}
                    </div>
                </main>
            </div>
        </>
    );
};

export default App;