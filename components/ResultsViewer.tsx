import React, { useState, useRef, useEffect } from 'react';
import Card from './Card';
import Button from './Button';
import { ModelResults, PreprocessingStep } from '../types';

declare var Chart: any;

interface ResultsViewerProps {
    results: ModelResults;
    propertyName: string;
    preprocessingSteps: PreprocessingStep[];
    activeSamples: (string|number)[];
    onDeactivateOutliers: (outlierIds: (string|number)[]) => void;
    wavelengths: number[];
}

const ResultsViewer: React.FC<ResultsViewerProps> = ({ results, propertyName, preprocessingSteps, activeSamples, onDeactivateOutliers, wavelengths }) => {
    const [activeTab, setActiveTab] = useState('correlation');
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);
    
    // Outliers management
    const residuals = results.model.residuals;
    const outliers = results.mahalanobis.distances.filter(d => d.isOutlier);
    const [selectedOutliers, setSelectedOutliers] = useState<Set<string|number>>(new Set());

    // Effect to handle Chart Lifecycle (Create, Update, Destroy)
    useEffect(() => {
        // Only initialize if we are on the correlation tab and the canvas ref exists
        if (activeTab === 'correlation' && chartRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                // 1. Create Chart Instance
                const chartInstance = new Chart(ctx, {
                    type: 'scatter',
                    data: { datasets: [] },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        animation: false,
                        plugins: {
                            legend: { display: true },
                            title: { display: true, text: 'Predicho vs Real' },
                             tooltip: {
                                callbacks: {
                                    label: (context: any) => {
                                        const label = context.dataset.label || '';
                                        const x = context.parsed.x;
                                        const y = context.parsed.y;
                                        return `${label}: (${x.toFixed(2)}, ${y.toFixed(2)})`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { 
                                title: { display: true, text: 'Valor Real (Laboratorio)' },
                                type: 'linear'
                            },
                            y: { 
                                title: { display: true, text: 'Valor Predicho (NIR)' },
                                type: 'linear'
                            }
                        }
                    }
                });
                
                chartInstanceRef.current = chartInstance;

                // 2. Populate Data
                if (results) {
                    const { actual, predicted } = results.model.correlation;
                    const inliersData: {x: number, y: number}[] = [];
                    const outliersData: {x: number, y: number}[] = [];
                    
                    // Map data to points
                    results.mahalanobis.distances.forEach((d, i) => {
                        const point = { x: actual[i], y: predicted[i] };
                        if (d.isOutlier) outliersData.push(point);
                        else inliersData.push(point);
                    });

                    const allValues = [...actual, ...predicted];
                    if (allValues.length > 0) {
                        const minVal = Math.min(...allValues);
                        const maxVal = Math.max(...allValues);
                        const padding = (maxVal - minVal) * 0.1;

                        chartInstance.data.datasets = [
                            { 
                                label: 'Muestras', 
                                data: inliersData, 
                                backgroundColor: '#3B82F680', 
                                borderColor: '#3B82F6', 
                                pointRadius: 5 
                            },
                            { 
                                label: 'Posibles Outliers', 
                                data: outliersData, 
                                backgroundColor: '#EF444480', 
                                borderColor: '#EF4444', 
                                pointRadius: 7, 
                                pointStyle: 'triangle' 
                            },
                            { 
                                type: 'line', 
                                label: 'Ideal (1:1)', 
                                data: [{x: minVal - padding, y: minVal - padding}, {x: maxVal + padding, y: maxVal + padding}], 
                                borderColor: '#9CA3AF', 
                                borderWidth: 2, 
                                borderDash: [5, 5], 
                                pointRadius: 0, 
                                fill: false 
                            }
                        ];
                        
                        chartInstance.options.scales.x.min = minVal - padding;
                        chartInstance.options.scales.x.max = maxVal + padding;
                        chartInstance.options.scales.y.min = minVal - padding;
                        chartInstance.options.scales.y.max = maxVal + padding;
                        
                        chartInstance.update();
                    }
                }
            }
        }

        // Cleanup function to destroy chart when tab changes or component unmounts
        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
        };
    }, [activeTab, results]); // Re-run when switching tabs or results update

    const handleExportConfig = () => {
        const config = {
            date: new Date().toISOString(),
            modelType: results.modelType,
            nComponents: results.nComponents,
            analyticalProperty: propertyName,
            activeSamples: activeSamples,
            preprocessing: preprocessingSteps,
            metrics: { 
                r: results.model.r, 
                r2: results.model.r2,
                sec: results.model.sec, 
                secv: results.model.secv,
                offset: results.model.offset,
                slope: results.model.slope
            },
            coefficients: results.model.coefficients
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `pls_model_config.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };
    
    const handleDownloadData = () => {
        const headers = ['ID_Muestra', 'Valor_Real', 'Valor_Predicho', 'Residuo', ...wavelengths];
        const { residuals, processedSpectra } = results.model;
        const rows = residuals.map((res, index) => 
            [res.id, res.actual.toFixed(6), res.predicted.toFixed(6), res.residual.toFixed(6), ...processedSpectra[index].map(v => v.toFixed(6))]
        );
        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "pls_results_data.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleOutlierSelection = (id: string|number, checked: boolean) => {
        setSelectedOutliers(prev => {
            const newSet = new Set(prev);
            if (checked) newSet.add(id);
            else newSet.delete(id);
            return newSet;
        });
    };
    
    const handleDeactivateClick = () => {
        if (selectedOutliers.size === 0) return alert("Seleccione al menos un outlier.");
        onDeactivateOutliers(Array.from(selectedOutliers));
        setSelectedOutliers(new Set());
    };
    
    const TabButton = ({ tabId, label }: { tabId: string; label: React.ReactNode }) => (
        <button
            className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeTab === tabId ? 'text-brand-primary border-brand-primary' : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'}`}
            onClick={() => setActiveTab(tabId)}
        >
            {label}
        </button>
    );

    return (
        <Card>
            <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
                <TabButton tabId="correlation" label="Gráfico de Correlación" />
                <TabButton tabId="stats" label="Estadísticas Detalladas" />
                <TabButton tabId="residuals" label="Tabla de Residuos" />
                <TabButton tabId="full-data" label="Exportar Datos" />
            </div>

            {activeTab === 'correlation' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                    <div className="md:col-span-2 relative h-80">
                         <canvas ref={chartRef}></canvas>
                    </div>
                    <div className="flex flex-col justify-center space-y-3 bg-gray-50 p-4 rounded-lg">
                        <h3 className="font-bold text-gray-800 border-b pb-2">Resumen PLS ({results.nComponents} LVs)</h3>
                        
                        <div className="grid grid-cols-2 gap-y-2 text-sm">
                            <span className="text-gray-600">Propiedad:</span>
                            <span className="font-medium text-right truncate">{propertyName}</span>

                            <span className="text-gray-600">R (Correlación):</span>
                            <span className="font-mono font-bold text-brand-primary text-right">{results.model.r.toFixed(4)}</span>

                            <span className="text-gray-600">R²:</span>
                            <span className="font-mono text-gray-800 text-right">{results.model.r2.toFixed(4)}</span>

                            <span className="text-gray-600" title="Standard Error of Calibration">SEC:</span>
                            <span className="font-mono text-brand-secondary text-right">{results.model.sec.toFixed(4)}</span>

                            <span className="text-gray-600" title="Standard Error of Cross-Validation">SECV:</span>
                            <span className="font-mono text-brand-accent text-right">{results.model.secv.toFixed(4)}</span>
                        </div>

                        <div className="pt-2 text-xs text-gray-500">
                           <p>SEC: Error en Calibración</p>
                           <p>SECV: Error en Validación Cruzada</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'stats' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                     <div className="bg-white p-4 border rounded shadow-sm">
                        <h4 className="font-semibold mb-3">Parámetros de Regresión</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between border-b pb-1">
                                <span>Pendiente (Slope):</span>
                                <span className="font-mono">{results.model.slope.toFixed(5)}</span>
                            </div>
                            <div className="flex justify-between border-b pb-1">
                                <span>Intercepto (Offset):</span>
                                <span className="font-mono">{results.model.offset.toFixed(5)}</span>
                            </div>
                            <div className="flex justify-between border-b pb-1">
                                <span>Variables Latentes:</span>
                                <span className="font-mono">{results.nComponents}</span>
                            </div>
                            <div className="flex justify-between border-b pb-1">
                                <span>Muestras Activas:</span>
                                <span className="font-mono">{activeSamples.length}</span>
                            </div>
                        </div>
                     </div>
                     
                     <div className="bg-white p-4 border rounded shadow-sm">
                        <h4 className="font-semibold mb-3">Diagnóstico de Outliers</h4>
                        {outliers.length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-sm text-red-600">Se detectaron {outliers.length} posibles outliers.</p>
                                <div className="max-h-32 overflow-y-auto border text-xs">
                                    <table className="w-full text-left">
                                        <thead className="bg-gray-100"><tr><th className="p-1">ID</th><th className="p-1">Distancia</th><th className="p-1">Acción</th></tr></thead>
                                        <tbody>
                                            {outliers.map(o => (
                                                <tr key={o.id}>
                                                    <td className="p-1 font-semibold">{o.id}</td>
                                                    <td className="p-1">{o.distance.toFixed(2)}</td>
                                                    <td className="p-1"><input type="checkbox" checked={selectedOutliers.has(o.id)} onChange={e => handleOutlierSelection(o.id, e.target.checked)} /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <Button onClick={handleDeactivateClick} className="w-full text-xs py-1 mt-2">Desactivar Seleccionados</Button>
                            </div>
                        ) : (
                            <p className="text-sm text-green-600">No se detectaron outliers significativos (Distancia &lt; 3.0).</p>
                        )}
                     </div>
                </div>
            )}
            
            {activeTab === 'residuals' && (
                 <div className="animate-fade-in">
                    <h3 className="font-semibold text-lg mb-2">Tabla de Residuos (Error)</h3>
                    <div className="max-h-96 overflow-y-auto pr-2 border rounded-md">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2">ID</th>
                                    <th className="px-4 py-2 text-right">Real</th>
                                    <th className="px-4 py-2 text-right">Predicho</th>
                                    <th className="px-4 py-2 text-right">Error (Residuo)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {residuals.map(r => (
                                    <tr key={r.id} className="border-b hover:bg-gray-50">
                                        <td className="px-4 py-2 font-medium">{r.id}</td>
                                        <td className="px-4 py-2 text-right font-mono">{r.actual.toFixed(4)}</td>
                                        <td className="px-4 py-2 text-right font-mono">{r.predicted.toFixed(4)}</td>
                                        <td className={`px-4 py-2 text-right font-mono ${Math.abs(r.residual) > results.model.sec * 2 ? 'text-red-600 font-bold' : ''}`}>
                                            {r.residual.toFixed(4)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 </div>
            )}

            {activeTab === 'full-data' && (
                <div className="flex flex-col gap-4 animate-fade-in">
                     <p className="text-sm text-gray-600">Descargue los datos completos incluyendo espectros procesados y coeficientes del modelo.</p>
                     <div className="flex gap-4">
                        <Button onClick={handleDownloadData}>Descargar CSV de Datos</Button>
                        <Button variant="secondary" onClick={handleExportConfig}>Exportar Modelo JSON</Button>
                     </div>
                </div>
            )}
        </Card>
    );
};

export default ResultsViewer;