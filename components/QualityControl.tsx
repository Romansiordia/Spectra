import React, { useState, useMemo } from 'react';
import { IngredientLibrary, ClassificationResult, Sample, PreprocessingStep } from '../types';
import { parseCSV } from '../services/csvParser';
import { createIngredientLibrary, classifySpectrum, applyPreprocessingLogic, runPcaAnalysis, PcaScore } from '../services/chemometrics';
import Card from './Card';
import Button from './Button';
import { Search, ShieldCheck, ShieldAlert, Database, Plus, Trash2, Info, CheckCircle2, XCircle, AlertTriangle, BarChart3, Map as MapIcon, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ScatterChart, Scatter, ZAxis, Cell, ComposedChart } from 'recharts';

interface QualityControlProps {
    wavelengths: number[];
    preprocessingSteps: PreprocessingStep[];
    onWavelengthsUpdate?: (wavelengths: number[]) => void;
}

const Gauge: React.FC<{ value: number; threshold: number; distance: number; isConforming: boolean }> = ({ value, threshold, distance, isConforming }) => {
    // Utilizamos la confianza global (value) para la aguja
    const percentage = 100 - value;
    
    return (
        <div className="relative flex flex-col items-center">
            <div className="relative w-48 h-24 overflow-hidden">
                <div className="absolute top-0 left-0 w-48 h-48 border-[16px] border-ui-border rounded-full"></div>
                <div 
                    className={`absolute top-0 left-0 w-48 h-48 border-[16px] rounded-full transition-all duration-1000 ease-out`}
                    style={{ 
                        borderColor: isConforming ? '#10b981' : '#ef4444',
                        clipPath: `polygon(0 50%, 100% 50%, 100% 0, 0 0)`,
                        transform: `rotate(${(percentage * 1.8) - 180}deg)`
                    }}
                ></div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                    <span className={`text-2xl font-black ${isConforming ? 'text-ui-success' : 'text-red-600'}`}>
                        {isConforming ? 'OK' : 'FAIL'}
                    </span>
                </div>
            </div>
            <div className="flex justify-between w-full mt-2 px-2 text-[10px] font-bold text-slate-400">
                <span>CONFORME</span>
                <span>FUERA DE LÍMITE</span>
            </div>
        </div>
    );
};

const QualityControl: React.FC<QualityControlProps> = ({ wavelengths, preprocessingSteps, onWavelengthsUpdate }) => {
    const [libraries, setLibraries] = useState<IngredientLibrary[]>([]);
    const [isUploadingLibrary, setIsUploadingLibrary] = useState(false);
    const [newIngredientName, setNewIngredientName] = useState('');
    const [inspectionResult, setInspectionResult] = useState<ClassificationResult | null>(null);
    const [isInspecting, setIsInspecting] = useState(false);
    const [inspectedSpectrum, setInspectedSpectrum] = useState<number[] | null>(null);
    const [pcaScores, setPcaScores] = useState<PcaScore[]>([]);
    
    // Google Sheets Integration State
    const [googleScriptUrl, setGoogleScriptUrl] = useState('');
    const [isSyncing, setIsSyncing] = useState(false);
    const [showGoogleConfig, setShowGoogleConfig] = useState(false);

    // Local wavelengths in case the global ones are empty
    const [localWavelengths, setLocalWavelengths] = useState<number[]>([]);

    const effectiveWavelengths = wavelengths.length > 0 ? wavelengths : localWavelengths;

    const handleLibraryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isJson = file.name.toLowerCase().endsWith('.json');
        if (!isJson && !newIngredientName) return;

        setIsUploadingLibrary(true);

        if (isJson) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const config = JSON.parse(event.target?.result as string);
                    if (config.referenceData && config.referenceData.meanSpectrum) {
                        const newLib: IngredientLibrary = {
                            id: `lib_${Date.now()}`,
                            name: newIngredientName || config.analyticalProperty || 'Modelo Referencia',
                            averageSpectrum: config.referenceData.meanSpectrum,
                            stdDevSpectrum: config.referenceData.stdSpectrum,
                            samples: [],
                            threshold: config.referenceData.threshold || 2.0
                        };
                        setLibraries(prev => [...prev, newLib]);
                        
                        if (effectiveWavelengths.length === 0 && config.referenceData.wavelengths) {
                            setLocalWavelengths(config.referenceData.wavelengths);
                            onWavelengthsUpdate?.(config.referenceData.wavelengths);
                        }
                        setNewIngredientName('');
                    } else {
                        alert("El archivo JSON no contiene datos de referencia válidos (se requiere generar un modelo con la versión actualizada).");
                    }
                } catch (error) {
                    alert('Error al leer el archivo JSON.');
                } finally {
                    setIsUploadingLibrary(false);
                    if (e.target) e.target.value = '';
                }
            };
            reader.readAsText(file);
            return;
        }

        parseCSV(file, (results) => {
            try {
                if (results.samples.length === 0) return;

                // Actualizar longitudes de onda si están vacías
                if (effectiveWavelengths.length === 0 && results.wavelengths.length > 0) {
                    setLocalWavelengths(results.wavelengths);
                    onWavelengthsUpdate?.(results.wavelengths);
                }

                // Calcular media para MSC si es necesario
                let ref: number[] | undefined = undefined;
                if (preprocessingSteps.some(s => s.method === 'msc')) {
                    const nPoints = results.samples[0].values.length;
                    ref = new Array(nPoints).fill(0);
                    results.samples.forEach(s => s.values.forEach((v, i) => ref![i] += v));
                    ref = ref.map(v => v / results.samples.length);
                }

                const processedSamples = results.samples.map(s => ({
                    id: s.id,
                    values: applyPreprocessingLogic(s.values, preprocessingSteps, ref)
                }));
                
                const newLib = createIngredientLibrary(newIngredientName, processedSamples);
                setLibraries(prev => [...prev, newLib]);
                setNewIngredientName('');
            } catch (error) {
                alert('Error al crear la biblioteca: ' + (error instanceof Error ? error.message : 'Error desconocido'));
            } finally {
                setIsUploadingLibrary(false);
                if (e.target) e.target.value = '';
            }
        });
    };

    const syncWithGoogleSheets = async () => {
        if (!googleScriptUrl) {
            alert('Por favor, ingresa la URL de tu Google Apps Script.');
            return;
        }

        setIsSyncing(true);
        try {
            // 1. Obtener lista de productos (hojas)
            const productsResponse = await fetch(`${googleScriptUrl}?action=getProducts`);
            if (!productsResponse.ok) throw new Error('No se pudo conectar con Google Sheets. Verifica la URL.');
            const productNames = await productsResponse.json();

            if (!Array.isArray(productNames)) throw new Error('Respuesta inválida de Google Sheets.');

            const newLibraries: IngredientLibrary[] = [];

            // 2. Para cada producto, obtener sus datos
            for (const name of productNames) {
                const dataResponse = await fetch(`${googleScriptUrl}?action=getData&sheet=${encodeURIComponent(name)}`);
                const rawData = await dataResponse.json();

                if (Array.isArray(rawData) && rawData.length > 1) {
                    // 1. Extraer encabezados y determinar columnas reales
                    const header = rawData[0].filter((cell: any) => cell !== null && cell !== "");
                    const numCols = header.length;
                    
                    let currentWavelengths = effectiveWavelengths;
                    if (currentWavelengths.length === 0 && numCols > 2) {
                        const extracted = header.slice(1, numCols - 1).map(Number).filter(v => !isNaN(v));
                        if (extracted.length > 0) {
                            setLocalWavelengths(extracted);
                            onWavelengthsUpdate?.(extracted);
                            currentWavelengths = extracted;
                        }
                    }

                    const expectedPoints = currentWavelengths.length;

                    // 2. Procesar muestras (saltando la primera fila de encabezados)
                    const samples = rawData.slice(1).map((row: any[]) => {
                        if (row.length < 2) return null;
                        
                        const id = String(row[0]);
                        // Tomamos exactamente la cantidad de puntos esperada empezando desde la col 1
                        const values = row.slice(1, 1 + expectedPoints).map(v => {
                            const num = Number(v);
                            return isNaN(num) ? 0 : num;
                        });

                        return values.length === expectedPoints ? { id, values } : null;
                    }).filter((s): s is { id: string; values: number[] } => s !== null);

                    if (samples.length > 0) {
                        // Calcular media para MSC si es necesario
                        let ref: number[] | undefined = undefined;
                        if (preprocessingSteps.some(s => s.method === 'msc')) {
                            const nPoints = samples[0].values.length;
                            ref = new Array(nPoints).fill(0);
                            samples.forEach(s => s.values.forEach((v, i) => ref![i] += v));
                            ref = ref.map(v => v / samples.length);
                        }

                        const processedSamples = samples.map(s => ({
                            id: s.id,
                            values: applyPreprocessingLogic(s.values, preprocessingSteps, ref)
                        }));

                        const lib = createIngredientLibrary(name, processedSamples);
                        newLibraries.push(lib);
                    }
                }
            }

            if (newLibraries.length > 0) {
                setLibraries(prev => {
                    // Evitar duplicados por nombre
                    const existingNames = new Set(prev.map(l => l.name));
                    const filteredNew = newLibraries.filter(l => !existingNames.has(l.name));
                    return [...prev, ...filteredNew];
                });
                alert(`Sincronización exitosa: ${newLibraries.length} productos cargados.`);
            } else {
                alert('No se encontraron datos válidos en las hojas de Google.');
            }

        } catch (error) {
            console.error('Error syncing with Google Sheets:', error);
            alert('Error de sincronización: ' + (error instanceof Error ? error.message : 'Error desconocido'));
        } finally {
            setIsSyncing(false);
        }
    };

    const handleInspectSample = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || libraries.length === 0) return;

        setIsInspecting(true);
        parseCSV(file, (results) => {
            try {
                const sample = results.samples[0];
                if (!sample) throw new Error("No se encontraron muestras en el archivo.");

                // Actualizar longitudes de onda si están vacías
                if (effectiveWavelengths.length === 0 && results.wavelengths.length > 0) {
                    setLocalWavelengths(results.wavelengths);
                    onWavelengthsUpdate?.(results.wavelengths);
                }
                
                const processedValues = applyPreprocessingLogic(sample.values, preprocessingSteps, libraries.length > 0 ? libraries[0].averageSpectrum : undefined);
                const result = classifySpectrum(processedValues, libraries);
                
                setInspectionResult(result);
                setInspectedSpectrum(processedValues);

                // Calcular PCA para visualización (Amedidas de las bibliotecas + muestra nueva)
                const pcaData = [
                    ...libraries.map(lib => ({
                        id: lib.id,
                        values: lib.averageSpectrum,
                        color: lib.id === result?.ingredientId ? '#10b981' : '#94a3b8',
                        label: lib.name
                    })),
                    {
                        id: 'current_sample',
                        values: processedValues,
                        color: '#6366f1',
                        label: 'Muestra Actual'
                    }
                ];
                
                const scores = runPcaAnalysis(pcaData);
                setPcaScores(scores);

            } catch (error) {
                alert('Error en la inspección: ' + (error instanceof Error ? error.message : 'Error desconocido'));
            } finally {
                setIsInspecting(false);
                if (e.target) e.target.value = '';
            }
        });
    };

    const removeLibrary = (id: string) => {
        setLibraries(prev => prev.filter(l => l.id !== id));
        if (inspectionResult?.ingredientId === id) {
            setInspectionResult(null);
            setInspectedSpectrum(null);
            setPcaScores([]);
        }
    };

    const chartData = useMemo(() => {
        if (!inspectionResult || !inspectedSpectrum || !effectiveWavelengths.length) return [];
        
        const matchedLib = libraries.find(l => l.id === inspectionResult.ingredientId);
        if (!matchedLib) return [];

        // Asegurarnos de no exceder los límites de los arrays
        const dataPoints = Math.min(effectiveWavelengths.length, inspectedSpectrum.length, matchedLib.averageSpectrum.length);

        const data = [];
        for (let i = 0; i < dataPoints; i++) {
            const diff = inspectedSpectrum[i] - matchedLib.averageSpectrum[i];
            data.push({
                wavelength: effectiveWavelengths[i],
                sample: inspectedSpectrum[i],
                reference: matchedLib.averageSpectrum[i],
                upper: matchedLib.averageSpectrum[i] + (matchedLib.stdDevSpectrum[i] * 2),
                lower: matchedLib.averageSpectrum[i] - (matchedLib.stdDevSpectrum[i] * 2),
                diff: diff,
                zero: 0
            });
        }
        return data;
    }, [inspectionResult, inspectedSpectrum, effectiveWavelengths, libraries]);

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* Panel de Gestión de Biblioteca */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <Card id="library-management">
                        <div className="flex items-center gap-2 mb-4">
                            <Database className="text-ui-accent" size={20} />
                            <h2 className="text-lg font-bold text-slate-100">Biblioteca</h2>
                        </div>

                        {/* Google Sheets Sync Section */}
                        <div className="mb-6 p-3 bg-ui-accent/10/50 border border-ui-accent/30 rounded-xl">
                            <button 
                                onClick={() => setShowGoogleConfig(!showGoogleConfig)}
                                className="flex items-center justify-between w-full text-[10px] font-bold text-ui-accent uppercase tracking-wider"
                            >
                                <span className="flex items-center gap-2">
                                    <MapIcon size={12} />
                                    Conexión Google Sheets
                                </span>
                                <span>{showGoogleConfig ? '−' : '+'}</span>
                            </button>
                            
                            {showGoogleConfig && (
                                <div className="mt-3 space-y-3 animate-fade-in">
                                    <input 
                                        type="text" 
                                        value={googleScriptUrl}
                                        onChange={(e) => setGoogleScriptUrl(e.target.value)}
                                        placeholder="URL de Google Script..."
                                        className="w-full px-2 py-1.5 bg-ui-card border border-ui-border rounded text-[10px] outline-none focus:ring-1 focus:ring-ui-accent"
                                    />
                                    <Button 
                                        onClick={syncWithGoogleSheets} 
                                        disabled={isSyncing || !googleScriptUrl}
                                        size="sm" 
                                        className="w-full py-1.5 text-[10px]"
                                    >
                                        {isSyncing ? 'Sincronizando...' : 'Sincronizar Todo'}
                                    </Button>
                                </div>
                            )}
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre (Opcional si usa JSON)</label>
                                <input 
                                    type="text" 
                                    value={newIngredientName}
                                    onChange={(e) => setNewIngredientName(e.target.value)}
                                    placeholder="Nombre del producto o modelo..."
                                    className="w-full px-3 py-2 bg-ui-dark border border-ui-border rounded-lg text-sm text-slate-100 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                                />
                            </div>
                            
                            <div className="relative">
                                <input 
                                    type="file" 
                                    accept=".csv,.json"
                                    onChange={handleLibraryUpload}
                                    disabled={isUploadingLibrary}
                                    className="hidden" 
                                    id="lib-upload"
                                />
                                <label 
                                    htmlFor="lib-upload"
                                    className={`flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border-2 border-dashed transition-all cursor-pointer ${isUploadingLibrary ? 'bg-ui-dark border-ui-border text-slate-400 cursor-wait' : 'bg-ui-accent/10 border-ui-accent/50 text-ui-accent hover:bg-ui-accent/20'}`}
                                >
                                    {isUploadingLibrary ? (
                                        <div className="h-4 w-4 border-2 border-[#0a1d4a] border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <Plus size={16} />
                                    )}
                                    <span className="font-bold text-xs">Cargar Referencias</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6">
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Registrados ({libraries.length})</h3>
                            {libraries.length === 0 ? (
                                <div className="py-6 text-center bg-ui-dark rounded-lg border border-ui-border">
                                    <p className="text-[10px] text-slate-400 italic">Sin datos</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                    {libraries.map(lib => (
                                        <div key={lib.id} className="flex items-center justify-between p-2 bg-ui-dark border border-ui-border rounded-lg group hover:border-ui-accent transition-colors">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className="h-6 w-6 bg-ui-accent/10 text-ui-accent rounded flex items-center justify-center font-bold text-[10px] shrink-0">
                                                    {lib.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <p className="text-xs font-semibold text-slate-300 truncate">{lib.name}</p>
                                            </div>
                                            <button 
                                                onClick={() => removeLibrary(lib.id)}
                                                className="p-1 text-slate-300 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </Card>

                    <Card id="quality-info" className="bg-ui-dark text-white border-none">
                        <div className="flex items-start gap-3">
                            <Info size={18} className="text-ui-accent shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-bold text-sm mb-1">Metodología</h4>
                                <p className="text-[10px] text-slate-400 leading-relaxed">
                                    Análisis de Distancia Euclidiana Multivariante. El umbral se define por 3 desviaciones estándar del grupo de referencia.
                                </p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Panel de Inspección y Resultados Visuales */}
                <div className="lg:col-span-3 flex flex-col gap-6">
                    <Card id="inspection-terminal">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <Search className="text-ui-accent" size={20} />
                                <h2 className="text-lg font-bold text-slate-100">Terminal de Inspección</h2>
                            </div>
                            
                            <div className="flex gap-2">
                                <input 
                                    type="file" 
                                    accept=".csv"
                                    onChange={handleInspectSample}
                                    disabled={isInspecting || libraries.length === 0}
                                    className="hidden" 
                                    id="sample-inspect"
                                />
                                <label 
                                    htmlFor="sample-inspect"
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer shadow-sm ${libraries.length === 0 ? 'bg-ui-darkest text-slate-400 cursor-not-allowed' : 'bg-ui-accent text-[#0a1d4a] hover:bg-[#38bdf8] shadow-[0_0_15px_rgba(14,165,233,0.3)]'}`}
                                >
                                    {isInspecting ? (
                                        <div className="h-4 w-4 border-2 border-[#0a1d4a] border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <Activity size={16} />
                                    )}
                                    Analizar Muestra
                                </label>
                            </div>
                        </div>

                        {inspectionResult ? (
                            <div className="space-y-6">
                                {/* Fila Superior: Identidad y Gauge */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className={`md:col-span-2 p-6 rounded-2xl border-2 flex flex-col justify-center ${inspectionResult.isConforming ? 'bg-ui-success/10 border-ui-success/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Identificación Detectada</span>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black ${inspectionResult.isConforming ? 'bg-ui-success text-white' : 'bg-red-500 text-white'}`}>
                                                    {inspectionResult.isConforming ? 'CONFORME' : 'NO CONFORME'}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <h4 className="text-4xl font-black text-slate-100 mb-2">{inspectionResult.ingredientName}</h4>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="h-2 flex-grow bg-slate-200 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-ui-accent transition-all duration-1000" 
                                                    style={{ width: `${inspectionResult.confidence}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs font-bold text-ui-accent">{Math.round(inspectionResult.confidence)}% Confianza</span>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4 mt-2">
                                            <div className="bg-ui-card/50 p-3 rounded-xl border border-ui-border">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Distancia</p>
                                                <p className="text-xl font-mono font-bold text-slate-200">{inspectionResult.distance.toFixed(4)}</p>
                                            </div>
                                            <div className="bg-ui-card/50 p-3 rounded-xl border border-ui-border">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Umbral Máx.</p>
                                                <p className="text-xl font-mono font-bold text-slate-200">{inspectionResult.details.threshold.toFixed(4)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-ui-darkest rounded-2xl border border-ui-border p-6 flex flex-col items-center justify-center">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 text-center w-full">Indicador de Conformidad</span>
                                        <Gauge 
                                            value={inspectionResult.confidence} 
                                            threshold={inspectionResult.details.threshold} 
                                            distance={inspectionResult.distance} 
                                            isConforming={inspectionResult.isConforming}
                                        />
                                    </div>
                                </div>

                                {/* Fila Inferior: Gráfico Overlay y PCA Map */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Gráfico de Superposición (Opción 1) */}
                                    <Card className="p-4">
                                        <div className="flex items-center gap-2 mb-4">
                                            <BarChart3 size={16} className="text-ui-accent" />
                                            <h3 className="text-xs font-bold text-slate-200 uppercase">Comparación Espectral (Overlay)</h3>
                                        </div>
                                        <div className="h-64 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={chartData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis 
                                                        dataKey="wavelength" 
                                                        fontSize={10}
                                                        tickFormatter={(val) => `${Math.round(val)}`}
                                                        minTickGap={30}
                                                    />
                                                    <YAxis fontSize={10} domain={['auto', 'auto']} />
                                                    <Tooltip 
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                        labelFormatter={(val) => `${val} nm`}
                                                    />
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="upperTolerance" 
                                                        stroke="none" 
                                                        fill="#94a3b8" 
                                                        fillOpacity={0.1} 
                                                        name="Banda de Tolerancia"
                                                    />
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="lowerTolerance" 
                                                        stroke="none" 
                                                        fill="#94a3b8" 
                                                        fillOpacity={0.1} 
                                                        name="Banda de Tolerancia"
                                                    />
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="reference" 
                                                        stroke="#94a3b8" 
                                                        strokeWidth={1} 
                                                        dot={false} 
                                                        name="Promedio Ref."
                                                    />
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="sample" 
                                                        stroke="#6366f1" 
                                                        strokeWidth={2} 
                                                        dot={false} 
                                                        name="Muestra Actual"
                                                    />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="flex justify-center gap-6 mt-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-0.5 bg-slate-400"></div>
                                                <span className="text-[10px] text-slate-500 font-medium">Referencia</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-0.5 bg-ui-accent"></div>
                                                <span className="text-[10px] text-slate-500 font-medium">Muestra</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-2 bg-slate-200 rounded-sm"></div>
                                                <span className="text-[10px] text-slate-500 font-medium">Tolerancia</span>
                                            </div>
                                        </div>

                                        {/* Residuals Chart */}
                                        <div className="mt-8 pt-6 border-t border-ui-border">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Análisis de Residuales (Diferencia)</h3>
                                                <div className="text-[10px] text-slate-400">Δ = Muestra - Ref</div>
                                            </div>
                                            <div className="h-32 w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <ComposedChart data={chartData}>
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                        <XAxis 
                                                            dataKey="wavelength" 
                                                            fontSize={10}
                                                            tickFormatter={(val) => `${Math.round(val)}`}
                                                            minTickGap={30}
                                                        />
                                                        <YAxis fontSize={10} domain={['auto', 'auto']} />
                                                        <Tooltip 
                                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                            labelFormatter={(val) => `${val} nm`}
                                                            formatter={(value: number) => [value.toFixed(4), 'Diferencia']}
                                                        />
                                                        <Line 
                                                            type="monotone" 
                                                            dataKey="zero" 
                                                            stroke="#cbd5e1" 
                                                            strokeWidth={1} 
                                                            strokeDasharray="5 5"
                                                            dot={false} 
                                                            name="Línea Base"
                                                        />
                                                        <Area 
                                                            type="monotone" 
                                                            dataKey="diff" 
                                                            stroke="#f43f5e" 
                                                            fill="#f43f5e" 
                                                            fillOpacity={0.1} 
                                                            name="Diferencia"
                                                        />
                                                    </ComposedChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* Mapa PCA (Opción 5) */}
                                    <Card className="p-4">
                                        <div className="flex items-center gap-2 mb-4">
                                            <MapIcon size={16} className="text-ui-accent" />
                                            <h3 className="text-xs font-bold text-slate-200 uppercase">Mapa de Identidad (PCA)</h3>
                                        </div>
                                        <div className="h-64 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis type="number" dataKey="pc1" name="PC1" domain={['auto', 'auto']} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                    <YAxis type="number" dataKey="pc2" name="PC2" domain={['auto', 'auto']} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                                    <ZAxis type="number" range={[100, 400]} />
                                                    <Tooltip 
                                                        cursor={{ strokeDasharray: '3 3' }}
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                        formatter={(value: any, name: any, props: any) => [props.payload.label, '']}
                                                    />
                                                    <Scatter name="Bibliotecas" data={pcaScores}>
                                                        {pcaScores.map((entry, index) => (
                                                            <Cell 
                                                                key={`cell-${index}`} 
                                                                fill={entry.color} 
                                                                stroke={entry.id === 'current_sample' ? '#000' : 'none'}
                                                                strokeWidth={entry.id === 'current_sample' ? 2 : 0}
                                                            />
                                                        ))}
                                                    </Scatter>
                                                </ScatterChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <p className="text-[9px] text-slate-400 text-center mt-2 italic">
                                            Visualización de agrupamiento espectral. La muestra actual se resalta con borde negro.
                                        </p>
                                    </Card>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-24 text-center px-10">
                                <div className="h-20 w-20 bg-ui-dark text-slate-400 rounded-full flex items-center justify-center mb-6 border-2 border-dashed border-ui-border">
                                    <Activity size={40} />
                                </div>
                                <h3 className="text-slate-200 font-bold text-lg mb-2">Listo para Inspección</h3>
                                <p className="text-sm text-slate-400 max-w-xs">
                                    Selecciona un archivo CSV con la muestra que deseas verificar contra tu biblioteca de referencia.
                                </p>
                            </div>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default QualityControl;
