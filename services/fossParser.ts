export const parseFossNirBinary = (buffer: ArrayBuffer): { wavelengths: number[], samples: number[][] } | null => {
  const view = new DataView(buffer);
  
  // Posibles configuraciones de espectro FOSS (Longitud de onda inicial, cantidad de puntos, step)
  const commonSpecs = [
    { points: 825, start: 850, step: 2 },    // 850 - 2498 nm (FOSS NIRS DS3 F / Optimo)
    { points: 826, start: 850, step: 2 },    // 850 - 2500 nm 
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

      // 1. Buscamos primero múltiplos EXACTOS de las configuraciones conocidas
      for (const spec of commonSpecs) {
          let matchedSamples: number[][] = [];
          let allExact = true;
          
          for (const seq of sequences) {
              if (seq.length % spec.points === 0) {
                  const numSamples = seq.length / spec.points;
                  for (let i = 0; i < numSamples; i++) {
                      matchedSamples.push(seq.slice(i * spec.points, (i + 1) * spec.points));
                  }
              } else {
                  allExact = false;
                  break;
              }
          }
          
          if (allExact && matchedSamples.length > 0) {
              return {
                  wavelengths: Array.from({length: spec.points}, (_, i) => spec.start + i * spec.step),
                  samples: matchedSamples
              };
          }
      }
      
      // 2. Si no hay múltiplos exactos, intentamos ver si una secuencia contiene muestras + algo de padding
      for (const spec of commonSpecs) {
          let matchedSamples: number[][] = [];
          
          for (const seq of sequences) {
              if (seq.length >= spec.points) {
                  const numSamples = Math.floor(seq.length / spec.points);
                  for (let i = 0; i < numSamples; i++) {
                      matchedSamples.push(seq.slice(i * spec.points, (i + 1) * spec.points));
                  }
              }
          }
          
          if (matchedSamples.length > 0) {
              return {
                  wavelengths: Array.from({length: spec.points}, (_, i) => spec.start + i * spec.step),
                  samples: matchedSamples
              };
          }
      }
      
      // 3. Fallback absoluto: el bloque más largo
      let maxSeq = sequences.reduce((prev, current) => (prev.length > current.length) ? prev : current, []);
      if (maxSeq.length > 200 && maxSeq.length < 5000) {
          let start = 400;
          let end = 2500;
          if (maxSeq.length === 826) { start = 850; end = 2500; }
          else if (maxSeq.length === 825) { start = 850; end = 2498; }
          else if (maxSeq.length === 701) { start = 1100; end = 2500; }
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
  const result = parseFossNirBinary(buffer);

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
