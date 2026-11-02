export const MIN_RATE = 0.0625;
export const MAX_RATE = 16;
export const DEFAULT_PRESETS = [2.5, 3, 3.5, 4] as const;

export function clampRate(value: number, fallback = 1): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(MAX_RATE, Math.max(MIN_RATE, value));
}

export interface ParsedRate {
    value: number;
    clamped: boolean;
}

/**
 * 解析用户输入的倍速。接受 "1.5"、"1,5"、" 2 " 等格式。
 * 非数字、空值、0 和负数返回 null；超出范围的正数会被钳制并标记 clamped。
 */
export function parseRateInput(raw: string): ParsedRate | null {
    const normalized = raw.trim().replace(',', '.');
    if (!normalized) return null;

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;

    const value = clampRate(parsed);
    return { value, clamped: value !== parsed };
}

export function formatRateValue(rate: number): string {
    return Number.isInteger(rate) ? rate.toFixed(1) : String(rate);
}

export function formatRate(rate: number): string {
    return `${formatRateValue(rate)}x`;
}

/**
 * 快捷键映射使用 e.code，避免 AZERTY 等布局下 e.key 变成 !@# 的问题。
 */
export function shortcutRateFromEvent(event: Pick<KeyboardEvent, 'code' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>): number | null {
    if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return null;

    switch (event.code) {
        case 'Digit1':
        case 'Numpad1':
            return 1;
        case 'Digit2':
        case 'Numpad2':
            return 2;
        case 'Digit3':
        case 'Numpad3':
            return 3;
        default:
            return null;
    }
}

export function isEditableTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    if (!element || typeof element.tagName !== 'string') return false;

    const tag = element.tagName.toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable === true;
}
