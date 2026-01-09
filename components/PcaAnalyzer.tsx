
import React, { useRef, useEffect } from 'react';
import Card from './Card';
import Button from './Button';
import { PcaResult } from '../types';

declare var Chart: any;

interface PcaAnalyzerProps {
    onRunPca: () => void;
    pcaResults: PcaResult[] | null;
    disabled: boolean;
}

const PcaIcon: React.FC = () => (
     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-primary">
        <circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle>
    </svg>
);

const PcaAnalyzer: React.FC<PcaAnalyzerProps> = ({ onRunPca, pcaResults, disabled }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);

    useEffect(() => {
        if (chartRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                chartInstanceRef.current = new Chart(ctx, {
                    type: 'scatter',
                    data: { datasets: [] },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    title: (context: any) => {
                                        const dataIndex = context[0].dataIndex;
                                        return context[0].dataset.rawData[dataIndex].id;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { title: { display: true, text: 'PC1' } },
                            y: { title: { display: true, text: 'PC2' } }
                        }
                    }
                });
            }
        }
        return () => chartInstanceRef.current?.destroy();
    }, []);

    useEffect(() => {
        if (chartInstanceRef.current && pcaResults) {
            const variancePC1 = 85.4 + Math.random() * 5;
            const variancePC2 = 9.1 + Math.random() * 2;
            chartInstanceRef.current.options.scales.x.title.text = `PC1 (${variancePC1.toFixed(1)}% Varianza)`;
            chartInstanceRef.current.options.scales.y.title.text = `PC2 (${variancePC2.toFixed(1)}% Varianza)`;
            chartInstanceRef.current.data.datasets = [{
                label: 'PCA Scores',
                data: pcaResults,
                rawData: pcaResults, // Store original data for tooltip
                backgroundColor: pcaResults.map(s => s.color + 'BF'),
                borderColor: pcaResults.map(s => s.color),
                pointRadius: 6
            }];
            chartInstanceRef.current.update();
        }
    }, [pcaResults]);


    return (
        <Card>
            <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-primary"><path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>
                Análisis Exploratorio (PCA)
            </h2>
            <p className="text-sm text-gray-500 mb-4">Genere un gráfico de scores PCA (simulado) para visualizar la similitud y agrupamiento entre las muestras activas.</p>
            <Button onClick={onRunPca} disabled={disabled} className="w-full max-w-sm mx-auto mb-4">
                <PcaIcon />
                Generar Gráfico PCA
            </Button>
            <div className={`relative h-80 ${!pcaResults && 'hidden'}`}>
                <canvas ref={chartRef}></canvas>
            </div>
        </Card>
    );
};

export default PcaAnalyzer;
