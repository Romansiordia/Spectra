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
            // keepRecordsRegExp enables us to read info and metadata
            const parsed = convert(jcampData, { keepRecordsRegExp: /.*/ });

            if (!parsed.flatten || parsed.flatten.length === 0) {
                throw new Error("No se encontraron espectros en el archivo JCAMP-DX.");
            }

            // Find the best valid full spectrum to extract the X coordinate array (wavelengths).
            // Some FOSS files may include small metadata blocks with spectra length = 1.
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
                // Exclude blocks that do not have the same number of Y points as our max X array length
                // This correctly filters out non-spectral "data" blocks in FOSS files
                if (!spectrumData || !spectrumData.y || spectrumData.y.length !== wavelengths.length) return;

                let title = block.title || `Sample ${index + 1}`;
                
                // Try FOSS-specific info tags if available
                if (block.info && block.info.SAMPLEDESCRIPTION) {
                    const descMatch = String(block.info.SAMPLEDESCRIPTION).match(/Sample number:\s*(\d+),\s*product name:\s*([^\r\n]+)/i);
                    if (descMatch) {
                        title = `${descMatch[1]} - ${descMatch[2].trim()}`;
                    } else {
                        // Fallback
                        title = String(block.info.SAMPLEDESCRIPTION).trim();
                    }
                }

                // Generamos un color dinámico
                const color = `hsl(${(samples.length * 360 / Math.max(parsed.flatten.length - 1, 15)) % 360}, 70%, 50%)`;

                samples.push({
                    id: title,
                    values: spectrumData.y,
                    color,
                    active: true,
                    analyticalValue: 0 // Default to 0, or we could extract predictions
                });
            });

            if (samples.length === 0) {
                throw new Error("No se extrajeron espectros que coincidieran con la longitud de onda base.");
            }

            onComplete({
                wavelengths: wavelengths,
                samples,
                analyticalProperty: "Solo Espectro"
            });
            
        } catch (error: any) {
            console.error(error);
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
