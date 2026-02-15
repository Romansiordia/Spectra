
import React, { useRef, useEffect, useState, useMemo } from 'react';
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

// --- TABLA DE REFERENCIA DE BANDAS NIR ---
const NIR_BANDS = [
    { id: 'humedad', name: 'Humedad (O-H)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', ranges: [[1430, 1470], [1920, 1960]] },
    { id: 'proteina', name: 'Proteína (N-H)', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)', ranges: [[1500, 1525], [2040, 2080], [2160, 2200]] },
    { id: 'grasas', name: 'Grasas (C-H)', color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)', ranges: [[1710, 1780], [2290, 2320], [2340, 2360]] },
    { id: 'almidon', name: 'Almidón', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', ranges: [[2090, 2120], [2270, 2290]] },
    { id: 'celulosa', name: 'Celulosa/Fibra', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', ranges: [[2260, 2275], [2330, 2345]] },
];

const findBandAssignment = (wavelength: number) => {
    return NIR_BANDS.filter(band => 
        band.ranges.some(range => wavelength >= range[0] && wavelength <= range[1])
    );
};

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
    const [activeBands, setActiveBands] = useState<Set<string>>(new Set());
    
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

    const toggleBand = (id: string) => {
        setActiveBands(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Custom Plugin for Drawing Background Bands
    const bandHighlighterPlugin = useMemo(() => ({
        id: 'bandHighlighter',
        beforeDraw: (chart: any) => {
            if (activeBands.size === 0) return;
            const { ctx, chartArea: { top, bottom, height }, scales: { x } } = chart;
            
            ctx.save();
            NIR_BANDS.forEach(band => {
                if (activeBands.has(band.id)) {
                    ctx.fillStyle = band.bg;
                    band.ranges.forEach(([min, max]) => {
                        const left = x.getPixelForValue(min);
                        const right = x.getPixelForValue(max);
                        if (left < chart.chartArea.right && right > chart.chartArea.left) {
                            const drawLeft = Math.max(left, chart.chartArea.left);
                            const drawRight = Math.min(right, chart.chartArea.right);
                            ctx.fillRect(drawLeft, top, drawRight - drawLeft, height);
                            
                            // Draw top indicator
                            ctx.strokeStyle = band.color;
                            ctx.lineWidth = 2;
                            ctx.beginPath();
                            ctx.moveTo(drawLeft, top);
                            ctx.lineTo(drawRight, top);
                            ctx.stroke();
                        }
                    });
                }
            });
            ctx.restore();
        }
    }), [activeBands]);

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
                    plugins: [bandHighlighterPlugin],
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: { 
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                titleColor: '#f8fafc',
                                bodyColor: '#f8fafc',
                                borderColor: '#334155',
                                borderWidth: 1,
                                padding: 12,
                                titleFont: { family: 'Inter', size: 14, weight: 'bold' },
                                bodyFont: { family: 'Inter', size: 12 },
                                cornerRadius: 8,
                                displayColors: true,
                                callbacks: { 
                                    title: (context: any) => {
                                        const wl = context[0].parsed.x;
                                        return `${wl.toFixed(1)} nm`;
                                    },
                                    label: (context: any) => {
                                        const sampleId = context.dataset.label;
                                        const val = context.parsed.y;
                                        return `${sampleId}: ${val.toFixed(5)}`;
                                    },
                                    afterBody: (context: any) => {
                                        const wl = context[0].parsed.x;
                                        const assignments = findBandAssignment(wl);
                                        if (assignments.length > 0) {
                                            return [
                                                '',
                                                '── ASIGNACIÓN QUÍMICA ──',
                                                ...assignments.map(a => `● ${a.name}`)
                                            ];
                                        }
                                        return null;
                                    }
                                } 
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
                                title: { display: true, text: isProcessed ? 'Intensidad / Derivada' : 'Absorbancia', color: '#94a3b8', font: {size: 11} },
                                ticks: { color: '#94a3b8', font: {family: 'JetBrains Mono', size: 10} },
                                grid: { color: '#334155' }
                            }
                        },
                        interaction: {
                            mode: 'index',
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
    }, [isProcessed, bandHighlighterPlugin]);

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

            chart.update('none'); 
        }
    }, [wavelengths, samples, isProcessed, hasData]);
    
    // Update chart when active bands change
    useEffect(() => {
        if (chartInstanceRef.current) {
            chartInstanceRef.current.update('none');
        }
    }, [activeBands]);

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
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-brand-50 rounded-lg flex items-center justify-center">
                            <ChartIcon />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Diagnóstico Químico NIR</h2>
                            <p className="text-sm text-slate-500">Seleccione los parámetros para resaltar sus regiones de absorción.</p>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={handleResetZoom} className="text-xs" size="sm" disabled={!hasData}>
                        {isProcessed ? 'Resetear Pre-proc.' : 'Resetear Zoom'}
                    </Button>
                </div>
            </div>

            {/* --- PANEL DE DIAGNÓSTICO (CHIPS) --- */}
            <div className={`flex flex-wrap gap-2 mb-4 p-3 bg-slate-100/50 rounded-xl border border-slate-200 transition-opacity ${!hasData ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full mb-1">Filtros de Diagnóstico:</span>
                {NIR_BANDS.map(band => (
                    <button
                        key={band.id}
                        onClick={() => toggleBand(band.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                            activeBands.has(band.id) 
                                ? 'bg-white shadow-sm ring-2 ring-offset-1' 
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                        }`}
                        style={{ 
                            borderColor: activeBands.has(band.id) ? band.color : undefined,
                            color: activeBands.has(band.id) ? band.color : undefined,
                            '--tw-ring-color': band.color
                        } as any}
                    >
                        <div className={`w-2 h-2 rounded-full ${activeBands.has(band.id) ? 'animate-pulse' : ''}`} style={{ backgroundColor: band.color }}></div>
                        {band.name}
                    </button>
                ))}
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
            
            <div className="relative h-[450px] rounded-xl overflow-hidden border border-slate-800 bg-slate-900 shadow-inner-dark group">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-900 to-[#0f172a]"></div>
                
                {hasData ? (
                    <>
                        <div className="relative h-full w-full p-4">
                            <canvas ref={chartRef}></canvas>
                        </div>

                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slate-400 bg-black/60 px-3 py-1.5 rounded-lg border border-slate-700 backdrop-blur-sm">
                            Scroll: Zoom • Arrastrar: Pan • Click: Info
                        </div>
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <div className="h-20 w-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 border border-slate-700 shadow-xl">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                               <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5v6h2" />
                               <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6" />
                               <path strokeLinecap="round" strokeLinejoin="round" d="M1 18l3.5-3.5a2 2 0 012.828 0L9 16m7 2l-3-3m0 0l-3-3m3 3l3-3m-3 3l-3 3" />
                            </svg>
                        </div>
                        <h3 className="font-bold text-xl text-slate-400">Sin Datos para Visualizar</h3>
                        <p className="text-sm text-slate-500 mt-2 max-w-xs leading-relaxed">
                            Cargue un archivo CSV en el <span className="font-semibold text-slate-300">Entrenamiento</span> para analizar la composición química de sus muestras.
                        </p>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default SpectraViewer;
