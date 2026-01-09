import React, { useRef, useState } from 'react';
import Card from './Card';
import Button from './Button';

interface DataUploaderProps {
    onFileSelected: (file: File) => void;
    onLoadDemo: () => void;
}

const DataUploader: React.FC<DataUploaderProps> = ({ onFileSelected, onLoadDemo }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) processFile(file);
    };
    
    const processFile = (file: File) => {
        setFileName(file.name);
        onFileSelected(file);
    };
    
    const handleLoadDemo = () => {
        setFileName('demo_dataset_nir.csv');
        onLoadDemo();
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.name.endsWith('.csv')) {
            processFile(file);
        } else if (file) {
            alert("Por favor suba un archivo .csv");
        }
    };

    return (
        <Card className="h-full">
            <div className="flex items-center gap-3 mb-4 border-b border-slate-200 pb-3">
                <div className="h-7 w-7 bg-brand-50 text-brand-600 border border-brand-100 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">1</div>
                <h2 className="text-lg font-bold text-slate-800">Cargar Datos</h2>
            </div>
            
            <div className="space-y-4">
                <div 
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${isDragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept=".csv"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <div className="mx-auto h-12 w-12 text-slate-300 mb-3 group-hover:text-brand-500 transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Click para subir CSV</p>
                    <p className="text-xs text-slate-500 mt-1">o arrastre el archivo aquí</p>
                </div>

                {fileName && (
                    <div className="flex items-center gap-2 text-xs bg-emerald-50 text-emerald-700 p-3 rounded-lg border border-emerald-100 animate-fade-in shadow-sm">
                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                        <span className="truncate font-medium">{fileName}</span>
                    </div>
                )}
                
                <div className="relative py-2">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                    <div className="relative flex justify-center text-xs"><span className="px-2 bg-white text-slate-400 font-medium">O use datos de prueba</span></div>
                </div>

                <Button variant="secondary" onClick={handleLoadDemo} className="w-full" size="sm">
                    Cargar Demo NIR
                </Button>
                
                <div className="text-[10px] text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <strong className="text-slate-700">Formato CSV:</strong><br/>
                    1ª fila: Headers (IDs, wavelenghts, Propiedad).<br/>
                    Última columna: Valor de propiedad (Y).
                </div>
            </div>
        </Card>
    );
};

export default DataUploader;