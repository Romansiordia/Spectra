import React from 'react';
import Card from './Card';
import { Sample } from '../types';

interface SampleManagerProps {
    samples: Sample[];
    onToggle: (index: number) => void;
    onToggleAll: (active: boolean) => void;
}

const ManagerIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-600">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" x2="12" y1="15" y2="3"></line>
    </svg>
);

const SampleManager: React.FC<SampleManagerProps> = ({ samples, onToggle, onToggleAll }) => {
    const activeSampleCount = samples.filter(s => s.active).length;

    return (
        <Card className="flex-grow flex flex-col min-h-0">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2 text-slate-800">
                <ManagerIcon />
                2. Gestionar Muestras
            </h2>
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200">
                <p className="text-sm text-slate-500">
                    <span className="font-bold text-slate-800">{activeSampleCount}</span> de <span className="font-bold text-slate-800">{samples.length}</span> activas
                </p>
                <div>
                    <button onClick={() => onToggleAll(true)} className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline">Todas</button> 
                    <span className="text-slate-300 mx-1">|</span>
                    <button onClick={() => onToggleAll(false)} className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline">Ninguna</button>
                </div>
            </div>
            <div className="overflow-y-auto pr-2 flex-grow custom-scrollbar">
                {samples.length === 0 ? (
                    <p className="text-center text-slate-400 pt-8 italic text-sm">Cargue un archivo para ver las muestras.</p>
                ) : (
                    <div className="space-y-1">
                        {samples.map((sample, index) => (
                            <div key={sample.id} className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 transition-colors group border border-transparent hover:border-slate-100">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <input
                                        type="checkbox"
                                        id={`sample-${index}`}
                                        checked={sample.active}
                                        onChange={() => onToggle(index)}
                                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                                    />
                                    <label htmlFor={`sample-${index}`} className={`text-sm cursor-pointer truncate max-w-[150px] transition-colors font-medium ${sample.active ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                                        {sample.id}
                                    </label>
                                </div>
                                <div className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-slate-100" style={{ backgroundColor: sample.color }}></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default SampleManager;