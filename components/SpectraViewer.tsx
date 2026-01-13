
import React, { useRef, useEffect, useState } from 'react';
import Card from './Card';
import Button from './Button';
import { Sample } from '../types';

declare var Chart: any;

interface SpectraViewerProps {
    wavelengths: number[];
    samples: (Sample | {id: string | number, values: number[], color: string})[];
    isProcessed: boolean;
    onReset: () => void;
}

const ChartIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600">
        <path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path>
    </svg>
);

const SpectraViewer: React.FC<SpectraViewerProps> = ({ wavelengths, samples, isProcessed, onReset }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);
    const [startWl, setStartWl] = useState('');
    const [endWl, setEndWl] = useState('');
    
    const hasData = samples.length > 0;

    useEffect(() => {
        if (hasData) {
            setStartWl(wavelengths[0].toString());
            setEndWl(wavelengths[wavelengths.length - 1].toString());
        } else {
            setStartWl('');
            setEndWl('');
        }
    }, [wavelengths, hasData]);

    // Handle Chart Creation and Destruction
    useEffect(() => {
        if (typeof Chart === 'undefined') return;

        let chartInstance: any = null;

        if (chartRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: { labels: [], datasets: [] },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: { 
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                titleColor: '#0f172a',
                                bodyColor: '#334155',
                                borderColor: '#e2e8f0',
                                borderWidth: 1,
                                padding: 10,
                                titleFont: { family: 'Inter', size: 13, weight: 'bold' },
                                callbacks: { title: (context: any) => context[0].dataset.label } 
                            },
                            zoom: {
                                pan: { enabled: true, mode: 'x' },
                                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                            }
                        },
                        scales: {
                            x: {
                                type: 'linear',
                                title: { display: true, text: 'Longitud de onda (nm)', color: '#94a3b8', font: {size: 11} },
                                ticks: { color: '#94a3b8', font: {family: 'JetBrains Mono', size: 10} },
                                grid: { color: '#334155' } 
                            },
                            y: {
                                title: { display: true, text: isProcessed ? 'Intensidad' : 'Absorbancia', color: '#94a3b8', font: {size: 11} },
                                ticks: { color: '#94a3b8', font: {family: 'JetBrains Mono', size: 10} },
                                grid: { color: '#334155' }
                            }
                        },
                        interaction: {
                            mode: 'nearest',
                            axis: 'x',
                            intersect: false
                        }
                    }
                });
                chartInstanceRef.current = chartInstance;
            }
        }

        return () => {
            if (chartInstance) {
                chartInstance.destroy();
                chartInstanceRef.current = null;
            }
        };
    }, [isProcessed]);

    // Handle Data Updates
    useEffect(() => {
        const chart = chartInstanceRef.current;
        if (chart && hasData) {
            chart.data.labels = wavelengths;
            chart.data.datasets = samples.map(sample => ({
                label: sample.id,
                data: sample.values,
                borderColor: sample.color,
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1
            }));
            
            if (isProcessed) {
                const allValues = samples.flatMap(s => s.values).filter(v => typeof v === 'number' && isFinite(v));
                if (allValues.length > 0) {
                    const min = Math.min(...allValues);
                    const max = Math.max(...allValues);
                    const padding = (max - min) * 0.1 || 0.1;
                    chart.options.scales.y.min = min - padding;
                    chart.options.scales.y.max = max + padding;
                }
            } else {
                 chart.options.scales.y.min = undefined;
                 chart.options.scales.y.max = undefined;
            }

            chart.update('none'); // Update without animation for stability
        }
    }, [wavelengths, samples, isProcessed, hasData]);
    
    const handleResetZoom = () => {
        if (chartInstanceRef.current) {
            chartInstanceRef.current.resetZoom();
        }
        if (isProcessed) {
            onReset();
        }
    };

    const handleApplyRange = () => {
        const chart = chartInstanceRef.current;
        if (!chart || !hasData) return;
        
        const start = parseFloat(startWl), end = parseFloat(endWl);
        const minWl = wavelengths[0], maxWl = wavelengths[wavelengths.length - 1];

        if (isNaN(start) || isNaN(end) || start >= end || start < minWl || end > maxWl) {
            alert(`Rango espectral inválido.`);
            setStartWl(minWl.toFixed(2));
            setEndWl(maxWl.toFixed(2));
            chart.options.scales.x.min = undefined;
            chart.options.scales.x.max = undefined;
        } else {
            chart.options.scales.x.min = start;
            chart.options.scales.x.max = end;
        }
        chart.update();
    };

    return (
        <Card>
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800">
                        <ChartIcon />
                        Visualizador de Espectros
                    </h2>
                    <p className="text-sm text-slate-500 mt-1 ml-7">Explore los datos espectrales crudos y pre-procesados.</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={handleResetZoom} className="text-xs" size="sm" disabled={!hasData}>
                        {isProcessed ? 'Resetear Pre-proc.' : 'Resetear Zoom'}
                    </Button>
                </div>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200 transition-opacity ${!hasData ? 'opacity-50' : ''}`}>
                <div className="md:col-span-5">
                    <label htmlFor="startWavelength" className="block text-xs font-semibold text-slate-500 mb-1">Longitud de onda inicial (nm)</label>
                    <input type="number" id="startWavelength" value={startWl} onChange={e => setStartWl(e.target.value)} disabled={!hasData} className="w-full bg-white border border-slate-300 text-slate-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow shadow-sm disabled:bg-slate-100" />
                </div>
                <div className="md:col-span-5">
                    <label htmlFor="endWavelength" className="block text-xs font-semibold text-slate-500 mb-1">Longitud de onda final (nm)</label>
                    <input type="number" id="endWavelength" value={endWl} onChange={e => setEndWl(e.target.value)} disabled={!hasData} className="w-full bg-white border border-slate-300 text-slate-800 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-shadow shadow-sm disabled:bg-slate-100" />
                </div>
                <div className="md:col-span-2">
                    <Button onClick={handleApplyRange} className="w-full text-sm py-1.5" disabled={!hasData}>Aplicar</Button>
                </div>
            </div>
            
            <div className="relative h-80 rounded-lg overflow-hidden border border-slate-800 bg-slate-900 shadow-inner-dark group">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-900 to-[#111827]"></div>
                
                {hasData ? (
                    <>
                        <div className="relative h-full w-full p-2">
                            <canvas ref={chartRef}></canvas>
                        </div>
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slate-500 bg-black/50 px-2 py-1 rounded">
                            Scroll para Zoom • Arrastrar para Mover
                        </div>
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-700 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
                           <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18" />
                           <path strokeLinecap="round" strokeLinejoin="round" d="M18.37 7.23L13 12.59l-3.13-3.13-4.24 4.24" />
                        </svg>
                        <h3 className="font-bold text-lg text-slate-400">Visualizador Vacío</h3>
                        <p className="text-sm text-slate-500 mt-1 max-w-xs">Cargue un archivo de datos en el <span className="font-semibold text-slate-400">Paso 1</span> para ver los espectros aquí.</p>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default SpectraViewer;
