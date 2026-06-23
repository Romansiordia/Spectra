
import React, { useRef, useState } from 'react';
import Card from './Card';
import Button from './Button';

interface DataUploaderProps {
    onFileSelected: (file: File) => void;
}

const DataUploader: React.FC<DataUploaderProps> = ({ onFileSelected }) => {
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
        if (file) {
            const fileName = file.name.toLowerCase();
            const ext = fileName.split('.').pop() || '';
            const isOpus = ext === 'opus' || /^\d+$/.test(ext);
            if (fileName.endsWith('.csv') || fileName.endsWith('.dx') || fileName.endsWith('.jdx') || isOpus) {
                processFile(file);
            } else {
                alert("Por favor suba un archivo .csv, jcamp-dx (.dx, .jdx) o Bruker OPUS (.opus, .0, .1...)");
            }
        }
    };

    return (
        <Card className="h-full">
            <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4 border-b border-ui-border pb-3">
                    <div className="h-7 w-7 bg-ui-darkest text-ui-accent border border-ui-accent rounded-lg flex items-center justify-center text-sm font-bold shadow-sm">1</div>
                    <h2 className="text-lg font-bold text-slate-100">Cargar Datos</h2>
                </div>
                
                <div className="flex flex-col gap-4 items-center flex-1">
                    <div 
                        className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer flex-1 flex flex-col justify-center ${isDragging ? 'border-ui-accent bg-ui-darkest' : 'border-ui-border hover:border-ui-accent hover:bg-ui-darkest'}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept=".csv,.dx,.jdx,.opus,.0,.1,.2,.3,.4,.5"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                        <div className="mx-auto h-8 w-8 text-slate-400 mb-3 group-hover:text-ui-accent transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                        </div>
                        <p className="text-sm font-semibold text-slate-200">Click o arrastre un CSV, JCAMP-DX o Bruker OPUS</p>
                        <p className="text-xs text-slate-400 mt-1">para iniciar el análisis</p>
                    </div>

                    <div className="w-full flex flex-col gap-2 justify-center">
                        {fileName && (
                            <div className="flex items-center gap-2 text-xs bg-ui-dark text-slate-200 p-2 rounded-lg border border-ui-border animate-fade-in shadow-sm">
                                <svg className="w-4 h-4 flex-shrink-0 text-ui-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                <span className="truncate font-medium">{fileName}</span>
                            </div>
                        )}
                        <div className="text-[10px] text-slate-400 leading-relaxed bg-ui-dark p-2 rounded-lg border border-ui-border">
                            <strong className="text-slate-200">Formatos soportados:</strong><br/>
                            - <strong>CSV:</strong> 1ª fila headers. Última col Propiedad (Y). <br/>
                            - <strong>JCAMP-DX:</strong> Archivos .dx o .jdx de equipos FOSS/Brukker. <br/>
                            - <strong>Bruker OPUS:</strong> Archivos .opus o extensiones numéricas (.0, .1...) de espectros puros.
                        </div>
                    </div>
                </div>
            </div>
        </Card>
    );
};

export default DataUploader;