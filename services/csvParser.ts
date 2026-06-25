import { Sample } from '../types';

declare var Papa: any;

type ParseResult = {
    wavelengths: number[];
    samples: Sample[];
    analyticalProperty: string;
};

export function preprocessCSVText(rawText: string): { cleanText: string, delimiter: string } {
    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const dataLines = lines.filter(l => !l.startsWith('#') && !l.startsWith('*') && !l.startsWith(';'));

    if (dataLines.length === 0) {
        return { cleanText: rawText, delimiter: ',' };
    }

    let semiCount = 0;
    let tabCount = 0;
    let commaCount = 0;
    let spaceCount = 0;

    const sampleSize = Math.min(dataLines.length, 20);
    for (let i = 0; i < sampleSize; i++) {
        const line = dataLines[i];
        if (line.includes(';')) semiCount++;
        if (line.includes('\t')) tabCount++;
        if (line.includes(',')) commaCount++;
        const partsBySpace = line.split(/\s+/);
        if (partsBySpace.length >= 2) spaceCount++;
    }

    let delimiter = ',';
    let isCommaDecimal = false;

    if (semiCount >= sampleSize * 0.8) {
        delimiter = ';';
        isCommaDecimal = true;
    } else if (tabCount >= sampleSize * 0.8) {
        delimiter = '\t';
        isCommaDecimal = true;
    } else if (spaceCount >= sampleSize * 0.8) {
        delimiter = ' ';
        isCommaDecimal = true;
    } else if (commaCount >= sampleSize * 0.8) {
        let hasDots = false;
        for (let i = 0; i < sampleSize; i++) {
            if (dataLines[i].includes('.')) {
                hasDots = true;
                break;
            }
        }
        if (hasDots) {
            delimiter = ',';
            isCommaDecimal = false;
        } else {
            let avgCommas = 0;
            for (let i = 0; i < sampleSize; i++) {
                avgCommas += (dataLines[i].match(/,/g) || []).length;
            }
            avgCommas /= sampleSize;

            if (avgCommas > 1.5) {
                delimiter = ',';
                isCommaDecimal = false;
            } else {
                delimiter = ',';
                isCommaDecimal = false;
            }
        }
    }

    let cleanText = rawText;
    if (isCommaDecimal) {
        // Replace commas with dots
        cleanText = rawText.replace(/,/g, '.');
    }

    // Standardize whitespace delimiters (multiple spaces or tabs) to commas
    if (delimiter === ' ' || delimiter === '\t') {
        const processedLines = lines.map(line => {
            if (line.startsWith('#') || line.startsWith('*')) return line;
            return line.replace(/\s+/g, ',');
        });
        cleanText = processedLines.join('\n');
        delimiter = ',';
    }

    return { cleanText, delimiter };
}

export function parseCSV(
    fileOrString: File | string,
    onComplete: (results: ParseResult) => void,
    hasAnalyticalProperty: boolean = true
) {
    if (fileOrString instanceof File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) {
                alert("No se pudieron leer los datos del archivo.");
                return;
            }
            processCSVText(text, fileOrString.name, onComplete, hasAnalyticalProperty);
        };
        reader.onerror = () => {
            alert("Error al leer el archivo CSV.");
        };
        reader.readAsText(fileOrString);
    } else {
        processCSVText(fileOrString, "Espectro", onComplete, hasAnalyticalProperty);
    }
}

function processCSVText(
    rawText: string,
    filename: string,
    onComplete: (results: ParseResult) => void,
    hasAnalyticalProperty: boolean = true
) {
    const { cleanText, delimiter } = preprocessCSVText(rawText);

    Papa.parse(cleanText, {
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

                if (row.length >= 2) {
                    const x = Number(row[0]);
                    const y = Number(row[1]);
                    if (!isNaN(x) && !isNaN(y)) {
                        xyPairs.push({ x, y });
                    }
                }
            }

            // Si detectamos al menos 2 puntos XY puros
            if (xyPairs.length >= 2 && (data[0].length < 3 || xyPairs.length > data.length * 0.8)) {
                const wavelengths = xyPairs.map(p => p.x);
                const values = xyPairs.map(p => p.y);
                const sampleName = filename.replace(/\.[^/.]+$/, "");
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
            const analyticalProperty = hasAnalyticalProperty ? String(header[numCols - 1]) : "Unknown";
            const wavelengths = hasAnalyticalProperty ? header.slice(1, numCols - 1).map(Number) : header.slice(1).map(Number);
            
            if (wavelengths.some(isNaN)) {
                alert("Cabecera de longitudes de onda contiene valores no numéricos.");
                return;
            }

            const samplesData: Sample[] = data.slice(1).map((row, index): Sample | null => {
                const id = String(row[0]);
                
                let analyticalValue = 0;
                let values: number[] = [];

                if (hasAnalyticalProperty) {
                    if (row.length !== numCols) {
                        console.warn(`Fila ${index + 2} ignorada por tener un número incorrecto de columnas.`);
                        return null;
                    }
                    analyticalValue = Number(row[numCols - 1]);
                    if (isNaN(analyticalValue)) {
                        console.warn(`Fila ${index + 2} (ID: ${id}) ignorada: el valor de la propiedad no es numérico.`);
                        return null;
                    }
                    values = row.slice(1, numCols - 1).map(Number);
                } else {
                    values = row.slice(1).map(Number);
                }

                if (values.some(v => isNaN(v))) {
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
