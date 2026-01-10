
import { Sample } from '../types';

declare var Papa: any;

type ParseResult = {
    wavelengths: number[];
    samples: Sample[];
    analyticalProperty: string;
};

export function parseCSV(
    fileOrString: File | string,
    onComplete: (results: ParseResult) => void
) {
    Papa.parse(fileOrString, {
        header: false,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results: { data: any[][] }) => {
            const data = results.data;
            if (data.length < 2 || data[0].length < 3) {
                alert("Formato de CSV inválido. Se requieren al menos 2 filas y 3 columnas.");
                return;
            }

            const header = data[0];
            const numCols = header.length;
            const analyticalProperty = header[numCols - 1];
            const wavelengths = header.slice(1, numCols - 1).map(Number);
            
            if (wavelengths.some(isNaN)) {
                alert("Cabecera de longitudes de onda contiene valores no numéricos.");
                return;
            }

            const samplesData: Sample[] = data.slice(1).map((row, index): Sample | null => {
                if (row.length !== numCols) {
                    console.warn(`Fila ${index + 2} ignorada por tener un número incorrecto de columnas.`);
                    return null;
                }

                const id = row[0];
                const analyticalValue = row[numCols - 1];
                if (typeof analyticalValue !== 'number' || isNaN(analyticalValue)) {
                    console.warn(`Fila ${index + 2} (ID: ${id}) ignorada: el valor de la propiedad no es numérico.`);
                    return null;
                }

                const values = row.slice(1, numCols - 1);
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