export interface FossNirParseResult {
    wavelengths: number[];
    samples: number[][];
    sampleIds?: string[];
}

export const extractSampleIdsFromText = (text: string): string[] => {
    const lines = text.split(/\r?\n/);
    const ids: string[] = [];
    let sampleColIdx = -1;
    let posColIdx = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        let parts: string[] = [];
        if (line.includes('|')) parts = line.split('|');
        else if (line.includes('\t')) parts = line.split('\t');
        else if (line.includes(';')) parts = line.split(';');
        else if (line.includes(',')) parts = line.split(',');
        else parts = line.split(/\s+/);

        const cleanParts = parts
            .map(p => p.replace(/^["']|["']$/g, '').trim())
            .filter(p => p.length > 0 && p !== '|');

        if (cleanParts.length < 2) continue;

        const lower = cleanParts.map(p => p.toLowerCase());
        const isHeader = lower.some(p => 
            /sample/i.test(p) || /muestra/i.test(p) || /^(pos|position|posici[óo]n|item|#)$/i.test(p) || /c[óo]digo/i.test(p)
        );

        if (isHeader && sampleColIdx === -1) {
            for (let c = 0; c < lower.length; c++) {
                if (/^(pos|position|posici[óo]n|item|#)$/i.test(lower[c])) posColIdx = c;
                if (/sample\s*(number|num|no|id|name)?/i.test(lower[c]) || /^(muestra|id\s*muestra|c[óo]digo|codigo|lote)$/i.test(lower[c])) {
                    sampleColIdx = c;
                }
            }
            continue;
        }

        // Data row
        if (sampleColIdx >= 0 && sampleColIdx < cleanParts.length) {
            const candidate = cleanParts[sampleColIdx];
            if (candidate && !/^(position|pos|sample|segment)/i.test(candidate)) {
                ids.push(candidate);
                continue;
            }
        }

        // Si la fila inicia con Position (entero 1..N) y luego Sample Number
        if (cleanParts.length >= 2 && /^\d{1,5}$/.test(cleanParts[0]) && cleanParts[1]) {
            ids.push(cleanParts[1]);
        }
    }
    return ids;
};

export const extractSampleIdsFromBuffer = (buffer: ArrayBuffer, expectedCount: number): string[] => {
    // 1. Intentar decodificar como texto UTF-8 / ASCII
    try {
        const textDecoder = new TextDecoder('utf-8');
        const text = textDecoder.decode(buffer);
        const textIds = extractSampleIdsFromText(text);
        if (textIds.length === expectedCount || (textIds.length > 0 && textIds.length >= expectedCount * 0.8)) {
            return textIds;
        }
    } catch (e) {
        // Ignorar error de decodificación
    }

    // 2. Escanear cadenas ASCII en el buffer binario
    const uint8 = new Uint8Array(buffer);
    const foundStrings: { offset: number, str: string }[] = [];
    let curStr = '';
    let startOffset = 0;

    for (let i = 0; i < uint8.length; i++) {
        const b = uint8[i];
        if (b >= 32 && b <= 126) {
            if (curStr.length === 0) startOffset = i;
            curStr += String.fromCharCode(b);
        } else {
            if (curStr.length >= 4 && curStr.length <= 40) {
                const trimmed = curStr.trim();
                if (trimmed.length >= 4 && !/^(foss|winisi|infratec|segment|absorbance|wavelength|version)/i.test(trimmed)) {
                    foundStrings.push({ offset: startOffset, str: trimmed });
                }
            }
            curStr = '';
        }
    }

    const numericStrings = foundStrings.filter(s => /^\d{5,15}$/.test(s.str));
    if (numericStrings.length === expectedCount) {
        return numericStrings.map(s => s.str);
    }
    if (numericStrings.length > expectedCount) {
        return numericStrings.slice(0, expectedCount).map(s => s.str);
    }

    const codeStrings = foundStrings.filter(s => /^[A-Za-z0-9_-]{5,20}$/.test(s.str));
    if (codeStrings.length === expectedCount) {
        return codeStrings.map(s => s.str);
    }

    return [];
};

export const parseFossNirText = (text: string): FossNirParseResult | null => {
    const lines = text.split(/\r?\n/);
    const samples: number[][] = [];
    const sampleIds: string[] = [];
    
    // Posibles configuraciones de espectro FOSS (Longitud de onda inicial, cantidad de puntos, step)
    const commonSpecs = [
        { points: 3300, start: 850, step: 0.5 },
        { points: 3301, start: 850, step: 0.5 },
        { points: 3401, start: 800, step: 0.5 },
        { points: 3400, start: 800, step: 0.5 },
        { points: 851, start: 800, step: 2 },
        { points: 850, start: 800, step: 2 },
        { points: 825, start: 850, step: 2 },
        { points: 826, start: 850, step: 2 },
        { points: 700, start: 1100, step: 2 },
        { points: 701, start: 1100, step: 2 },
        { points: 1051, start: 400, step: 2 },
        { points: 1026, start: 450, step: 2 },
        { points: 4201, start: 400, step: 0.5 },
        { points: 2101, start: 400, step: 1 },
        { points: 101, start: 850, step: 2 },
        { points: 2151, start: 350, step: 1 }
    ];

    let headerLineIdx = -1;
    let detectedSampleColIdx = -1;
    let detectedPosColIdx = -1;
    let headerWavelengths: number[] | null = null;
    let currentBlockSampleId: string | null = null;

    // Helper para dividir tokens según delimitadores comunes incluyendo pipe '|'
    const splitTokens = (rawLine: string): string[] => {
        let parts: string[] = [];
        if (rawLine.includes('|')) {
            parts = rawLine.split('|');
        } else if (rawLine.includes('\t') && rawLine.split('\t').length >= 3) {
            parts = rawLine.split('\t');
        } else if (rawLine.includes(';') && rawLine.split(';').length >= 3) {
            parts = rawLine.split(';');
        } else if (rawLine.includes(',') && rawLine.split(',').length >= 3) {
            parts = rawLine.split(',');
        } else if (rawLine.includes('\t')) {
            parts = rawLine.split('\t');
        } else {
            parts = rawLine.split(/\s+/);
        }
        return parts
            .map(p => p.replace(/^["']|["']$/g, '').trim())
            .filter(p => p.length > 0 && p !== '|');
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Detectar cabeceras en formato bloque tipo "Sample Number: 26080096" o "Muestra: 26080096"
        const blockMatch = line.match(/^(?:sample\s*(?:number|num|no|id|name)?|muestra|id\s*muestra|c[óo]digo|lote|batch)\s*[:=]\s*([^\r\n]+)$/i);
        if (blockMatch) {
            currentBlockSampleId = blockMatch[1].trim().replace(/^["']|["']$/g, '');
            continue;
        }

        const rawTokens = splitTokens(line);
        if (rawTokens.length < 2) continue;

        // Detectar si esta fila es una fila de cabecera de columnas (Position, Sample Number, etc.)
        const lowerTokens = rawTokens.map(t => t.toLowerCase());
        const isHeaderRow = lowerTokens.some(t => 
            /^(pos|position|posici[óo]n|item|fila|row|#)$/i.test(t) ||
            /sample\s*(number|num|no|id|name)?/i.test(t) ||
            /^(muestra|id\s*muestra|n[°ºo\.]*\s*muestra|numero\s*de\s*muestra|n[úu]mero\s*muestra|c[óo]digo|codigo|lote|batch)$/i.test(t)
        );

        if (isHeaderRow && headerLineIdx === -1) {
            headerLineIdx = i;
            for (let c = 0; c < lowerTokens.length; c++) {
                const col = lowerTokens[c];
                if (/^(pos|position|posici[óo]n|item|fila|row|#)$/i.test(col)) {
                    detectedPosColIdx = c;
                }
                if (/sample\s*(number|num|no|id|name)?/i.test(col) ||
                    /^(muestra|id\s*muestra|n[°ºo\.]*\s*muestra|numero\s*de\s*muestra|n[úu]mero\s*muestra|c[óo]digo|codigo|lote|batch)$/i.test(col)) {
                    detectedSampleColIdx = c;
                }
            }

            // Verificar si hay longitudes de onda en la cabecera
            const maxMetaCol = Math.max(detectedSampleColIdx, detectedPosColIdx);
            const wlCandidates: number[] = [];
            for (let c = maxMetaCol + 1; c < rawTokens.length; c++) {
                const num = parseFloat(rawTokens[c].replace(',', '.'));
                if (!isNaN(num) && isFinite(num) && num >= 300 && num <= 4000) {
                    wlCandidates.push(num);
                } else if (wlCandidates.length > 0) {
                    break;
                }
            }
            if (wlCandidates.length > 50) {
                headerWavelengths = wlCandidates;
            }
            continue;
        }

        // Procesar fila de datos
        const cleanTokens = rawTokens.map(t => t.replace(',', '.'));

        let dataVals: number[] = [];
        let leadingTokens: string[] = [];

        // 1. Probar concordancia con especificaciones conocidas FOSS (3300, 3301, 850, etc.)
        for (const spec of commonSpecs) {
            if (cleanTokens.length >= spec.points && cleanTokens.length <= spec.points + 25) {
                const offset = cleanTokens.length - spec.points;
                const candidateVals = cleanTokens.slice(offset);
                
                let validCount = 0;
                for (let k = 0; k < candidateVals.length; k++) {
                    const n = parseFloat(candidateVals[k]);
                    if (!isNaN(n) && isFinite(n) && n > -15 && n < 100) {
                        validCount++;
                    }
                }
                if (validCount >= spec.points * 0.98) {
                    dataVals = candidateVals.map(Number);
                    leadingTokens = rawTokens.slice(0, offset);
                    break;
                }
            }
        }

        // 2. Método inteligente de rango: buscar el bloque contiguo de absorbancias reales (-10 a 50)
        // Ignorando números de muestra grandes enteros como "26080096"
        if (dataVals.length === 0) {
            let bestStart = -1;
            let bestLen = 0;
            let curStart = -1;
            let curLen = 0;

            for (let idx = 0; idx < cleanTokens.length; idx++) {
                const val = parseFloat(cleanTokens[idx]);
                const isAbsorbance = !isNaN(val) && isFinite(val) && val >= -10 && val <= 50 && (val < 1000 || !Number.isInteger(val));
                if (isAbsorbance) {
                    if (curStart === -1) curStart = idx;
                    curLen++;
                } else {
                    if (curLen > bestLen) {
                        bestLen = curLen;
                        bestStart = curStart;
                    }
                    curStart = -1;
                    curLen = 0;
                }
            }
            if (curLen > bestLen) {
                bestLen = curLen;
                bestStart = curStart;
            }

            if (bestLen > 50 && bestStart >= 0) {
                dataVals = cleanTokens.slice(bestStart, bestStart + bestLen).map(Number);
                leadingTokens = rawTokens.slice(0, bestStart);
            }
        }

        // 3. Fallback: extraer números continuos desde el final hacia el inicio
        if (dataVals.length === 0) {
            let endIdx = cleanTokens.length - 1;
            while (endIdx >= 0) {
                const val = parseFloat(cleanTokens[endIdx]);
                if (isNaN(val) || !isFinite(val) || val > 10000 || val < -50 || endIdx === detectedSampleColIdx || endIdx === detectedPosColIdx) {
                    break;
                }
                dataVals.unshift(val);
                endIdx--;
            }
            if (dataVals.length > 50) {
                leadingTokens = rawTokens.slice(0, endIdx + 1);
            } else {
                dataVals = [];
            }
        }

        if (dataVals.length > 50) {
            let sampleId = '';

            // 1. Si detectamos la columna en la cabecera
            if (detectedSampleColIdx >= 0 && detectedSampleColIdx < leadingTokens.length) {
                const val = leadingTokens[detectedSampleColIdx].trim();
                if (val) sampleId = val;
            }

            // 2. Si solo hay 1 token inicial
            if (!sampleId && leadingTokens.length === 1) {
                sampleId = leadingTokens[0].trim();
            }

            // 3. Si hay 2 tokens iniciales (ej. [Position: "1", Sample Number: "26080096"])
            if (!sampleId && leadingTokens.length === 2) {
                const tok0 = leadingTokens[0].trim();
                const tok1 = leadingTokens[1].trim();
                if (/^\d{1,5}$/.test(tok0)) {
                    sampleId = tok1 || tok0;
                } else {
                    sampleId = tok1 || tok0;
                }
            }

            // 4. Si hay 3 o más tokens iniciales (ej. [Position, Sample Number, Date, Time, Product])
            if (!sampleId && leadingTokens.length >= 3) {
                const candidates = leadingTokens.filter((tok, idx) => {
                    const trimmed = tok.trim();
                    if (!trimmed) return false;
                    if (idx === detectedPosColIdx) return false;
                    if (idx === 0 && /^\d{1,5}$/.test(trimmed) && parseInt(trimmed) <= samples.length + 5) return false;
                    if (/^\d{2,4}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(trimmed)) return false;
                    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return false;
                    return true;
                });

                if (candidates.length > 0) {
                    const numericCandidate = candidates.find(c => /^\d{4,15}$/.test(c.trim()));
                    sampleId = numericCandidate ? numericCandidate.trim() : candidates[0].trim();
                }
            }

            // 5. Bloque previo si existe
            if (!sampleId && currentBlockSampleId) {
                sampleId = currentBlockSampleId;
                currentBlockSampleId = null;
            }

            samples.push(dataVals);
            sampleIds.push(sampleId);
        }
    }
    
    if (samples.length > 0) {
        const uniformLength = samples[0].length;
        const allUniform = samples.every(s => s.length === uniformLength);
        
        if (allUniform) {
            if (headerWavelengths && headerWavelengths.length === uniformLength) {
                return {
                    wavelengths: headerWavelengths,
                    samples: samples,
                    sampleIds: sampleIds
                };
            }

            let spec = commonSpecs.find(s => s.points === uniformLength);
            
            if (spec) {
                return {
                    wavelengths: Array.from({length: spec.points}, (_, i) => spec.start + i * spec.step),
                    samples: samples,
                    sampleIds: sampleIds
                };
            } else if (uniformLength === 3300) {
                // Dual-Segment FOSS: 850 - 2499.5 nm (res 0.5 nm)
                return {
                    wavelengths: Array.from({length: 3300}, (_, i) => 850 + i * 0.5),
                    samples: samples,
                    sampleIds: sampleIds
                };
            } else if (uniformLength === 3301) {
                // Dual-Segment FOSS: 850 - 2500 nm (res 0.5 nm)
                return {
                    wavelengths: Array.from({length: 3301}, (_, i) => 850 + i * 0.5),
                    samples: samples,
                    sampleIds: sampleIds
                };
            } else if (uniformLength > 100 && uniformLength < 5000) {
                let start = 400;
                let end = 2500;
                if (uniformLength >= 3290 && uniformLength <= 3310) {
                    start = 850;
                    end = 2499.5;
                } else if (uniformLength >= 3390 && uniformLength <= 3415) {
                    start = 800;
                    end = 2500;
                }
                let step = (end - start) / (uniformLength - 1);
                return {
                    wavelengths: Array.from({length: uniformLength}, (_, i) => start + i * step),
                    samples: samples,
                    sampleIds: sampleIds
                };
            }
        }
    }
    
    return null;
}

export const parseFossNirBinary = (buffer: ArrayBuffer): { wavelengths: number[], samples: number[][], sampleIds?: string[] } | null => {
  const view = new DataView(buffer);
  
  // Posibles configuraciones de espectro FOSS (Longitud de onda inicial, cantidad de puntos, step)
  const commonSpecs = [
    // FOSS 2 Segmentos: 850-1099.5 nm (500 pts Si) + 1100-2499.5 nm (2800 pts InGaAs) = 3300 pts a 0.5 nm
    { points: 3300, start: 850, step: 0.5 },
    { points: 3301, start: 850, step: 0.5 }, // 850 - 2500 nm (0.5 nm step)
    { points: 3401, start: 800, step: 0.5 }, // 800 - 2500 nm (0.5nm step)
    { points: 3400, start: 800, step: 0.5 }, // 800 - 2499.5 nm (0.5nm step)
    { points: 851, start: 800, step: 2 },    // 800 - 2500 nm (2nm step)
    { points: 850, start: 800, step: 2 },    // 800 - 2498 nm (2nm step)
    { points: 1701, start: 800, step: 1 },   // 800 - 2500 nm (1nm step)
    { points: 825, start: 850, step: 2 },    // 850 - 2498 nm (FOSS NIRS DS3 F / Optimo)
    { points: 826, start: 850, step: 2 },    // 850 - 2500 nm 
    { points: 700, start: 1100, step: 2 },   // 1100 - 2498 nm
    { points: 701, start: 1100, step: 2 },   // 1100 - 2500 nm (FOSS DS2500)
    { points: 1051, start: 400, step: 2 },   // 400 - 2500 nm (FOSS / XDS)
    { points: 1026, start: 450, step: 2 },   // 450 - 2500 nm
    { points: 4201, start: 400, step: 0.5 }, // 400 - 2500 nm (0.5nm step)
    { points: 2101, start: 400, step: 1 },   // 400 - 2500 nm (1nm step)
    { points: 101, start: 850, step: 2 },    // 850 - 1050 nm
    { points: 2151, start: 350, step: 1 }    // 350 - 2500 nm (ASD / LabSpec)
  ];

  const floatTypes = [
    { size: 4, getter: (offset: number, le: boolean) => view.getFloat32(offset, le) },
    { size: 8, getter: (offset: number, le: boolean) => view.getFloat64(offset, le) }
  ];
  
  const endians = [true, false]; // little-endian, big-endian

  for (const fType of floatTypes) {
    for (const le of endians) {
      let sequences: number[][] = [];
      
      for (let alignment = 0; alignment < fType.size; alignment++) {
        let currentSeq: number[] = [];
        let sameCount = 0;
        let lastVal: number | null = null;
        
        for (let offset = alignment; offset <= buffer.byteLength - fType.size; offset += fType.size) {
          try {
            const val = fType.getter(offset, le);
            let isValid = !isNaN(val) && isFinite(val) && val > -10 && val < 20;
            
            if (lastVal !== null && Math.abs(val - lastVal) > 1.5) {
                isValid = false; 
            }
            
            if (val === lastVal) {
                sameCount++;
                if (sameCount > 15) { isValid = false; }
            } else {
                sameCount = 0;
            }
            lastVal = val;
            
            if (isValid) {
                currentSeq.push(val);
            } else {
                if (currentSeq.length > 200) {
                    sequences.push(currentSeq);
                }
                currentSeq = [];
                sameCount = 0;
                lastVal = null;
            }
          } catch(e) {
            if (currentSeq.length > 200) { sequences.push(currentSeq); }
            currentSeq = [];
          }
        }
        if (currentSeq.length > 200) { sequences.push(currentSeq); }
        
        if (sequences.length > 0) {
            break; 
        }
      }
      
      if (sequences.length === 0) continue;

      // 1. Buscamos configuraciones conocidas, eliminando ruido cercano a 0 en los bordes
      for (const spec of commonSpecs) {
          let matchedSamples: number[][] = [];
          
          for (let seq of sequences) {
              // Trim trailing and leading values that are very close to 0 (garbage metadata usually < 1e-15)
              let startIdx = 0;
              while (startIdx < seq.length && Math.abs(seq[startIdx]) < 1e-4) {
                  startIdx++;
              }
              
              let endIdx = seq.length - 1;
              while (endIdx >= startIdx && Math.abs(seq[endIdx]) < 1e-4) {
                  endIdx--;
              }
              
              const trimmedSeq = seq.slice(startIdx, endIdx + 1);
              
              if (trimmedSeq.length >= spec.points && trimmedSeq.length % spec.points === 0) {
                  // Perfect match after trimming
                  const numSamples = trimmedSeq.length / spec.points;
                  for (let i = 0; i < numSamples; i++) {
                      matchedSamples.push(trimmedSeq.slice(i * spec.points, (i + 1) * spec.points));
                  }
              } else if (seq.length >= spec.points && seq.length % spec.points === 0) {
                  // Perfect match without trimming
                  const numSamples = seq.length / spec.points;
                  for (let i = 0; i < numSamples; i++) {
                      matchedSamples.push(seq.slice(i * spec.points, (i + 1) * spec.points));
                  }
              } else if (trimmedSeq.length > spec.points) {
                  // Fallback: take from start of trimmed sequence
                  const numSamples = Math.floor(trimmedSeq.length / spec.points);
                  for (let i = 0; i < numSamples; i++) {
                      matchedSamples.push(trimmedSeq.slice(i * spec.points, (i + 1) * spec.points));
                  }
              } else if (seq.length > spec.points) {
                  // Fallback: take from the end of the original sequence (skip leading garbage)
                  matchedSamples.push(seq.slice(seq.length - spec.points, seq.length));
              } else if (seq.length === spec.points) {
                  matchedSamples.push(seq);
              }
          }
          
          if (matchedSamples.length > 0) {
              const bSampleIds = extractSampleIdsFromBuffer(buffer, matchedSamples.length);
              return {
                  wavelengths: Array.from({length: spec.points}, (_, i) => spec.start + i * spec.step),
                  samples: matchedSamples,
                  sampleIds: bSampleIds.length > 0 ? bSampleIds : undefined
              };
          }
      }
      
      // 2. Fallback absoluto: el bloque más largo
      let maxSeq = sequences.reduce((prev, current) => (prev.length > current.length) ? prev : current, []);
      
      // Recortar ceros al inicio del fallback también
      let startIdx = 0;
      while (startIdx < maxSeq.length && Math.abs(maxSeq[startIdx]) < 1e-4) {
          startIdx++;
      }
      maxSeq = maxSeq.slice(startIdx);

      if (maxSeq.length > 200 && maxSeq.length < 5000) {
          let start = 400;
          let end = 2500;
          if (maxSeq.length === 3300) { start = 850; end = 2499.5; }
          else if (maxSeq.length === 3301) { start = 850; end = 2500; }
          else if (maxSeq.length === 3401) { start = 800; end = 2500; }
          else if (maxSeq.length === 3400) { start = 800; end = 2499.5; }
          else if (maxSeq.length === 851) { start = 800; end = 2500; }
          else if (maxSeq.length === 850) { start = 800; end = 2498; }
          else if (maxSeq.length === 1701) { start = 800; end = 2500; }
          else if (maxSeq.length === 826) { start = 850; end = 2500; }
          else if (maxSeq.length === 825) { start = 850; end = 2498; }
          else if (maxSeq.length === 701) { start = 1100; end = 2500; }
          else if (maxSeq.length === 700) { start = 1100; end = 2498; }
          else if (maxSeq.length === 1051) { start = 400; end = 2500; }
          else if (maxSeq.length === 1026) { start = 450; end = 2500; }
          else if (maxSeq.length >= 3290 && maxSeq.length <= 3310) { start = 850; end = 2499.5; }
          else if (maxSeq.length >= 3390 && maxSeq.length <= 3415) { start = 800; end = 2500; }
          
          let step = (end - start) / (maxSeq.length - 1);
          const bSampleIds = extractSampleIdsFromBuffer(buffer, 1);
          return {
              wavelengths: Array.from({length: maxSeq.length}, (_, i) => start + i * step),
              samples: [maxSeq],
              sampleIds: bSampleIds.length > 0 ? bSampleIds : undefined
          };
      }
    }
  }
  
  return null;
};

export const parseFOSS = (
  buffer: ArrayBuffer,
  onComplete: (data: { wavelengths: number[]; samples: any[]; analyticalProperty: string } | null) => void,
  fileName: string
) => {
  const textDecoder = new TextDecoder('utf-8');
  const text = textDecoder.decode(buffer);
  
  let result = null;
  // Check if it's an ASCII export (like from Mosaic, WinISI or FOSS text export)
  if (text.includes('File Name:') || text.includes('Position') || text.includes('Sample Number') || text.includes('Segment') || text.includes('FOSS') || text.includes('foss')) {
      result = parseFossNirText(text);
  }

  if (!result && !text.includes('\0\0\0')) {
      // If it looks like plain text with multiple lines and numbers, try text parsing
      result = parseFossNirText(text);
  }
  
  if (!result) {
      result = parseFossNirBinary(buffer);
  }

  if (result && result.samples.length > 0) {
    let fallbackIds: string[] = [];
    if (!result.sampleIds || result.sampleIds.length === 0 || result.sampleIds.every(id => !id)) {
        fallbackIds = extractSampleIdsFromText(text);
        if (fallbackIds.length === 0) {
            fallbackIds = extractSampleIdsFromBuffer(buffer, result.samples.length);
        }
    }

    const formattedSamples = result.samples.map((absorbanceValues, index) => {
        let sampleId: string = '';
        const parsedId = result.sampleIds && result.sampleIds[index] ? result.sampleIds[index].trim() : '';
        const fallbackId = fallbackIds && fallbackIds[index] ? fallbackIds[index].trim() : '';

        if (parsedId) {
            sampleId = parsedId;
        } else if (fallbackId) {
            sampleId = fallbackId;
        } else if (result.samples.length > 1) {
            sampleId = `${fileName.replace(/\.nir$/i, '')} - Muestra ${index + 1}`;
        } else {
            sampleId = fileName.replace(/\.nir$/i, '');
        }

        return {
            id: sampleId,
            values: absorbanceValues,
            analyticalValue: 0,
            active: true,
            color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
        };
    });

    onComplete({
      wavelengths: result.wavelengths,
      samples: formattedSamples,
      analyticalProperty: 'Propiedad'
    });
  } else {
    onComplete(null);
  }
};
