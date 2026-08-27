export const parseFossNirText = (text: string): { wavelengths: number[], samples: number[][] } | null => {
    const lines = text.split(/\r?\n/);
    const samples: number[][] = [];
    
    // Posibles configuraciones de espectro FOSS (Longitud de onda inicial, cantidad de puntos, step)
    const commonSpecs = [
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

    let detectedSpec = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        let parts = line.split('\t');
        if (parts.length < 5) {
            parts = line.split(/\s+/);
        }
        
        const cleanParts = parts.map(p => p.replace(/"/g, '').trim().replace(',', '.'));
        
        // Extract all valid numbers from the end of the line
        let dataVals: number[] = [];
        for (let j = cleanParts.length - 1; j >= 0; j--) {
            const num = parseFloat(cleanParts[j]);
            if (!isNaN(num) && isFinite(num)) {
                dataVals.unshift(num);
            } else {
                break; // Stop at first non-number from the right
            }
        }
        
        if (dataVals.length > 50) {
            // It's a data row!
            samples.push(dataVals);
            if (!detectedSpec) {
                detectedSpec = commonSpecs.find(s => s.points === dataVals.length);
            }
        }
    }
    
    if (samples.length > 0) {
        const uniformLength = samples[0].length;
        const allUniform = samples.every(s => s.length === uniformLength);
        
        if (allUniform) {
            let spec = commonSpecs.find(s => s.points === uniformLength);
            
            if (spec) {
                return {
                    wavelengths: Array.from({length: spec.points}, (_, i) => spec.start + i * spec.step),
                    samples: samples
                };
            } else if (uniformLength > 100 && uniformLength < 5000) {
                let start = 400;
                let end = 2500;
                let step = (end - start) / (uniformLength - 1);
                return {
                    wavelengths: Array.from({length: uniformLength}, (_, i) => start + i * step),
                    samples: samples
                };
            }
        }
    }
    
    return null;
}

export const parseFossNirBinary = (buffer: ArrayBuffer): { wavelengths: number[], samples: number[][] } | null => {
  const view = new DataView(buffer);
  
  // Posibles configuraciones de espectro FOSS (Longitud de onda inicial, cantidad de puntos, step)
  const commonSpecs = [
    { points: 851, start: 800, step: 2 },    // 800 - 2500 nm (2nm step)
    { points: 850, start: 800, step: 2 },    // 800 - 2498 nm (2nm step)
    { points: 3401, start: 800, step: 0.5 }, // 800 - 2500 nm (0.5nm step)
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
              return {
                  wavelengths: Array.from({length: spec.points}, (_, i) => spec.start + i * spec.step),
                  samples: matchedSamples
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
          if (maxSeq.length === 851) { start = 800; end = 2500; }
          else if (maxSeq.length === 850) { start = 800; end = 2498; }
          else if (maxSeq.length === 3401) { start = 800; end = 2500; }
          else if (maxSeq.length === 1701) { start = 800; end = 2500; }
          else if (maxSeq.length === 826) { start = 850; end = 2500; }
          else if (maxSeq.length === 825) { start = 850; end = 2498; }
          else if (maxSeq.length === 701) { start = 1100; end = 2500; }
          else if (maxSeq.length === 700) { start = 1100; end = 2498; }
          else if (maxSeq.length === 1051) { start = 400; end = 2500; }
          else if (maxSeq.length === 1026) { start = 450; end = 2500; }
          
          let step = (end - start) / (maxSeq.length - 1);
          return {
              wavelengths: Array.from({length: maxSeq.length}, (_, i) => start + i * step),
              samples: [maxSeq]
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
  // Check if it's an ASCII export (like from Mosaic)
  if (text.includes('File Name:') || text.includes('Position') || text.includes('Sample Number')) {
      result = parseFossNirText(text);
  }
  
  if (!result) {
      result = parseFossNirBinary(buffer);
  }

  if (result && result.samples.length > 0) {
    const formattedSamples = result.samples.map((absorbanceValues, index) => ({
        id: result.samples.length > 1 ? `${fileName.replace('.nir', '')} - Muestra ${index + 1}` : fileName,
        values: absorbanceValues,
        analyticalValue: 0,
        active: true,
        color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
    }));

    onComplete({
      wavelengths: result.wavelengths,
      samples: formattedSamples,
      analyticalProperty: 'Propiedad'
    });
  } else {
    onComplete(null);
  }
};
