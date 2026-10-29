import { ModelResults, PreprocessingStep } from '../types';

export interface FossEqaOptions {
    productName?: string;
    constituentName: string;
    modelResults: ModelResults;
    wavelengths: number[];
    preprocessingSteps: PreprocessingStep[];
    sampleCount?: number;
}

export interface WinISIMathTreatment {
    mathCode: string;
    derivative: number;
    gap: number;
    smooth1: number;
    smooth2: number;
    scatter: string;
    scatterCode: number;
}

/**
 * Traduce la lista de pasos de preprocesamiento aplicados en la app
 * a los códigos de tratamiento matemático estándar de WinISI / FOSS (D, G, S1, S2 y Scatter).
 */
export function extractWinISIMathTreatment(steps: PreprocessingStep[]): WinISIMathTreatment {
    let derivative = 0;
    let gap = 0;
    let smooth1 = 1;
    let smooth2 = 1;
    let mathCode = '0,0,1,1';

    let hasSnv = false;
    let hasDetrend = false;
    let hasMsc = false;

    for (const step of steps) {
        if (step.method === 'winisi2441') {
            derivative = 2; gap = 4; smooth1 = 4; smooth2 = 1;
            mathCode = '2,4,4,1';
        } else if (step.method === 'winisi1441') {
            derivative = 1; gap = 4; smooth1 = 4; smooth2 = 1;
            mathCode = '1,4,4,1';
        } else if (step.method === 'winisi1881') {
            derivative = 1; gap = 8; smooth1 = 8; smooth2 = 1;
            mathCode = '1,8,8,1';
        } else if (step.method === 'winisi2861') {
            derivative = 2; gap = 8; smooth1 = 6; smooth2 = 1;
            mathCode = '2,8,6,1';
        } else if (step.method === 'winisi_custom') {
            derivative = Math.max(0, Math.min(2, Math.round(step.params?.derivative ?? 2)));
            gap = Math.max(1, Math.round(step.params?.gap ?? 4));
            smooth1 = Math.max(1, Math.round(step.params?.smooth1 ?? 4));
            smooth2 = Math.max(1, Math.round(step.params?.smooth2 ?? 1));
            mathCode = `${derivative},${gap},${smooth1},${smooth2}`;
        } else if (step.method === 'savgol1') {
            const w = step.params?.windowSize ?? 15;
            derivative = 1;
            gap = Math.max(1, Math.floor(w / 2));
            smooth1 = w;
            smooth2 = 1;
            mathCode = `${derivative},${gap},${smooth1},${smooth2}`;
        } else if (step.method === 'savgol2') {
            const w = step.params?.windowSize ?? 15;
            derivative = 2;
            gap = Math.max(1, Math.floor(w / 2));
            smooth1 = w;
            smooth2 = 1;
            mathCode = `${derivative},${gap},${smooth1},${smooth2}`;
        } else if (step.method === 'savgolsmooth') {
            const w = step.params?.windowSize ?? 9;
            derivative = 0;
            gap = 0;
            smooth1 = w;
            smooth2 = 1;
            mathCode = `0,0,${smooth1},1`;
        }

        if (step.method === 'snv') hasSnv = true;
        if (step.method === 'detrend') hasDetrend = true;
        if (step.method === 'msc') hasMsc = true;
    }

    let scatter = 'None';
    let scatterCode = 0;

    if (hasSnv && hasDetrend) {
        scatter = 'SNV & Detrend';
        scatterCode = 3;
    } else if (hasSnv) {
        scatter = 'SNV';
        scatterCode = 1;
    } else if (hasDetrend) {
        scatter = 'Detrend';
        scatterCode = 2;
    } else if (hasMsc) {
        scatter = 'MSC';
        scatterCode = 4;
    }

    return {
        mathCode,
        derivative,
        gap,
        smooth1,
        smooth2,
        scatter,
        scatterCode
    };
}

/**
 * Convierte el modelo PLS actual al formato EQA compatible con equipos e instrumentos FOSS
 * (WinISI II/III/4, ISIscan, FossManager, Infratec, NIRS DS2500, ProFoss).
 */
export function generateFossEqa(options: FossEqaOptions): string {
    const {
        productName = 'Producto_NIR',
        constituentName = 'Propiedad',
        modelResults,
        wavelengths,
        preprocessingSteps,
        sampleCount
    } = options;

    const math = extractWinISIMathTreatment(preprocessingSteps);

    const startWl = wavelengths.length > 0 ? wavelengths[0] : 1100;
    const endWl = wavelengths.length > 0 ? wavelengths[wavelengths.length - 1] : 2500;
    const numPoints = wavelengths.length;
    const stepWl = numPoints > 1 ? (endWl - startWl) / (numPoints - 1) : 2.0;

    // Métricas del modelo
    const r2 = isFinite(modelResults.model.r2) ? modelResults.model.r2 : 0;
    const q2 = isFinite(modelResults.model.q2) ? modelResults.model.q2 : 0;
    const sec = isFinite(modelResults.model.sec) ? modelResults.model.sec : 0;
    const secv = isFinite(modelResults.model.secv) ? modelResults.model.secv : 0;
    const slope = isFinite(modelResults.model.slope) ? modelResults.model.slope : 1.0;
    const offset = isFinite(modelResults.model.offset) ? modelResults.model.offset : 0.0;
    
    // Intercepto de regresión PLS (B0)
    const intercept = isFinite(modelResults.model.plsIntercept) 
        ? modelResults.model.plsIntercept 
        : (isFinite(modelResults.model.offset) ? modelResults.model.offset : 0.0);

    const coefficients = modelResults.model.coefficients || [];
    const nTerms = modelResults.nComponents || 1;

    // Calcular media y desviación estándar de referencia a partir de los residuales
    const residuals = modelResults.model.residuals || [];
    const nSamples = sampleCount || residuals.length || 1;
    let meanRef = 0;
    let stdRef = 0;

    if (residuals.length > 0) {
        const sum = residuals.reduce((acc, curr) => acc + curr.actual, 0);
        meanRef = sum / residuals.length;
        const varianceSum = residuals.reduce((acc, curr) => acc + Math.pow(curr.actual - meanRef, 2), 0);
        stdRef = Math.sqrt(varianceSum / (residuals.length > 1 ? residuals.length - 1 : 1));
    }

    const now = new Date();
    const isoDate = now.toISOString();
    const formattedDate = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const formattedTime = now.toLocaleTimeString('en-US', { hour12: false });

    // Sanitizar nombres para ASCII seguro
    const cleanProduct = productName.replace(/[^\w\s-]/g, '').trim() || 'General';
    const cleanConstituent = constituentName.replace(/[^\w\s-]/g, '').trim() || 'Constituent';

    // Construcción del archivo .EQA estructurado según estándar FOSS / WinISI
    const lines: string[] = [];

    // Encabezado informativo y de compatibilidad FOSS
    lines.push('; ==============================================================================');
    lines.push('; FOSS / INFRASOFT INTERNATIONAL (ISI) CALIBRATION EQUATION FILE (.EQA)');
    lines.push('; Generated by Chemometrics NIR Studio');
    lines.push('; Compatible with: WinISI II/III/4, ISIscan, FossManager, Infratec, NIRS DS2500');
    lines.push('; ==============================================================================');
    lines.push('');

    // Bloque 1: General & Identificación
    lines.push('[EQA_HEADER]');
    lines.push('FORMAT_VERSION=1.2');
    lines.push('APPLICATION=Chemometrics NIR Studio');
    lines.push(`CREATION_TIMESTAMP=${isoDate}`);
    lines.push(`DATE=${formattedDate}`);
    lines.push(`TIME=${formattedTime}`);
    lines.push('EQUATION_TYPE=PLS');
    lines.push(`PRODUCT_NAME=${cleanProduct}`);
    lines.push(`CONSTITUENT_NAME=${cleanConstituent}`);
    lines.push('UNITS=%');
    lines.push('');

    // Bloque 2: Parámetros del Espectrómetro FOSS
    lines.push('[INSTRUMENT_PARAMETERS]');
    lines.push(`START_WAVELENGTH=${startWl.toFixed(2)}`);
    lines.push(`END_WAVELENGTH=${endWl.toFixed(2)}`);
    lines.push(`STEP_WAVELENGTH=${stepWl.toFixed(2)}`);
    lines.push(`TOTAL_DATAPOINTS=${numPoints}`);
    lines.push('OPTICAL_DATA_TYPE=log(1/R)');
    lines.push('');

    // Bloque 3: Tratamiento Matemático WinISI (D, G, S1, S2 & Scatter)
    lines.push('[MATH_TREATMENT]');
    lines.push(`WINISI_MATH_CODE=${math.mathCode}`);
    lines.push(`DERIVATIVE_ORDER=${math.derivative}`);
    lines.push(`GAP_SIZE=${math.gap}`);
    lines.push(`PRIMARY_SMOOTH=${math.smooth1}`);
    lines.push(`SECONDARY_SMOOTH=${math.smooth2}`);
    lines.push(`SCATTER_CORRECTION=${math.scatter}`);
    lines.push(`SCATTER_CODE=${math.scatterCode}`);
    lines.push('');

    // Bloque 4: Desempeño y Estadísticas Quimiométricas
    lines.push('[PERFORMANCE_STATISTICS]');
    lines.push(`SAMPLES_COUNT=${nSamples}`);
    lines.push(`LATENT_VARIABLES=${nTerms}`);
    lines.push(`RSQUARED=${r2.toFixed(4)}`);
    lines.push(`QSQUARED=${q2.toFixed(4)}`);
    lines.push(`SEC=${sec.toFixed(4)}`);
    lines.push(`SECV=${secv.toFixed(4)}`);
    lines.push(`SLOPE=${slope.toFixed(4)}`);
    lines.push(`OFFSET=${offset.toFixed(4)}`);
    lines.push(`REFERENCE_MEAN=${meanRef.toFixed(4)}`);
    lines.push(`REFERENCE_STDDEV=${stdRef.toFixed(4)}`);
    lines.push('GH_OUTLIER_LIMIT=3.00');
    lines.push('NH_OUTLIER_LIMIT=1.00');
    lines.push('T_OUTLIER_LIMIT=2.50');
    lines.push('');

    // Bloque 5: Modelo de Ecuación e Intercepto (B0)
    lines.push('[EQUATION_MODEL]');
    lines.push(`EQUATION_NAME=${cleanConstituent}_PLS_${nTerms}LV`);
    lines.push(`INTERCEPT=${intercept >= 0 ? '+' : ''}${intercept.toExponential(10)}`);
    lines.push(`TERMS_COUNT=${coefficients.length}`);
    lines.push('');

    // Bloque 6: Coeficientes de Regresión Espectral (Index, Wavelength nm, Beta Coeff)
    lines.push('[COEFFICIENTS]');
    lines.push('; Format: Term_Index, Wavelength_nm, Beta_Coefficient');
    for (let i = 0; i < coefficients.length; i++) {
        const wl = wavelengths[i] !== undefined ? wavelengths[i] : (startWl + i * stepWl);
        const beta = coefficients[i] || 0;
        const betaFormatted = (beta >= 0 ? ' ' : '') + beta.toExponential(10);
        lines.push(`${(i + 1).toString().padStart(5, ' ')}, ${wl.toFixed(2).padStart(8, ' ')}, ${betaFormatted}`);
    }
    lines.push('');

    // Bloque 7: Sección clásica WinISI Columnar (garantiza compatibilidad con versiones legacy de WinISI)
    lines.push('; --- WINISI CLASSIC COMPATIBILITY STREAM ---');
    lines.push('[WINISI_STREAM]');
    lines.push(`NAME="${cleanConstituent}"`);
    lines.push(`MATH=${math.derivative} ${math.gap} ${math.smooth1} ${math.smooth2}`);
    lines.push(`SCAT=${math.scatterCode}`);
    lines.push(`TERMS=${nTerms}`);
    lines.push(`CONST=${intercept.toExponential(10)}`);
    lines.push(`CAL_SEC=${sec.toFixed(6)}`);
    lines.push(`CAL_RSQ=${r2.toFixed(6)}`);
    lines.push(`VAL_SECV=${secv.toFixed(6)}`);
    lines.push('');

    return lines.join('\r\n');
}

/**
 * Dispara la descarga directa de un archivo .EQA en el navegador web del usuario.
 */
export function downloadFossEqaFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.eqa') ? filename : `${filename}.eqa`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
