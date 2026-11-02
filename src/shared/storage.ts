import { STORAGE_KEYS } from './constants';
import { clampRate } from './rate';
import { DEFAULT_SETTINGS, mergeSettings, normalizeSettings } from './settings';
import type { Settings } from './settings';

type SettingsListener = (settings: Settings) => void;

function readLocal(keys: string[]): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, (result) => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve(result);
        });
    });
}

function writeLocal(values: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set(values, () => {
            const error = chrome.runtime.lastError;
            if (error) {
                reject(new Error(error.message));
                return;
            }
            resolve();
        });
    });
}

/**
 * 读取设置；如果旧版 bili_global_speed 存在且新设置为空，会一次性迁移。
 */
export async function getSettings(): Promise<Settings> {
    const stored = await readLocal([STORAGE_KEYS.settings, STORAGE_KEYS.legacyRate]);
    const raw = stored[STORAGE_KEYS.settings];

    if (raw && typeof raw === 'object') {
        return normalizeSettings(raw);
    }

    const legacy = Number(stored[STORAGE_KEYS.legacyRate]);
    const migrated = normalizeSettings({
        defaultRate: Number.isFinite(legacy) && legacy > 0 ? clampRate(legacy) : DEFAULT_SETTINGS.defaultRate,
    });
    await writeLocal({ [STORAGE_KEYS.settings]: migrated });
    return migrated;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
    const normalized = normalizeSettings(settings);
    await writeLocal({ [STORAGE_KEYS.settings]: normalized });
    return normalized;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const current = await getSettings();
    return saveSettings(mergeSettings(current, patch));
}

export async function resetSettings(): Promise<Settings> {
    return saveSettings(DEFAULT_SETTINGS);
}

export function subscribeSettings(listener: SettingsListener): () => void {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local') return;
        const change = changes[STORAGE_KEYS.settings];
        if (!change) return;
        listener(normalizeSettings(change.newValue));
    };

    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
}
