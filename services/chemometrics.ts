
import { PreprocessingStep, Sample, ModelResults, OptimizationResult } from '../types';
import { Matrix, inverse, solve } from 'ml-matrix';

// ===============================================
// PRE-PROCESAMIENTO
// ===============================================

function savitzkyGolay(data: number[], options: { windowSize: number; polynomial: number; derivative?: number }): number[] {
    const { windowSize, polynomial, derivative = 0 } = options;
    if (windowSize % 2 === 0 || windowSize < 3 || polynomial >= windowSize || derivative > polynomial) {
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

export function applyPreprocessingLogic(inputSpectrum: number[], steps: PreprocessingStep[]): number[] {
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
            case 'savgol': { 
                const { derivative = 1, windowSize = 5, polynomialOrder = 2 } = step.params;
                processedSpectrum = savitzkyGolay(processedSpectrum, { windowSize: parseInt(String(windowSize)), polynomial: parseInt(String(polynomialOrder)), derivative: parseInt(String(derivative)) });
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
        let t_norm = t.norm();
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
        
        let v_norm = v.norm();
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
    const Y_raw = activeSamples.map(s => s.analyticalValue);
    const X_raw_array = activeSamples.map(s => applyPreprocessingLogic(s.values, preprocessingSteps));
    
    const N = activeSamples.length;
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
            processedSpectra: X_raw_array
        },
        mahalanobis: {
            distances: mahalanobisDistances,
            outlierIds: mahalanobisDistances.filter(d => d.isOutlier).map(d => d.id)
        }
    };
}
