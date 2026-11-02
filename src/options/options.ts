import { formatRate, formatRateValue, parseRateInput } from '../shared/rate';
import {
    DEFAULT_SETTINGS,
    normalizeSettings,
    normalizeStep,
} from '../shared/settings';
import type { Settings } from '../shared/settings';
import { getSettings, saveSettings, subscribeSettings } from '../shared/storage';

const $ = <T extends HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`missing element: ${selector}`);
    return element;
};

const enabledInput = $<HTMLInputElement>('#enabled');
const defaultRateInput = $<HTMLInputElement>('#defaultRate');
const stepInput = $<HTMLInputElement>('#step');
const presetList = $<HTMLUListElement>('#presetList');
const presetForm = $<HTMLFormElement>('#presetForm');
const newPresetInput = $<HTMLInputElement>('#newPreset');
const presetFeedback = $<HTMLParagraphElement>('#presetFeedback');
const exportButton = $<HTMLButtonElement>('#export');
const importInput = $<HTMLInputElement>('#import');
const resetButton = $<HTMLButtonElement>('#reset');
const saveButton = $<HTMLButtonElement>('#save');
const saveStatus = $<HTMLSpanElement>('#saveStatus');
const versionEl = $<HTMLSpanElement>('#version');

let draft: Settings = cloneSettings(DEFAULT_SETTINGS);
let dirty = false;
let statusTimer: number | null = null;
let presetFeedbackTimer: number | null = null;

function cloneSettings(settings: Settings): Settings {
    return { ...settings, presets: [...settings.presets] };
}

function setStatus(text: string, isError = false): void {
    if (statusTimer !== null) window.clearTimeout(statusTimer);
    saveStatus.textContent = text;
    saveStatus.classList.toggle('error', isError);
    if (text) {
        statusTimer = window.setTimeout(() => {
            saveStatus.textContent = '';
            saveStatus.classList.remove('error');
            statusTimer = null;
        }, 2600);
    }
}

function setPresetFeedback(text: string, isError = true): void {
    if (presetFeedbackTimer !== null) window.clearTimeout(presetFeedbackTimer);
    presetFeedback.textContent = text;
    presetFeedback.classList.toggle('ok', !isError);
    if (text) {
        presetFeedbackTimer = window.setTimeout(() => {
            presetFeedback.textContent = '';
            presetFeedback.classList.remove('ok');
            presetFeedbackTimer = null;
        }, 2400);
    }
}

function markDirty(): void {
    dirty = true;
    if (statusTimer !== null) {
        window.clearTimeout(statusTimer);
        statusTimer = null;
    }
    saveStatus.textContent = '有未保存的修改';
    saveStatus.classList.remove('error');
}

function renderPresets(): void {
    presetList.replaceChildren();

    draft.presets.forEach((rate, index) => {
        const row = document.createElement('li');
        row.className = 'preset-row';

        const value = document.createElement('span');
        value.className = 'preset-value';
        value.textContent = formatRate(rate);

        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'icon-button';
        up.textContent = '↑';
        up.setAttribute('aria-label', `上移 ${formatRate(rate)}`);
        up.disabled = index === 0;
        up.addEventListener('click', () => {
            if (index === 0) return;
            [draft.presets[index - 1], draft.presets[index]] = [draft.presets[index]!, draft.presets[index - 1]!];
            markDirty();
            renderPresets();
        });

        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'icon-button';
        down.textContent = '↓';
        down.setAttribute('aria-label', `下移 ${formatRate(rate)}`);
        down.disabled = index === draft.presets.length - 1;
        down.addEventListener('click', () => {
            if (index >= draft.presets.length - 1) return;
            [draft.presets[index + 1], draft.presets[index]] = [draft.presets[index]!, draft.presets[index + 1]!];
            markDirty();
            renderPresets();
        });

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-button';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `删除 ${formatRate(rate)}`);
        remove.disabled = draft.presets.length <= 1;
        remove.addEventListener('click', () => {
            if (draft.presets.length <= 1) {
                setPresetFeedback('至少保留 1 个预设');
                return;
            }
            draft.presets.splice(index, 1);
            markDirty();
            renderPresets();
        });

        row.append(value, up, down, remove);
        presetList.appendChild(row);
    });
}

function render(): void {
    enabledInput.checked = draft.enabled;
    defaultRateInput.value = formatRateValue(draft.defaultRate);
    stepInput.value = String(draft.step);
    renderPresets();
}

async function save(): Promise<void> {
    const parsedRate = parseRateInput(defaultRateInput.value);
    if (!parsedRate) {
        setStatus('默认倍速需在 0.0625–16 之间', true);
        return;
    }

    if (stepInput.value.trim() !== '' && !Number.isFinite(Number(stepInput.value))) {
        setStatus('微调步长需为数字', true);
        return;
    }

    const next = normalizeSettings({
        ...draft,
        defaultRate: parsedRate.value,
        step: normalizeStep(stepInput.value),
        enabled: enabledInput.checked,
    });

    try {
        draft = await saveSettings(next);
        dirty = false;
        render();
        setStatus(parsedRate.clamped ? `已限制为 ${formatRate(parsedRate.value)} 并保存` : '已保存');
    } catch (error) {
        console.warn('[bili-speed] failed to save options', error);
        setStatus('保存失败，请重试', true);
    }
}

function exportSettings(): void {
    const payload = {
        app: 'bili-speed-custom',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        settings: draft,
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bili-speed-custom-settings.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('已导出设置');
}

async function importSettings(file: File): Promise<void> {
    try {
        const text = await file.text();
        const parsed = JSON.parse(text) as { settings?: unknown } | unknown;
        const raw = parsed && typeof parsed === 'object' && 'settings' in parsed
            ? (parsed as { settings?: unknown }).settings
            : parsed;
        const next = normalizeSettings(raw);
        draft = await saveSettings(next);
        dirty = false;
        render();
        setStatus('已导入设置');
    } catch (error) {
        console.warn('[bili-speed] failed to import settings', error);
        setStatus('导入失败：文件格式不正确', true);
    } finally {
        importInput.value = '';
    }
}

async function reset(): Promise<void> {
    if (!window.confirm('确定恢复默认设置吗？当前预设和默认倍速会被覆盖。')) return;

    draft = await saveSettings(normalizeSettings(DEFAULT_SETTINGS));
    dirty = false;
    render();
    setStatus('已恢复默认设置');
}

async function init(): Promise<void> {
    versionEl.textContent = chrome.runtime.getManifest().version;
    draft = cloneSettings(await getSettings());
    render();

    subscribeSettings((next) => {
        if (dirty) return;
        draft = cloneSettings(next);
        render();
    });

    enabledInput.addEventListener('change', () => {
        draft.enabled = enabledInput.checked;
        markDirty();
    });
    defaultRateInput.addEventListener('input', markDirty);
    stepInput.addEventListener('input', markDirty);

    presetForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const parsed = parseRateInput(newPresetInput.value);
        if (!parsed) {
            setPresetFeedback('请输入 0.0625–16 之间的数字');
            return;
        }
        if (draft.presets.some((rate) => Math.abs(rate - parsed.value) < 0.0001)) {
            setPresetFeedback('该预设已存在');
            return;
        }
        if (draft.presets.length >= 12) {
            setPresetFeedback('最多只能添加 12 个预设');
            return;
        }

        draft.presets.push(parsed.value);
        newPresetInput.value = '';
        markDirty();
        renderPresets();
        setPresetFeedback(`已添加 ${formatRate(parsed.value)}`, false);
        newPresetInput.focus();
    });

    saveButton.addEventListener('click', () => { void save(); });
    exportButton.addEventListener('click', exportSettings);
    resetButton.addEventListener('click', () => { void reset(); });
    importInput.addEventListener('change', () => {
        const file = importInput.files?.[0];
        if (file) void importSettings(file);
    });
}

void init().catch((error) => {
    console.error('[bili-speed] options init failed', error);
});
