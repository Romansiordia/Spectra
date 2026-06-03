import React, { useState, useMemo, useEffect } from 'react';
import { 
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Scatter, ReferenceLine, Label,
  ComposedChart, BarChart, Bar
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  Activity, 
  AlertCircle, 
  Upload,
  ClipboardList,
  Target,
  Gauge,
  Table as TableIcon,
  Download
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

// --- Funciones Estadísticas ---

const calculateStatistics = (data: { id: number; quimico: number; nir: number }[]) => {
  const n = data.length;
  if (n < 2) return null;

  const sumX = data.reduce((acc, d) => acc + d.quimico, 0);
  const sumY = data.reduce((acc, d) => acc + d.nir, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let numR = 0;
  let denRX = 0;
  let denRY = 0;
  let sumSqDiff = 0;
  let sumDiff = 0;

  data.forEach(d => {
    numR += (d.quimico - meanX) * (d.nir - meanY);
    denRX += Math.pow(d.quimico - meanX, 2);
    denRY += Math.pow(d.nir - meanY, 2);
    
    const diff = d.nir - d.quimico;
    sumSqDiff += Math.pow(diff, 2);
    sumDiff += diff;
  });

  // Cálculo de Pendiente (Slope): b = sum((x-meanX)(y-meanY)) / sum((x-meanX)^2)
  const slope = denRX !== 0 ? numR / denRX : 0;
  // Intercepto: a = meanY - slope * meanX
  const intercept = meanY - (slope * meanX);

  const r = numR / Math.sqrt(denRX * denRY);
  const r2 = Math.pow(r, 2);
  const bias = sumDiff / n;
  const sep = Math.sqrt(sumSqDiff / (n - 1));
  
  const sdRef = Math.sqrt(denRX / (n - 1));
  const rpd = sep > 0 ? sdRef / sep : 0;

  const diffs = data.map(d => d.nir - d.quimico);
  const meanDiff = sumDiff / n;
  const stdDiff = Math.sqrt(diffs.reduce((a, b) => a + Math.pow(b - meanDiff, 2), 0) / (n - 1));
  const tValue = Math.abs(meanDiff / (stdDiff / Math.sqrt(n)));
  const pValue = 2 * (1 - normalCDF(tValue));

  // Generar puntos para la línea de tendencia
  const minX = Math.min(...data.map(d => d.quimico));
  const maxX = Math.max(...data.map(d => d.quimico));
  const trendLine = [
    { quimico: minX, trend: slope * minX + intercept },
    { quimico: maxX, trend: slope * maxX + intercept }
  ];

  return { r2, sep, bias, pValue, n, meanX, meanY, rpd, slope, intercept, trendLine };
};

function normalCDF(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

const generateMockData = () => {
  return Array.from({ length: 40 }, (_, i) => {
    const quimico = 10 + Math.random() * 15;
    const ruido = (Math.random() - 0.5) * 0.7;
    // Forzamos una ligera pendiente distinta de 1 para visibilidad
    const nir = (quimico * 0.98) + ruido + 0.45; 
    return { id: i, quimico: parseFloat(quimico.toFixed(2)), nir: parseFloat(nir.toFixed(2)) };
  });
};

const ModelValidator: React.FC = () => {
  const [data, setData] = useState<{ id: number; quimico: number; nir: number }[]>([]);
  const [isCustomData, setIsCustomData] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    setData(generateMockData());
  }, []);

  const stats = useMemo(() => calculateStatistics(data), [data]);

  const histogramData = useMemo(() => {
    if (data.length === 0) return [];
    const diffs = data.map(d => d.nir - d.quimico);
    const min = Math.min(...diffs);
    const max = Math.max(...diffs);
    const range = max - min || 0.1;

    const numBins = Math.max(5, Math.min(10, Math.round(Math.sqrt(data.length))));
    const binWidth = range / numBins;

    const bins = Array.from({ length: numBins }, (_, i) => {
      const start = min + i * binWidth;
      const end = start + binWidth;
      return {
        start,
        end,
        name: `${start.toFixed(2)} a ${end.toFixed(2)}`,
        count: 0
      };
    });

    diffs.forEach(diff => {
      let placed = false;
      for (let i = 0; i < bins.length; i++) {
        const isLastBin = (i === bins.length - 1);
        if (diff >= bins[i].start && (isLastBin ? diff <= bins[i].end : diff < bins[i].end)) {
          bins[i].count++;
          placed = true;
          break;
        }
      }
      if (!placed && bins.length > 0) {
        if (diff < min) bins[0].count++;
        else if (diff > max) bins[bins.length - 1].count++;
      }
    });

    return bins;
  }, [data]);

  const diffStats = useMemo(() => {
    if (data.length === 0) return { max: 0, min: 0, meanAbs: 0, std: 0 };
    const diffs = data.map(d => d.nir - d.quimico);
    const max = Math.max(...diffs);
    const min = Math.min(...diffs);
    const sum = diffs.reduce((a, b) => a + b, 0);
    const mean = sum / data.length;
    const std = Math.sqrt(diffs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / Math.max(1, data.length - 1));
    const meanAbs = diffs.reduce((a, b) => a + Math.abs(b), 0) / data.length;
    return { max, min, meanAbs, std };
  }, [data]);

  const handleDownloadPDF = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF();
      const today = new Date().toLocaleDateString('es-ES');
      const time = new Date().toLocaleTimeString('es-ES');
      
      // --- PÁGINA 1: RESUMEN Y METRICAS ---
      // Header
      doc.setFontSize(22);
      doc.setTextColor(14, 165, 233); // Brand color: sky-500
      doc.text('Reporte de Validacion Externa NIR', 14, 22);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text(`Fecha de Emisión: ${today} a las ${time}`, 14, 30);
      doc.text(`Origen de Datos: ${isCustomData ? 'Archivo CSV cargado por usuario' : 'Muestras de simulacion por defecto'}`, 14, 35);
      
      // Line divider
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.line(14, 40, 196, 40);
      
      // Section 1: Key stats
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text('1. Resumen Estadistico de Regresion', 14, 49);
      
      const statsRows = [
        ['Muestras Analizadas (n)', `${stats?.n || 0}`, '-'],
        ['Pendiente (Slope)', `${stats?.slope.toFixed(4) || '0.0000'}`, '1.000'],
        ['Intercepto', `${stats?.intercept.toFixed(4) || '0.0000'}`, '0.000'],
        ['R2 (Coeficiente Determinacion)', `${stats?.r2.toFixed(4) || '0.0000'}`, '> 0.90'],
        ['SEP (Error Estandar de Prediccion)', `${stats?.sep.toFixed(4) || '0.0000'}%`, 'Minimo'],
        ['Bias (Sesgo)', `${stats?.bias.toFixed(4) || '0.0000'}%`, '± 0.05'],
        ['RPD (Desviacion Predictiva Relativa)', `${stats?.rpd.toFixed(2) || '0.00'}`, 'Excelente (>=3.0)'],
      ];
      
      autoTable(doc, {
        startY: 54,
        head: [['Estadistico', 'Valor Obtenido', 'Valor Ideal / Objetivo']],
        body: statsRows,
        theme: 'striped',
        headStyles: { fillColor: [14, 165, 233] },
        margin: { left: 14, right: 14 }
      });
      
      // Section 2: Detailed Error Analysis
      let currentY = (doc as any).lastAutoTable.finalY + 12;
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('2. Analisis de Diferencias y Dispersion de Errores', 14, currentY);
      
      const errorRows = [
        ['Diferencia Maxima (Error Max Positivo)', `+${diffStats.max.toFixed(4)}%`],
        ['Diferencia Minima (Error Max Negativo)', `${diffStats.min.toFixed(4)}%`],
        ['Error Absoluto Medio (MAE)', `${diffStats.meanAbs.toFixed(4)}%`],
        ['Media de Diferencias (Bias)', `${(stats?.bias || 0).toFixed(4)}%`],
        ['Desviacion Estandar de Diferencias (Std Dev Errores)', `${diffStats.std.toFixed(4)}%`],
      ];
      
      autoTable(doc, {
        startY: currentY + 5,
        head: [['Metrica de Error / Diferencia', 'Valor']],
        body: errorRows,
        theme: 'grid',
        headStyles: { fillColor: [71, 85, 105] },
        margin: { left: 14, right: 14 }
      });

      // --- PÁGINA 2: GRÁFICOS ---
      // Capturar Gráficos
      const dispContainer = document.getElementById('chart-dispersion-container');
      const histContainer = document.getElementById('chart-histogram-container');

      if (dispContainer || histContainer) {
        doc.addPage();
        doc.setFontSize(16);
        doc.setTextColor(14, 165, 233);
        doc.text('3. Graficos de Validación NIR Externa', 14, 20);
        doc.setDrawColor(226, 232, 240);
        doc.line(14, 24, 196, 24);

        let graphY = 32;

        if (dispContainer) {
          try {
            const dispCanvas = await html2canvas(dispContainer, {
              scale: 2,
              useCORS: true,
              backgroundColor: '#0a1d4a',
            });
            const dispImg = dispCanvas.toDataURL('image/png');
            doc.setFontSize(11);
            doc.setTextColor(71, 85, 105);
            doc.text('A. Recta de Regresión / Dispersión (Predicción vs Laboratorio)', 14, graphY);
            doc.addImage(dispImg, 'PNG', 14, graphY + 4, 180, 100);
            graphY += 112;
          } catch (err) {
            console.error("Error al renderizar el gráfico de dispersión en PDF:", err);
            doc.setFontSize(10);
            doc.setTextColor(220, 38, 38);
            doc.text("[Error al capturar el gráfico de dispersión]", 14, graphY + 10);
            graphY += 20;
          }
        }

        if (histContainer) {
          try {
            const histCanvas = await html2canvas(histContainer, {
              scale: 2,
              useCORS: true,
              backgroundColor: '#0a1d4a',
            });
            const histImg = histCanvas.toDataURL('image/png');
            doc.setFontSize(11);
            doc.setTextColor(71, 85, 105);
            doc.text('B. Histograma de Errores (Frecuencia de Diferencias Residuales)', 14, graphY);
            doc.addImage(histImg, 'PNG', 14, graphY + 4, 180, 95);
          } catch (err) {
            console.error("Error al renderizar el histograma en PDF:", err);
            doc.setFontSize(10);
            doc.setTextColor(220, 38, 38);
            doc.text("[Error al capturar el histograma de errores]", 14, graphY + 10);
          }
        }
      }
      
      // --- PÁGINA 3: TABLA DETALLADA ---
      doc.addPage();
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text('4. Tabla Completa de Diferencias y Valores por Muestra', 14, 20);
      
      const dataRows = data.map((row) => {
        const di = row.nir - row.quimico;
        const diffStr = di >= 0 ? `+${di.toFixed(3)}%` : `${di.toFixed(3)}%`;
        return [
          `${row.id}`,
          `${row.quimico.toFixed(3)}%`,
          `${row.nir.toFixed(3)}%`,
          diffStr
        ];
      });
      
      autoTable(doc, {
        startY: 25,
        head: [['ID de Muestra', 'Quimico (Laboratorio Ref) %', 'NIR (Predicho) %', 'Diferencia (Residual)']],
        body: dataRows,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
        margin: { left: 14, right: 14 }
      });
      
      doc.save(`Reporte_Validacion_NIR_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (e: any) {
      console.error("Error al generar PDF:", e);
      alert(`Error al generar el documento PDF: ${e.message}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
      if (rows.length < 2) return;
      const firstRow = rows[0];
      const delimiter = firstRow.includes(';') ? ';' : ',';
      const headers = firstRow.split(delimiter).map(h => h.trim().toLowerCase());
      
      const idxQuimico = headers.findIndex(h => h.includes('quimico') || h.includes('ref') || h.includes('lab'));
      const idxNir = headers.findIndex(h => h.includes('nir') || h.includes('pred'));

      if (idxQuimico === -1 || idxNir === -1) {
        alert("Error: No se encontraron columnas 'Quimico' y 'NIR' (o similares como 'Ref'/'Pred').");
        return;
      }

      const parsedData = rows.slice(1).map((row, i) => {
        const cols = row.split(delimiter);
        const valQ = cols[idxQuimico]?.replace(/"/g, '').replace(',', '.');
        const valN = cols[idxNir]?.replace(/"/g, '').replace(',', '.');
        return { id: i, quimico: parseFloat(valQ), nir: parseFloat(valN) };
      }).filter(d => !isNaN(d.quimico) && !isNaN(d.nir));

      setData(parsedData);
      setIsCustomData(true);
    };
    reader.readAsText(file);
  };

  const getRpdColor = (rpd: number | undefined) => {
    if (!rpd) return "bg-slate-400";
    if (rpd >= 3.0) return "bg-ui-success";
    if (rpd >= 2.0) return "bg-amber-500";
    return "bg-rose-500";
  };

  const StatCard = ({ title, value, unit, icon: Icon, description, color }: { title: string; value: any; unit?: string; icon: any; description: string; color: string }) => (
    <div className="bg-ui-card p-5 rounded-xl shadow-sm border border-ui-border flex flex-col justify-between h-full hover:shadow-md transition-shadow">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</span>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon size={16} className="text-white" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-slate-100">{typeof value === 'number' ? value.toFixed(2) : (value || '0.00')}</span>
          <span className="text-slate-400 text-xs font-medium">{unit}</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-400 leading-tight">{description}</p>
    </div>
  );

  return (
    <div className="p-0 font-sans text-slate-100 bg-transparent pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-100">Validación NIR Externa</h1>
          <p className="text-slate-400 text-sm mt-1">Análisis de rendimiento y precisión del modelo con regresión lineal vs laboratorio.</p>
        </div>
        
        <div className="flex gap-3 items-center">
          <button 
            onClick={handleDownloadPDF} 
            disabled={isGeneratingPdf}
            className={`flex items-center gap-2 bg-slate-800 text-slate-100 hover:bg-slate-700 px-5 py-2.5 rounded-lg transition-all font-bold text-xs border border-slate-700 uppercase tracking-wide shadow-sm ${isGeneratingPdf ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Descargar Reporte Completo en PDF"
          >
            <Download size={14} className={isGeneratingPdf ? 'animate-spin' : 'text-ui-accent'} /> {isGeneratingPdf ? 'Generando PDF...' : 'Exportar PDF'}
          </button>
          <label className="flex items-center gap-2 bg-ui-accent text-[#0a1d4a] hover:bg-[#38bdf8] shadow-[0_0_15px_rgba(14,165,233,0.3)] px-5 py-2.5 rounded-lg transition-all font-bold text-xs cursor-pointer uppercase tracking-wide">
            <Upload size={14} /> Cargar Datos (.csv)
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={() => {setData(generateMockData()); setIsCustomData(false);}} className="text-slate-500 bg-ui-card hover:bg-ui-darkest p-2.5 rounded-lg transition-colors border border-ui-border shadow-sm" title="Datos de ejemplo">
            <Activity size={18} />
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Muestras" value={stats?.n || data.length} icon={ClipboardList} color="bg-indigo-600" description="Total de muestras analizadas." />
          <StatCard title="RPD" value={stats?.rpd} icon={Gauge} color={getRpdColor(stats?.rpd)} description="Capacidad predictiva del modelo." />
          <StatCard title="Pendiente" value={stats?.slope} icon={TrendingUp} color="bg-ui-accent" description="Inclinación de la recta (ideal 1.0)." />
          <StatCard title="SEP" value={stats?.sep} unit="%" icon={AlertCircle} color="bg-slate-700" description="Error total de predicción." />
          <StatCard title="Bias" value={stats?.bias} unit="%" icon={BarChart3} color="bg-blue-500" description="Desviación sistemática promedio." />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div id="chart-dispersion-container" className="lg:col-span-2 bg-ui-card p-6 rounded-xl shadow-card border border-ui-border">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-100">
              <TrendingUp size={20} className="text-ui-accent" />
              Dispersión y Línea de Tendencia
            </h2>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" dataKey="quimico" stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']}><Label value="Ref. Laboratorio (%)" offset={-10} position="insideBottom" /></XAxis>
                  <YAxis type="number" dataKey="nir" stroke="#94a3b8" fontSize={11} domain={['auto', 'auto']}><Label value="Predicción NIR (%)" angle={-90} position="insideLeft" /></YAxis>
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  
                  {/* Línea Ideal de 45 grados */}
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#cbd5e1" strokeDasharray="5 5" label={{ position: 'top', value: 'Ideal (1:1)', fill: '#94a3b8', fontSize: 10 }} />
                  
                  {/* Puntos de Datos */}
                  <Scatter name="Muestras" data={data} fill="#0ea5e9" fillOpacity={0.6} />
                  
                  {/* Línea de Tendencia calculada */}
                  <Line data={stats?.trendLine} dataKey="trend" stroke="#0284c7" strokeWidth={2} dot={false} activeDot={false} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-ui-card p-6 rounded-xl shadow-card border border-ui-border">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-100">
                <ClipboardList size={20} className="text-ui-accent" />
                Estadísticos de Regresión
              </h2>
              <div className="space-y-4">
                <div className="p-4 bg-ui-darkest rounded-xl border border-ui-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-500 uppercase">Estado RPD</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${getRpdColor(stats?.rpd)}`}>
                      {stats && stats.rpd >= 3 ? 'Excelente' : (stats && stats.rpd >= 2 ? 'Bueno' : 'Pobre')}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${getRpdColor(stats?.rpd)}`} style={{ width: `${stats ? Math.min(100, (stats.rpd / 4) * 100) : 0}%` }} />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400">RPD {stats?.rpd.toFixed(2)}: Precisión relativa a la desviación estándar.</p>
                </div>

                <div className="overflow-hidden border border-ui-border rounded-lg text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-ui-darkest text-slate-400 uppercase text-[9px] font-bold">
                      <tr>
                        <th className="px-3 py-2">Parámetro</th>
                        <th className="px-3 py-2">Valor</th>
                        <th className="px-3 py-2 text-right">Ideal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-3 py-2 font-medium">Muestras Analizadas (n)</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.n || data.length}</td>
                        <td className="px-3 py-2 text-right text-slate-400">-</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Pendiente (Slope)</td>
                        <td className="px-3 py-2 font-bold text-ui-accent">{stats?.slope.toFixed(4)}</td>
                        <td className="px-3 py-2 text-right text-slate-400">1.000</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Intercepto</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.intercept.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right text-slate-400">0.000</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">R²</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.r2.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{"> 0.90"}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">SEP</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.sep.toFixed(3)}%</td>
                        <td className="px-3 py-2 text-right text-slate-400">Mínimo</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Bias</td>
                        <td className="px-3 py-2 font-bold text-slate-200">{stats?.bias.toFixed(3)}%</td>
                        <td className="px-3 py-2 text-right text-slate-400">{"± 0.05"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-ui-dark p-6 rounded-xl text-white shadow-lg">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-[13px]">
                <Target size={18} className="text-ui-accent" />
                Análisis de Pendiente
              </h3>
              <div className="space-y-3">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  La pendiente (slope) mide la sensibilidad del modelo. Un valor de <strong>{stats?.slope.toFixed(2)}</strong> indica que el modelo {stats && stats.slope < 1 ? "infraestima" : "sobreestima"} los cambios en la concentración real. 
                </p>
                <div className="p-3 bg-ui-darkest rounded-lg border border-ui-border">
                  <p className="text-brand-300 text-[10px] font-bold uppercase mb-1">Ecuación de Regresión:</p>
                  <p className="text-[12px] font-mono text-white tracking-tight">
                    NIR = {stats?.slope.toFixed(2)}x {stats && stats.intercept >= 0 ? '+' : '-'} {stats ? Math.abs(stats.intercept).toFixed(2) : '0.00'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- DYNAMIC RESIDUALS HISTOGRAM --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div id="chart-histogram-container" className="lg:col-span-2 bg-ui-card p-6 rounded-xl shadow-card border border-ui-border">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-2 text-slate-100">
              <BarChart3 size={20} className="text-ui-accent" />
              Distribución de Diferencias (Histograma de Errores)
            </h2>
            <p className="text-slate-400 text-xs mb-6">Frecuencia de las diferencias (NIR - Referencia Quimiométrica) agrupadas en rangos equidistantes.</p>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histogramData} margin={{ top: 20, right: 25, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} angle={-15} textAnchor="end" height={50} />
                  <YAxis stroke="#94a3b8" fontSize={11} allowDecimals={false} label={{ value: 'Frecuencia (Muestras)', angle: -90, position: 'insideLeft', offset: 0, fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                    labelClassName="text-xs font-bold text-slate-300"
                    itemStyle={{ fontSize: '11px', color: '#0ea5e9' }}
                    formatter={(value) => [`${value} muestras`, 'Cantidad']}
                  />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-ui-card p-6 rounded-xl shadow-card border border-ui-border flex flex-col justify-between">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-100">
                <Activity size={20} className="text-indigo-400" />
                Estadísticas de Errores
              </h2>
              <div className="p-4 bg-ui-darkest rounded-xl border border-ui-border space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Error Máximo Positivo</span>
                  <span className="font-mono font-bold text-rose-500">+{diffStats.max.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Error Máximo Negativo</span>
                  <span className="font-mono font-bold text-amber-500">{diffStats.min.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Media del Error (Bias)</span>
                  <span className={`font-mono font-bold ${Math.abs(stats?.bias || 0) > 0.05 ? 'text-amber-500' : 'text-ui-success'}`}>
                    {(stats?.bias || 0).toFixed(3)}%
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">MAE (Error Absoluto Medio)</span>
                  <span className="font-mono font-bold text-slate-100">{diffStats.meanAbs.toFixed(3)}%</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">Desv Est de Diferencias (n-1)</span>
                  <span className="font-mono font-bold text-slate-100">{diffStats.std.toFixed(3)}%</span>
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-slate-900/40 rounded-lg text-[11px] text-slate-400">
              <p className="leading-relaxed">
                El histograma muestra cuán balanceados están los errores. Una distribución simétrica y centrada en <strong>0.00</strong> nos dice que no hay sesgo o subdosage constante.
              </p>
            </div>
          </div>
        </div>

        {/* --- NUEVA TABLA DE DATOS DE VALIDACIÓN --- */}
        <div className="bg-ui-card p-6 rounded-xl shadow-card border border-ui-border animate-fade-in">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-100">
            <TableIcon size={20} className="text-ui-accent" />
            Tabla de Datos y Diferencias de Validación
          </h2>
          <div className="overflow-x-auto rounded-lg border border-ui-border">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-ui-darkest text-slate-500 uppercase text-[10px] font-bold sticky top-0">
                <tr>
                  <th className="px-6 py-4 border-b border-ui-border">ID Muestra</th>
                  <th className="px-6 py-4 border-b border-ui-border text-right">Químico (Ref) %</th>
                  <th className="px-6 py-4 border-b border-ui-border text-right">NIR (Pred) %</th>
                  <th className="px-6 py-4 border-b border-ui-border text-right">Diferencia %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row) => {
                  const diff = row.nir - row.quimico;
                  return (
                    <tr key={row.id} className="hover:bg-ui-darkest transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-200">{row.id}</td>
                      <td className="px-6 py-3 text-right font-mono text-slate-300">{row.quimico.toFixed(3)}</td>
                      <td className="px-6 py-3 text-right font-mono text-slate-300">{row.nir.toFixed(3)}</td>
                      <td className={`px-6 py-3 text-right font-mono font-bold ${Math.abs(diff) > (stats?.sep || 1) ? 'text-red-500' : 'text-ui-success'}`}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400 italic">
                      No hay datos cargados para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-ui-darkest font-bold">
                <tr>
                  <td className="px-6 py-3 text-slate-500 uppercase text-[10px]">Promedios</td>
                  <td className="px-6 py-3 text-right font-mono">{stats?.meanX.toFixed(3)}</td>
                  <td className="px-6 py-3 text-right font-mono">{stats?.meanY.toFixed(3)}</td>
                  <td className="px-6 py-3 text-right font-mono text-slate-100">{stats?.bias.toFixed(3)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-4 text-[11px] text-slate-400 italic">
            * La diferencia se calcula como (NIR - Químico). Los valores resaltados en rojo indican una desviación superior al SEP (Standard Error of Prediction).
          </p>
        </div>
      </div>
    </div>
  );
};

export default ModelValidator;