
import React, { useRef, useEffect, useState } from 'react';
import Card from './Card';
import Button from './Button';
import { Sample } from '../types';

// Declare Chart and its zoom plugin from CDN for TypeScript
declare var Chart: any;
declare var ChartDataLabels: any;
declare var ChartZoom: any;


interface SpectraViewerProps {
    wavelengths: number[];
    samples: (Sample | {id: string | number, values: number[], color: string})[];
    isProcessed: boolean;
    onReset: () => void;
}

const ChartIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-primary">
        <path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path>
    </svg>
);


const SpectraViewer: React.FC<SpectraViewerProps> = ({ wavelengths, samples, isProcessed, onReset }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);

    const [startWl, setStartWl] = useState('');
    const [endWl, setEndWl] = useState('');

    useEffect(() => {
        if (wavelengths.length > 0) {
            setStartWl(wavelengths[0].toString());
            setEndWl(wavelengths[wavelengths.length - 1].toString());
        } else {
            setStartWl('');
            setEndWl('');
        }
    }, [wavelengths]);

    useEffect(() => {
        if (chartRef.current) {
            Chart.register(ChartZoom);
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                chartInstanceRef.current = new Chart(ctx, {
                    type: 'line',
                    data: { labels: [], datasets: [] },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { title: (context: any) => context[0].dataset.label } },
                            zoom: {
                                pan: { enabled: true, mode: 'x' },
                                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
                            }
                        },
                        scales: {
                            x: {
                                type: 'linear',
                                title: { display: true, text: 'Longitud de onda (nm)' },
                                ticks: { color: '#6B7280' },
                                grid: { color: '#E5E7EB' }
                            },
                            y: {
                                title: { display: true, text: isProcessed ? 'Intensidad (Pre-procesado)' : 'Absorbancia' },
                                ticks: { color: '#6B7280' },
                                grid: { color: '#E5E7EB' }
                            }
                        }
                    }
                });
            }
        }
        return () => {
            chartInstanceRef.current?.destroy();
            // Chart.unregister(ChartZoom) is not available in v4, destroying instance is enough
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isProcessed]); // Re-create chart if isProcessed changes to update Y-axis title

    useEffect(() => {
        const chart = chartInstanceRef.current;
        if (chart) {
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
                const allValues = samples.flatMap(s => s.values).filter(v => isFinite(v as number));
                if (allValues.length > 0) {
                    const min = Math.min(...allValues as number[]);
                    const max = Math.max(...allValues as number[]);
                    const padding = (max - min) * 0.1;
                    chart.options.scales.y.min = min - padding;
                    chart.options.scales.y.max = max + padding;
                }
            } else {
                 chart.options.scales.y.min = undefined;
                 chart.options.scales.y.max = undefined;
            }

            chart.update();
        }
    }, [wavelengths, samples, isProcessed]);
    
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
        if (!chart || wavelengths.length === 0) return;
        
        const start = parseFloat(startWl), end = parseFloat(endWl);
        const minWl = wavelengths[0], maxWl = wavelengths[wavelengths.length - 1];

        if (isNaN(start) || isNaN(end) || start >= end || start < minWl || end > maxWl) {
            alert(`Rango espectral inválido. Asegúrese que el inicio < fin y está dentro de ${minWl.toFixed(2)} y ${maxWl.toFixed(2)} nm.`);
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
            <div className="flex justify-between items-start mb-2">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <ChartIcon />
                    Visualizador de Espectros
                </h2>
                <p className="text-sm text-gray-500 hidden md:block">Click/arrastre o use la rueda para zoom.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center border-t border-gray-200 pt-3 mt-2">
                <div className="flex items-center gap-2 md:col-span-1">
                    <label htmlFor="startWavelength" className="text-xs text-gray-500 whitespace-nowrap">Inicio:</label>
                    <input type="number" id="startWavelength" value={startWl} onChange={e => setStartWl(e.target.value)} placeholder="nm" className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                </div>
                <div className="flex items-center gap-2 md:col-span-1">
                    <label htmlFor="endWavelength" className="text-xs text-gray-500 whitespace-nowrap">Fin:</label>
                    <input type="number" id="endWavelength" value={endWl} onChange={e => setEndWl(e.target.value)} placeholder="nm" className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-primary" />
                </div>
                <div className="md:col-span-1">
                    <Button onClick={handleApplyRange} className="text-xs !py-1.5 !px-3 w-full">Aplicar</Button>
                </div>
                <div className="md:col-span-2 flex justify-end">
                    <Button variant="secondary" onClick={handleResetZoom} className="text-xs !py-1.5 !px-3">
                        {isProcessed ? 'Resetear Pre-proc.' : 'Resetear Vista'}
                    </Button>
                </div>
            </div>
            <div className="relative h-64 mt-4">
                <canvas ref={chartRef}></canvas>
            </div>
        </Card>
    );
};

export default SpectraViewer;
