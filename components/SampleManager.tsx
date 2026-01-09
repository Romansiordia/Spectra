
import React from 'react';
import Card from './Card';
import { Sample } from '../types';

interface SampleManagerProps {
    samples: Sample[];
    onToggle: (index: number) => void;
    onToggleAll: (active: boolean) => void;
}

const ManagerIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-primary">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" x2="12" y1="15" y2="3"></line>
    </svg>
);

const SampleManager: React.FC<SampleManagerProps> = ({ samples, onToggle, onToggleAll }) => {
    const activeSampleCount = samples.filter(s => s.active).length;

    return (
        <Card className="flex-grow flex flex-col min-h-0">
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <ManagerIcon />
                2. Gestionar Muestras
            </h2>
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">
                    <span className="font-bold">{activeSampleCount}</span> de <span className="font-bold">{samples.length}</span> activas
                </p>
                <div>
                    <button onClick={() => onToggleAll(true)} className="text-xs text-brand-primary hover:underline">Todas</button> |
                    <button onClick={() => onToggleAll(false)} className="text-xs text-brand-primary hover:underline">Ninguna</button>
                </div>
            </div>
            <div className="overflow-y-auto pr-2 flex-grow">
                {samples.length === 0 ? (
                    <p className="text-center text-gray-400 pt-8">Cargue un archivo para ver las muestras.</p>
                ) : (
                    samples.map((sample, index) => (
                        <div key={sample.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id={`sample-${index}`}
                                    checked={sample.active}
                                    onChange={() => onToggle(index)}
                                    className="form-checkbox h-4 w-4 rounded text-brand-primary border-gray-300 focus:ring-brand-primary"
                                />
                                <label htmlFor={`sample-${index}`} className="text-sm cursor-pointer truncate max-w-[150px]">{sample.id}</label>
                            </div>
                            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: sample.color }}></div>
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
};

export default SampleManager;
