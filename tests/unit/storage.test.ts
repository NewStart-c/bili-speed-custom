import { afterEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '../../src/shared/constants';
import { normalizeSettings } from '../../src/shared/settings';
import {
    getSettings,
    resetSettings,
    saveSettings,
    subscribeSettings,
    updateSettings,
} from '../../src/shared/storage';

type ChangeRecord = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type ChangeListener = (changes: ChangeRecord, areaName: string) => void;

function createChromeHarness(initial: Record<string, unknown> = {}) {
    const store = new Map<string, unknown>(Object.entries(initial));
    const listeners = new Set<ChangeListener>();

    const local = {
        get(keys: string[], callback: (items: Record<string, unknown>) => void) {
            const result: Record<string, unknown> = {};
            for (const key of keys) {
                if (store.has(key)) result[key] = store.get(key);
            }
            queueMicrotask(() => callback(result));
        },
        set(values: Record<string, unknown>, callback?: () => void) {
            const changes: ChangeRecord = {};
            for (const [key, value] of Object.entries(values)) {
                changes[key] = { oldValue: store.get(key), newValue: value };
                store.set(key, value);
            }
            queueMicrotask(() => {
                listeners.forEach((listener) => listener(changes, 'local'));
                callback?.();
            });
        },
    };

    const onChanged = {
        addListener(listener: ChangeListener) {
            listeners.add(listener);
        },
        removeListener(listener: ChangeListener) {
            listeners.delete(listener);
        },
    };

    vi.stubGlobal('chrome', {
        storage: { local, onChanged },
        runtime: { lastError: undefined },
    });

    return { store, listeners };
}

describe('settings storage', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('migrates the legacy global rate key', async () => {
        const { store } = createChromeHarness({ [STORAGE_KEYS.legacyRate]: 2.5 });
        const settings = await getSettings();

        expect(settings.defaultRate).toBe(2.5);
        const persisted = store.get(STORAGE_KEYS.settings) as { defaultRate: number };
        expect(persisted.defaultRate).toBe(2.5);
    });

    it('persists defaults when no settings exist', async () => {
        const { store } = createChromeHarness();
        const settings = await getSettings();

        expect(settings.defaultRate).toBe(1);
        expect(store.has(STORAGE_KEYS.settings)).toBe(true);
    });

    it('merges updates without dropping other fields', async () => {
        const initial = normalizeSettings({ defaultRate: 2, presets: [3] });
        createChromeHarness({ [STORAGE_KEYS.settings]: initial });

        const updated = await updateSettings({ enabled: false });
        expect(updated.enabled).toBe(false);
        expect(updated.defaultRate).toBe(2);
        expect(updated.presets).toEqual([3]);
    });

    it('notifies subscribers and supports unsubscribe', async () => {
        const harness = createChromeHarness();
        const listener = vi.fn();
        const unsubscribe = subscribeSettings(listener);

        await saveSettings(normalizeSettings({ defaultRate: 1.5 }));
        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0]?.[0]).toMatchObject({ defaultRate: 1.5 });

        unsubscribe();
        await saveSettings(normalizeSettings({ defaultRate: 2 }));
        expect(listener).toHaveBeenCalledTimes(1);
        expect(harness.store.has(STORAGE_KEYS.settings)).toBe(true);
    });

    it('resets to defaults', async () => {
        createChromeHarness({
            [STORAGE_KEYS.settings]: normalizeSettings({ defaultRate: 3, enabled: false }),
        });

        const settings = await resetSettings();
        expect(settings.defaultRate).toBe(1);
        expect(settings.enabled).toBe(true);
        expect(settings.presets).toEqual([2.5, 3, 3.5, 4]);
    });
});
