import React from 'react';
import Card from './Card';
import { Sample } from '../types';

interface SampleManagerProps {
    samples: Sample[];
    onToggle: (index: number) => void;
    onToggleAll: (active: boolean) => void;
}

const ManagerIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" x2="12" y1="15" y2="3"></line>
    </svg>
);

const SampleManager: React.FC<SampleManagerProps> = ({ samples, onToggle, onToggleAll }) => {
    const activeSampleCount = samples.filter(s => s.active).length;

    return (
        <Card noPadding>
             <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                <h4 className="font-bold text-slate-700 flex items-center gap-2">
                    <ManagerIcon />
                    Gestor de Muestras
                </h4>
                <div className="flex items-center gap-4">
                    <p className="text-sm text-slate-500 hidden md:block">
                        <span className="font-bold text-slate-800">{activeSampleCount}</span> / {samples.length} activas
                    </p>
                    <div>
                        <button onClick={() => onToggleAll(true)} className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline">TODAS</button> 
                        <span className="text-slate-300 mx-1.5">|</span>
                        <button onClick={() => onToggleAll(false)} className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline">NINGUNA</button>
                    </div>
                </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-80 custom-scrollbar">
                {samples.length === 0 ? (
                    <div className="text-center text-slate-400 py-10">
                         <p className="italic text-sm">Cargue un archivo para ver las muestras.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                        {samples.map((sample, index) => (
                            <div key={sample.id} className="flex items-center justify-between rounded-md group">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <input
                                        type="checkbox"
                                        id={`sample-${index}`}
                                        checked={sample.active}
                                        onChange={() => onToggle(index)}
                                        className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 cursor-pointer flex-shrink-0"
                                    />
                                    <label htmlFor={`sample-${index}`} className={`text-sm cursor-pointer truncate max-w-[150px] transition-colors font-medium ${sample.active ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                                        {sample.id}
                                    </label>
                                </div>
                                <div className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-slate-200" style={{ backgroundColor: sample.color }}></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Card>
    );
};

export default SampleManager;