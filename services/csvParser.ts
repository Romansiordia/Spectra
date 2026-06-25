
import { Sample } from '../types';

declare var Papa: any;

type ParseResult = {
    wavelengths: number[];
    samples: Sample[];
    analyticalProperty: string;
};

export function parseCSV(
    fileOrString: File | string,
    onComplete: (results: ParseResult) => void,
    hasAnalyticalProperty: boolean = true
) {
    Papa.parse(fileOrString, {
        header: false,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results: { data: any[][] }) => {
            const data = results.data;
            if (data.length === 0) {
                alert("El archivo está vacío o no se pudo procesar.");
                return;
            }

            // 1. Intentar procesar como formato XY de 2 columnas (Wavelength/Wavenumber vs Absorbance/Intensity)
            const xyPairs: { x: number; y: number }[] = [];
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;

                // Si la fila tiene longitud 1, podría ser que Papaparse no detectó el delimitador de espacios múltiples
                if (row.length === 1 && typeof row[0] === 'string') {
                    const trimmed = row[0].trim();
                    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;
                    const parts = trimmed.split(/[\s,;]+/);
                    if (parts.length >= 2) {
                        const x = Number(parts[0]);
                        const y = Number(parts[1]);
                        if (!isNaN(x) && !isNaN(y)) {
                            xyPairs.push({ x, y });
                        }
                    }
                } else if (row.length >= 2) {
                    const x = Number(row[0]);
                    const y = Number(row[1]);
                    // Asegurar que sean números válidos y no cabeceras de texto
                    if (!isNaN(x) && !isNaN(y)) {
                        xyPairs.push({ x, y });
                    }
                }
            }

            // Si detectamos al menos 2 puntos XY puros y el formato parece ser de un solo espectro
            if (xyPairs.length >= 2 && (data[0].length < 3 || xyPairs.length > data.length * 0.8)) {
                const wavelengths = xyPairs.map(p => p.x);
                const values = xyPairs.map(p => p.y);
                const sampleName = typeof fileOrString === 'string' ? 'Espectro' : fileOrString.name.replace(/\.[^/.]+$/, "");
                const color = `hsl(210, 70%, 50%)`;

                onComplete({
                    wavelengths: wavelengths,
                    samples: [{
                        id: sampleName,
                        values: values,
                        color: color,
                        active: true,
                        analyticalValue: 0
                    }],
                    analyticalProperty: "Absorbancia"
                });
                return;
            }

            // 2. Formato matriz estándar (CSV multi-muestra con múltiples columnas)
            if (data.length < 2 || data[0].length < 3) {
                alert("Formato de CSV inválido. Se requieren al menos 2 filas y 3 columnas para matrices de calibración, o un formato XY de 2 columnas para espectros individuales.");
                return;
            }

            const header = data[0];
            const numCols = header.length;
            const analyticalProperty = hasAnalyticalProperty ? header[numCols - 1] : "Unknown";
            const wavelengths = hasAnalyticalProperty ? header.slice(1, numCols - 1).map(Number) : header.slice(1).map(Number);
            
            if (wavelengths.some(isNaN)) {
                alert("Cabecera de longitudes de onda contiene valores no numéricos.");
                return;
            }

            const samplesData: Sample[] = data.slice(1).map((row, index): Sample | null => {
                const id = row[0];
                
                let analyticalValue = 0;
                let values: number[] = [];

                if (hasAnalyticalProperty) {
                    if (row.length !== numCols) {
                        console.warn(`Fila ${index + 2} ignorada por tener un número incorrecto de columnas.`);
                        return null;
                    }
                    analyticalValue = row[numCols - 1];
                    if (typeof analyticalValue !== 'number' || isNaN(analyticalValue)) {
                        console.warn(`Fila ${index + 2} (ID: ${id}) ignorada: el valor de la propiedad no es numérico.`);
                        return null;
                    }
                    values = row.slice(1, numCols - 1);
                } else {
                    values = row.slice(1);
                }

                if (values.some(v => typeof v !== 'number' || isNaN(v))) {
                    console.warn(`Fila ${index + 2} (ID: ${id}) ignorada: el espectro contiene valores no numéricos.`);
                    return null;
                }
                
                const color = `hsl(${(index * 360 / (data.length - 1)) % 360}, 70%, 50%)`;

                return {
                    id,
                    values,
                    color,
                    active: true,
                    analyticalValue,
                };
            }).filter((s): s is Sample => s !== null);

            onComplete({ wavelengths, samples: samplesData, analyticalProperty });
        },
        error: (error: Error) => {
            alert(`Error al parsear el CSV: ${error.message}`);
        }
    });
}