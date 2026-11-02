import { describe, expect, it } from 'vitest';
import { DEFAULT_PRESETS, MAX_RATE, MIN_RATE } from '../../src/shared/rate';
import {
    DEFAULT_SETTINGS,
    mergeSettings,
    normalizePresets,
    normalizeSettings,
    normalizeStep,
} from '../../src/shared/settings';

describe('normalizeSettings', () => {
    it('returns defaults for empty input', () => {
        const settings = normalizeSettings(undefined);
        expect(settings.schemaVersion).toBe(1);
        expect(settings.enabled).toBe(true);
        expect(settings.defaultRate).toBe(1);
        expect(settings.presets).toEqual([...DEFAULT_PRESETS]);
        expect(settings.step).toBe(0.25);
        expect(settings.memoryMode).toBe('global');
    });

    it('clamps the default rate and step', () => {
        const low = normalizeSettings({ defaultRate: 0.01, step: 0 });
        expect(low.defaultRate).toBe(MIN_RATE);
        expect(low.step).toBe(0.05);

        const high = normalizeSettings({ defaultRate: 99, step: 5 });
        expect(high.defaultRate).toBe(MAX_RATE);
        expect(high.step).toBe(1);

        const invalid = normalizeSettings({ defaultRate: null, step: '' });
        expect(invalid.defaultRate).toBe(1);
        expect(invalid.step).toBe(0.25);
    });

    it('keeps booleans and ignores unsupported memory modes for now', () => {
        const settings = normalizeSettings({
            enabled: false,
            smoothTransition: true,
            preservePitch: false,
            memoryMode: 'video',
        });
        expect(settings.enabled).toBe(false);
        expect(settings.smoothTransition).toBe(true);
        expect(settings.preservePitch).toBe(false);
        expect(settings.memoryMode).toBe('global');
    });
});

describe('normalizePresets', () => {
    it('deduplicates, clamps and keeps valid order', () => {
        expect(normalizePresets([2.5, 2.5, 99, 0.01, '3'])).toEqual([2.5, MAX_RATE, MIN_RATE, 3]);
    });

    it('falls back to defaults when the list is empty or invalid', () => {
        expect(normalizePresets([])).toEqual([...DEFAULT_PRESETS]);
        expect(normalizePresets(['abc'])).toEqual([...DEFAULT_PRESETS]);
        expect(normalizePresets('2')).toEqual([...DEFAULT_PRESETS]);
    });

    it('limits the list to 12 entries', () => {
        const values = Array.from({ length: 20 }, (_, index) => index + 0.5);
        expect(normalizePresets(values)).toHaveLength(12);
    });
});

describe('mergeSettings', () => {
    it('merges patches and re-normalizes', () => {
        const merged = mergeSettings(DEFAULT_SETTINGS, { defaultRate: 2.5, presets: [3, 3] });
        expect(merged.defaultRate).toBe(2.5);
        expect(merged.presets).toEqual([3]);
        expect(merged.enabled).toBe(true);
    });
});

describe('normalizeStep', () => {
    it('bounds the step to 0.05–1', () => {
        expect(normalizeStep(0.1)).toBe(0.1);
        expect(normalizeStep('0.5')).toBe(0.5);
        expect(normalizeStep('')).toBe(0.25);
        expect(normalizeStep(null)).toBe(0.25);
        expect(normalizeStep('abc')).toBe(0.25);
    });
});
