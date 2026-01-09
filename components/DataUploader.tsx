
import React, { useRef, useState } from 'react';
import Card from './Card';
import Button from './Button';

interface DataUploaderProps {
    onFileSelected: (file: File) => void;
    onLoadDemo: () => void;
}

const UploadIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-primary">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" x2="12" y1="3" y2="15"></line>
    </svg>
);

const FileIcon: React.FC = () => (
     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line>
    </svg>
);


const DataUploader: React.FC<DataUploaderProps> = ({ onFileSelected, onLoadDemo }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState('');

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setFileName(file.name);
            onFileSelected(file);
        }
    };
    
    const handleLoadDemo = () => {
        setFileName('demo_data.csv');
        onLoadDemo();
    };

    return (
        <Card>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <UploadIcon />
                1. Cargar Datos
            </h2>
            <p className="text-sm text-gray-500 mb-4">CSV: 1ª fila: longitudes de onda + propiedad. 1ª col: IDs. Última col: valor de propiedad.</p>
            <div className="space-y-2">
                <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-brand-secondary file:text-white hover:file:bg-brand-primary cursor-pointer"
                />
                <p className="text-xs text-gray-500 h-4 truncate">{fileName}</p>
                <Button variant="secondary" onClick={handleLoadDemo} className="w-full">
                    <FileIcon />
                    Cargar Datos de Demostración
                </Button>
            </div>
        </Card>
    );
};

export default DataUploader;
