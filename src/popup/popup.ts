import { MESSAGES } from '../shared/constants';
import { clampRate, formatRate, formatRateValue, parseRateInput } from '../shared/rate';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { Settings } from '../shared/settings';
import { getSettings, subscribeSettings, updateSettings } from '../shared/storage';

interface StatusResponse {
    supported?: boolean;
    enabled?: boolean;
    rate?: number;
    presets?: number[];
}

interface SetRateResponse {
    ok?: boolean;
    rate?: number;
}

const $ = <T extends HTMLElement>(selector: string): T => {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`missing element: ${selector}`);
    return element;
};

const pageStatus = $<HTMLParagraphElement>('#pageStatus');
const currentRateEl = $<HTMLElement>('#currentRate');
const presetsEl = $<HTMLDivElement>('#presets');
const rateForm = $<HTMLFormElement>('#rateForm');
const rateInput = $<HTMLInputElement>('#rateInput');
const feedbackEl = $<HTMLParagraphElement>('#feedback');
const resetButton = $<HTMLButtonElement>('#reset');
const enabledInput = $<HTMLInputElement>('#enabled');
const openOptionsButton = $<HTMLButtonElement>('#openOptions');

let settings: Settings = DEFAULT_SETTINGS;
let tabId: number | null = null;
let supported = false;
let currentRate = 1;
let feedbackTimer: number | null = null;

function queryActiveTab(): Promise<chrome.tabs.Tab | undefined> {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
    });
}

function sendToTab<T>(id: number, message: Record<string, unknown>): Promise<T | null> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(id, message, (response: T | undefined) => {
            if (chrome.runtime.lastError) {
                resolve(null);
                return;
            }
            resolve(response ?? null);
        });
    });
}

function showFeedback(text: string): void {
    if (feedbackTimer !== null) window.clearTimeout(feedbackTimer);
    feedbackEl.textContent = text;
    feedbackTimer = window.setTimeout(() => {
        feedbackEl.textContent = '';
        feedbackTimer = null;
    }, 2200);
}

function renderStatus(): void {
    enabledInput.checked = settings.enabled;

    if (!settings.enabled) {
        pageStatus.textContent = '扩展已暂停';
        return;
    }

    pageStatus.textContent = supported
        ? '当前页面已连接'
        : '当前页面不支持，修改将保存为默认倍速';
}

function renderCurrentRate(): void {
    currentRateEl.textContent = formatRate(currentRate);
    rateInput.placeholder = `例如 ${formatRateValue(currentRate)}`;
}

function renderPresets(): void {
    presetsEl.replaceChildren();
    settings.presets.forEach((rate) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = formatRate(rate);
        button.addEventListener('click', () => {
            void applyRate(rate);
        });
        presetsEl.appendChild(button);
    });
}

function render(): void {
    renderStatus();
    renderCurrentRate();
    renderPresets();
}

async function applyRate(rate: number): Promise<void> {
    const clamped = clampRate(rate);

    if (supported && tabId !== null) {
        const response = await sendToTab<SetRateResponse>(tabId, {
            type: MESSAGES.setRate,
            rate: clamped,
        });

        if (response?.ok) {
            currentRate = typeof response.rate === 'number' ? response.rate : clamped;
            renderCurrentRate();
            return;
        }

        supported = false;
        renderStatus();
    }

    const saved = await updateSettings({ defaultRate: clamped });
    settings = saved;
    currentRate = clamped;
    renderCurrentRate();
    showFeedback('已保存为默认倍速');
}

async function setEnabled(enabled: boolean): Promise<void> {
    if (supported && tabId !== null) {
        const response = await sendToTab<{ ok?: boolean }>(tabId, {
            type: MESSAGES.setEnabled,
            enabled,
        });
        if (response?.ok) {
            settings.enabled = enabled;
            renderStatus();
            return;
        }
    }

    const saved = await updateSettings({ enabled });
    settings = saved;
    renderStatus();
}

async function init(): Promise<void> {
    settings = await getSettings();
    currentRate = settings.defaultRate;
    render();

    const tab = await queryActiveTab();
    if (tab?.id !== undefined) {
        tabId = tab.id;
        const status = await sendToTab<StatusResponse>(tabId, { type: MESSAGES.getStatus });

        if (status?.supported) {
            supported = true;
            settings.enabled = status.enabled ?? settings.enabled;
            currentRate = typeof status.rate === 'number' ? status.rate : settings.defaultRate;
            if (Array.isArray(status.presets) && status.presets.length > 0) {
                settings.presets = status.presets;
            }
            render();
        }
    }

    subscribeSettings((next) => {
        settings = next;
        currentRate = next.defaultRate;
        render();
    });

    rateForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const parsed = parseRateInput(rateInput.value);
        if (!parsed) {
            showFeedback('请输入 0.0625–16 之间的数字');
            return;
        }
        if (parsed.clamped) {
            showFeedback(`已限制为 ${formatRate(parsed.value)}`);
        }
        rateInput.value = formatRateValue(parsed.value);
        void applyRate(parsed.value);
    });

    resetButton.addEventListener('click', () => {
        void applyRate(1);
    });

    enabledInput.addEventListener('change', () => {
        void setEnabled(enabledInput.checked);
    });

    openOptionsButton.addEventListener('click', () => {
        void chrome.runtime.openOptionsPage();
    });
}

void init().catch((error) => {
    console.error('[bili-speed] popup init failed', error);
});
