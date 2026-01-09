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

const StatCard = ({ label, value, subtext, colorClass }: { label: string, value: string | number, subtext?: string, colorClass: string }) => (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-soft flex flex-col items-center justify-center hover:translate-y-[-2px] transition-transform duration-200">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</span>
        <span className={`text-3xl font-bold font-mono ${colorClass}`}>{value}</span>
        {subtext && <span className="text-xs text-slate-500 mt-2 bg-slate-50 px-2 py-0.5 rounded-full">{subtext}</span>}
    </div>
);

const ResultsViewer: React.FC<ResultsViewerProps> = ({ results, propertyName, preprocessingSteps, activeSamples, onDeactivateOutliers, wavelengths }) => {
    const [activeTab, setActiveTab] = useState('correlation');
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);
    
    const residuals = results.model.residuals;
    const outliers = results.mahalanobis.distances.filter(d => d.isOutlier);
    const [selectedOutliers, setSelectedOutliers] = useState<Set<string|number>>(new Set());

    useEffect(() => {
        if (activeTab === 'correlation' && chartRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                const chartInstance = new Chart(ctx, {
                    type: 'scatter',
                    data: { datasets: [] },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        animation: false,
                        plugins: {
                            legend: { 
                                position: 'bottom',
                                labels: { usePointStyle: true, padding: 20, font: { family: 'Inter', size: 12 }, color: '#94a3b8' }
                            },
                            title: { display: false },
                            tooltip: {
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                titleColor: '#0f172a',
                                bodyColor: '#334155',
                                borderColor: '#e2e8f0',
                                borderWidth: 1,
                                padding: 10,
                                titleFont: { family: 'Inter', size: 13, weight: 'bold' },
                                callbacks: {
                                    label: (context: any) => {
                                        const label = context.dataset.label || '';
                                        const x = context.parsed.x;
                                        const y = context.parsed.y;
                                        return `${label}: Ref ${x.toFixed(2)} / Pred ${y.toFixed(2)}`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { 
                                title: { display: true, text: `Valor Referencia (${propertyName})`, font: { weight: '600' }, color: '#94a3b8' },
                                grid: { color: '#334155', drawBorder: false },
                                ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } }
                            },
                            y: { 
                                title: { display: true, text: 'Valor Predicho (NIR)', font: { weight: '600' }, color: '#94a3b8' },
                                grid: { color: '#334155', drawBorder: false },
                                ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } }
                            }
                        }
                    }
                });
                
                chartInstanceRef.current = chartInstance;

                if (results) {
                    const { actual, predicted } = results.model.correlation;
                    const inliersData: {x: number, y: number}[] = [];
                    const outliersData: {x: number, y: number}[] = [];
                    
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
                                label: 'Muestras Válidas', 
                                data: inliersData, 
                                backgroundColor: '#0ea5e9', // Brand 500
                                borderColor: '#0284c7', 
                                borderWidth: 1,
                                pointRadius: 5,
                                pointHoverRadius: 7
                            },
                            { 
                                label: 'Posibles Outliers', 
                                data: outliersData, 
                                backgroundColor: '#ef4444', 
                                borderColor: '#b91c1c', 
                                borderWidth: 1,
                                pointRadius: 6, 
                                pointStyle: 'triangle',
                                pointHoverRadius: 8
                            },
                            { 
                                type: 'line', 
                                label: 'Línea Ideal (1:1)', 
                                data: [{x: minVal - padding, y: minVal - padding}, {x: maxVal + padding, y: maxVal + padding}], 
                                borderColor: '#64748b', 
                                borderWidth: 2, 
                                borderDash: [6, 6], 
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

        return () => {
            if (chartInstanceRef.current) {
                chartInstanceRef.current.destroy();
                chartInstanceRef.current = null;
            }
        };
    }, [activeTab, results]);

    const handleExportConfig = () => {
        const config = {
            date: new Date().toISOString(),
            modelType: results.modelType,
            nComponents: results.nComponents,
            analyticalProperty: propertyName,
            activeSamples: activeSamples,
            preprocessing: preprocessingSteps,
            metrics: results.model,
            coefficients: results.model.coefficients
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
        const anchor = document.createElement('a');
        anchor.href = dataStr;
        anchor.download = `model_config_${new Date().toISOString().slice(0,10)}.json`;
        anchor.click();
    };
    
    const handleDownloadData = () => {
        const headers = ['ID', 'Reference', 'Predicted', 'Residual', ...wavelengths];
        const { residuals, processedSpectra } = results.model;
        const rows = residuals.map((res, index) => 
            [res.id, res.actual, res.predicted, res.residual, ...processedSpectra[index]]
        );
        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "pls_prediction_results.csv";
        link.click();
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
    
    const TabButton = ({ tabId, label, icon }: { tabId: string; label: string; icon?: React.ReactNode }) => (
        <button
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative ${activeTab === tabId ? 'text-brand-600 bg-brand-50 border-b-2 border-brand-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}
            onClick={() => setActiveTab(tabId)}
        >
            {icon}
            {label}
        </button>
    );

    return (
        <Card noPadding className="overflow-hidden">
            <div className="bg-white border-b border-slate-200">
                <div className="flex overflow-x-auto no-scrollbar">
                    <TabButton tabId="correlation" label="Diagnóstico Gráfico" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path></svg>} />
                    <TabButton tabId="stats" label="Métricas & Outliers" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>} />
                    <TabButton tabId="residuals" label="Tabla Residuos" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>} />
                    <TabButton tabId="full-data" label="Exportar" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>} />
                </div>
            </div>

            <div className="p-6 bg-slate-50 min-h-[400px]">
                {activeTab === 'correlation' && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">
                        {/* KPI Column */}
                        <div className="lg:col-span-3 space-y-4">
                            <div className="bg-slate-800 text-white p-6 rounded-xl shadow-xl border border-slate-700 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                                </div>
                                <h3 className="text-brand-500 text-xs font-bold uppercase tracking-widest mb-1">Modelo PLS</h3>
                                <div className="text-4xl font-bold font-mono tracking-tight">{results.nComponents} <span className="text-lg font-normal text-slate-400 font-sans">LVs</span></div>
                                <div className="mt-6 pt-4 border-t border-slate-700 flex flex-col gap-2">
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="text-slate-300">R² Score</span>
                                        <span className="font-mono text-brand-400 font-bold bg-slate-900 px-2 py-0.5 rounded">{results.model.r2.toFixed(4)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="text-slate-300">Correlación (r)</span>
                                        <span className="font-mono text-white">{results.model.r.toFixed(4)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                                <StatCard label="SEC (Calibración)" value={results.model.sec.toFixed(4)} colorClass="text-brand-600" />
                                <StatCard label="SECV (Validación)" value={results.model.secv.toFixed(4)} colorClass="text-emerald-600" subtext="Target Minimization" />
                            </div>
                        </div>
                        
                        {/* Chart Column - Dark Themed */}
                        <div className="lg:col-span-9 bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-inner-dark relative h-[500px]">
                            <canvas ref={chartRef}></canvas>
                        </div>
                    </div>
                )}

                {activeTab === 'stats' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                         <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                                <h4 className="font-bold text-slate-700">Parámetros de Regresión</h4>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                        <div className="text-xs font-bold text-slate-400 uppercase mb-2">Pendiente (Slope)</div>
                                        <div className="font-mono text-xl font-semibold text-slate-700">{results.model.slope.toFixed(5)}</div>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                        <div className="text-xs font-bold text-slate-400 uppercase mb-2">Offset (Bias)</div>
                                        <div className="font-mono text-xl font-semibold text-slate-700">{results.model.offset.toFixed(5)}</div>
                                    </div>
                                </div>
                                <div className="text-sm text-slate-600 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                    <p className="mb-2"><strong>Validación de Sesgo:</strong> Compruebe si la pendiente es cercana a 1.0 y el offset cercano a 0.0 para asegurar robustez.</p>
                                    <p><strong>Ratio Desempeño:</strong> {results.model.sec > 0 ? `RPD ≈ ${(results.model.secv / results.model.sec).toFixed(2)}` : 'N/A'}</p>
                                </div>
                            </div>
                         </div>
                         
                         <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden flex flex-col">
                            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                                <h4 className="font-bold text-slate-700">Detección de Outliers (Mahalanobis)</h4>
                                {outliers.length > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">{outliers.length} Detectados</span>}
                            </div>
                            
                            <div className="flex-1 p-0 overflow-hidden flex flex-col">
                                {outliers.length > 0 ? (
                                    <>
                                        <div className="flex-1 overflow-y-auto max-h-60 custom-scrollbar">
                                            <table className="w-full text-sm text-left">
                                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-6 py-3 w-16 text-center">Sel.</th>
                                                        <th className="px-6 py-3">ID Muestra</th>
                                                        <th className="px-6 py-3 text-right">Distancia</th>
                                                        <th className="px-6 py-3 text-right">Estado</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {outliers.map(o => (
                                                        <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-6 py-3 text-center">
                                                                <input 
                                                                    type="checkbox" 
                                                                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                                                    checked={selectedOutliers.has(o.id)} 
                                                                    onChange={e => handleOutlierSelection(o.id, e.target.checked)} 
                                                                />
                                                            </td>
                                                            <td className="px-6 py-3 font-medium text-slate-700">{o.id}</td>
                                                            <td className="px-6 py-3 text-right font-mono text-red-600 font-bold">{o.distance.toFixed(2)}</td>
                                                            <td className="px-6 py-3 text-right"><span className="text-[10px] uppercase font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-100">Crítico</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="p-4 border-t border-slate-200 bg-slate-50">
                                            <Button onClick={handleDeactivateClick} variant="danger" size="sm" className="w-full">
                                                Desactivar Outliers Seleccionados
                                            </Button>
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-8 text-center flex flex-col items-center justify-center h-full">
                                        <div className="h-16 w-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4">
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                        </div>
                                        <p className="text-slate-800 font-bold text-lg">Todo limpio</p>
                                        <p className="text-sm text-slate-500 mt-1">No se detectaron outliers espectrales significativos.</p>
                                    </div>
                                )}
                            </div>
                         </div>
                    </div>
                )}
                
                {activeTab === 'residuals' && (
                     <div className="animate-fade-in bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                        <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4 font-bold">ID Muestra</th>
                                        <th className="px-6 py-4 text-right font-bold">Valor Real</th>
                                        <th className="px-6 py-4 text-right font-bold">Valor Predicho</th>
                                        <th className="px-6 py-4 text-right font-bold">Error Absoluto</th>
                                        <th className="px-6 py-4 text-right font-bold">% Error Relativo</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {residuals.map((r, idx) => {
                                        const relError = (Math.abs(r.residual) / Math.abs(r.actual)) * 100;
                                        const isHighError = Math.abs(r.residual) > results.model.sec * 2;
                                        return (
                                            <tr key={r.id} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                                <td className="px-6 py-3 font-medium text-slate-700">{r.id}</td>
                                                <td className="px-6 py-3 text-right font-mono text-slate-600">{r.actual.toFixed(4)}</td>
                                                <td className="px-6 py-3 text-right font-mono text-slate-600">{r.predicted.toFixed(4)}</td>
                                                <td className={`px-6 py-3 text-right font-mono font-medium ${isHighError ? 'text-red-600' : 'text-slate-600'}`}>
                                                    {r.residual > 0 ? '+' : ''}{r.residual.toFixed(4)}
                                                </td>
                                                <td className="px-6 py-3 text-right font-mono text-slate-500">
                                                    {relError.toFixed(2)}%
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                     </div>
                )}

                {activeTab === 'full-data' && (
                    <div className="flex flex-col items-center justify-center py-16 gap-6 animate-fade-in bg-white rounded-xl border border-dashed border-slate-300">
                         <div className="text-center max-w-md">
                            <div className="bg-slate-50 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-6 text-slate-400 shadow-inner">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">Exportación de Resultados</h3>
                            <p className="text-slate-500 mb-8 leading-relaxed">Descargue los resultados completos en CSV para reportes externos o el archivo de configuración JSON para reproducir este modelo más tarde.</p>
                         </div>
                         <div className="flex gap-4">
                            <Button onClick={handleDownloadData} size="lg" className="shadow-lg shadow-brand-500/20">
                                Descargar CSV
                            </Button>
                            <Button variant="secondary" onClick={handleExportConfig} size="lg">
                                Exportar Modelo (JSON)
                            </Button>
                         </div>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default ResultsViewer;