
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
    analyticalProperty?: string;
}

// --- TABLA DE REFERENCIA DE BANDAS NIR ---
const NIR_BANDS = [
    { id: 'humedad', name: 'Humedad (O-H)', description: 'Crucial para calidad y estabilidad post-cosecha.', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', ranges: [[1430, 1470], [1920, 1960]] },
    { id: 'proteina', name: 'Proteína (N-H)', description: 'Indicador de valor nutricional y calidad de granos.', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)', ranges: [[1500, 1525], [2040, 2080], [2160, 2200]] },
    { id: 'grasas', name: 'Grasas (C-H)', description: 'Componente clave para el perfil energético y de lípidos.', color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)', ranges: [[1710, 1780], [2290, 2320], [2340, 2360]] },
    { id: 'almidon', name: 'Almidón', description: 'Carbohidrato principal, fuente de energía.', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', ranges: [[2090, 2120], [2270, 2290]] },
    { id: 'celulosa', name: 'Celulosa/Fibra', description: 'Componente estructural y de fibra dietética.', color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', ranges: [[2260, 2275], [2330, 2345]] },
];

const findBandAssignment = (wavelength: number) => {
    return NIR_BANDS.filter(band => 
        band.ranges.some(range => wavelength >= range[0] && wavelength <= range[1])
    );
};

const ChartIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ui-accent">
        <path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path>
    </svg>
);

const SpectraViewer: React.FC<SpectraViewerProps> = ({ wavelengths, samples, isProcessed, onReset, analyticalProperty }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);
    const [startWl, setStartWl] = useState('');
    const [endWl, setEndWl] = useState('');
    const [activeBands, setActiveBands] = useState<Set<string>>(new Set());
    const [samplingLimit, setSamplingLimit] = useState<number>(50);
    const [invertY, setInvertY] = useState(false);
    
    const hasData = samples.length > 0;

    // Detectar automáticamente si el tipo de dato es reflectancia o transmitancia para invertir el eje Y
    useEffect(() => {
        if (analyticalProperty === 'Reflectancia' || analyticalProperty === 'Transmitancia') {
            setInvertY(true);
        } else {
            setInvertY(false);
        }
    }, [analyticalProperty]);

    const displayedSamples = useMemo(() => {
        if (samplingLimit === 0 || samples.length <= samplingLimit) {
            return samples;
        }
        // Systematic sampling: select 'samplingLimit' elements evenly distributed
        const step = samples.length / samplingLimit;
        const filtered: typeof samples = [];
        for (let i = 0; i < samplingLimit; i++) {
            const idx = Math.min(Math.floor(i * step), samples.length - 1);
            filtered.push(samples[idx]);
        }
        return filtered;
    }, [samples, samplingLimit]);

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
                                displayColors: false,
                                filter: (e: any, index: number) => index === 0,
                                callbacks: { 
                                    title: (context: any) => {
                                        const wl = context[0].parsed.x;
                                        return `${wl.toFixed(1)} nm`;
                                    },
                                    label: () => {
                                        return '';
                                    },
                                    afterBody: (context: any) => {
                                        const wl = context[0].parsed.x;
                                        const assignments = findBandAssignment(wl);
                                        if (assignments.length > 0) {
                                            return [
                                                '',
                                                '── ASIGNACIÓN QUÍMICA ──',
                                                ...assignments.map(a => `● ${a.name}: ${a.description}`)
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
                                title: { 
                                    display: true, 
                                    text: isProcessed 
                                        ? 'Intensidad / Derivada' 
                                        : (invertY 
                                            ? `${analyticalProperty || 'Absorbancia'} (Eje Invertido)` 
                                            : (analyticalProperty || 'Absorbancia')), 
                                    color: '#94a3b8', 
                                    font: {size: 11} 
                                },
                                ticks: { color: '#94a3b8', font: {family: 'JetBrains Mono', size: 10} },
                                grid: { color: '#334155' },
                                reverse: invertY
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
    }, [isProcessed, bandHighlighterPlugin, invertY, analyticalProperty]);

    // Handle Data Updates
    useEffect(() => {
        const chart = chartInstanceRef.current;
        if (chart && hasData) {
            chart.data.labels = wavelengths;
            chart.data.datasets = displayedSamples.map(sample => ({
                label: sample.id,
                data: sample.values,
                borderColor: sample.color,
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1
            }));
            
            if (isProcessed) {
                const allValues = displayedSamples.flatMap(s => s.values).filter(v => typeof v === 'number' && isFinite(v));
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
    }, [wavelengths, displayedSamples, isProcessed, hasData]);
    
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
                        <div className="h-9 w-9 bg-ui-darkest text-ui-accent rounded-lg flex items-center justify-center">
                            <ChartIcon />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-100">Diagnóstico Químico NIR</h2>
                            <p className="text-sm text-slate-400">Seleccione los parámetros para resaltar sus regiones de absorción.</p>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    {hasData && (
                        <button
                            onClick={() => setInvertY(!invertY)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                invertY 
                                    ? 'bg-brand-500/10 border-brand-500 text-brand-400 hover:bg-brand-500/20' 
                                    : 'bg-ui-dark border-ui-border text-slate-400 hover:border-slate-500'
                            }`}
                            title="Invierte verticalmente el eje Y (útil para que reflectancia/transmitancia muestren picos de absorción)"
                        >
                            {invertY ? '✓ Eje Y Invertido' : '⇅ Invertir Eje Y'}
                        </button>
                    )}
                    <Button variant="secondary" onClick={handleResetZoom} className="text-xs" size="sm" disabled={!hasData}>
                        {isProcessed ? 'Resetear Pre-proc.' : 'Resetear Zoom'}
                    </Button>
                </div>
            </div>

            {/* --- PANEL DE DIAGNÓSTICO (CHIPS) --- */}
            <div className={`flex flex-wrap gap-2 mb-4 p-3 bg-ui-darkest rounded-xl border border-ui-border transition-opacity ${!hasData ? 'opacity-50 pointer-events-none' : ''}`}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest w-full mb-1">Filtros de Diagnóstico:</span>
                {NIR_BANDS.map(band => (
                    <button
                        key={band.id}
                        onClick={() => toggleBand(band.id)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                            activeBands.has(band.id) 
                                ? 'bg-ui-card shadow-sm ring-2 ring-offset-1' 
                                : 'bg-ui-dark text-slate-400 border-ui-border hover:border-slate-500'
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

            <div className={`grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-4 bg-ui-dark p-3 rounded-lg border border-ui-border transition-opacity ${!hasData ? 'opacity-50' : ''}`}>
                <div className="md:col-span-5">
                    <label htmlFor="startWavelength" className="block text-xs font-semibold text-slate-400 mb-1">Longitud de onda inicial (nm)</label>
                    <input type="number" id="startWavelength" value={startWl} onChange={e => setStartWl(e.target.value)} disabled={!hasData} className="w-full bg-ui-card border border-ui-border text-slate-100 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow shadow-sm disabled:bg-ui-darkest" />
                </div>
                <div className="md:col-span-5">
                    <label htmlFor="endWavelength" className="block text-xs font-semibold text-slate-400 mb-1">Longitud de onda final (nm)</label>
                    <input type="number" id="endWavelength" value={endWl} onChange={e => setEndWl(e.target.value)} disabled={!hasData} className="w-full bg-ui-card border border-ui-border text-slate-100 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow shadow-sm disabled:bg-ui-darkest" />
                </div>
                <div className="md:col-span-2">
                    <Button onClick={handleApplyRange} className="w-full text-sm py-1.5" disabled={!hasData}>Aplicar</Button>
                </div>
            </div>

            {/* --- CONTROLLER DE MUESTREO EN CASO DE MUCHOS DATOS --- */}
            {hasData && samples.length > 50 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 mb-4 text-xs bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-xl">
                    <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-ui-accent shrink-0"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        <span>
                            <strong>Muestreo Inteligente:</strong> Se visualizan <strong className="text-slate-200">{displayedSamples.length}</strong> de <strong className="text-slate-200">{samples.length}</strong> espectros para optimizar el rendimiento. <span className="opacity-80">El 100% de los datos participa en el fondo matemático para entrenamientos y calibraciones.</span>
                        </span>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        <label className="text-slate-400 text-[11px] uppercase tracking-wider font-semibold">Mostrar:</label>
                        <select 
                            value={samplingLimit} 
                            onChange={e => setSamplingLimit(Number(e.target.value))}
                            className="bg-ui-dark border border-ui-border rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none cursor-pointer focus:border-ui-accent min-w-[120px] font-semibold"
                        >
                            <option value={50}>50 espectros</option>
                            <option value={100}>100 espectros (Fina)</option>
                            <option value={200}>200 espectros (Denso)</option>
                            <option value={0}>Todos (Saturar)</option>
                        </select>
                    </div>
                </div>
            )}
            
            <div className="relative h-[450px] rounded-xl overflow-hidden border border-ui-border bg-ui-dark shadow-inner-dark group">
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-900 to-[#0f172a]"></div>
                
                {hasData ? (
                    <>
                        <div className="relative h-full w-full p-4">
                            <canvas ref={chartRef}></canvas>
                        </div>

                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-slate-400 bg-black/60 px-3 py-1.5 rounded-lg border border-ui-border backdrop-blur-sm">
                            Scroll: Zoom • Arrastrar: Pan • Click: Info
                        </div>
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                        <div className="h-20 w-20 bg-ui-darkest rounded-full flex items-center justify-center mb-6 border border-ui-border shadow-xl">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
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
