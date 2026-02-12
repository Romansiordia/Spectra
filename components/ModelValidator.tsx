import React, { useState, useMemo, useEffect } from 'react';
import { 
  Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Scatter, ReferenceLine, Label,
  ComposedChart
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
  Table as TableIcon
} from 'lucide-react';

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

  useEffect(() => {
    setData(generateMockData());
  }, []);

  const stats = useMemo(() => calculateStatistics(data), [data]);

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
    if (rpd >= 3.0) return "bg-emerald-500";
    if (rpd >= 2.0) return "bg-amber-500";
    return "bg-rose-500";
  };

  const StatCard = ({ title, value, unit, icon: Icon, description, color }: { title: string; value: any; unit?: string; icon: any; description: string; color: string }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 flex flex-col justify-between h-full hover:shadow-md transition-shadow">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</span>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon size={16} className="text-white" />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-slate-800">{typeof value === 'number' ? value.toFixed(2) : (value || '0.00')}</span>
          <span className="text-slate-400 text-xs font-medium">{unit}</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-400 leading-tight">{description}</p>
    </div>
  );

  return (
    <div className="p-0 font-sans text-slate-900 bg-transparent pb-12">
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">Validación NIR Externa</h1>
          <p className="text-slate-500 text-sm mt-1">Análisis de rendimiento y precisión del modelo con regresión lineal vs laboratorio.</p>
        </div>
        
        <div className="flex gap-3">
          <label className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg transition-colors font-bold text-xs shadow-sm cursor-pointer uppercase tracking-wide">
            <Upload size={14} /> Cargar Datos (.csv)
            <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={() => {setData(generateMockData()); setIsCustomData(false);}} className="text-slate-500 bg-white hover:bg-slate-50 p-2.5 rounded-lg transition-colors border border-slate-200 shadow-sm" title="Datos de ejemplo">
            <Activity size={18} />
          </button>
        </div>
      </header>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="RPD" value={stats?.rpd} icon={Gauge} color={getRpdColor(stats?.rpd)} description="Capacidad predictiva del modelo." />
          <StatCard title="Pendiente" value={stats?.slope} icon={TrendingUp} color="bg-brand-500" description="Inclinación de la recta (ideal 1.0)." />
          <StatCard title="SEP" value={stats?.sep} unit="%" icon={AlertCircle} color="bg-slate-700" description="Error total de predicción." />
          <StatCard title="Bias" value={stats?.bias} unit="%" icon={BarChart3} color="bg-blue-500" description="Desviación sistemática promedio." />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-card border border-slate-100">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-800">
              <TrendingUp size={20} className="text-brand-600" />
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
            <div className="bg-white p-6 rounded-xl shadow-card border border-slate-100">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800">
                <ClipboardList size={20} className="text-brand-600" />
                Estadísticos de Regresión
              </h2>
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
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

                <div className="overflow-hidden border border-slate-100 rounded-lg text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] font-bold">
                      <tr>
                        <th className="px-3 py-2">Parámetro</th>
                        <th className="px-3 py-2">Valor</th>
                        <th className="px-3 py-2 text-right">Ideal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-3 py-2 font-medium">Pendiente (Slope)</td>
                        <td className="px-3 py-2 font-bold text-brand-600">{stats?.slope.toFixed(4)}</td>
                        <td className="px-3 py-2 text-right text-slate-400">1.000</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Intercepto</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{stats?.intercept.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right text-slate-400">0.000</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">R²</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{stats?.r2.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{"> 0.90"}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">SEP</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{stats?.sep.toFixed(3)}%</td>
                        <td className="px-3 py-2 text-right text-slate-400">Mínimo</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 font-medium">Bias</td>
                        <td className="px-3 py-2 font-bold text-slate-700">{stats?.bias.toFixed(3)}%</td>
                        <td className="px-3 py-2 text-right text-slate-400">{"± 0.05"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 p-6 rounded-xl text-white shadow-lg">
              <h3 className="font-bold mb-3 flex items-center gap-2 text-[13px]">
                <Target size={18} className="text-brand-400" />
                Análisis de Pendiente
              </h3>
              <div className="space-y-3">
                <p className="text-[11px] leading-relaxed text-slate-400">
                  La pendiente (slope) mide la sensibilidad del modelo. Un valor de <strong>{stats?.slope.toFixed(2)}</strong> indica que el modelo {stats && stats.slope < 1 ? "infraestima" : "sobreestima"} los cambios en la concentración real. 
                </p>
                <div className="p-3 bg-slate-800 rounded-lg border border-slate-700">
                  <p className="text-brand-300 text-[10px] font-bold uppercase mb-1">Ecuación de Regresión:</p>
                  <p className="text-[12px] font-mono text-white tracking-tight">
                    NIR = {stats?.slope.toFixed(2)}x {stats && stats.intercept >= 0 ? '+' : '-'} {stats ? Math.abs(stats.intercept).toFixed(2) : '0.00'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- NUEVA TABLA DE DATOS DE VALIDACIÓN --- */}
        <div className="bg-white p-6 rounded-xl shadow-card border border-slate-100 animate-fade-in">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-6 text-slate-800">
            <TableIcon size={20} className="text-brand-600" />
            Tabla de Datos y Diferencias de Validación
          </h2>
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold sticky top-0">
                <tr>
                  <th className="px-6 py-4 border-b border-slate-100">ID Muestra</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-right">Químico (Ref) %</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-right">NIR (Pred) %</th>
                  <th className="px-6 py-4 border-b border-slate-100 text-right">Diferencia %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((row) => {
                  const diff = row.nir - row.quimico;
                  return (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-700">{row.id}</td>
                      <td className="px-6 py-3 text-right font-mono text-slate-600">{row.quimico.toFixed(3)}</td>
                      <td className="px-6 py-3 text-right font-mono text-slate-600">{row.nir.toFixed(3)}</td>
                      <td className={`px-6 py-3 text-right font-mono font-bold ${Math.abs(diff) > (stats?.sep || 1) ? 'text-rose-600' : 'text-emerald-600'}`}>
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
              <tfoot className="bg-slate-50 font-bold">
                <tr>
                  <td className="px-6 py-3 text-slate-500 uppercase text-[10px]">Promedios</td>
                  <td className="px-6 py-3 text-right font-mono">{stats?.meanX.toFixed(3)}</td>
                  <td className="px-6 py-3 text-right font-mono">{stats?.meanY.toFixed(3)}</td>
                  <td className="px-6 py-3 text-right font-mono text-slate-800">{stats?.bias.toFixed(3)}</td>
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