import React, { useState } from 'react';
import Card from './Card';
import { Sample } from '../types';
import { List, Table, Clipboard, Check, X, Edit3 } from 'lucide-react';

interface SampleManagerProps {
    samples: Sample[];
    onToggle: (index: number) => void;
    onToggleAll: (active: boolean) => void;
    analyticalProperty: string;
    onUpdateAnalyticalValue: (index: number, value: number) => void;
    onUpdatePropertyName: (name: string) => void;
}

const ManagerIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" x2="12" y1="15" y2="3"></line>
    </svg>
);

const SampleManager: React.FC<SampleManagerProps> = ({ 
    samples, 
    onToggle, 
    onToggleAll,
    analyticalProperty,
    onUpdateAnalyticalValue,
    onUpdatePropertyName
}) => {
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const [isPasting, setIsPasting] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [pasteError, setPasteError] = useState<string | null>(null);

    const activeSamples = samples.filter(s => s.active);
    const activeSampleCount = activeSamples.length;

    const handlePasteSubmit = () => {
        setPasteError(null);
        if (!pasteText.trim()) {
            setPasteError('El texto de pegado está vacío.');
            return;
        }

        // Split by lines or tabs or spaces
        const lines = pasteText
            .trim()
            .split(/[\r\n\t,;]+/)
            .map(line => line.trim())
            .filter(line => line !== '');

        const numbers = lines.map(line => {
            // Replace comma with dot for decimals (Spanish Excel uses commas)
            const sanitized = line.replace(',', '.');
            return parseFloat(sanitized);
        });

        const validNumbers = numbers.filter(n => !isNaN(n));

        if (validNumbers.length === 0) {
            setPasteError('No se encontraron números válidos en el texto pegado.');
            return;
        }

        // Apply these numbers row-by-row to active samples
        let numberIdx = 0;
        const updatedSamplesCount = Math.min(validNumbers.length, activeSampleCount);

        // Find the absolute indices of active samples to update
        let activeIdx = 0;
        samples.forEach((sample, index) => {
            if (sample.active) {
                if (numberIdx < validNumbers.length) {
                    onUpdateAnalyticalValue(index, validNumbers[numberIdx]);
                    numberIdx++;
                }
                activeIdx++;
            }
        });

        setIsPasting(false);
        setPasteText('');
        alert(`Se han asignado exitosamente ${updatedSamplesCount} valores analíticos de forma masiva.`);
    };

    return (
        <Card noPadding>
             <div className="bg-ui-dark px-6 py-4 border-b border-ui-border flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <h4 className="font-bold text-slate-200 flex items-center gap-2">
                    <ManagerIcon />
                    Gestor de Datos y Muestras
                </h4>
                
                <div className="flex flex-wrap items-center gap-4">
                    {/* View Switcher */}
                    <div className="flex bg-ui-darkest p-1 rounded-lg border border-ui-border shrink-0">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'grid' ? 'bg-ui-card text-ui-accent shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                            title="Vista rápida en cuadrícula"
                        >
                            <List size={14} />
                            Cuadrícula
                        </button>
                        <button
                            onClick={() => setViewMode('table')}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === 'table' ? 'bg-ui-card text-ui-accent shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                            title="Tabla de valores analíticos"
                        >
                            <Table size={14} />
                            Tabla de Datos
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <p className="text-sm text-slate-400 hidden lg:block">
                            <span className="font-bold text-slate-100">{activeSampleCount}</span> / {samples.length} activas
                        </p>
                        <div className="shrink-0">
                            <button onClick={() => onToggleAll(true)} className="text-xs font-semibold text-ui-accent hover:text-ui-accent hover:underline">TODAS</button> 
                            <span className="text-slate-500 mx-1.5">|</span>
                            <button onClick={() => onToggleAll(false)} className="text-xs font-semibold text-ui-accent hover:text-ui-accent hover:underline">NINGUNA</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Bulk Paste Tool Drawer */}
            {isPasting && (
                <div className="bg-ui-darkest p-4 border-b border-ui-border animate-fade-in">
                    <div className="flex justify-between items-center mb-2">
                        <h5 className="text-xs font-bold text-ui-accent uppercase tracking-wider flex items-center gap-1.5">
                            <Clipboard size={14} />
                            Asistente de Pegado Masivo (Excel / Sheets)
                        </h5>
                        <button 
                            onClick={() => { setIsPasting(false); setPasteError(null); }}
                            className="text-slate-400 hover:text-slate-100"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                        Copia una columna de números de Excel o Google Sheets, pégala aquí y haz clic en aplicar. Se asignarán en orden a las <span className="text-slate-200 font-semibold">{activeSampleCount} muestras activas</span>.
                    </p>
                    <textarea
                        rows={4}
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder="Ejemplo:&#10;12.5&#10;13.1&#10;11.8&#10;14.0"
                        className="w-full bg-ui-card border border-ui-border rounded p-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-ui-accent font-mono mb-2"
                    />
                    {pasteError && (
                        <p className="text-xs text-red-400 mb-2">{pasteError}</p>
                    )}
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={() => { setIsPasting(false); setPasteError(null); }}
                            className="px-3 py-1.5 border border-ui-border rounded text-xs font-medium text-slate-300 hover:bg-ui-dark transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handlePasteSubmit}
                            className="bg-ui-accent text-ui-darkest font-bold px-4 py-1.5 rounded text-xs hover:opacity-90 transition-all flex items-center gap-1"
                        >
                            <Check size={14} />
                            Aplicar a muestras activas
                        </button>
                    </div>
                </div>
            )}
            
            <div className="p-6 overflow-y-auto max-h-[380px] custom-scrollbar">
                {samples.length === 0 ? (
                    <div className="text-center text-slate-400 py-10">
                         <p className="italic text-sm">Cargue un archivo (CSV, JDX u OPUS) para ver y editar las muestras.</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    /* Grid View - Compact Layout */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                        {samples.map((sample, index) => (
                            <div key={sample.id} className="flex items-center justify-between rounded-md p-1 hover:bg-ui-dark/30 transition-all">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <input
                                        type="checkbox"
                                        id={`sample-${index}`}
                                        checked={sample.active}
                                        onChange={() => onToggle(index)}
                                        className="w-4 h-4 rounded border-slate-300 text-ui-accent focus:ring-ui-accent cursor-pointer flex-shrink-0"
                                    />
                                    <label htmlFor={`sample-${index}`} className={`text-sm cursor-pointer truncate max-w-[150px] transition-colors font-medium ${sample.active ? 'text-slate-200' : 'text-slate-500 line-through'}`}>
                                        {sample.id}
                                    </label>
                                </div>
                                <div className="flex items-center gap-2">
                                    {sample.active && (
                                        <span className="text-xs font-mono text-slate-400 bg-ui-darkest px-1.5 py-0.5 rounded">
                                            v: {sample.analyticalValue}
                                        </span>
                                    )}
                                    <div className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-ui-border" style={{ backgroundColor: sample.color }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* Table View - Spreadsheet Editable Layout */
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-ui-border">
                            <thead>
                                <tr className="border-b border-ui-border">
                                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-16">
                                        Activa
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-12">
                                        Color
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                                        ID de Muestra
                                    </th>
                                    <th className="px-4 py-2.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider w-72">
                                        <div className="flex items-center gap-2">
                                            <span className="text-ui-accent">Valor de Referencia:</span>
                                            <div className="flex items-center bg-ui-darkest px-2 py-1 rounded border border-ui-border focus-within:ring-1 focus-within:ring-ui-accent">
                                                <input
                                                    type="text"
                                                    value={analyticalProperty}
                                                    onChange={(e) => onUpdatePropertyName(e.target.value)}
                                                    className="bg-transparent border-none text-xs text-slate-200 font-bold focus:outline-none w-28 placeholder-slate-500"
                                                    title="Renombrar la propiedad analítica"
                                                    placeholder="Propiedad"
                                                />
                                                <Edit3 size={11} className="text-slate-500" />
                                            </div>
                                            {!isPasting && (
                                                <button
                                                    onClick={() => setIsPasting(true)}
                                                    className="ml-auto text-[11px] font-bold text-ui-accent hover:underline flex items-center gap-1 px-2 py-1 rounded bg-ui-accent/10 border border-ui-accent/20"
                                                    title="Pegar columna desde Excel"
                                                >
                                                    <Clipboard size={10} />
                                                    Pegar de Excel
                                                </button>
                                            )}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ui-border/50">
                                {samples.map((sample, index) => (
                                    <tr 
                                        key={sample.id} 
                                        className={`transition-colors hover:bg-ui-dark/20 ${sample.active ? '' : 'bg-ui-darkest/10 opacity-60'}`}
                                    >
                                        {/* Status Checkbox */}
                                        <td className="px-4 py-2">
                                            <input
                                                type="checkbox"
                                                checked={sample.active}
                                                onChange={() => onToggle(index)}
                                                className="w-4 h-4 rounded border-slate-300 text-ui-accent focus:ring-ui-accent cursor-pointer"
                                            />
                                        </td>
                                        
                                        {/* Color block */}
                                        <td className="px-4 py-2">
                                            <div className="w-3 h-3 rounded-full ring-1 ring-ui-border" style={{ backgroundColor: sample.color }}></div>
                                        </td>
                                        
                                        {/* Sample ID */}
                                        <td className="px-4 py-2 text-sm font-medium text-slate-200 truncate max-w-xs">
                                            <span className={sample.active ? '' : 'line-through text-slate-500'}>
                                                {sample.id}
                                            </span>
                                        </td>
                                        
                                        {/* Analytical value editable input */}
                                        <td className="px-4 py-2">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    step="any"
                                                    disabled={!sample.active}
                                                    value={sample.analyticalValue}
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        onUpdateAnalyticalValue(index, isNaN(val) ? 0 : val);
                                                    }}
                                                    className={`bg-ui-darkest border border-ui-border rounded px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ui-accent focus:border-ui-accent w-full max-w-[160px] ${
                                                        sample.active 
                                                            ? 'text-slate-100' 
                                                            : 'text-slate-600 border-slate-800 bg-slate-950/20 cursor-not-allowed'
                                                    }`}
                                                    placeholder="0.00"
                                                />
                                                {sample.active && (
                                                    <span className="text-xs text-slate-400 font-mono">
                                                        {analyticalProperty || 'valor'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default SampleManager;
