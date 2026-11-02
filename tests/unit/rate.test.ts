import { describe, expect, it } from 'vitest';
import {
    clampRate,
    formatRate,
    formatRateValue,
    isEditableTarget,
    MAX_RATE,
    MIN_RATE,
    parseRateInput,
    shortcutRateFromEvent,
} from '../../src/shared/rate';

describe('parseRateInput', () => {
    it('parses normal decimals', () => {
        expect(parseRateInput('2.5')).toEqual({ value: 2.5, clamped: false });
    });

    it('accepts comma decimals and surrounding spaces', () => {
        expect(parseRateInput(' 1,75 ')).toEqual({ value: 1.75, clamped: false });
    });

    it('rejects empty, non-numeric, zero and negative values', () => {
        expect(parseRateInput('')).toBeNull();
        expect(parseRateInput('   ')).toBeNull();
        expect(parseRateInput('abc')).toBeNull();
        expect(parseRateInput('0')).toBeNull();
        expect(parseRateInput('-2')).toBeNull();
    });

    it('clamps values outside the allowed range', () => {
        expect(parseRateInput('99')).toEqual({ value: MAX_RATE, clamped: true });
        expect(parseRateInput('0.01')).toEqual({ value: MIN_RATE, clamped: true });
    });
});

describe('rate formatting', () => {
    it('formats integer values with one decimal place', () => {
        expect(formatRateValue(3)).toBe('3.0');
        expect(formatRate(3)).toBe('3.0x');
    });

    it('keeps decimal values as-is', () => {
        expect(formatRateValue(2.5)).toBe('2.5');
        expect(formatRate(2.5)).toBe('2.5x');
    });

    it('falls back when clamping a non-finite value', () => {
        expect(clampRate(Number.NaN, 2)).toBe(2);
        expect(clampRate(0)).toBe(MIN_RATE);
        expect(clampRate(100)).toBe(MAX_RATE);
    });
});

describe('shortcutRateFromEvent', () => {
    const base = {
        code: 'Digit1',
        shiftKey: true,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
    };

    it('maps Shift+1/2/3 by physical code', () => {
        expect(shortcutRateFromEvent(base)).toBe(1);
        expect(shortcutRateFromEvent({ ...base, code: 'Digit2' })).toBe(2);
        expect(shortcutRateFromEvent({ ...base, code: 'Digit3' })).toBe(3);
        expect(shortcutRateFromEvent({ ...base, code: 'Numpad2' })).toBe(2);
    });

    it('ignores other modifiers and other keys', () => {
        expect(shortcutRateFromEvent({ ...base, shiftKey: false })).toBeNull();
        expect(shortcutRateFromEvent({ ...base, ctrlKey: true })).toBeNull();
        expect(shortcutRateFromEvent({ ...base, altKey: true })).toBeNull();
        expect(shortcutRateFromEvent({ ...base, code: 'Digit4' })).toBeNull();
    });
});

describe('isEditableTarget', () => {
    it('detects form fields and contenteditable', () => {
        expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
        expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
        expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
        expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBe(true);
    });

    it('allows the video area and document targets', () => {
        expect(isEditableTarget({ tagName: 'VIDEO' } as unknown as EventTarget)).toBe(false);
        expect(isEditableTarget(null)).toBe(false);
    });
});
