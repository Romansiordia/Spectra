export interface Sample {
    id: string | number;
    values: number[];
    color: string;
    active: boolean;
    analyticalValue: number;
}

export interface PreprocessingStep {
    method: 'none' | 'savgol' | 'snv' | 'msc' | 'detrend';
    params: { [key: string]: any };
}

export interface PcaResult {
    id: string | number;
    x: number;
    y: number;
    color: string;
}

export interface OptimizationResult {
    components: number;
    sec: number;
    secv: number;
}

export interface ModelResults {
    modelType: 'PLS';
    nComponents: number;
    model: {
        r: number; // Correlación
        r2: number; // Coeficiente de determinación
        sec: number; // Standard Error of Calibration
        secv: number; // Standard Error of Cross Validation
        slope: number;
        offset: number; // Intercepto/Bias
        correlation: {
            actual: number[];
            predicted: number[];
            predictedCV: number[]; // Predicciones de Validación Cruzada
        };
        residuals: {
            id: string | number;
            actual: number;
            predicted: number;
            residual: number;
        }[];
        coefficients: number[]; // Coeficientes de regresión (Beta)
        processedSpectra: number[][];
    };
    mahalanobis: {
        distances: {
            id: string | number;
            distance: number;
            isOutlier: boolean;
        }[];
        outlierIds: (string | number)[];
    };
}