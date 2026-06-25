import { Sample } from '../types';

type ParseResult = {
    wavelengths: number[];
    samples: Sample[];
    analyticalProperty: string;
};

export function textToWindows1252Bytes(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length);
    const unicodeToW1252: Record<number, number> = {
        0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
        0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
        0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
        0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F
    };

    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code <= 0xFF) {
            bytes[i] = code;
        } else if (unicodeToW1252[code] !== undefined) {
            bytes[i] = unicodeToW1252[code];
        } else {
            bytes[i] = 0x3F; // '?' fallback for unmappable characters
        }
    }
    return bytes;
}

function arrayBufferToLatin1(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let str = "";
    const chunkSize = 65536;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        str += String.fromCharCode.apply(null, chunk as any);
    }
    return str;
}

function scanParameter(bytes: Uint8Array, name: string): any {
    const nameBytesSpace = new Uint8Array(4);
    const nameBytesNull = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
        const charCode = i < name.length ? name.charCodeAt(i) : 32;
        nameBytesSpace[i] = charCode;
        nameBytesNull[i] = i < name.length ? charCode : 0;
    }

    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let i = 0; i < bytes.length - 16; i++) {
        let found = true;
        for (let j = 0; j < 4; j++) {
            if (bytes[i + j] !== nameBytesSpace[j] && bytes[i + j] !== nameBytesNull[j]) {
                found = false;
                break;
            }
        }
        if (found) {
            const type = bytes[i + 4] | (bytes[i + 5] << 8);
            const length = bytes[i + 6] | (bytes[i + 7] << 8);
            const valOffset = i + 8;

            if (type === 0 && valOffset + 2 <= bytes.length) {
                return dataView.getInt16(valOffset, true);
            } else if (type === 1 && valOffset + 8 <= bytes.length) {
                return dataView.getFloat64(valOffset, true);
            } else if (type === 3 && valOffset + 4 <= bytes.length) {
                return dataView.getInt32(valOffset, true);
            } else if (type === 4 && valOffset + 4 <= bytes.length) {
                return dataView.getFloat32(valOffset, true);
            } else if (type === 2) {
                const valSize = length * 2;
                if (valOffset + valSize <= bytes.length) {
                    let str = "";
                    for (let j = 0; j < valSize; j++) {
                        const b = bytes[valOffset + j];
                        if (b === 0) break;
                        if (b >= 32 && b <= 126) {
                            str += String.fromCharCode(b);
                        }
                    }
                    return str.trim();
                }
            }
        }
    }
    return undefined;
}

function isValidParameterBlockStart(dataView: DataView, offset: number, maxByteLength: number): boolean {
    if (offset < 0 || offset + 8 > maxByteLength) return false;
    for (let i = 0; i < 4; i++) {
        const b = dataView.getUint8(offset + i);
        // Valid characters for parameter name: uppercase A-Z, digits 0-9, space, or null
        if (!((b >= 65 && b <= 90) || (b >= 48 && b <= 57) || b === 32 || b === 0)) {
            return false;
        }
    }
    // Check if the type is a valid parameter type (0 to 4)
    const type = dataView.getUint16(offset + 4, true);
    if (type > 4) {
        return false;
    }
    return true;
}

export function parseOPUS(
    fileOrBuffer: File | ArrayBuffer,
    onComplete: (results: ParseResult | null) => void,
    fileName: string = "Espectro"
) {
    if (fileOrBuffer instanceof ArrayBuffer) {
        processBuffer(fileOrBuffer, fileName);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            if (!arrayBuffer) {
                onComplete(null);
                return;
            }
            processBuffer(arrayBuffer, fileOrBuffer.name);
        };
        reader.onerror = () => {
            alert("Error al leer el archivo Bruker OPUS.");
            onComplete(null);
        };
        reader.readAsArrayBuffer(fileOrBuffer);
    }

    function processBuffer(originalArrayBuffer: ArrayBuffer, name: string) {
        try {
            let arrayBuffer = originalArrayBuffer;
            let bytes = new Uint8Array(arrayBuffer);
            let startOffset = 0;
            
            // Find earliest magic number offset (0x0A 0x0A or 0xFE 0xFE) in first 1024 bytes
            for (let i = 0; i < Math.min(bytes.length - 1, 1024); i++) {
                if ((bytes[i] === 0x0A && bytes[i + 1] === 0x0A) || 
                    (bytes[i] === 0xFE && bytes[i + 1] === 0xFE)) {
                    startOffset = i;
                    break;
                }
            }

            if (startOffset > 0) {
                console.log(`Firma Bruker OPUS encontrada en el offset ${startOffset}. Recortando buffer.`);
                arrayBuffer = arrayBuffer.slice(startOffset);
                bytes = new Uint8Array(arrayBuffer);
            }

            const dataView = new DataView(arrayBuffer);
            if (arrayBuffer.byteLength < 32) {
                throw new Error("El archivo es demasiado pequeño para ser un archivo OPUS válido.");
            }

            // Extract Latin-1 text strings delimited or matching the pattern in OPUS files
            const latin1Text = arrayBufferToLatin1(arrayBuffer);
            const textMatches: Record<string, string> = {};
            const textRegex = /([A-Z0-9]{3})\s+(?:\x0c)?\s*([^\r\n]{1,100}?)\s+END/gi;
            let match;
            while ((match = textRegex.exec(latin1Text)) !== null) {
                const tag = match[1].trim().toUpperCase();
                const val = match[2].trim();
                if (tag.length === 3) {
                    textMatches[tag] = val;
                }
            }
            console.log("Resilient text tags matched in OPUS:", textMatches);

            // Attempt standard Bruker OPUS directory parsing first
            let standardSuccess = false;
            let wavelengths: number[] = [];
            let values: number[] = [];
            let analyticalProperty = "Absorbancia";
            let sampleId = textMatches["FD9"] || name.replace(/\.[^/.]+$/, "");

            const dirOffsetRaw = dataView.getUint32(24, true);
            const dirSize = dataView.getUint32(28, true);

            // Robust offset resolution
            const findAlignedBlockOffset = (originalOffset: number): number => {
                const options = [originalOffset - startOffset, originalOffset];
                for (const opt of options) {
                    if (opt >= 24 && opt + 4 <= arrayBuffer.byteLength) {
                        if (isValidParameterBlockStart(dataView, opt, arrayBuffer.byteLength)) {
                            return opt;
                        }
                    }
                }
                if (originalOffset - startOffset >= 24 && originalOffset - startOffset + 4 <= arrayBuffer.byteLength) {
                    return originalOffset - startOffset;
                }
                return originalOffset;
            };

            const getSpectrumOffset = (originalOffset: number, requiredBytes: number): number => {
                if (originalOffset - startOffset >= 24 && originalOffset - startOffset + requiredBytes <= arrayBuffer.byteLength) {
                    return originalOffset - startOffset;
                }
                if (originalOffset >= 24 && originalOffset + requiredBytes <= arrayBuffer.byteLength) {
                    return originalOffset;
                }
                return originalOffset - startOffset;
            };

            // Try both original dirOffset and dirOffset - startOffset
            const triedDirOffsets = [dirOffsetRaw - startOffset, dirOffsetRaw].filter(
                offset => offset >= 24 && offset + 12 <= arrayBuffer.byteLength
            );

            for (const dirOffset of triedDirOffsets) {
                if (standardSuccess) break;
                try {
                    const spectraBlocks: { dataType: number; channelType: number; offset: number; size: number }[] = [];
                    const parameters: Record<string, any> = {};

                    // Parse directory entries
                    for (let i = 0; i < dirSize; i++) {
                        const entryOffset = dirOffset + i * 12;
                        if (entryOffset + 12 > arrayBuffer.byteLength) {
                            break;
                        }

                        const blockType = dataView.getUint32(entryOffset, true);
                        const blockSize = dataView.getUint32(entryOffset + 4, true);
                        const blockOffsetRaw = dataView.getUint32(entryOffset + 8, true);

                        const dataType = blockType & 0xFF;
                        const channelType = (blockType >> 8) & 0xFF;
                        const block_type = (blockType >> 16) & 0xFF;

                        let byteSize = blockSize;
                        if (blockOffsetRaw + blockSize * 4 <= arrayBuffer.byteLength || (blockOffsetRaw - startOffset) + blockSize * 4 <= arrayBuffer.byteLength) {
                            byteSize = blockSize * 4;
                        }

                        if (block_type === 0) {
                            const alignedOffset = findAlignedBlockOffset(blockOffsetRaw);
                            if (alignedOffset >= 24 && alignedOffset + byteSize <= arrayBuffer.byteLength) {
                                parseParameterBlock(dataView, alignedOffset, byteSize, parameters);
                            }
                        } else if (block_type === 1) {
                            spectraBlocks.push({ dataType, channelType, offset: blockOffsetRaw, size: byteSize });
                        }
                    }

                    const NPT = parameters["NPT"];
                    const FXV = parameters["FXV"];
                    const LXT = parameters["LXT"] !== undefined ? parameters["LXT"] : parameters["LXV"];

                    if (NPT !== undefined && FXV !== undefined && LXT !== undefined && NPT > 1) {
                        const preferredTypes = [14, 15, 25, 12, 24, 13, 16, 11, 22, 10, 23];
                        const candidates = spectraBlocks.filter(b => b.dataType !== 0);

                        if (candidates.length > 0) {
                            let bestBlock = candidates[0];
                            let bestScore = -1;

                            for (const b of candidates) {
                                let score = 0;
                                if (b.size === NPT * 4) {
                                    score += 1000;
                                } else if (b.size >= NPT * 4 && b.size <= NPT * 4 + 64) {
                                    score += 500;
                                }

                                const typeIndex = preferredTypes.indexOf(b.dataType);
                                if (typeIndex !== -1) {
                                    score += (100 - typeIndex);
                                }

                                if (score > bestScore) {
                                    bestScore = score;
                                    bestBlock = b;
                                }
                            }

                            const spectrumBlock = bestBlock;
                            const requiredBytes = NPT * 4;
                            const valOffset = getSpectrumOffset(spectrumBlock.offset, requiredBytes);

                            if (valOffset >= 24 && valOffset + requiredBytes <= arrayBuffer.byteLength) {
                                values = [];
                                wavelengths = [];
                                for (let i = 0; i < NPT; i++) {
                                    values.push(dataView.getFloat32(valOffset + i * 4, true));
                                }

                                const step = (LXT - FXV) / (NPT - 1);
                                for (let i = 0; i < NPT; i++) {
                                    const wavenumber = FXV + i * step;
                                    const wavelength = wavenumber !== 0 ? 10000000 / wavenumber : 0;
                                    wavelengths.push(wavelength);
                                }

                                analyticalProperty = getAnalyticalProperty(spectrumBlock.dataType);
                                if (parameters["SNM"]) {
                                    sampleId = parameters["SNM"];
                                }
                                standardSuccess = true;
                                console.log("Standard OPUS binary parsing succeeded with dirOffset:", dirOffset);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`Standard OPUS parsing failed for dirOffset ${dirOffset}:`, e);
                }
            }

            // Fallback: Resilient Parameter and Spectrum Block Scanner
            if (!standardSuccess) {
                console.log("Initiating resilient raw OPUS scanner...");
                const NPT = scanParameter(bytes, "NPT");
                const FXV = scanParameter(bytes, "FXV");
                const LXT = scanParameter(bytes, "LXT") !== undefined ? scanParameter(bytes, "LXT") : scanParameter(bytes, "LXV");

                if (NPT === undefined || FXV === undefined || LXT === undefined || NPT <= 1) {
                    throw new Error("No se encontraron los parámetros espectrales necesarios (NPT, FXV, LXT/LXV) mediante escaneo resiliente.");
                }

                console.log(`Resilient scanner found header: NPT=${NPT}, FXV=${FXV}, LXT=${LXT}`);

                // Scan for the spectrum block
                let foundOffset = -1;

                // Method A: Look for directory entry in the whole file
                for (let i = 0; i < bytes.length - 12; i += 4) {
                    const blockSizeVal = dataView.getUint32(i + 4, true);
                    const blockOffsetVal = dataView.getUint32(i + 8, true);

                    if ((blockSizeVal === NPT || blockSizeVal === NPT * 4)) {
                        const alignedOffset = getSpectrumOffset(blockOffsetVal, NPT * 4);
                        if (alignedOffset >= 24 && alignedOffset + NPT * 4 <= bytes.length) {
                            foundOffset = alignedOffset;
                            break;
                        }
                    }
                }

                // Method B: Heuristic float smoothness scan
                if (foundOffset === -1) {
                    let bOffset = -1;
                    let bestSmoothness = Infinity;

                    for (let offset = 512; offset <= bytes.length - NPT * 4; offset += 4) {
                        let sumDiffs = 0;
                        let isValid = true;
                        let prevVal = dataView.getFloat32(offset, true);

                        for (let j = 1; j < Math.min(NPT, 50); j++) {
                            const val = dataView.getFloat32(offset + j * 4, true);
                            if (isNaN(val) || Math.abs(val) > 15) {
                                isValid = false;
                                break;
                            }
                            sumDiffs += Math.abs(val - prevVal);
                            prevVal = val;
                        }

                        if (isValid && sumDiffs > 0) {
                            const avgDiff = sumDiffs / Math.min(NPT - 1, 49);
                            if (avgDiff < bestSmoothness && avgDiff > 1e-6) {
                                bestSmoothness = avgDiff;
                                bOffset = offset;
                            }
                        }
                    }

                    if (bOffset !== -1) {
                        foundOffset = bOffset;
                        console.log(`Resilient scanner selected spectrum block at offset ${foundOffset} with smoothness ${bestSmoothness}`);
                    }
                }

                if (foundOffset === -1) {
                    throw new Error("No se pudo localizar el bloque de datos espectrales en el archivo.");
                }

                values = [];
                for (let i = 0; i < NPT; i++) {
                    values.push(dataView.getFloat32(foundOffset + i * 4, true));
                }

                wavelengths = [];
                const step = (LXT - FXV) / (NPT - 1);
                for (let i = 0; i < NPT; i++) {
                    const wavenumber = FXV + i * step;
                    const wavelength = wavenumber !== 0 ? 10000000 / wavenumber : 0;
                    wavelengths.push(wavelength);
                }

                const snm = scanParameter(bytes, "SNM");
                if (snm) {
                    sampleId = snm;
                }
            }

            // Create sample with extracted metadata
            const sample: Sample = {
                id: textMatches["FD9"] || sampleId,
                values: values,
                color: "hsl(210, 70%, 50%)",
                active: true,
                analyticalValue: 0,
                client: textMatches["FD2"] || undefined,
                provider: textMatches["FD5"] || undefined,
                material: textMatches["FD8"] || textMatches["FD1"] || textMatches["FD3"] || textMatches["FD4"] || textMatches["MAT"] || textMatches["PRD"] || undefined
            };

            onComplete({
                wavelengths: wavelengths,
                samples: [sample],
                analyticalProperty: analyticalProperty
            });

        } catch (error: any) {
            console.error("Error parseOPUS:", error);
            alert(`Error al procesar el archivo Bruker OPUS: ${error.message}`);
            onComplete(null);
        }
    }
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

        const prevP = p;
        p += valSize;
        if (p % 2 !== 0) {
            p++;
        }
        if (p <= prevP) {
            p += 2; // Guarantee progress
        }
    }
}
