import { convert } from 'jcampconverter';
import { Sample } from '../types';

type ParseResult = {
    wavelengths: number[];
    samples: Sample[];
    analyticalProperty: string;
};

export function parseDX(
    file: File,
    onComplete: (results: ParseResult | null) => void
) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const jcampData = e.target?.result as string;
            // keepRecordsRegExp is required to read custom FOSS parameters like sample name
            const parsed = convert(jcampData, { keepRecordsRegExp: /.*/ });

            if (!parsed.flatten || parsed.flatten.length === 0) {
                throw new Error("No se encontraron espectros en el archivo JCAMP-DX.");
            }

            // Encontrar la longitud máxima de onda como referencia para alinear todo
            let bestX: number[] = [];
            parsed.flatten.forEach((b: any) => {
                const x = b.spectra?.[0]?.data?.x;
                if (x && Array.isArray(x) && x.length > bestX.length) {
                    bestX = x;
                }
            });

            if (bestX.length < 2) {
                throw new Error("El archivo no contiene un espectro válido con suficientes datos X.");
            }
            
            const wavelengths = bestX;
            const samples: Sample[] = [];

            parsed.flatten.forEach((block: any, index: number) => {
                const spectrumData = block.spectra?.[0]?.data;
                
                if (!spectrumData || !spectrumData.y) return;
                let targetY = spectrumData.y;
                
                // Si la longitud extraída es demasiado corta comparada con el estándar, es otro tipo de bloque (ej metadata)
                if (targetY.length < wavelengths.length * 0.5) return;

                // Forzamos que la longitud del vector coincida para no tener problemas de matrices asimétricas
                if (targetY.length !== wavelengths.length) {
                    const newY = [];
                    for(let i=0; i<wavelengths.length; i++) {
                        // Rellenamos datos faltantes al final del espectro con el último valor válido (padding)
                        newY.push(targetY[i] !== undefined ? targetY[i] : (targetY[targetY.length - 1] || 0));
                    }
                    targetY = newY;
                }

                let title = block.title || `Muestra ${index + 1}`;
                
                // Extraer el nombre real de FOSS (Sample number, product name, etc)
                if (block.info && block.info.SAMPLEDESCRIPTION) {
                    const descMatch = String(block.info.SAMPLEDESCRIPTION).match(/Sample number:\s*(\d+).*?product name:\s*([^\r\n]+)/i);
                    if (descMatch) {
                        title = `${descMatch[1]} - ${descMatch[2].trim()}`;
                    } else {
                        title = String(block.info.SAMPLEDESCRIPTION).trim();
                    }
                } else if (block.info && block.info.TITLE) {
                    title = String(block.info.TITLE).trim();
                }

                const color = `hsl(${(samples.length * 360 / Math.max(parsed.flatten.length, 1)) % 360}, 70%, 50%)`;

                samples.push({
                    id: title,
                    values: targetY,
                    color,
                    active: true,
                    analyticalValue: 0 
                });
            });

            if (samples.length === 0) {
                throw new Error("No pudimos extraer información espectral coherente del archivo DX.");
            }

            onComplete({
                wavelengths: wavelengths,
                samples,
                analyticalProperty: "Espectro"
            });
            
        } catch (error: any) {
            console.error("Error dxParser:", error);
            alert(`Error al procesar el archivo JCAMP-DX: ${error.message}`);
            onComplete(null);
        }
    };

    reader.onerror = () => {
        alert("Error al leer el archivo JCAMP-DX.");
        onComplete(null);
    };

    reader.readAsText(file);
}
