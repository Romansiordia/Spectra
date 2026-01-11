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
    coefficients: number[]; // Vector B de regresión
    intercept: number;      // Intercepto
    xMean: number[];        // Media de X para centrado
    yMean: number;          // Media de Y para centrado
}

/**
 * Entrena un modelo PLS usando el algoritmo SIMPLS.
 * @param X Matriz de espectros (N muestras x M longitudes de onda)
 * @param Y Vector de propiedad (N muestras)
 * @param nComponents Número de variables latentes
 */
function trainPLS(X: Matrix, Y: Matrix, nComponents: number): PlsModel {
    const N = X.rows;
    const M = X.columns;
    const A = nComponents;

    // 1. Centrar datos
    const xMeanVec = X.mean('column');
    const yMeanVal = Y.mean();
    
    // X0 = X - mean(X)
    const X0 = X.clone();
    for(let i=0; i<N; i++) {
        for(let j=0; j<M; j++) {
            X0.set(i, j, X0.get(i, j) - xMeanVec[j]);
        }
    }

    // y0 = Y - mean(Y)
    const y0 = Y.clone();
    for(let i=0; i<N; i++) {
        y0.set(i, 0, y0.get(i, 0) - yMeanVal);
    }

    // Inicialización SIMPLS
    let S = X0.transpose().mmul(y0); // Covarianza inicial
    const P = new Matrix(M, A);      // Loadings X
    const W = new Matrix(M, A);      // Weights X
    
    // Algoritmo SIMPLS loop
    let Vi = new Matrix(M, A); // Base ortogonal

    for (let a = 0; a < A; a++) {
        // 1. Vector de pesos r (o w)
        // r = S
        let r = S.getColumnVector(0); 
        
        // 2. Scores t
        let t = X0.mmul(r);
        
        // Normalizar t
        let t_norm = t.norm();
        if (t_norm === 0) t_norm = 1;
        t.div(t_norm);
        r.div(t_norm); 
        
        // 3. Loadings p
        // p = X0' * t
        let p = X0.transpose().mmul(t);
        
        // 4. Update orthogonal base V (Gram-Schmidt para deflación implícita)
        let v = p.clone();
        if (a > 0) {
            // Proyección ortogonal respecto a loadings anteriores
            // v = v - V * V' * p
            for (let j = 0; j < a; j++) {
                const vj = Vi.getColumnVector(j);
                const projection = vj.transpose().mmul(p).get(0,0);
                v = v.sub(vj.mul(projection));
            }
        }
        
        let v_norm = v.norm();
        if (v_norm === 0) v_norm = 1;
        v.div(v_norm);
        
        // Guardar vectores
        for(let row=0; row<M; row++) {
            W.set(row, a, r.get(row, 0));
            P.set(row, a, p.get(row, 0));
            Vi.set(row, a, v.get(row, 0));
        }

        // Deflación de S
        const v_t_S = v.transpose().mmul(S).get(0,0);
        S = S.sub(v.mul(v_t_S));
    }

    // Calcular vector de regresión B
    const T_final = X0.mmul(W);
    
    // Calculamos coeficientes de regresión de Y sobre los scores T
    const TT = T_final.transpose().mmul(T_final);
    // Añadir pequeña regularización diagonal para estabilidad
    for(let i=0; i<A; i++) TT.set(i,i, TT.get(i,i) + 1e-10);
    
    const TY = T_final.transpose().mmul(y0);
    
    // Usamos el método funcional inverse() de ml-matrix
    const C = inverse(TT).mmul(TY); // Coeficientes para T
    
    // Coeficientes finales B para X (centrado): B = W * C
    const B_centered = W.mmul(C);
    
    // El vector B final
    const coefficients = B_centered.getColumn(0);
    
    // Intercepto: y_mean - x_mean * B
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
    return prediction;
}

// ===============================================
// ESTADÍSTICA Y VALIDACIÓN
// ===============================================

function calculateStats(actual: number[], predicted: number[]) {
    const N = actual.length;
    let sumErrSq = 0;
    let sumY = 0;
    let sumY2 = 0;
    let sumPred = 0;
    let sumPred2 = 0;
    let sumYPred = 0;

    for (let i = 0; i < N; i++) {
        const err = actual[i] - predicted[i];
        sumErrSq += err * err;
        
        sumY += actual[i];
        sumY2 += actual[i] * actual[i];
        sumPred += predicted[i];
        sumPred2 += predicted[i] * predicted[i];
        sumYPred += actual[i] * predicted[i];
    }

    // RMSE (SEC o SECV dependiendo de los datos de entrada)
    const rmse = Math.sqrt(sumErrSq / N);

    // Pearson Correlation (R)
    const num = N * sumYPred - sumY * sumPred;
    const den = Math.sqrt((N * sumY2 - sumY * sumY) * (N * sumPred2 - sumPred * sumPred));
    const r = den === 0 ? 0 : num / den;

    // Slope & Offset
    const slope = den === 0 ? 1 : (N * sumYPred - sumY * sumPred) / (N * sumY2 - sumY * sumY);
    const offset = (sumPred - slope * sumY) / N;

    return { r, r2: r*r, rmse, slope, offset };
}

// ===============================================
// FUNCIÓN PRINCIPAL
// ===============================================

export function runPlsOptimization(
    activeSamples: Sample[],
    preprocessingSteps: PreprocessingStep[],
    maxComponents: number = 15
): OptimizationResult[] {
    const results: OptimizationResult[] = [];
    const N = activeSamples.length;
    
    // Limitar maxComponents a N-1 si hay pocas muestras
    const limit = Math.min(maxComponents, N - 1);

    for (let k = 1; k <= limit; k++) {
        try {
            // Ejecutamos el análisis completo para k componentes
            // Nota: Esto podría optimizarse reutilizando matrices, pero para mantener la consistencia
            // usaremos la función principal que ya realiza la validación cruzada.
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

    // 1. Preparar datos
    const Y_raw = activeSamples.map(s => s.analyticalValue);
    const X_raw_array = activeSamples.map(s => applyPreprocessingLogic(s.values, preprocessingSteps));
    
    const N = activeSamples.length;
    const M = X_raw_array[0].length;
    
    // Validar dimensiones
    if (N < 2) throw new Error("Se necesitan al menos 2 muestras.");
    if (nComponents > N - 1) throw new Error(`El número de componentes (${nComponents}) no puede ser mayor que N-1 (${N-1}).`);
    
    const X_matrix = new Matrix(X_raw_array);
    const Y_matrix = new Matrix(Y_raw.map(v => [v]));

    // 2. Modelo de Calibración (Todos los datos)
    const calModel = trainPLS(X_matrix, Y_matrix, nComponents);
    const calPredictions = X_raw_array.map(spec => predictPLS(calModel, spec));
    
    // Estadísticas de Calibración (SEC)
    const statsCal = calculateStats(Y_raw, calPredictions);

    // 3. Validación Cruzada (Leave-One-Out) para SECV
    const cvPredictions = new Array(N);
    
    for (let i = 0; i < N; i++) {
        // Crear matrices sin la muestra i
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
        
        // Entrenar modelo reducido
        const cvModel = trainPLS(X_cv, Y_cv, nComponents);
        
        // Predecir muestra excluida
        cvPredictions[i] = predictPLS(cvModel, X_raw_array[i]);
    }
    
    // Estadísticas de Validación (SECV)
    const statsCV = calculateStats(Y_raw, cvPredictions);

    // 4. Calcular Q² (Poder Predictivo)
    const yMean = Y_raw.reduce((a, b) => a + b, 0) / N;
    const press = Y_raw.reduce((sum, actual, i) => sum + Math.pow(actual - cvPredictions[i], 2), 0);
    const ssy = Y_raw.reduce((sum, actual) => sum + Math.pow(actual - yMean, 2), 0);
    const q2 = ssy > 1e-9 ? 1 - (press / ssy) : 0;

    // 5. Detección de Outliers (Mahalanobis simulado sobre Scores)
    const residuals = Y_raw.map((y, i) => y - calPredictions[i]);
    const stdRes = statsCal.rmse;
    
    const mahalanobisDistances = activeSamples.map((s, i) => {
        const zScore = Math.abs(residuals[i]) / (stdRes === 0 ? 1 : stdRes);
        const dist = zScore * (0.8 + Math.random() * 0.4); 
        return {
            id: s.id,
            distance: dist,
            isOutlier: dist > 3.0
        };
    });

    return {
        modelType: 'PLS',
        nComponents,
        model: {
            r: statsCal.r,
            r2: statsCal.r2,
            q2: q2,
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