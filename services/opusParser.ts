import { Sample } from '../types';

type ParseResult = {
    wavelengths: number[];
    samples: Sample[];
    analyticalProperty: string;
};

export function parseOPUS(
    file: File,
    onComplete: (results: ParseResult | null) => void
) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) {
                throw new Error("No se pudieron leer los datos binarios del archivo.");
            }

            const dataView = new DataView(arrayBuffer);
            if (arrayBuffer.byteLength < 32) {
                throw new Error("El archivo es demasiado pequeño para ser un archivo OPUS válido.");
            }

            // Offset 24: pointer to first directory (uint32)
            // Offset 28: number of directory entries (int32)
            const dirOffset = dataView.getUint32(24, true);
            const dirSize = dataView.getUint32(28, true);

            if (dirOffset < 24 || dirOffset >= arrayBuffer.byteLength) {
                throw new Error("Puntero de directorio inválido o fuera de rango.");
            }

            const spectraBlocks: { dataType: number; channelType: number; offset: number; size: number }[] = [];
            const parameters: Record<string, any> = {};

            // Parse directory entries first to read all parameter blocks
            for (let i = 0; i < dirSize; i++) {
                const entryOffset = dirOffset + i * 12;
                if (entryOffset + 12 > arrayBuffer.byteLength) {
                    break;
                }

                const blockType = dataView.getUint32(entryOffset, true);
                const blockSize = dataView.getUint32(entryOffset + 4, true);
                const blockOffset = dataView.getUint32(entryOffset + 8, true);

                const dataType = blockType & 0xFF;
                const channelType = (blockType >> 8) & 0xFF;

                if (blockOffset + blockSize > arrayBuffer.byteLength) {
                    continue;
                }

                if (dataType === 0) {
                    // Parameter block
                    parseParameterBlock(dataView, blockOffset, blockSize, parameters);
                } else {
                    // Candidate spectral data block (any non-parameter block)
                    spectraBlocks.push({ dataType, channelType, offset: blockOffset, size: blockSize });
                }
            }

            const NPT = parameters["NPT"]; // Number of points
            const FXV = parameters["FXV"]; // First X value (wavenumber)
            const LXT = parameters["LXT"]; // Last X value (wavenumber)

            if (NPT === undefined || FXV === undefined || LXT === undefined) {
                const keys = Object.keys(parameters).join(", ");
                throw new Error(`El archivo OPUS no contiene los parámetros espectrales necesarios (NPT, FXV, LXT). Parámetros encontrados: [${keys || 'ninguno'}]`);
            }

            if (NPT <= 1) {
                throw new Error(`El número de puntos (NPT: ${NPT}) no es válido.`);
            }

            // Expanded list of known Bruker spectra block data types:
            // 14, 15, 25 = Absorbance (AB)
            // 12, 24 = Transmittance (TR)
            // 13, 16 = Reflectance (RE)
            // 11, 22 = Single Channel Sample (SC)
            // 10, 23 = Single Channel Reference (SC_Ref)
            const preferredTypes = [14, 15, 25, 12, 24, 13, 16, 11, 22, 10, 23];
            const candidates = spectraBlocks.filter(b => b.dataType !== 0);

            if (candidates.length === 0) {
                throw new Error("No se encontró ningún bloque de datos de espectro en el archivo OPUS.");
            }

            // Find the best block matching the criteria (exact size match is a huge indicator)
            let bestBlock = candidates[0];
            let bestScore = -1;

            for (const b of candidates) {
                let score = 0;

                // 1. Math check: perfect size match (NPT points * 4 bytes per Float32)
                if (b.size === NPT * 4) {
                    score += 1000;
                } else if (b.size >= NPT * 4 && b.size <= NPT * 4 + 64) {
                    score += 500; // close size with potential headers/padding
                }

                // 2. Heuristics check: standard spectral dataType prioritization
                const typeIndex = preferredTypes.indexOf(b.dataType);
                if (typeIndex !== -1) {
                    score += (100 - typeIndex); // Prefer items earlier in the list
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestBlock = b;
                }
            }

            const spectrumBlock = bestBlock;

            // Read Float32 data points
            const values: number[] = [];
            const valOffset = spectrumBlock.offset;
            const requiredBytes = NPT * 4;

            // In some files, the block size might be reported as slightly larger,
            // so we guard against arrayBuffer limits strictly with requiredBytes.
            if (valOffset + requiredBytes > arrayBuffer.byteLength) {
                throw new Error("El archivo de espectro está incompleto o truncado.");
            }

            for (let i = 0; i < NPT; i++) {
                const val = dataView.getFloat32(valOffset + i * 4, true); // little-endian float
                values.push(val);
            }

            // Generate wavenumbers (wavelengths scale)
            const wavelengths: number[] = [];
            const step = (LXT - FXV) / (NPT - 1);
            for (let i = 0; i < NPT; i++) {
                wavelengths.push(FXV + i * step);
            }

            // Determine sample name
            const sampleName = parameters["SNM"] || file.name.replace(/\.[^/.]+$/, "");
            const color = `hsl(210, 70%, 50%)`;

            const sample: Sample = {
                id: sampleName,
                values: values,
                color: color,
                active: true,
                analyticalValue: 0
            };

            onComplete({
                wavelengths: wavelengths,
                samples: [sample],
                analyticalProperty: getAnalyticalProperty(spectrumBlock.dataType)
            });

        } catch (error: any) {
            console.error("Error parseOPUS:", error);
            alert(`Error al procesar el archivo Bruker OPUS: ${error.message}`);
            onComplete(null);
        }
    };

    reader.onerror = () => {
        alert("Error al leer el archivo Bruker OPUS.");
        onComplete(null);
    };

    reader.readAsArrayBuffer(file);
}

function getAnalyticalProperty(dataType: number): string {
    switch (dataType) {
        case 14:
        case 15:
        case 25:
            return "Absorbancia";
        case 12:
        case 24:
            return "Transmitancia";
        case 13:
        case 16:
            return "Reflectancia";
        case 11:
        case 22:
            return "Canal Único (Muestra)";
        case 10:
        case 23:
            return "Canal Único (Referencia)";
        default:
            return `Espectro (Tipo ${dataType})`;
    }
}

function parseParameterBlock(
    dataView: DataView,
    offset: number,
    size: number,
    parameters: Record<string, any>
) {
    let p = offset;
    const end = offset + size;

    while (p + 8 <= end) {
        // Read parameter name (4 characters ASCII)
        let name = "";
        for (let j = 0; j < 4; j++) {
            const byteVal = dataView.getUint8(p + j);
            if (byteVal >= 32 && byteVal <= 126) {
                name += String.fromCharCode(byteVal);
            }
        }
        name = name.trim();

        const type = dataView.getUint16(p + 4, true);
        const length = dataView.getUint16(p + 6, true);

        p += 8;

        let val: any = null;
        let valSize = 0;

        if (type === 0) {
            // 16-bit signed integer (short)
            if (p + 2 <= end) {
                val = dataView.getInt16(p, true);
            }
            valSize = 2;
        } else if (type === 1) {
            // 64-bit float (double)
            if (p + 8 <= end) {
                val = dataView.getFloat64(p, true);
            }
            valSize = 8;
        } else if (type === 2) {
            // String (length of string is length * 2 bytes)
            valSize = length * 2;
            if (p + valSize <= end) {
                let str = "";
                for (let j = 0; j < valSize; j++) {
                    const byteVal = dataView.getUint8(p + j);
                    if (byteVal === 0) break; // Null terminator
                    if (byteVal >= 32 && byteVal <= 126) {
                        str += String.fromCharCode(byteVal);
                    }
                }
                val = str.trim();
            }
        } else if (type === 3) {
            // 32-bit signed integer (dword)
            if (p + 4 <= end) {
                val = dataView.getInt32(p, true);
            }
            valSize = 4;
        } else if (type === 4) {
            // 32-bit float
            if (p + 4 <= end) {
                val = dataView.getFloat32(p, true);
            }
            valSize = 4;
        } else {
            // Unknown types
            valSize = length * 2;
        }

        if (name && val !== null) {
            parameters[name] = val;
        }

        p += valSize;
        if (p % 2 !== 0) {
            p++;
        }
    }
}
