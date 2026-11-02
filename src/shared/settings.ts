import { clampRate, DEFAULT_PRESETS, MAX_RATE, MIN_RATE } from './rate';

export type MemoryMode = 'global';

export interface Settings {
    schemaVersion: number;
    enabled: boolean;
    defaultRate: number;
    presets: number[];
    step: number;
    memoryMode: MemoryMode;
    smoothTransition: boolean;
    preservePitch: boolean;
    showOsd: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
    schemaVersion: 1,
    enabled: true,
    defaultRate: 1,
    presets: [...DEFAULT_PRESETS],
    step: 0.25,
    memoryMode: 'global',
    smoothTransition: false,
    preservePitch: true,
    showOsd: false,
};

export function normalizePresets(raw: unknown): number[] {
    if (!Array.isArray(raw)) return [...DEFAULT_PRESETS];

    const result: number[] = [];
    for (const value of raw) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) continue;

        const rate = clampRate(numeric);
        if (!result.some((existing) => Math.abs(existing - rate) < 0.0001)) {
            result.push(rate);
        }
        if (result.length >= 12) break;
    }

    return result.length > 0 ? result : [...DEFAULT_PRESETS];
}

export function normalizeSettings(raw: unknown): Settings {
    const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const rawRate = Number(input.defaultRate);
    const rawStep = input.step === undefined || input.step === null || input.step === ''
        ? Number.NaN
        : Number(input.step);

    return {
        schemaVersion: 1,
        enabled: typeof input.enabled === 'boolean' ? input.enabled : DEFAULT_SETTINGS.enabled,
        defaultRate: Number.isFinite(rawRate) && rawRate > 0
            ? clampRate(rawRate, DEFAULT_SETTINGS.defaultRate)
            : DEFAULT_SETTINGS.defaultRate,
        presets: normalizePresets(input.presets),
        step: Number.isFinite(rawStep) ? Math.min(1, Math.max(0.05, rawStep)) : DEFAULT_SETTINGS.step,
        memoryMode: 'global',
        smoothTransition: typeof input.smoothTransition === 'boolean' ? input.smoothTransition : DEFAULT_SETTINGS.smoothTransition,
        preservePitch: typeof input.preservePitch === 'boolean' ? input.preservePitch : DEFAULT_SETTINGS.preservePitch,
        showOsd: typeof input.showOsd === 'boolean' ? input.showOsd : DEFAULT_SETTINGS.showOsd,
    };
}

export function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
    return normalizeSettings({ ...base, ...patch });
}

export function normalizeStep(value: unknown): number {
    const step = value === undefined || value === null || value === '' ? Number.NaN : Number(value);
    return Number.isFinite(step) ? Math.min(1, Math.max(0.05, step)) : DEFAULT_SETTINGS.step;
}

export function isAllowedRate(value: number): boolean {
    return Number.isFinite(value) && value >= MIN_RATE && value <= MAX_RATE;
}
