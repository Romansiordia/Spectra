import React, { useState, useMemo, useRef, useEffect } from 'react';
import { RotateCcw, ZoomIn, ZoomOut, Compass, Crosshair, Target } from 'lucide-react';
import { RobpcaSampleType } from '../types';

export interface Pca3DPoint {
    id: string | number;
    x: number;
    y: number;
    z: number;
    gh: number;
    hotellingT2: number;
    qResidual: number;
    sd: number;
    od: number;
    robpcaType: RobpcaSampleType;
    lofScore: number;
    isOutlier: boolean;
    isRobpcaOutlier: boolean;
    isLofOutlier: boolean;
    outlierReason?: string;
    active: boolean;
    color: string;
    analyticalValue?: number;
}

interface Pca3DPlotProps {
    points: Pca3DPoint[];
    xLabel: string;
    yLabel: string;
    zLabel: string;
    xShort: string;
    yShort: string;
    zShort: string;
    selectedId?: string | number | null;
    onSelectPoint: (id: string | number) => void;
    analyticalProperty?: string;
}

interface Vec3 {
    x: number;
    y: number;
    z: number;
}

interface AxisBounds {
    min: number;
    max: number;
    ticks: number[];
}

function computeNiceAxisBounds(values: number[]): AxisBounds {
    if (values.length === 0) {
        return { min: -1, max: 1, ticks: [-1, -0.5, 0, 0.5, 1] };
    }
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (!isFinite(minVal) || !isFinite(maxVal)) {
        return { min: -1, max: 1, ticks: [-1, 0, 1] };
    }
    if (Math.abs(maxVal - minVal) < 1e-6) {
        minVal -= 1;
        maxVal += 1;
    }

    const rawSpan = maxVal - minVal;
    const paddedMin = minVal - rawSpan * 0.1;
    const paddedMax = maxVal + rawSpan * 0.1;
    const span = paddedMax - paddedMin;

    const targetSteps = 4;
    const roughStep = span / targetSteps;
    const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const norm = roughStep / mag;

    let niceNorm = 1;
    if (norm <= 1) niceNorm = 1;
    else if (norm <= 2) niceNorm = 2;
    else if (norm <= 2.5) niceNorm = 2.5;
    else if (norm <= 5) niceNorm = 5;
    else niceNorm = 10;

    const step = niceNorm * mag;
    const niceMin = Math.floor(paddedMin / step) * step;
    const niceMax = Math.ceil(paddedMax / step) * step;

    const ticks: number[] = [];
    const maxTicks = 8;
    for (let t = niceMin, i = 0; t <= niceMax + step * 0.001 && i < maxTicks; t += step, i++) {
        ticks.push(Number(t.toFixed(6)));
    }

    return { min: niceMin, max: niceMax, ticks };
}

function formatTick(val: number): string {
    if (Math.abs(val) < 1e-9) return '0';
    if (Math.abs(val) >= 100) return val.toFixed(0);
    if (Math.abs(val) >= 10) return val.toFixed(1);
    if (Math.abs(val) >= 1) return Number(val.toFixed(2)).toString();
    return Number(val.toFixed(3)).toString();
}

function rotatePoint(p: Vec3, yaw: number, pitch: number): Vec3 {
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const x1 = p.x * cy + p.z * sy;
    const z1 = -p.x * sy + p.z * cy;
    const y1 = p.y;

    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y2 = y1 * cp - z1 * sp;
    const z2 = y1 * sp + z1 * cp;

    return { x: x1, y: y2, z: z2 };
}

const DEFAULT_CAMERA = { yaw: -0.68, pitch: 0.42, zoom: 1.0 };

const Pca3DPlot: React.FC<Pca3DPlotProps> = ({
    points,
    xLabel,
    yLabel,
    zLabel,
    xShort,
    yShort,
    zShort,
    selectedId,
    onSelectPoint,
    analyticalProperty = 'Propiedad'
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 720, height: 384 });
    const [camera, setCamera] = useState(DEFAULT_CAMERA);
    const [isDragging, setIsDragging] = useState(false);
    const [showDropLines, setShowDropLines] = useState(true);
    const [showConfidenceRings, setShowConfidenceRings] = useState(true);
    const [hovered, setHovered] = useState<{ point: Pca3DPoint; sx: number; sy: number } | null>(null);
    const dragRef = useRef<{ startX: number; startY: number; startYaw: number; startPitch: number; moved: boolean } | null>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setDimensions({ width: rect.width, height: rect.height });
            }
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1.08 : 0.92;
            setCamera(prev => ({
                ...prev,
                zoom: Math.max(0.6, Math.min(2.6, Number((prev.zoom * delta).toFixed(3))))
            }));
        };

        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }, []);

    // Estadísticas del elipsoide Hotelling T² en 3D (A = 3 componentes)
    const confidenceEllipsoid = useMemo(() => {
        const activePts = points.filter(p => p.active);
        const statPts = activePts.length >= 4 ? activePts : points;
        const n = statPts.length;
        if (n < 4) return null;

        let sumX = 0;
        let sumY = 0;
        let sumZ = 0;
        for (const p of statPts) {
            sumX += p.x;
            sumY += p.y;
            sumZ += p.z;
        }
        const meanX = sumX / n;
        const meanY = sumY / n;
        const meanZ = sumZ / n;

        let ssX = 0;
        let ssY = 0;
        let ssZ = 0;
        for (const p of statPts) {
            ssX += (p.x - meanX) ** 2;
            ssY += (p.y - meanY) ** 2;
            ssZ += (p.z - meanZ) ** 2;
        }
        const denom = Math.max(1, n - 1);
        const varX = Math.max(1e-9, ssX / denom);
        const varY = Math.max(1e-9, ssY / denom);
        const varZ = Math.max(1e-9, ssZ / denom);

        // Valores críticos T² en 3D (chi²_3: 7.815 al 95%, 11.345 al 99%)
        const t2Factor = (n - 1) / Math.max(1, n - 3);
        const t2Limit95 = t2Factor * 7.815;
        const t2Limit99 = t2Factor * 11.345;

        return {
            n,
            center: { x: meanX, y: meanY, z: meanZ },
            r95: {
                x: Math.sqrt(t2Limit95 * varX),
                y: Math.sqrt(t2Limit95 * varY),
                z: Math.sqrt(t2Limit95 * varZ)
            },
            r99: {
                x: Math.sqrt(t2Limit99 * varX),
                y: Math.sqrt(t2Limit99 * varY),
                z: Math.sqrt(t2Limit99 * varZ)
            }
        };
    }, [points]);

    const bounds = useMemo(() => {
        const xs = points.map(p => p.x);
        const ys = points.map(p => p.y);
        const zs = points.map(p => p.z);

        // Incluir alcance del anillo del 95% en los límites del cubo cuando n >= 6
        if (showConfidenceRings && confidenceEllipsoid && confidenceEllipsoid.n >= 6) {
            const { center, r95 } = confidenceEllipsoid;
            xs.push(center.x - r95.x, center.x + r95.x);
            ys.push(center.y - r95.y, center.y + r95.y);
            zs.push(center.z - r95.z, center.z + r95.z);
        }

        return {
            x: computeNiceAxisBounds(xs),
            y: computeNiceAxisBounds(ys),
            z: computeNiceAxisBounds(zs)
        };
    }, [points, showConfidenceRings, confidenceEllipsoid]);

    const normCoord = (val: number, b: AxisBounds) => {
        const span = b.max - b.min || 1;
        return ((val - b.min) / span) * 2 - 1;
    };

    const project = (p: Vec3) => {
        const r = rotatePoint(p, camera.yaw, camera.pitch);
        const cameraDist = 4.5;
        const focal = Math.min(dimensions.width, dimensions.height) * 0.36 * camera.zoom;
        const persp = cameraDist / (cameraDist - r.z);
        return {
            sx: dimensions.width / 2 + r.x * focal * persp,
            sy: dimensions.height / 2 + 8 - r.y * focal * persp,
            depth: r.z,
            persp
        };
    };

    // Determinar caras traseras de la caja [-1, 1]^3
    const backFaces = useMemo(() => {
        const faces: {
            id: string;
            normal: Vec3;
            corners: Vec3[];
            axisU: 'x' | 'y' | 'z';
            axisV: 'x' | 'y' | 'z';
            fixedCoord: { axis: 'x' | 'y' | 'z'; val: number };
        }[] = [
            {
                id: 'x-neg',
                normal: { x: -1, y: 0, z: 0 },
                corners: [{ x: -1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: 1, z: 1 }, { x: -1, y: -1, z: 1 }],
                axisU: 'y',
                axisV: 'z',
                fixedCoord: { axis: 'x', val: -1 }
            },
            {
                id: 'x-pos',
                normal: { x: 1, y: 0, z: 0 },
                corners: [{ x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: 1 }],
                axisU: 'y',
                axisV: 'z',
                fixedCoord: { axis: 'x', val: 1 }
            },
            {
                id: 'y-neg',
                normal: { x: 0, y: -1, z: 0 },
                corners: [{ x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: -1, z: 1 }, { x: -1, y: -1, z: 1 }],
                axisU: 'x',
                axisV: 'z',
                fixedCoord: { axis: 'y', val: -1 }
            },
            {
                id: 'y-pos',
                normal: { x: 0, y: 1, z: 0 },
                corners: [{ x: -1, y: 1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }],
                axisU: 'x',
                axisV: 'z',
                fixedCoord: { axis: 'y', val: 1 }
            },
            {
                id: 'z-neg',
                normal: { x: 0, y: 0, z: -1 },
                corners: [{ x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 }],
                axisU: 'x',
                axisV: 'y',
                fixedCoord: { axis: 'z', val: -1 }
            },
            {
                id: 'z-pos',
                normal: { x: 0, y: 0, z: 1 },
                corners: [{ x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }],
                axisU: 'x',
                axisV: 'y',
                fixedCoord: { axis: 'z', val: 1 }
            }
        ];

        return faces.filter(f => rotatePoint(f.normal, camera.yaw, camera.pitch).z < -0.02);
    }, [camera.yaw, camera.pitch]);

    // Elegir la mejor arista exterior del cubo para cada eje (ticks + etiqueta)
    const axisGuides = useMemo(() => {
        const backIds = new Set(backFaces.map(f => f.id));

        const pickEdge = (
            axis: 'x' | 'y' | 'z',
            candidates: { start: Vec3; end: Vec3; adjFaces: [string, string]; outward: Vec3 }[]
        ) => {
            // Arista en la frontera entre una cara trasera visible y una cara frontal
            const silhouette = candidates.filter(c => {
                const a = backIds.has(c.adjFaces[0]);
                const b = backIds.has(c.adjFaces[1]);
                return a !== b;
            });
            const pool = silhouette.length > 0 ? silhouette : candidates;
            // Elegir la arista inferior/lateral más alejada del centro hacia abajo/afuera
            let best = pool[0];
            let bestScore = -Infinity;
            for (const c of pool) {
                const mid = {
                    x: (c.start.x + c.end.x) / 2,
                    y: (c.start.y + c.end.y) / 2,
                    z: (c.start.z + c.end.z) / 2
                };
                const projMid = project(mid);
                const rOut = rotatePoint(c.outward, camera.yaw, camera.pitch);
                // Preferir aristas inferiores para X y Z, e izquierda para Y
                let score = rOut.z * 0.2;
                if (axis === 'y') {
                    score += -projMid.sx * 0.01 - Math.abs(rOut.x) * -0.5;
                    if (projMid.sx < dimensions.width / 2) score += 10;
                } else {
                    if (projMid.sy > dimensions.height / 2) score += 10;
                    score += projMid.sy * 0.005;
                }
                if (score > bestScore) {
                    bestScore = score;
                    best = c;
                }
            }
            return best;
        };

        const xEdge = pickEdge('x', [
            { start: { x: -1, y: -1, z: -1 }, end: { x: 1, y: -1, z: -1 }, adjFaces: ['y-neg', 'z-neg'], outward: { x: 0, y: -1, z: -1 } },
            { start: { x: -1, y: -1, z: 1 }, end: { x: 1, y: -1, z: 1 }, adjFaces: ['y-neg', 'z-pos'], outward: { x: 0, y: -1, z: 1 } },
            { start: { x: -1, y: 1, z: -1 }, end: { x: 1, y: 1, z: -1 }, adjFaces: ['y-pos', 'z-neg'], outward: { x: 0, y: 1, z: -1 } },
            { start: { x: -1, y: 1, z: 1 }, end: { x: 1, y: 1, z: 1 }, adjFaces: ['y-pos', 'z-pos'], outward: { x: 0, y: 1, z: 1 } }
        ]);

        const yEdge = pickEdge('y', [
            { start: { x: -1, y: -1, z: -1 }, end: { x: -1, y: 1, z: -1 }, adjFaces: ['x-neg', 'z-neg'], outward: { x: -1, y: 0, z: -1 } },
            { start: { x: -1, y: -1, z: 1 }, end: { x: -1, y: 1, z: 1 }, adjFaces: ['x-neg', 'z-pos'], outward: { x: -1, y: 0, z: 1 } },
            { start: { x: 1, y: -1, z: -1 }, end: { x: 1, y: 1, z: -1 }, adjFaces: ['x-pos', 'z-neg'], outward: { x: 1, y: 0, z: -1 } },
            { start: { x: 1, y: -1, z: 1 }, end: { x: 1, y: 1, z: 1 }, adjFaces: ['x-pos', 'z-pos'], outward: { x: 1, y: 0, z: 1 } }
        ]);

        const zEdge = pickEdge('z', [
            { start: { x: -1, y: -1, z: -1 }, end: { x: -1, y: -1, z: 1 }, adjFaces: ['x-neg', 'y-neg'], outward: { x: -1, y: -1, z: 0 } },
            { start: { x: 1, y: -1, z: -1 }, end: { x: 1, y: -1, z: 1 }, adjFaces: ['x-pos', 'y-neg'], outward: { x: 1, y: -1, z: 0 } },
            { start: { x: -1, y: 1, z: -1 }, end: { x: -1, y: 1, z: 1 }, adjFaces: ['x-neg', 'y-pos'], outward: { x: -1, y: 1, z: 0 } },
            { start: { x: 1, y: 1, z: -1 }, end: { x: 1, y: 1, z: 1 }, adjFaces: ['x-pos', 'y-pos'], outward: { x: 1, y: 1, z: 0 } }
        ]);

        return { xEdge, yEdge, zEdge };
    }, [backFaces, camera.yaw, camera.pitch, camera.zoom, dimensions]);

    // Puntos ordenados por profundidad (de atrás hacia adelante)
    const projectedPoints = useMemo(() => {
        const items = points.map(pt => {
            const nx = normCoord(pt.x, bounds.x);
            const ny = normCoord(pt.y, bounds.y);
            const nz = normCoord(pt.z, bounds.z);
            const proj = project({ x: nx, y: ny, z: nz });
            const floorProj = project({ x: nx, y: -1, z: nz });
            return {
                pt,
                nx,
                ny,
                nz,
                sx: proj.sx,
                sy: proj.sy,
                depth: proj.depth,
                persp: proj.persp,
                floorSx: floorProj.sx,
                floorSy: floorProj.sy
            };
        });
        items.sort((a, b) => a.depth - b.depth);
        return items;
    }, [points, bounds, camera, dimensions]);

    // Proyección de anillos ortogonales y silueta 3D del elipsoide Hotelling T² (95% y 99%)
    const projectedConfidenceRings = useMemo(() => {
        if (!showConfidenceRings || !confidenceEllipsoid) return null;

        const { center, r95, r99 } = confidenceEllipsoid;
        const cx = normCoord(center.x, bounds.x);
        const cy = normCoord(center.y, bounds.y);
        const cz = normCoord(center.z, bounds.z);

        const spanX = bounds.x.max - bounds.x.min || 1;
        const spanY = bounds.y.max - bounds.y.min || 1;
        const spanZ = bounds.z.max - bounds.z.min || 1;

        const buildRingPath = (pts3d: Vec3[]) => {
            if (pts3d.length === 0) return '';
            return (
                pts3d
                    .map((p, idx) => {
                        const proj = project(p);
                        return `${idx === 0 ? 'M' : 'L'} ${proj.sx.toFixed(1)} ${proj.sy.toFixed(1)}`;
                    })
                    .join(' ') + ' Z'
            );
        };

        const steps = 64;
        const buildLevelGeometry = (radii: Vec3) => {
            const nrx = Math.max(1e-4, (2 * radii.x) / spanX);
            const nry = Math.max(1e-4, (2 * radii.y) / spanY);
            const nrz = Math.max(1e-4, (2 * radii.z) / spanZ);

            const xyPts: Vec3[] = [];
            const xzPts: Vec3[] = [];
            const yzPts: Vec3[] = [];
            for (let i = 0; i < steps; i++) {
                const t = (i / steps) * Math.PI * 2;
                const ct = Math.cos(t);
                const st = Math.sin(t);
                xyPts.push({ x: cx + nrx * ct, y: cy + nry * st, z: cz });
                xzPts.push({ x: cx + nrx * ct, y: cy, z: cz + nrz * st });
                yzPts.push({ x: cx, y: cy + nry * ct, z: cz + nrz * st });
            }

            // Silueta del elipsoide alineada con el vector de vista de la cámara
            const vx = -Math.cos(camera.pitch) * Math.sin(camera.yaw);
            const vy = Math.sin(camera.pitch);
            const vz = Math.cos(camera.pitch) * Math.cos(camera.yaw);

            const wx = vx / nrx;
            const wy = vy / nry;
            const wz = vz / nrz;
            const wLen = Math.hypot(wx, wy, wz) || 1;
            const wn = { x: wx / wLen, y: wy / wLen, z: wz / wLen };

            const ref = Math.abs(wn.x) < 0.8 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
            const axRaw = {
                x: wn.y * ref.z - wn.z * ref.y,
                y: wn.z * ref.x - wn.x * ref.z,
                z: wn.x * ref.y - wn.y * ref.x
            };
            const aLen = Math.hypot(axRaw.x, axRaw.y, axRaw.z) || 1;
            const a = { x: axRaw.x / aLen, y: axRaw.y / aLen, z: axRaw.z / aLen };
            const b = {
                x: wn.y * a.z - wn.z * a.y,
                y: wn.z * a.x - wn.x * a.z,
                z: wn.x * a.y - wn.y * a.x
            };

            const silhouettePts: Vec3[] = [];
            for (let i = 0; i < steps; i++) {
                const t = (i / steps) * Math.PI * 2;
                const ct = Math.cos(t);
                const st = Math.sin(t);
                const ux = a.x * ct + b.x * st;
                const uy = a.y * ct + b.y * st;
                const uz = a.z * ct + b.z * st;
                silhouettePts.push({
                    x: cx + nrx * ux,
                    y: cy + nry * uy,
                    z: cz + nrz * uz
                });
            }

            return {
                xy: buildRingPath(xyPts),
                xz: buildRingPath(xzPts),
                yz: buildRingPath(yzPts),
                silhouette: buildRingPath(silhouettePts)
            };
        };

        return {
            centerProj: project({ x: cx, y: cy, z: cz }),
            ring95: buildLevelGeometry(r95),
            ring99: buildLevelGeometry(r99)
        };
    }, [showConfidenceRings, confidenceEllipsoid, bounds, camera, dimensions]);

    const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        setIsDragging(true);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startYaw: camera.yaw,
            startPitch: camera.pitch,
            moved: false
        };
    };

    const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            dragRef.current.moved = true;
            setHovered(null);
        }
        const nextYaw = dragRef.current.startYaw + dx * 0.008;
        const nextPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, dragRef.current.startPitch + dy * 0.008));
        setCamera(prev => ({ ...prev, yaw: nextYaw, pitch: nextPitch }));
    };

    const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
        if ((e.currentTarget as Element).hasPointerCapture(e.pointerId)) {
            (e.currentTarget as Element).releasePointerCapture(e.pointerId);
        }
        setIsDragging(false);
        dragRef.current = null;
    };

    const renderAxisTicksAndLabel = (
        axis: 'x' | 'y' | 'z',
        edge: { start: Vec3; end: Vec3 },
        axisBounds: AxisBounds,
        title: string
    ) => {
        const pStart = project(edge.start);
        const pEnd = project(edge.end);
        const centerProj = project({ x: 0, y: 0, z: 0 });

        const midX = (pStart.sx + pEnd.sx) / 2;
        const midY = (pStart.sy + pEnd.sy) / 2;
        let outX = midX - centerProj.sx;
        let outY = midY - centerProj.sy;
        const outLen = Math.hypot(outX, outY) || 1;
        outX /= outLen;
        outY /= outLen;

        const ticks = axisBounds.ticks.map(val => {
            const n = normCoord(val, axisBounds);
            const pos: Vec3 = {
                x: axis === 'x' ? n : edge.start.x,
                y: axis === 'y' ? n : edge.start.y,
                z: axis === 'z' ? n : edge.start.z
            };
            const pt = project(pos);
            return { val, sx: pt.sx, sy: pt.sy };
        });

        const labelDist = axis === 'y' ? 42 : 34;
        const angleRad = Math.atan2(pEnd.sy - pStart.sy, pEnd.sx - pStart.sx);
        let angleDeg = (angleRad * 180) / Math.PI;
        if (angleDeg > 90) angleDeg -= 180;
        if (angleDeg < -90) angleDeg += 180;

        return (
            <g key={`axis-${axis}`} className="pointer-events-none select-none">
                <line
                    x1={pStart.sx}
                    y1={pStart.sy}
                    x2={pEnd.sx}
                    y2={pEnd.sy}
                    stroke="#64748b"
                    strokeWidth={1.4}
                />
                {ticks.map((t, idx) => (
                    <g key={`tick-${axis}-${idx}`}>
                        <line
                            x1={t.sx}
                            y1={t.sy}
                            x2={t.sx + outX * 5}
                            y2={t.sy + outY * 5}
                            stroke="#64748b"
                            strokeWidth={1}
                        />
                        <text
                            x={t.sx + outX * 13}
                            y={t.sy + outY * 13 + 3}
                            textAnchor={outX > 0.35 ? 'start' : outX < -0.35 ? 'end' : 'middle'}
                            fill="#94a3b8"
                            fontSize={10}
                            fontFamily="JetBrains Mono, monospace"
                        >
                            {formatTick(t.val)}
                        </text>
                    </g>
                ))}
                <text
                    x={midX + outX * labelDist}
                    y={midY + outY * labelDist}
                    textAnchor="middle"
                    fill="#cbd5e1"
                    fontSize={11}
                    fontWeight={600}
                    transform={`rotate(${angleDeg}, ${midX + outX * labelDist}, ${midY + outY * labelDist})`}
                >
                    {title}
                </text>
            </g>
        );
    };

    const getRobpcaLabel = (type: RobpcaSampleType) => {
        switch (type) {
            case 'good_leverage': return 'BUEN APALANCAMIENTO';
            case 'bad_leverage': return 'OUTLIER DAÑINO';
            case 'orthogonal': return 'OUTLIER ORTOGONAL';
            default: return 'REGULAR';
        }
    };

    const getRobpcaStyle = (type: RobpcaSampleType) => {
        switch (type) {
            case 'good_leverage': return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
            case 'bad_leverage': return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
            case 'orthogonal': return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
            default: return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
        }
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-full relative rounded-xl bg-[#040d1a] border border-ui-border overflow-hidden select-none"
        >
            {/* Controles Superiores de Cámara y Vistas Rápidas */}
            <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                <div className="flex flex-wrap items-center gap-1 bg-slate-950/80 backdrop-blur border border-slate-800 rounded-lg p-1 pointer-events-auto">
                    <button
                        type="button"
                        onClick={() => setCamera(DEFAULT_CAMERA)}
                        className="px-2 py-1 text-[10px] font-semibold rounded text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex items-center gap-1 cursor-pointer"
                        title="Vista Isométrica 3D"
                    >
                        <Compass className="w-3 h-3 text-ui-accent" />
                        Isométrica
                    </button>
                    <button
                        type="button"
                        onClick={() => setCamera({ yaw: 0, pitch: 0.01, zoom: 1.05 })}
                        className="px-2 py-1 text-[10px] font-semibold rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        {xShort}–{yShort}
                    </button>
                    <button
                        type="button"
                        onClick={() => setCamera({ yaw: 0, pitch: Math.PI / 2 - 0.05, zoom: 1.05 })}
                        className="px-2 py-1 text-[10px] font-semibold rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        {xShort}–{zShort}
                    </button>
                    <button
                        type="button"
                        onClick={() => setCamera({ yaw: -Math.PI / 2, pitch: 0.01, zoom: 1.05 })}
                        className="px-2 py-1 text-[10px] font-semibold rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        {zShort}–{yShort}
                    </button>
                </div>

                <div className="flex items-center gap-1 bg-slate-950/80 backdrop-blur border border-slate-800 rounded-lg p-1 pointer-events-auto">
                    <button
                        type="button"
                        onClick={() => setShowConfidenceRings(v => !v)}
                        className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer ${
                            showConfidenceRings
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/35'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Mostrar anillos de confianza 3D Hotelling T² (95% y 99%)"
                    >
                        <Target className="w-3 h-3" />
                        Anillos T²
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowDropLines(v => !v)}
                        className={`px-2 py-1 text-[10px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer ${
                            showDropLines
                                ? 'bg-ui-accent/20 text-ui-accent border border-ui-accent/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Mostrar líneas de proyección al plano base para outliers y muestra seleccionada"
                    >
                        <Crosshair className="w-3 h-3" />
                        Guías
                    </button>
                    <button
                        type="button"
                        onClick={() => setCamera(c => ({ ...c, zoom: Math.min(2.6, Number((c.zoom * 1.15).toFixed(2))) }))}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
                        title="Acercar"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setCamera(c => ({ ...c, zoom: Math.max(0.6, Number((c.zoom / 1.15).toFixed(2))) }))}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
                        title="Alejar"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setCamera(DEFAULT_CAMERA)}
                        className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded cursor-pointer"
                        title="Restablecer cámara"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Lienzo SVG 3D */}
            <svg
                width={dimensions.width}
                height={dimensions.height}
                className={`w-full h-full block ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={() => {
                    if (!isDragging) setHovered(null);
                }}
            >
                {/* Caras Traseras y Rejillas 3D */}
                {backFaces.map(face => {
                    const ptsStr = face.corners.map(c => {
                        const p = project(c);
                        return `${p.sx},${p.sy}`;
                    }).join(' ');

                    const buildGridLines = (varyingAxis: 'x' | 'y' | 'z', otherAxis: 'x' | 'y' | 'z') => {
                        const ticks = bounds[varyingAxis].ticks;
                        return ticks.map((val, idx) => {
                            const n = normCoord(val, bounds[varyingAxis]);
                            const a: Vec3 = {
                                x: face.fixedCoord.axis === 'x' ? face.fixedCoord.val : varyingAxis === 'x' ? n : -1,
                                y: face.fixedCoord.axis === 'y' ? face.fixedCoord.val : varyingAxis === 'y' ? n : -1,
                                z: face.fixedCoord.axis === 'z' ? face.fixedCoord.val : varyingAxis === 'z' ? n : -1
                            };
                            const b: Vec3 = {
                                ...a,
                                [otherAxis]: 1
                            };
                            const pa = project(a);
                            const pb = project(b);
                            const isZero = Math.abs(val) < 1e-9;
                            return (
                                <line
                                    key={`${face.id}-${varyingAxis}-${idx}`}
                                    x1={pa.sx}
                                    y1={pa.sy}
                                    x2={pb.sx}
                                    y2={pb.sy}
                                    stroke={isZero ? 'rgba(148, 163, 184, 0.35)' : 'rgba(51, 65, 85, 0.55)'}
                                    strokeDasharray={isZero ? '3 3' : undefined}
                                    strokeWidth={isZero ? 1 : 0.8}
                                />
                            );
                        });
                    };

                    return (
                        <g key={face.id}>
                            <polygon
                                points={ptsStr}
                                fill="rgba(11, 32, 59, 0.32)"
                                stroke="rgba(71, 85, 105, 0.55)"
                                strokeWidth={1}
                            />
                            {buildGridLines(face.axisU, face.axisV)}
                            {buildGridLines(face.axisV, face.axisU)}
                        </g>
                    );
                })}

                {/* Guías de Ejes y Etiquetas Numéricas */}
                {renderAxisTicksAndLabel('x', axisGuides.xEdge, bounds.x, xLabel)}
                {renderAxisTicksAndLabel('y', axisGuides.yEdge, bounds.y, yLabel)}
                {renderAxisTicksAndLabel('z', axisGuides.zEdge, bounds.z, zLabel)}

                {/* Anillos de Confianza 3D Hotelling T² (95% y 99%) */}
                {projectedConfidenceRings && (
                    <g className="pointer-events-none">
                        {/* Elipsoide 99% (límite crítico externo) */}
                        <path
                            d={projectedConfidenceRings.ring99.silhouette}
                            fill="rgba(251, 113, 133, 0.02)"
                            stroke="rgba(251, 113, 133, 0.52)"
                            strokeWidth={1.1}
                            strokeDasharray="4 3"
                        />
                        <path d={projectedConfidenceRings.ring99.xy} fill="none" stroke="rgba(251, 113, 133, 0.34)" strokeWidth={0.9} strokeDasharray="3 3" />
                        <path d={projectedConfidenceRings.ring99.xz} fill="none" stroke="rgba(251, 113, 133, 0.28)" strokeWidth={0.9} strokeDasharray="3 3" />
                        <path d={projectedConfidenceRings.ring99.yz} fill="none" stroke="rgba(251, 113, 133, 0.28)" strokeWidth={0.9} strokeDasharray="3 3" />

                        {/* Elipsoide 95% (límite nominal interno) */}
                        <path
                            d={projectedConfidenceRings.ring95.silhouette}
                            fill="rgba(34, 211, 238, 0.04)"
                            stroke="rgba(34, 211, 238, 0.65)"
                            strokeWidth={1.25}
                        />
                        <path d={projectedConfidenceRings.ring95.xy} fill="none" stroke="rgba(34, 211, 238, 0.48)" strokeWidth={1} />
                        <path d={projectedConfidenceRings.ring95.xz} fill="none" stroke="rgba(34, 211, 238, 0.36)" strokeWidth={0.95} />
                        <path d={projectedConfidenceRings.ring95.yz} fill="none" stroke="rgba(34, 211, 238, 0.36)" strokeWidth={0.95} />

                        {/* Centroide de las muestras activas */}
                        <circle
                            cx={projectedConfidenceRings.centerProj.sx}
                            cy={projectedConfidenceRings.centerProj.sy}
                            r={2.5}
                            fill="rgba(34, 211, 238, 0.75)"
                        />
                    </g>
                )}

                {/* Guías de proyección al plano base (para outliers y punto seleccionado) */}
                {showDropLines && projectedPoints.map(({ pt, sx, sy, floorSx, floorSy }) => {
                    const isSelected = pt.id === selectedId;
                    const isHover = hovered?.point.id === pt.id;
                    if (!isSelected && !isHover && !pt.isOutlier) return null;
                    return (
                        <g key={`drop-${pt.id}`} className="pointer-events-none">
                            <line
                                x1={sx}
                                y1={sy}
                                x2={floorSx}
                                y2={floorSy}
                                stroke={isSelected ? '#38bdf8' : 'rgba(244, 63, 94, 0.45)'}
                                strokeWidth={isSelected ? 1.4 : 1}
                                strokeDasharray="3 3"
                            />
                            <circle
                                cx={floorSx}
                                cy={floorSy}
                                r={isSelected ? 3 : 2}
                                fill="none"
                                stroke={isSelected ? '#38bdf8' : 'rgba(244, 63, 94, 0.6)'}
                                strokeWidth={1}
                            />
                        </g>
                    );
                })}

                {/* Nube de Puntos 3D ordenada por profundidad */}
                {projectedPoints.map(({ pt, sx, sy, persp }) => {
                    const isSelected = pt.id === selectedId;
                    const isHover = hovered?.point.id === pt.id;
                    const baseRadius = isSelected ? 7.5 : (pt.isOutlier ? 5.8 : 4.6);
                    const r = Math.max(3, Math.min(10, baseRadius * (0.6 + persp * 0.4)));
                    const depthOpacity = pt.active ? Math.max(0.75, Math.min(1, 0.55 + persp * 0.45)) : 0.45;

                    return (
                        <circle
                            key={`pt3d-${pt.id}`}
                            cx={sx}
                            cy={sy}
                            r={isHover ? r + 1.5 : r}
                            fill={pt.color}
                            fillOpacity={depthOpacity}
                            stroke={isSelected ? '#ffffff' : (pt.isOutlier ? '#ffe4e6' : 'rgba(248, 250, 252, 0.7)')}
                            strokeWidth={isSelected ? 2.2 : (pt.isOutlier ? 1.4 : 0.9)}
                            className="cursor-pointer"
                            onPointerEnter={() => {
                                if (!isDragging) {
                                    setHovered({ point: pt, sx, sy });
                                }
                            }}
                            onPointerLeave={() => {
                                setHovered(prev => (prev?.point.id === pt.id ? null : prev));
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (!dragRef.current?.moved) {
                                    onSelectPoint(pt.id);
                                }
                            }}
                        />
                    );
                })}
            </svg>

            {/* Ayuda discreta de interacción en esquina inferior izquierda */}
            <div className="absolute bottom-2 left-3 text-[10px] text-slate-500 pointer-events-none">
                Arrastra para rotar 360° • Rueda para zoom • Clic en punto para diagnosticar
            </div>

            {/* Leyenda compacta de anillos de confianza T² */}
            {showConfidenceRings && confidenceEllipsoid && (
                <div className="absolute bottom-2 right-3 z-10 flex items-center gap-3 bg-slate-950/75 backdrop-blur border border-slate-800/80 rounded-md px-2.5 py-1 text-[10px] font-mono pointer-events-none">
                    <span className="flex items-center gap-1.5 text-cyan-300">
                        <span className="w-3.5 h-0.5 bg-cyan-400 inline-block rounded-full" />
                        95% T²
                    </span>
                    <span className="flex items-center gap-1.5 text-rose-300">
                        <span className="w-3.5 border-t border-dashed border-rose-400 inline-block" />
                        99% T²
                    </span>
                </div>
            )}

            {/* Tooltip Flotante */}
            {hovered && !isDragging && (
                <div
                    className="absolute z-20 pointer-events-none bg-slate-900/95 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-200 min-w-52"
                    style={{
                        left: Math.min(dimensions.width - 230, Math.max(12, hovered.sx + 14)),
                        top: Math.min(dimensions.height - 155, Math.max(48, hovered.sy - 20))
                    }}
                >
                    <div className="font-bold text-slate-100 flex items-center justify-between gap-2 mb-1.5">
                        <span>ID: {hovered.point.id}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getRobpcaStyle(hovered.point.robpcaType)}`}>
                            {getRobpcaLabel(hovered.point.robpcaType)}
                        </span>
                    </div>
                    <div className="text-slate-400 font-mono text-[11px]">
                        {xShort}: <span className="text-slate-100">{hovered.point.x}</span> | {yShort}: <span className="text-slate-100">{hovered.point.y}</span> | {zShort}: <span className="text-slate-100">{hovered.point.z}</span>
                    </div>
                    {hovered.point.analyticalValue !== undefined && (
                        <div className="text-slate-400 text-[11px]">
                            {analyticalProperty}: <span className="text-slate-100 font-mono">{hovered.point.analyticalValue}</span>
                        </div>
                    )}
                    <div className="text-slate-400 text-[11px]">
                        ROBPCA SD: <span className="text-slate-200 font-mono">{hovered.point.sd}</span> | OD: <span className="text-slate-200 font-mono">{hovered.point.od}</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                        Factor LOF: <span className={`font-mono font-bold ${hovered.point.isLofOutlier ? 'text-amber-400' : 'text-slate-200'}`}>{hovered.point.lofScore}</span>
                    </div>
                    {hovered.point.outlierReason && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[11px] font-medium text-slate-300">
                            {hovered.point.outlierReason}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Pca3DPlot;
