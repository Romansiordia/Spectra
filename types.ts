export interface Sample {
    id: string | number;
    values: number[];
    color: string;
    active: boolean;
    analyticalValue: number;
    material?: string;
    provider?: string;
    client?: string;
}

export interface PreprocessingStep {
    method: 'none' | 'savgol' | 'savgol1' | 'savgol2' | 'savgolsmooth' | 'snv' | 'msc' | 'detrend';
    params: { [key: string]: any };
}

export interface PcaScorePoint {
    id: string | number;
    pc1: number;
    pc2: number;
    pc3?: number;
    gh: number; // Distancia de Mahalanobis en espacio de scores (Global H)
    hotellingT2: number; // T^2 de Hotelling
    qResidual: number; // Residual espectral Q (distancia al modelo)
    isOutlier: boolean; // GH > 3.0 o T^2 > 99%
    outlierReason?: string;
    active: boolean; // Si está incluida en la calibración
    color: string;
    analyticalValue?: number;
}

export interface PcaAnalysisModel {
    scores: PcaScorePoint[];
    varianceExplained: number[]; // % Varianza por PC (PC1, PC2, PC3...)
    cumulativeVariance: number[];
    t2Limit95: number;
    t2Limit99: number;
    qLimit95: number;
    qLimit99: number;
    outlierCount: number;
    totalCount: number;
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
        q2: number; // Coeficiente de predicción (Q-cuadrado)
        sec: number; // Standard Error of Calibration
        secv: number; // Standard Error of Cross Validation
        slope: number;
        offset: number; // Intercepto/Bias de la regresión Y vs Y_pred
        plsIntercept: number; // Intercepto de la ecuación PLS (B0)
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
            gh: number;
        }[];
        coefficients: number[]; // Coeficientes de regresión (Beta)
        processedSpectra: number[][];
        referenceSpectrum?: number[]; // Para MSC
        // Metadata para Mahalanobis (GH) en predicción
        xMean?: number[];
        W?: number[][];
        T_inv_var?: number[];
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

export interface IngredientLibrary {
    id: string;
    name: string;
    samples: {
        id: string | number;
        values: number[];
    }[];
    averageSpectrum: number[];
    stdDevSpectrum: number[];
    rawAverageSpectrum?: number[];
    threshold: number; // Umbral de distancia para "Conformidad"
}

export interface ClassificationResult {
    ingredientId: string;
    ingredientName: string;
    confidence: number;
    distance: number;
    isConforming: boolean;
    details: {
        meanDistance: number;
        threshold: number;
    };
}
