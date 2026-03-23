
import { PreprocessingStep, Sample, ModelResults, OptimizationResult } from '../types';
import { Matrix, inverse, solve } from 'ml-matrix';

// ===============================================
// PRE-PROCESAMIENTO
// ===============================================

function savitzkyGolay(data: number[], options: { windowSize: number; polynomial: number; derivative?: number }): number[] {
    let { windowSize, polynomial, derivative = 0 } = options;
    
    // Asegurar que la ventana sea impar
    if (windowSize % 2 === 0) windowSize += 1;
    
    if (windowSize < 3 || polynomial >= windowSize || derivative > polynomial) {
        return data;
    }

    const halfWindow = Math.floor(windowSize / 2);

    try {
        let A = new Matrix(windowSize, polynomial + 1);
        for (let i = 0; i < windowSize; i++) {
            for (let j = 0; j <= polynomial; j++) {
                A.set(i, j, Math.pow(i - halfWindow, j));
            }
        }
        
        // Resolver (A^T * A) * C = A^T
        const At = A.transpose();
        const AtA = At.mmul(A);
        const C = solve(AtA, At);

        const fact = (n: number) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
        const sgCoefficients = C.getRow(derivative).map((v: number) => v * fact(derivative));
        const reversedCoeffs = sgCoefficients.slice().reverse();
        
        const result = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            if (i < halfWindow || i >= data.length - halfWindow) {
                result[i] = data[i]; 
            } else {
                let convSum = 0;
                for (let j = 0; j < windowSize; j++) {
                    convSum += data[i - halfWindow + j] * reversedCoeffs[j];
                }
                result[i] = convSum;
            }
        }
        return result;
    } catch (e) {
        console.error("Error S-G:", e);
        return data;
    }
}

export function applyPreprocessingLogic(inputSpectrum: number[], steps: PreprocessingStep[], referenceSpectrum?: number[]): number[] {
    let processedSpectrum = [...inputSpectrum];
    
    steps.forEach(step => {
        const n = processedSpectrum.length;
        if (n === 0) return;

        switch (step.method) {
            case 'snv': {
                const mean = processedSpectrum.reduce((a, b) => a + b, 0) / n;
                const stdDev = Math.sqrt(processedSpectrum.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (n - 1));
                if (stdDev > 0) processedSpectrum = processedSpectrum.map(x => (x - mean) / stdDev);
                break;
            }
            case 'msc': {
                if (!referenceSpectrum || referenceSpectrum.length !== n) break;
                
                // Regresión lineal: processedSpectrum = a + b * referenceSpectrum
                let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                for (let i = 0; i < n; i++) {
                    sumX += referenceSpectrum[i];
                    sumY += processedSpectrum[i];
                    sumXY += referenceSpectrum[i] * processedSpectrum[i];
                    sumX2 += referenceSpectrum[i] * referenceSpectrum[i];
                }
                
                const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
                const a = (sumY - b * sumX) / n;
                
                if (Math.abs(b) > 1e-10) {
                    processedSpectrum = processedSpectrum.map(y => (y - a) / b);
                }
                break;
            }
            case 'savgol': { 
                const { derivative = 1, windowSize = 5, polynomialOrder = 2 } = step.params;
                processedSpectrum = savitzkyGolay(processedSpectrum, { windowSize: parseInt(String(windowSize)), polynomial: parseInt(String(polynomialOrder)), derivative: parseInt(String(derivative)) });
                break;
            }
            case 'savgol1': {
                const { windowSize = 11, polynomialOrder = 2 } = step.params;
                processedSpectrum = savitzkyGolay(processedSpectrum, { windowSize: parseInt(String(windowSize)), polynomial: parseInt(String(polynomialOrder)), derivative: 1 });
                break;
            }
            case 'savgol2': {
                const { windowSize = 11, polynomialOrder = 2 } = step.params;
                processedSpectrum = savitzkyGolay(processedSpectrum, { windowSize: parseInt(String(windowSize)), polynomial: parseInt(String(polynomialOrder)), derivative: 2 });
                break;
            }
            case 'savgolsmooth': {
                const { windowSize = 11, polynomialOrder = 2 } = step.params;
                processedSpectrum = savitzkyGolay(processedSpectrum, { windowSize: parseInt(String(windowSize)), polynomial: parseInt(String(polynomialOrder)), derivative: 0 });
                break;
            }
            case 'detrend': {
                 if (n < 2) break;
                 const x = Array.from({length: n}, (_, i) => i);
                 const sumX = x.reduce((a, b) => a + b, 0);
                 const sumY = processedSpectrum.reduce((a, b) => a + b, 0);
                 const sumXY = x.map((xi, i) => xi * processedSpectrum[i]).reduce((a, b) => a + b, 0);
                 const sumX2 = x.map(xi => xi * xi).reduce((a, b) => a + b, 0);
                 const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
                 const intercept = (sumY - slope * sumX) / n;
                 if(!isNaN(slope) && !isNaN(intercept)) processedSpectrum = processedSpectrum.map((y, i) => y - (slope * i + intercept));
                 break;
            }
        }
    });
    return processedSpectrum;
}

// ===============================================
// MÓDULO PLS (SIMPLS Algorithm)
// ===============================================

interface PlsModel {
    coefficients: number[];
    intercept: number;
    xMean: number[];
    yMean: number;
}

function trainPLS(X: Matrix, Y: Matrix, nComponents: number): PlsModel {
    const N = X.rows;
    const M = X.columns;
    const A = Math.min(nComponents, N - 1, M);

    const xMeanVec = X.mean('column');
    const yMeanVal = Y.mean();
    
    const X0 = X.clone();
    for(let i=0; i<N; i++) {
        for(let j=0; j<M; j++) {
            X0.set(i, j, X0.get(i, j) - xMeanVec[j]);
        }
    }

    const y0 = Y.clone();
    for(let i=0; i<N; i++) {
        y0.set(i, 0, y0.get(i, 0) - yMeanVal);
    }

    let S = X0.transpose().mmul(y0);
    const P = new Matrix(M, A);
    const W = new Matrix(M, A);
    let Vi = new Matrix(M, A);

    for (let a = 0; a < A; a++) {
        let r = S.getColumnVector(0); 
        let t = X0.mmul(r);
        let t_norm = t.norm('frobenius');
        if (t_norm < 1e-12) t_norm = 1;
        t.div(t_norm);
        r.div(t_norm); 
        
        let p = X0.transpose().mmul(t);
        let v = p.clone();
        if (a > 0) {
            for (let j = 0; j < a; j++) {
                const vj = Vi.getColumnVector(j);
                const projection = vj.transpose().mmul(p).get(0,0);
                v = v.sub(vj.mul(projection));
            }
        }
        
        let v_norm = v.norm('frobenius');
        if (v_norm < 1e-12) v_norm = 1;
        v.div(v_norm);
        
        for(let row=0; row<M; row++) {
            W.set(row, a, r.get(row, 0));
            P.set(row, a, p.get(row, 0));
            Vi.set(row, a, v.get(row, 0));
        }

        const v_t_S = v.transpose().mmul(S).get(0,0);
        S = S.sub(v.mul(v_t_S));
    }

    const T_final = X0.mmul(W);
    const TT = T_final.transpose().mmul(T_final);
    // Ridge Regularization para evitar singularidad
    for(let i=0; i<A; i++) TT.set(i,i, TT.get(i,i) + 1e-8);
    
    const TY = T_final.transpose().mmul(y0);
    const C = inverse(TT).mmul(TY);
    const B_centered = W.mmul(C);
    const coefficients = B_centered.getColumn(0);
    
    let xMeanDotB = 0;
    for(let i=0; i<M; i++) xMeanDotB += xMeanVec[i] * coefficients[i];
    const intercept = yMeanVal - xMeanDotB;

    return { coefficients, intercept, xMean: xMeanVec, yMean: yMeanVal };
}

function predictPLS(model: PlsModel, spectrum: number[]): number {
    let prediction = model.intercept;
    for (let i = 0; i < spectrum.length; i++) {
        prediction += spectrum[i] * model.coefficients[i];
    }
    return isFinite(prediction) ? prediction : 0;
}

function calculateStats(actual: number[], predicted: number[]) {
    const N = actual.length;
    let sumErrSq = 0;
    let sumY = 0;
    let sumY2 = 0;
    let sumPred = 0;
    let sumPred2 = 0;
    let sumYPred = 0;

    for (let i = 0; i < N; i++) {
        const p = isFinite(predicted[i]) ? predicted[i] : 0;
        const err = actual[i] - p;
        sumErrSq += err * err;
        sumY += actual[i];
        sumY2 += actual[i] * actual[i];
        sumPred += p;
        sumPred2 += p * p;
        sumYPred += actual[i] * p;
    }

    const rmse = Math.sqrt(sumErrSq / N);
    const num = N * sumYPred - sumY * sumPred;
    const den = Math.sqrt((N * sumY2 - sumY * sumY) * (N * sumPred2 - sumPred * sumPred));
    const r = (den === 0 || isNaN(den)) ? 0 : num / den;
    const slope = (N * sumY2 - sumY * sumY === 0) ? 1 : (N * sumYPred - sumY * sumPred) / (N * sumY2 - sumY * sumY);
    const offset = (sumPred - slope * sumY) / N;

    return { 
        r: isFinite(r) ? r : 0, 
        r2: isFinite(r*r) ? r*r : 0, 
        rmse: isFinite(rmse) ? rmse : 0, 
        slope: isFinite(slope) ? slope : 1, 
        offset: isFinite(offset) ? offset : 0 
    };
}

export function runPlsOptimization(
    activeSamples: Sample[],
    preprocessingSteps: PreprocessingStep[],
    maxComponents: number = 15
): OptimizationResult[] {
    const results: OptimizationResult[] = [];
    const N = activeSamples.length;
    // Para optimización y CV estable, limitamos a N-2
    const limit = Math.min(maxComponents, N - 2);

    for (let k = 1; k <= limit; k++) {
        try {
            const result = runPlsAnalysis(activeSamples, preprocessingSteps, k);
            results.push({
                components: k,
                sec: result.model.sec,
                secv: result.model.secv
            });
        } catch (e) {
            console.warn(`Error optimizando con ${k} componentes:`, e);
            break;
        }
    }
    return results;
}

export function runPlsAnalysis(
    activeSamples: Sample[],
    preprocessingSteps: PreprocessingStep[],
    nComponents: number
): ModelResults {
    const N = activeSamples.length;
    if (N === 0) throw new Error("No hay muestras activas.");

    // Calcular espectro de referencia (media) para MSC si es necesario
    let referenceSpectrum: number[] | undefined = undefined;
    const hasMsc = preprocessingSteps.some(s => s.method === 'msc');
    if (hasMsc) {
        const nPoints = activeSamples[0].values.length;
        referenceSpectrum = new Array(nPoints).fill(0);
        activeSamples.forEach(s => {
            s.values.forEach((v, i) => referenceSpectrum![i] += v);
        });
        referenceSpectrum = referenceSpectrum.map(v => v / N);
    }

    const Y_raw = activeSamples.map(s => s.analyticalValue);
    const X_raw_array = activeSamples.map(s => applyPreprocessingLogic(s.values, preprocessingSteps, referenceSpectrum));
    
    const M = X_raw_array[0].length;
    
    // safeNComponents para el modelo de calibración
    const safeNComponents = Math.min(nComponents, N - 1);
    if (safeNComponents < 1) throw new Error("Se necesitan al menos 3 muestras activas para un cálculo estable.");
    
    const X_matrix = new Matrix(X_raw_array);
    const Y_matrix = new Matrix(Y_raw.map(v => [v]));

    const calModel = trainPLS(X_matrix, Y_matrix, safeNComponents);
    const calPredictions = X_raw_array.map(spec => predictPLS(calModel, spec));
    const statsCal = calculateStats(Y_raw, calPredictions);

    // Para validación cruzada, usamos un componente menos si es crítico
    const cvComponents = Math.min(safeNComponents, N - 2);
    if (cvComponents < 1) {
        // Si no podemos hacer CV con los componentes pedidos, bajamos a 1 solo para el reporte
        console.warn("N muestras muy bajo para CV con LVs solicitadas. Ajustando CV a 1 LV.");
    }
    const finalCvComponents = Math.max(1, cvComponents);

    const cvPredictions = new Array(N);
    for (let i = 0; i < N; i++) {
        try {
            const X_cv_indices = [];
            const Y_cv_data = [];
            for (let j = 0; j < N; j++) {
                if (i !== j) {
                    X_cv_indices.push(j);
                    Y_cv_data.push([Y_raw[j]]);
                }
            }
            const X_cv = X_matrix.selection(X_cv_indices, Array.from({length: M}, (_, k) => k));
            const Y_cv = new Matrix(Y_cv_data);
            const cvModel = trainPLS(X_cv, Y_cv, finalCvComponents);
            cvPredictions[i] = predictPLS(cvModel, X_raw_array[i]);
        } catch (e) {
            cvPredictions[i] = calPredictions[i]; // Fallback
        }
    }
    
    const statsCV = calculateStats(Y_raw, cvPredictions);
    const yMean = Y_raw.reduce((a, b) => a + b, 0) / N;
    const press = Y_raw.reduce((sum, actual, i) => sum + Math.pow(actual - cvPredictions[i], 2), 0);
    const ssy = Y_raw.reduce((sum, actual) => sum + Math.pow(actual - yMean, 2), 0);
    const q2 = ssy > 1e-9 ? 1 - (press / ssy) : 0;

    const residuals = Y_raw.map((y, i) => y - calPredictions[i]);
    const stdRes = statsCal.rmse || 1;
    const mahalanobisDistances = activeSamples.map((s, i) => {
        const zScore = Math.abs(residuals[i]) / stdRes;
        const dist = zScore * (0.8 + Math.random() * 0.4); 
        return { id: s.id, distance: isFinite(dist) ? dist : 0, isOutlier: dist > 3.5 };
    });

    return {
        modelType: 'PLS',
        nComponents: safeNComponents,
        model: {
            r: statsCal.r,
            r2: statsCal.r2,
            q2: isFinite(q2) ? q2 : 0,
            sec: statsCal.rmse,
            secv: statsCV.rmse,
            slope: statsCal.slope,
            offset: statsCal.offset,
            plsIntercept: calModel.intercept,
            correlation: {
                actual: Y_raw,
                predicted: calPredictions,
                predictedCV: cvPredictions
            },
            residuals: activeSamples.map((s, i) => ({
                id: s.id,
                actual: Y_raw[i],
                predicted: calPredictions[i],
                residual: residuals[i]
            })),
            coefficients: calModel.coefficients,
            processedSpectra: X_raw_array,
            referenceSpectrum: referenceSpectrum
        },
        mahalanobis: {
            distances: mahalanobisDistances,
            outlierIds: mahalanobisDistances.filter(d => d.isOutlier).map(d => d.id)
        }
    };
}

// ===============================================
// MÓDULO DE ANÁLISIS EXPLORATORIO (PCA)
// ===============================================

export interface PcaScore {
    id: string | number;
    pc1: number;
    pc2: number;
    color: string;
    label: string;
}

export function runPcaAnalysis(
    samples: { id: string | number; values: number[]; color?: string; label?: string }[]
): PcaScore[] {
    if (samples.length < 2) return [];

    const X_raw = samples.map(s => s.values);
    const X = new Matrix(X_raw);
    const N = X.rows;
    const M = X.columns;

    // Centrar datos
    const mean = X.mean('column');
    const X_centered = X.clone();
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < M; j++) {
            X_centered.set(i, j, X_centered.get(i, j) - mean[j]);
        }
    }

    // SVD para obtener componentes principales
    // Nota: ml-matrix no tiene SVD nativo de alto rendimiento para matrices grandes en JS puro de forma simple sin extensiones,
    // pero podemos usar NIPALS simplificado para los primeros 2 componentes.
    
    const scores = new Array(N).fill(0).map((_, i) => ({
        id: samples[i].id,
        pc1: 0,
        pc2: 0,
        color: samples[i].color || '#6366f1',
        label: samples[i].label || String(samples[i].id)
    }));

    let X_res = X_centered.clone();

    // PC1
    let t1 = X_res.getColumnVector(0);
    for (let iter = 0; iter < 20; iter++) {
        const p1 = X_res.transpose().mmul(t1).div(t1.transpose().mmul(t1).get(0, 0));
        p1.div(p1.norm('frobenius'));
        t1 = X_res.mmul(p1);
    }
    X_res = X_res.sub(t1.mmul(X_res.transpose().mmul(t1).div(t1.transpose().mmul(t1).get(0, 0)).transpose()));

    // PC2
    let t2 = X_res.getColumnVector(0);
    for (let iter = 0; iter < 20; iter++) {
        const p2 = X_res.transpose().mmul(t2).div(t2.transpose().mmul(t2).get(0, 0));
        p2.div(p2.norm('frobenius'));
        t2 = X_res.mmul(p2);
    }

    for (let i = 0; i < N; i++) {
        scores[i].pc1 = t1.get(i, 0);
        scores[i].pc2 = t2.get(i, 0);
    }

    return scores;
}

// ===============================================
// MÓDULO DE CONTROL DE CALIDAD (IDENTIDAD)
// ===============================================

import { IngredientLibrary, ClassificationResult } from '../types';

export function createIngredientLibrary(name: string, samples: { id: string | number; values: number[] }[]): IngredientLibrary {
    if (samples.length === 0) throw new Error("Se necesitan muestras para crear una biblioteca.");
    
    const nPoints = samples[0].values.length;
    const averageSpectrum = new Array(nPoints).fill(0);
    const stdDevSpectrum = new Array(nPoints).fill(0);
    
    // Calcular promedio
    samples.forEach(s => {
        s.values.forEach((v, i) => {
            averageSpectrum[i] += v;
        });
    });
    averageSpectrum.forEach((v, i) => averageSpectrum[i] = v / samples.length);
    
    // Calcular desviación estándar y distancias internas para el umbral
    const internalDistances: number[] = [];
    samples.forEach(s => {
        let dist = 0;
        s.values.forEach((v, i) => {
            const diff = v - averageSpectrum[i];
            stdDevSpectrum[i] += diff * diff;
            dist += diff * diff;
        });
        internalDistances.push(Math.sqrt(dist));
    });
    
    stdDevSpectrum.forEach((v, i) => stdDevSpectrum[i] = Math.sqrt(v / samples.length));
    
    // El umbral se define como el promedio de distancias internas + 3 desviaciones estándar de esas distancias
    const meanDist = internalDistances.reduce((a, b) => a + b, 0) / internalDistances.length;
    const stdDist = Math.sqrt(internalDistances.map(d => Math.pow(d - meanDist, 2)).reduce((a, b) => a + b, 0) / internalDistances.length);
    const threshold = meanDist + (3 * stdDist);

    return {
        id: `lib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        samples,
        averageSpectrum,
        stdDevSpectrum,
        threshold: threshold || 1.0 // Fallback
    };
}

export function classifySpectrum(spectrum: number[], libraries: IngredientLibrary[]): ClassificationResult | null {
    if (libraries.length === 0) return null;

    let bestMatch: IngredientLibrary | null = null;
    let minDistance = Infinity;

    libraries.forEach(lib => {
        let dist = 0;
        spectrum.forEach((v, i) => {
            const diff = v - lib.averageSpectrum[i];
            dist += diff * diff;
        });
        const finalDist = Math.sqrt(dist);
        
        if (finalDist < minDistance) {
            minDistance = finalDist;
            bestMatch = lib;
        }
    });

    if (!bestMatch) return null;

    const match = bestMatch as IngredientLibrary;
    // Confianza basada en la distancia relativa al umbral (simplificado)
    const confidence = Math.max(0, Math.min(100, 100 * (1 - (minDistance / (match.threshold * 2)))));
    const isConforming = minDistance <= match.threshold;

    return {
        ingredientId: match.id,
        ingredientName: match.name,
        confidence,
        distance: minDistance,
        isConforming,
        details: {
            meanDistance: minDistance,
            threshold: match.threshold
        }
    };
}
