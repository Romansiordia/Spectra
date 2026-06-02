
import React, { useState, useRef, useEffect } from 'react';
import Card from './Card';
import Button from './Button';
import { ModelResults, PreprocessingStep, Sample } from '../types';
import { applyPreprocessingLogic } from '../services/chemometrics';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

declare var Chart: any;

interface ResultsViewerProps {
    results: ModelResults;
    propertyName: string;
    preprocessingSteps: PreprocessingStep[];
    activeSamples: (string | number)[];
    activeSamplesData: Sample[];
    onDeactivateOutliers: (outlierIds: (string | number)[]) => void;
    wavelengths: number[];
    onExportCleanDataset: () => void;
}

const StatCard = ({ label, value, subtext, colorClass }: { label: string, value: string | number, subtext?: string, colorClass: string }) => (
    <div className="bg-ui-dark p-5 rounded-xl border border-ui-border shadow-sm flex flex-col items-center justify-center hover:translate-y-[-2px] transition-transform duration-200">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</span>
        <span className={`text-3xl font-bold font-mono ${colorClass}`}>{value}</span>
        {subtext && <span className="text-xs text-slate-400 mt-2 bg-ui-darkest px-2 py-0.5 rounded-full">{subtext}</span>}
    </div>
);

const ResultsViewer: React.FC<ResultsViewerProps> = ({ results, propertyName, preprocessingSteps, activeSamples, activeSamplesData, onDeactivateOutliers, wavelengths, onExportCleanDataset }) => {
    const [activeTab, setActiveTab] = useState('correlation');
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstanceRef = useRef<any>(null);
    
    const residuals = results.model.residuals;
    const [selectedOutliers, setSelectedOutliers] = useState<Set<string|number>>(new Set());
    const [manualSelection, setManualSelection] = useState<Set<string | number>>(new Set());

    useEffect(() => {
        setSelectedOutliers(new Set());
        setManualSelection(new Set());
    }, [results]);

    useEffect(() => {
        if (typeof Chart === 'undefined' || !chartRef.current) return;

        if (!chartInstanceRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                const chartInstance = new Chart(ctx, {
                    type: 'scatter',
                    data: { datasets: [] },
                    options: {
                        maintainAspectRatio: false,
                        responsive: true,
                        animation: false,
                        onClick: (evt: any) => {
                            if (!chartInstanceRef.current) return;
                            const points = chartInstanceRef.current.getElementsAtEventForMode(evt, 'point', { intersect: true }, true);
                            if (points.length > 0) {
                                const point = points[0];
                                const dataset = chartInstanceRef.current.data.datasets[point.datasetIndex];
                                const dataPoint = (dataset.data[point.index] as any);
                                if (dataPoint && dataPoint.id !== undefined) {
                                    const sampleId = dataPoint.id;
                                    setManualSelection(prev => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(sampleId)) newSet.delete(sampleId);
                                        else newSet.add(sampleId);
                                        return newSet;
                                    });
                                }
                            }
                        },
                        plugins: {
                            legend: { 
                                position: 'bottom',
                                labels: { usePointStyle: true, padding: 20, font: { family: 'Inter', size: 12 }, color: '#94a3b8' }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                titleColor: '#f8fafc',
                                bodyColor: '#f1f5f9',
                                borderColor: '#1e293b',
                                borderWidth: 1,
                                padding: 10,
                                callbacks: {
                                    title: (context: any) => `Muestra: ${context[0].dataset.data[context[0].dataIndex].id}`,
                                    label: (context: any) => `Ref ${context.parsed.x.toFixed(2)} / Pred ${context.parsed.y.toFixed(2)}`
                                }
                            }
                        },
                        scales: {
                            x: { title: { display: true, text: `Ref (${propertyName})`, color: '#94a3b8' }, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                            y: { title: { display: true, text: 'Pred (NIR)', color: '#94a3b8' }, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } }
                        }
                    }
                });
                chartInstanceRef.current = chartInstance;
            }
        }

        return () => {
            // Cleanup on unmount
        };
    }, [propertyName]); // Re-init if property changes (to update axis titles)

    useEffect(() => {
        const chartInstance = chartInstanceRef.current;
        if (chartInstance && results) {
            const allDataPoints = results.model.correlation.actual.map((act, i) => ({
                x: act,
                y: results.model.correlation.predicted[i],
                id: results.model.residuals[i].id,
                isOutlier: results.mahalanobis.distances.find(d => d.id === results.model.residuals[i].id)?.isOutlier || false
            })).filter(p => isFinite(p.x) && isFinite(p.y));

            if (allDataPoints.length > 0) {
                const inliersData = allDataPoints.filter(p => !p.isOutlier);
                const outliersData = allDataPoints.filter(p => p.isOutlier);

                const xValues = allDataPoints.map(p => p.x);
                const yValues = allDataPoints.map(p => p.y);
                const minVal = Math.min(...xValues, ...yValues);
                const maxVal = Math.max(...xValues, ...yValues);
                const padding = (maxVal - minVal) * 0.1 || 1;

                chartInstance.data.datasets = [
                    { label: 'Válidas', data: inliersData, backgroundColor: '#0ea5e9', pointRadius: (ctx: any) => manualSelection.has(ctx.raw?.id) ? 8 : 5 },
                    { label: 'Outliers', data: outliersData, backgroundColor: '#ef4444', pointStyle: 'triangle', pointRadius: (ctx: any) => manualSelection.has(ctx.raw?.id) ? 9 : 6 },
                    { type: 'line', label: '1:1', data: [{x: minVal - padding, y: minVal - padding}, {x: maxVal + padding, y: maxVal + padding}], borderColor: '#64748b', borderDash: [6, 6], pointRadius: 0, fill: false }
                ];
                
                chartInstance.options.scales.x.min = minVal - padding;
                chartInstance.options.scales.x.max = maxVal + padding;
                chartInstance.options.scales.y.min = minVal - padding;
                chartInstance.options.scales.y.max = maxVal + padding;
                chartInstance.update('none');
            }
        }
    }, [results, manualSelection, activeTab, propertyName]);

    const handleExportConfig = () => {
        // Calcular espectro de referencia y desviación estándar para muestras limpias
        const rawSpectra = activeSamplesData.map(s => s.values);
        const numSamples = rawSpectra.length;
        
        const rawMeanSpectrum = rawSpectra[0]?.map((_, i) => 
            rawSpectra.reduce((sum, s) => sum + s[i], 0) / (numSamples || 1)
        ) || [];
        
        const spectra = rawSpectra.map(s => applyPreprocessingLogic(s, preprocessingSteps, rawMeanSpectrum));
        
        const meanSpectrum: number[] = [];
        const stdSpectrum: number[] = [];
        const numPoints = spectra[0]?.length || 0;

        for (let i = 0; i < numPoints; i++) {
            let sum = 0;
            for (let j = 0; j < numSamples; j++) {
                sum += spectra[j][i];
            }
            const mean = sum / numSamples;
            meanSpectrum.push(mean);

            let varianceSum = 0;
            for (let j = 0; j < numSamples; j++) {
                varianceSum += Math.pow(spectra[j][i] - mean, 2);
            }
            const std = Math.sqrt(varianceSum / (numSamples > 1 ? numSamples - 1 : 1));
            stdSpectrum.push(std);
        }

        const internalDistances: number[] = [];
        for (let j = 0; j < numSamples; j++) {
            let dist = 0;
            for (let i = 0; i < numPoints; i++) {
                const diff = spectra[j][i] - meanSpectrum[i];
                dist += diff * diff;
            }
            internalDistances.push(Math.sqrt(dist));
        }
        
        const meanDist = internalDistances.reduce((a, b) => a + b, 0) / (numSamples || 1);
        const stdDist = Math.sqrt(internalDistances.reduce((a, b) => a + Math.pow(b - meanDist, 2), 0) / (numSamples || 1));
        const resultThreshold = meanDist + (3 * stdDist) || 1.0;

        const config = { 
            date: new Date().toISOString(), 
            modelType: results.modelType, 
            nComponents: results.nComponents, 
            analyticalProperty: propertyName, 
            preprocessing: preprocessingSteps, 
            metrics: results.model,
            referenceData: {
                meanSpectrum,
                stdSpectrum,
                rawMeanSpectrum,
                numberOfSamples: numSamples,
                wavelengths: wavelengths,
                threshold: resultThreshold
            }
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
        const anchor = document.createElement('a'); anchor.href = dataStr; anchor.download = `modelo_${propertyName}.json`; anchor.click();
    };

    const handleDownloadPDF = () => {
        try {
            const doc = new jsPDF();
            
            // Header
            doc.setFontSize(22);
            doc.setTextColor(14, 165, 233); // Brand color
            doc.text('Reporte Técnico Quimiométrico', 14, 22);
            
            doc.setFontSize(10);
            doc.setTextColor(100, 116, 139); // Slate 500
            doc.text(`Fecha de Generación: ${new Date().toLocaleString()}`, 14, 30);
            doc.text(`Propiedad Analizada: ${propertyName}`, 14, 35);
            doc.text(`Algoritmo: ${results.modelType.toUpperCase()}`, 14, 40);
            doc.text(`Componentes Principales: ${results.nComponents}`, 14, 45);

            // Pre-procesamiento
            doc.setFontSize(16);
            doc.setTextColor(15, 23, 42); // Slate 900
            doc.text('1. Pre-procesamiento', 14, 55);
            
            const preprocData = preprocessingSteps.map((step, i) => [i + 1, step.type, JSON.stringify(step.params)]);
            autoTable(doc, {
                startY: 60,
                head: [['#', 'Método Aplicado', 'Configuración']],
                body: preprocData,
                theme: 'striped',
                headStyles: { fillColor: [14, 165, 233] },
                margin: { left: 14, right: 14 }
            });

            // Métricas
            let currentY = (doc as any).lastAutoTable.finalY + 15;
            doc.setFontSize(16);
            doc.text('2. Métricas de Performance', 14, currentY);
            
            const metricsData = [
                ['R² (Coeficiente de Determinación)', results.model.r2.toFixed(4)],
                ['Q² (Validación Cruzada)', results.model.q2.toFixed(4)],
                ['SEC (Error Estándar de Calibración)', results.model.sec.toFixed(4)],
                ['SECV (Error Estándar de Validación)', results.model.secv.toFixed(4)],
                ['Pendiente (Slope)', results.model.slope.toFixed(4)],
                ['Offset (Intersección)', results.model.offset.toFixed(4)]
            ];
            
            autoTable(doc, {
                startY: currentY + 5,
                body: metricsData,
                theme: 'plain',
                styles: { cellPadding: 3, fontSize: 11 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 120 } },
                margin: { left: 14, right: 14 }
            });

            // Gráfico de Correlación
            currentY = (doc as any).lastAutoTable.finalY + 15;
            
            // Verificar si el gráfico cabe en la página, si no, nueva página
            if (currentY + 110 > doc.internal.pageSize.getHeight()) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(16);
            doc.text('3. Gráfico de Correlación (NIR vs Referencia)', 14, currentY);

            if (chartRef.current && chartInstanceRef.current) {
                try {
                    const chartInstance = chartInstanceRef.current;
                    
                    // Guardar colores originales
                    const originalOptions = JSON.parse(JSON.stringify({
                        xTicks: chartInstance.options.scales.x.ticks.color,
                        xTitle: chartInstance.options.scales.x.title.color,
                        xGrid: chartInstance.options.scales.x.grid.color,
                        yTicks: chartInstance.options.scales.y.ticks.color,
                        yTitle: chartInstance.options.scales.y.title.color,
                        yGrid: chartInstance.options.scales.y.grid.color,
                        legend: chartInstance.options.plugins.legend.labels.color
                    }));

                    // Aplicar colores de alto contraste para el PDF
                    chartInstance.options.scales.x.ticks.color = '#1e293b';
                    chartInstance.options.scales.x.title.color = '#1e293b';
                    chartInstance.options.scales.x.grid.color = '#e2e8f0';
                    chartInstance.options.scales.y.ticks.color = '#1e293b';
                    chartInstance.options.scales.y.title.color = '#1e293b';
                    chartInstance.options.scales.y.grid.color = '#e2e8f0';
                    chartInstance.options.plugins.legend.labels.color = '#1e293b';
                    
                    chartInstance.update('none');

                    // Capturar con fondo blanco
                    const canvas = chartRef.current;
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    if (tempCtx) {
                        tempCtx.fillStyle = '#FFFFFF';
                        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                        tempCtx.drawImage(canvas, 0, 0);
                        
                        const chartImage = tempCanvas.toDataURL('image/jpeg', 1.0);
                        doc.addImage(chartImage, 'JPEG', 14, currentY + 5, 180, 100);
                        currentY += 110;
                    }

                    // Restaurar colores
                    chartInstance.options.scales.x.ticks.color = originalOptions.xTicks;
                    chartInstance.options.scales.x.title.color = originalOptions.xTitle;
                    chartInstance.options.scales.x.grid.color = originalOptions.xGrid;
                    chartInstance.options.scales.y.ticks.color = originalOptions.yTicks;
                    chartInstance.options.scales.y.title.color = originalOptions.yTitle;
                    chartInstance.options.scales.y.grid.color = originalOptions.yGrid;
                    chartInstance.options.plugins.legend.labels.color = originalOptions.legend;
                    chartInstance.update('none');

                } catch (chartError) {
                    console.error("Error capturando gráfico:", chartError);
                    doc.setFontSize(10);
                    doc.setTextColor(239, 68, 68);
                    doc.text('Error: No se pudo renderizar el gráfico en el PDF.', 14, currentY + 10);
                    currentY += 20;
                }
            }

            // Residuos (Nueva Página)
            doc.addPage();
            doc.setFontSize(16);
            doc.setTextColor(15, 23, 42);
            doc.text('4. Resumen de Residuos (Top 50)', 14, 20);
            
            const residualsData = residuals.slice(0, 50).map(r => [
                r.id, 
                r.actual.toFixed(4), 
                r.predicted.toFixed(4), 
                r.residual.toFixed(4)
            ]);
            
            autoTable(doc, {
                startY: 25,
                head: [['ID Muestra', 'Valor Referencia', 'Predicción NIR', 'Residuo']],
                body: residualsData,
                theme: 'striped',
                headStyles: { fillColor: [14, 165, 233] },
                styles: { fontSize: 9 },
                margin: { left: 14, right: 14 }
            });

            doc.save(`Reporte_${propertyName}_${new Date().getTime()}.pdf`);
        } catch (pdfError) {
            console.error("Error generando PDF:", pdfError);
            alert("Hubo un error al generar el reporte PDF. Por favor, intente de nuevo.");
        }
    };

    const handleDeactivateManualClick = () => {
        if (manualSelection.size === 0) return;
        onDeactivateOutliers(Array.from(manualSelection));
    };

    const TabButton = ({ tabId, label, icon }: { tabId: string; label: string; icon?: React.ReactNode }) => (
        <button className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative ${activeTab === tabId ? 'text-ui-accent bg-ui-darkest border-b-2 border-ui-accent' : 'text-slate-400 hover:text-slate-100 hover:bg-ui-dark'}`} onClick={() => setActiveTab(tabId)}>
            {icon}{label}
        </button>
    );

    return (
        <Card noPadding className="overflow-hidden">
            <div className="bg-ui-card border-b border-ui-border">
                <div className="flex overflow-x-auto no-scrollbar">
                    <TabButton tabId="correlation" label="Gráfico" icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18"></path></svg>} />
                    <TabButton tabId="residuals" label="Residuos" />
                    <TabButton tabId="full-data" label="Exportar" />
                </div>
            </div>

            <div className="p-6 bg-ui-darkest min-h-[400px]">
                <div className={activeTab === 'correlation' ? 'block' : 'hidden'}>
                    <div className="flex flex-col gap-6 animate-fade-in">
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                            <StatCard label="R²" value={isFinite(results.model.r2) ? results.model.r2.toFixed(4) : '0.0000'} colorClass="text-sky-400" />
                            <StatCard label="Q²" value={isFinite(results.model.q2) ? results.model.q2.toFixed(4) : '0.0000'} colorClass="text-purple-400" />
                            <StatCard label="SEC" value={isFinite(results.model.sec) ? results.model.sec.toFixed(4) : '0.0000'} colorClass="text-ui-accent" />
                            <StatCard label="SECV" value={isFinite(results.model.secv) ? results.model.secv.toFixed(4) : '0.0000'} colorClass="text-ui-success" />
                            <StatCard label="Offset" value={results.model.offset != null && isFinite(results.model.offset) ? results.model.offset.toFixed(4) : '0.0000'} colorClass="text-amber-400" />
                        </div>

                        <div className="bg-ui-darkest p-4 rounded-xl border border-ui-border shadow-inner-dark h-[450px] relative">
                            <canvas ref={chartRef}></canvas>
                        </div>

                        <div className="bg-ui-card rounded-xl border border-ui-border p-6 flex justify-between items-center">
                            <div>
                                <h4 className="font-bold text-slate-100">Gestión de Outliers</h4>
                                <p className="text-sm text-slate-400">Seleccionados: {manualSelection.size}</p>
                            </div>
                            <Button onClick={handleDeactivateManualClick} disabled={manualSelection.size === 0} variant="danger">
                                Desactivar y Recalcular
                            </Button>
                        </div>
                    </div>
                </div>

                <div className={activeTab === 'residuals' ? 'block' : 'hidden'}>
                     <div className="bg-ui-card rounded-xl border border-ui-border overflow-hidden animate-fade-in">
                        <table className="w-full text-sm text-left text-slate-100">
                            <thead className="bg-ui-dark text-slate-400 uppercase text-xs">
                                <tr>
                                    <th className="px-6 py-3">ID</th>
                                    <th className="px-6 py-3 text-right">Real</th>
                                    <th className="px-6 py-3 text-right">Pred</th>
                                    <th className="px-6 py-3 text-right">Error</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ui-darkest">
                                {residuals.map(r => (
                                    <tr key={r.id}>
                                        <td className="px-6 py-3">{r.id}</td>
                                        <td className="px-6 py-3 text-right font-mono">{r.actual.toFixed(4)}</td>
                                        <td className="px-6 py-3 text-right font-mono">{r.predicted.toFixed(4)}</td>
                                        <td className={`px-6 py-3 text-right font-mono ${Math.abs(r.residual) > results.model.sec * 2 ? 'text-red-400 font-bold' : ''}`}>{r.residual.toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                     </div>
                </div>

                <div className={activeTab === 'full-data' ? 'block' : 'hidden'}>
                    <div className="flex flex-col items-center justify-center py-20 bg-ui-card rounded-xl border-2 border-dashed border-ui-border animate-fade-in gap-4">
                         <div className="flex gap-4">
                            <Button onClick={handleExportConfig} size="lg">Descargar Modelo JSON</Button>
                            <Button onClick={onExportCleanDataset} size="lg" className="bg-ui-accent hover:bg-ui-accent/80 text-white">Descargar Dataset Limpio (CSV)</Button>
                            <Button onClick={handleDownloadPDF} size="lg" variant="secondary">Descargar Reporte PDF</Button>
                         </div>
                         <p className="mt-4 text-slate-400 text-sm">El archivo JSON es para el módulo de predicción. El CSV contiene las lecturas y valores de las muestras activas. El PDF es un reporte técnico.</p>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default ResultsViewer;
