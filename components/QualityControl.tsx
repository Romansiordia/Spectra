import React, { useState, useMemo } from 'react';
import { IngredientLibrary, ClassificationResult, Sample, PreprocessingStep } from '../types';
import { parseCSV } from '../services/csvParser';
import { createIngredientLibrary, classifySpectrum, applyPreprocessingLogic, runPcaAnalysis, PcaScore } from '../services/chemometrics';
import Card from './Card';
import Button from './Button';
import { Search, ShieldCheck, ShieldAlert, Database, Plus, Trash2, Info, CheckCircle2, XCircle, AlertTriangle, BarChart3, Map as MapIcon, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart, ScatterChart, Scatter, ZAxis, Cell } from 'recharts';

interface QualityControlProps {
    wavelengths: number[];
    preprocessingSteps: PreprocessingStep[];
}

const Gauge: React.FC<{ value: number; threshold: number; distance: number }> = ({ value, threshold, distance }) => {
    const percentage = Math.min(100, (distance / (threshold * 1.5)) * 100);
    const isConforming = distance <= threshold;
    
    return (
        <div className="relative flex flex-col items-center">
            <div className="relative w-48 h-24 overflow-hidden">
                <div className="absolute top-0 left-0 w-48 h-48 border-[16px] border-slate-100 rounded-full"></div>
                <div 
                    className={`absolute top-0 left-0 w-48 h-48 border-[16px] rounded-full transition-all duration-1000 ease-out`}
                    style={{ 
                        borderColor: isConforming ? '#10b981' : '#ef4444',
                        clipPath: `polygon(0 50%, 100% 50%, 100% 0, 0 0)`,
                        transform: `rotate(${(percentage * 1.8) - 180}deg)`
                    }}
                ></div>
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
                    <span className={`text-2xl font-black ${isConforming ? 'text-emerald-600' : 'text-red-600'}`}>
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

const QualityControl: React.FC<QualityControlProps> = ({ wavelengths, preprocessingSteps }) => {
    const [libraries, setLibraries] = useState<IngredientLibrary[]>([]);
    const [isUploadingLibrary, setIsUploadingLibrary] = useState(false);
    const [newIngredientName, setNewIngredientName] = useState('');
    const [inspectionResult, setInspectionResult] = useState<ClassificationResult | null>(null);
    const [isInspecting, setIsInspecting] = useState(false);
    const [inspectedSpectrum, setInspectedSpectrum] = useState<number[] | null>(null);
    const [pcaScores, setPcaScores] = useState<PcaScore[]>([]);

    const handleLibraryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !newIngredientName) return;

        setIsUploadingLibrary(true);
        parseCSV(file, (results) => {
            try {
                const processedSamples = results.samples.map(s => ({
                    id: s.id,
                    values: applyPreprocessingLogic(s.values, preprocessingSteps)
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

    const handleInspectSample = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || libraries.length === 0) return;

        setIsInspecting(true);
        parseCSV(file, (results) => {
            try {
                const sample = results.samples[0];
                if (!sample) throw new Error("No se encontraron muestras en el archivo.");
                
                const processedValues = applyPreprocessingLogic(sample.values, preprocessingSteps);
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
        if (!inspectionResult || !inspectedSpectrum || !wavelengths.length) return [];
        
        const matchedLib = libraries.find(l => l.id === inspectionResult.ingredientId);
        if (!matchedLib) return [];

        return wavelengths.map((w, i) => ({
            wavelength: w,
            sample: inspectedSpectrum[i],
            reference: matchedLib.averageSpectrum[i],
            upper: matchedLib.averageSpectrum[i] + (matchedLib.stdDevSpectrum[i] * 2),
            lower: matchedLib.averageSpectrum[i] - (matchedLib.stdDevSpectrum[i] * 2),
        }));
    }, [inspectionResult, inspectedSpectrum, wavelengths, libraries]);

    return (
        <div className="flex flex-col gap-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                
                {/* Panel de Gestión de Biblioteca */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <Card id="library-management">
                        <div className="flex items-center gap-2 mb-4">
                            <Database className="text-brand-600" size={20} />
                            <h2 className="text-lg font-bold text-slate-800">Biblioteca</h2>
                        </div>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nuevo Ingrediente</label>
                                <input 
                                    type="text" 
                                    value={newIngredientName}
                                    onChange={(e) => setNewIngredientName(e.target.value)}
                                    placeholder="Nombre del producto..."
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                                />
                            </div>
                            
                            <div className="relative">
                                <input 
                                    type="file" 
                                    accept=".csv"
                                    onChange={handleLibraryUpload}
                                    disabled={!newIngredientName || isUploadingLibrary}
                                    className="hidden" 
                                    id="lib-upload"
                                />
                                <label 
                                    htmlFor="lib-upload"
                                    className={`flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border-2 border-dashed transition-all cursor-pointer ${!newIngredientName ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-brand-50 border-brand-200 text-brand-700 hover:bg-brand-100'}`}
                                >
                                    {isUploadingLibrary ? (
                                        <div className="h-4 w-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
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
                                <div className="py-6 text-center bg-slate-50 rounded-lg border border-slate-100">
                                    <p className="text-[10px] text-slate-400 italic">Sin datos</p>
                                </div>
                            ) : (
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                    {libraries.map(lib => (
                                        <div key={lib.id} className="flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg group hover:border-brand-300 transition-colors">
                                            <div className="flex items-center gap-2 overflow-hidden">
                                                <div className="h-6 w-6 bg-brand-50 text-brand-600 rounded flex items-center justify-center font-bold text-[10px] shrink-0">
                                                    {lib.name.substring(0, 2).toUpperCase()}
                                                </div>
                                                <p className="text-xs font-semibold text-slate-700 truncate">{lib.name}</p>
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

                    <Card id="quality-info" className="bg-slate-900 text-white border-none">
                        <div className="flex items-start gap-3">
                            <Info size={18} className="text-brand-400 shrink-0 mt-0.5" />
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
                                <Search className="text-brand-600" size={20} />
                                <h2 className="text-lg font-bold text-slate-800">Terminal de Inspección</h2>
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
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs transition-all cursor-pointer shadow-sm ${libraries.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 text-white'}`}
                                >
                                    {isInspecting ? (
                                        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
                                    <div className={`md:col-span-2 p-6 rounded-2xl border-2 flex flex-col justify-center ${inspectionResult.isConforming ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Identificación Detectada</span>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black ${inspectionResult.isConforming ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                                                    {inspectionResult.isConforming ? 'CONFORME' : 'NO CONFORME'}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <h4 className="text-4xl font-black text-slate-800 mb-2">{inspectionResult.ingredientName}</h4>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="h-2 flex-grow bg-slate-200 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-brand-500 transition-all duration-1000" 
                                                    style={{ width: `${inspectionResult.confidence}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-xs font-bold text-brand-600">{Math.round(inspectionResult.confidence)}% Confianza</span>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4 mt-2">
                                            <div className="bg-white/50 p-3 rounded-xl border border-white">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Distancia</p>
                                                <p className="text-xl font-mono font-bold text-slate-700">{inspectionResult.distance.toFixed(4)}</p>
                                            </div>
                                            <div className="bg-white/50 p-3 rounded-xl border border-white">
                                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Umbral Máx.</p>
                                                <p className="text-xl font-mono font-bold text-slate-700">{inspectionResult.details.threshold.toFixed(4)}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col items-center justify-center">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4 text-center w-full">Indicador de Conformidad</span>
                                        <Gauge 
                                            value={inspectionResult.confidence} 
                                            threshold={inspectionResult.details.threshold} 
                                            distance={inspectionResult.distance} 
                                        />
                                    </div>
                                </div>

                                {/* Fila Inferior: Gráfico Overlay y PCA Map */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Gráfico de Superposición (Opción 1) */}
                                    <Card className="p-4">
                                        <div className="flex items-center gap-2 mb-4">
                                            <BarChart3 size={16} className="text-brand-600" />
                                            <h3 className="text-xs font-bold text-slate-700 uppercase">Comparación Espectral (Overlay)</h3>
                                        </div>
                                        <div className="h-64 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={chartData}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis 
                                                        dataKey="wavelength" 
                                                        hide 
                                                    />
                                                    <YAxis hide domain={['auto', 'auto']} />
                                                    <Tooltip 
                                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                        labelFormatter={(val) => `${val} nm`}
                                                    />
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="upper" 
                                                        stroke="none" 
                                                        fill="#94a3b8" 
                                                        fillOpacity={0.1} 
                                                        name="Banda de Tolerancia"
                                                    />
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="lower" 
                                                        stroke="none" 
                                                        fill="#94a3b8" 
                                                        fillOpacity={0.1} 
                                                        name="Banda de Tolerancia"
                                                    />
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="reference" 
                                                        stroke="#94a3b8" 
                                                        strokeWidth={2} 
                                                        dot={false} 
                                                        name="Promedio Ref."
                                                    />
                                                    <Line 
                                                        type="monotone" 
                                                        dataKey="sample" 
                                                        stroke="#6366f1" 
                                                        strokeWidth={3} 
                                                        dot={false} 
                                                        name="Muestra Actual"
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="flex justify-center gap-6 mt-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-0.5 bg-slate-400"></div>
                                                <span className="text-[10px] text-slate-500 font-medium">Referencia</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-0.5 bg-brand-500"></div>
                                                <span className="text-[10px] text-slate-500 font-medium">Muestra</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-2 bg-slate-200 rounded-sm"></div>
                                                <span className="text-[10px] text-slate-500 font-medium">Tolerancia</span>
                                            </div>
                                        </div>
                                    </Card>

                                    {/* Mapa PCA (Opción 5) */}
                                    <Card className="p-4">
                                        <div className="flex items-center gap-2 mb-4">
                                            <MapIcon size={16} className="text-brand-600" />
                                            <h3 className="text-xs font-bold text-slate-700 uppercase">Mapa de Identidad (PCA)</h3>
                                        </div>
                                        <div className="h-64 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                                    <XAxis type="number" dataKey="pc1" name="PC1" hide />
                                                    <YAxis type="number" dataKey="pc2" name="PC2" hide />
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
                                <div className="h-20 w-20 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mb-6 border-2 border-dashed border-slate-200">
                                    <Activity size={40} />
                                </div>
                                <h3 className="text-slate-600 font-bold text-lg mb-2">Listo para Inspección</h3>
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
