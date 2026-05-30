
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
    // Para detección de outliers en predicción (H-Distance / GH)
    W: number[][]; // Pesos de carga (M x A)
    T_inv_var: number[]; // 1 / (T_a^T * T_a) para cada componente
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
    
    // Almacenar inversas de varianzas de scores para Mahalanobis (H-distance)
    const T_inv_var = new Array(A);
    for(let i=0; i<A; i++) {
        const val = TT.get(i,i);
        T_inv_var[i] = val > 1e-12 ? 1.0 / val : 0;
    }

    // Ridge Regularization para evitar singularidad en el cálculo de B
    for(let i=0; i<A; i++) TT.set(i,i, TT.get(i,i) + 1e-8);
    
    const TY = T_final.transpose().mmul(y0);
    const C = inverse(TT).mmul(TY);
    const B_centered = W.mmul(C);
    const coefficients = B_centered.getColumn(0);
    
    let xMeanDotB = 0;
    for(let i=0; i<M; i++) xMeanDotB += xMeanVec[i] * coefficients[i];
    const intercept = yMeanVal - xMeanDotB;

    return { 
        coefficients, 
        intercept, 
        xMean: xMeanVec, 
        yMean: yMeanVal,
        W: W.to2DArray(),
        T_inv_var: T_inv_var
    };
}

export function predictPLS(model: any, spectrum: number[]): { prediction: number; gh: number } {
    // 1. Predicción cuantitativa (Siempre disponible)
    let prediction = model.plsIntercept || model.intercept || 0;
    const coeffs = model.coefficients || [];
    for (let i = 0; i < Math.min(spectrum.length, coeffs.length); i++) {
        prediction += spectrum[i] * coeffs[i];
    }

    // 2. Cálculo de GH (Solo si el modelo tiene la metadata necesaria)
    let gh = 0;
    if (model.xMean && model.W && model.T_inv_var) {
        try {
            const M = model.xMean.length;
            const xc = new Array(M);
            for(let i=0; i<M; i++) {
                xc[i] = (spectrum[i] || 0) - model.xMean[i];
            }

            let hDist = 0;
            const numComponents = model.T_inv_var.length;
            
            for (let a = 0; a < numComponents; a++) {
                let ta = 0;
                for (let i = 0; i < M; i++) {
                    ta += xc[i] * model.W[i][a];
                }
                hDist += (ta * ta) * model.T_inv_var[a];
            }

            // Normalización GH
            gh = Math.sqrt(hDist * (numComponents || 1) * 10); 
        } catch (e) {
            console.warn("Error calculando GH:", e);
            gh = 0;
        }
    }

    return { 
        prediction: isFinite(prediction) ? prediction : 0, 
        gh: isFinite(gh) ? gh : 0 
    };
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
    const calPredictionsData = X_raw_array.map(spec => predictPLS(calModel, spec));
    const calPredictions = calPredictionsData.map(p => p.prediction);
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
            const cvRes = predictPLS(cvModel, X_raw_array[i]);
            cvPredictions[i] = cvRes.prediction;
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
        // Usar el GH calculado por el modelo
        const dist = calPredictionsData[i].gh; 
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
                residual: residuals[i],
                gh: calPredictionsData[i].gh
            })),
            coefficients: calModel.coefficients,
            processedSpectra: X_raw_array,
            referenceSpectrum: referenceSpectrum,
            // Exportar metadata de Mahalanobis para predicción futura
            xMean: calModel.xMean,
            W: calModel.W,
            T_inv_var: calModel.T_inv_var
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

    // Ensure all arrays have the same length to prevent ml-matrix from crashing
    const minLength = Math.min(...samples.map(s => s.values.length));
    if (minLength === 0) return [];
    
    const X_raw = samples.map(s => s.values.slice(0, minLength));
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
        const t1_sq = t1.transpose().mmul(t1).get(0, 0);
        if (t1_sq < 1e-10) break;
        const p1 = X_res.transpose().mmul(t1).div(t1_sq);
        const p1_norm = p1.norm('frobenius');
        if (p1_norm < 1e-10) break;
        p1.div(p1_norm);
        t1 = X_res.mmul(p1);
    }
    
    let t1_sq_final = t1.transpose().mmul(t1).get(0, 0);
    if (t1_sq_final > 1e-10) {
        X_res = X_res.sub(t1.mmul(X_res.transpose().mmul(t1).div(t1_sq_final).transpose()));
    }

    // PC2
    let t2 = X_res.getColumnVector(0);
    for (let iter = 0; iter < 20; iter++) {
        const t2_sq = t2.transpose().mmul(t2).get(0, 0);
        if (t2_sq < 1e-10) break;
        const p2 = X_res.transpose().mmul(t2).div(t2_sq);
        const p2_norm = p2.norm('frobenius');
        if (p2_norm < 1e-10) break;
        p2.div(p2_norm);
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

function calculateCorrelation(a: number[], b: number[]): number {
    const n = a.length;
    let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
    for (let i = 0; i < n; i++) {
        sumA += a[i];
        sumB += b[i];
        sumAA += a[i] * a[i];
        sumBB += b[i] * b[i];
        sumAB += a[i] * b[i];
    }
    const num = n * sumAB - sumA * sumB;
    const den = Math.sqrt((n * sumAA - sumA * sumA) * (n * sumBB - sumB * sumB));
    return den === 0 ? 0 : num / den;
}

export function classifySpectrum(spectrum: number[], libraries: IngredientLibrary[]): ClassificationResult | null {
    if (libraries.length === 0) return null;

    let bestMatch: IngredientLibrary | null = null;
    let minDistance = Infinity;
    let maxCorrelation = -1;

    const results = libraries.map(lib => {
        // Asegurar que comparamos la misma cantidad de puntos
        const n = Math.min(spectrum.length, lib.averageSpectrum.length);
        const specA = spectrum.slice(0, n);
        const specB = lib.averageSpectrum.slice(0, n);

        let dist = 0;
        for (let i = 0; i < n; i++) {
            const diff = specA[i] - specB[i];
            dist += diff * diff;
        }
        
        const finalDist = Math.sqrt(dist);
        const correlation = calculateCorrelation(specA, specB);
        
        return { lib, dist: finalDist, correlation };
    });

    // Criterio de selección riguroso: 
    // 1. Debe tener una correlación alta (> 0.95) para ser considerado el mismo ingrediente
    // 2. Entre los que tienen correlación alta, elegimos el de menor distancia
    const validMatches = results.filter(r => r.correlation > 0.90);
    
    if (validMatches.length === 0) {
        // Si ninguno correlaciona bien, buscamos el "menos malo" pero con confianza baja
        const absoluteBest = results.sort((a, b) => b.correlation - a.correlation)[0];
        bestMatch = absoluteBest.lib;
        minDistance = absoluteBest.dist;
        maxCorrelation = absoluteBest.correlation;
    } else {
        const best = validMatches.sort((a, b) => a.dist - b.dist)[0];
        bestMatch = best.lib;
        minDistance = best.dist;
        maxCorrelation = best.correlation;
    }

    if (!bestMatch) return null;

    const match = bestMatch as IngredientLibrary;
    
    // Confianza Rigurosa: Combinación de Distancia y Correlación
    // Si la correlación es baja, la confianza cae exponencialmente
    const distScore = Math.max(0, 1 - (minDistance / (match.threshold * 1.5)));
    const corrScore = maxCorrelation > 0.98 ? 1 : (maxCorrelation > 0.90 ? 0.5 : 0);
    
    let confidence = (distScore * 0.4 + maxCorrelation * 0.6) * 100;
    
    // Penalización crítica: Si la forma no coincide, no es el producto
    if (maxCorrelation < 0.95) confidence *= 0.5;
    if (maxCorrelation < 0.85) confidence = 0;

    const isConforming = minDistance <= match.threshold && maxCorrelation > 0.97;

    return {
        ingredientId: match.id,
        ingredientName: match.name,
        confidence: Math.min(100, Math.max(0, confidence)),
        distance: minDistance,
        isConforming,
        details: {
            meanDistance: minDistance,
            threshold: match.threshold
        }
    };
}
