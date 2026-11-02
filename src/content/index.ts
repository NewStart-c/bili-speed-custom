import { MESSAGES, SELECTORS } from '../shared/constants';
import { clampRate, isEditableTarget, shortcutRateFromEvent } from '../shared/rate';
import { getSettings, subscribeSettings, updateSettings } from '../shared/storage';
import { DEFAULT_SETTINGS } from '../shared/settings';
import type { Settings } from '../shared/settings';
import { MenuController } from './menu';
import { PlayerController } from './player';

const ROUTE_INTERVAL_MS = 800;

interface StatusMessage {
    type: string;
    rate?: unknown;
    enabled?: unknown;
}

class App {
    private settings: Settings;
    private readonly player: PlayerController;
    private readonly menu: MenuController;
    private active = false;
    private routeKey = '';
    private observer: MutationObserver | null = null;
    private routeTimer: number | null = null;
    private rafPending = false;
    private settingsTimer: (() => void) | null = null;
    private lastLocalPersistAt = 0;
    private lastLocalPersistValue = Number.NaN;

    constructor(settings: Settings) {
        this.settings = settings;
        this.player = new PlayerController({
            onRateChanged: (rate) => this.menu.syncRate(rate),
            onUserRate: (rate) => { void this.persistUserRate(rate); },
        });
        this.menu = new MenuController(settings, {
            getCurrentRate: () => this.player.currentRate,
            onSelectRate: (rate) => this.player.setRate(rate, true),
            onNativeUserIntent: () => this.player.markUserIntent(),
            onClose: () => undefined,
        });
    }

    start(): void {
        this.routeKey = this.computeRouteKey();
        this.installKeyboard();
        this.installMessages();
        this.settingsTimer = subscribeSettings((settings) => this.onSettingsChanged(settings));
        window.addEventListener('popstate', () => this.checkRoute());

        this.observer = new MutationObserver((mutations) => this.onMutations(mutations));
        this.observer.observe(document.body, { childList: true, subtree: true });
        this.routeTimer = window.setInterval(() => this.checkRoute(), ROUTE_INTERVAL_MS);

        window.addEventListener('unload', () => this.stop());

        if (this.settings.enabled && this.isVideoRoute()) {
            this.activate();
        }
    }

    private stop(): void {
        this.settingsTimer?.();
        this.observer?.disconnect();
        if (this.routeTimer !== null) window.clearInterval(this.routeTimer);
        this.deactivate();
    }

    private isVideoRoute(): boolean {
        return /^\/video\//.test(location.pathname) || /^\/bangumi\/play\//.test(location.pathname);
    }

    private computeRouteKey(): string {
        const page = new URLSearchParams(location.search).get('p') ?? '';
        return `${location.pathname}?p=${page}`;
    }

    private checkRoute(): void {
        const nextKey = this.computeRouteKey();
        if (nextKey === this.routeKey) {
            // 作为观察器的兜底：播放器/菜单迟到或被包在更深的容器里时，
            // 也能在下一个 tick 完成发现与注入。
            if (this.active) this.syncDom();
            return;
        }
        this.routeKey = nextKey;

        if (this.settings.enabled && this.isVideoRoute()) {
            this.deactivate();
            this.activate();
        } else {
            this.deactivate();
        }
    }

    private activate(): void {
        if (this.active) return;
        this.active = true;

        this.menu.updateSettings(this.settings);
        this.player.setRate(this.settings.defaultRate, false);
        this.player.attach(true);
        this.syncDom();
    }

    private deactivate(): void {
        if (!this.active) return;
        this.active = false;
        this.player.destroy();
        this.menu.destroy();
    }

    private syncDom(): void {
        if (!this.active) return;
        this.player.attach();
        this.menu.inject();
    }

    private scheduleSync(): void {
        if (this.rafPending) return;
        this.rafPending = true;
        requestAnimationFrame(() => {
            this.rafPending = false;
            this.syncDom();
        });
    }

    private onMutations(mutations: MutationRecord[]): void {
        if (!this.active) return;

        const relevant = mutations.some((mutation) => {
            const target = mutation.target as Element | null;
            if (
                target?.closest?.(SELECTORS.playerContainer) ||
                target?.closest?.(SELECTORS.rateControl) ||
                target?.closest?.(SELECTORS.rateMenu)
            ) {
                return true;
            }

            // 只检查新增节点本身是否就是播放器/菜单，避免对评论区等大子树
            // 反复执行 querySelector；更深层的新增由 800ms 的兜底 tick 发现。
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node.matches?.(`${SELECTORS.playerContainer}, ${SELECTORS.rateControl}, ${SELECTORS.rateMenu}`)) {
                    return true;
                }
            }

            return false;
        });

        if (relevant) this.scheduleSync();
    }

    private installKeyboard(): void {
        document.addEventListener('keydown', (event) => {
            if (!this.active || isEditableTarget(event.target)) return;

            const rate = shortcutRateFromEvent(event);
            if (rate === null) return;

            event.preventDefault();
            event.stopPropagation();
            this.player.setRate(rate, true);
        }, true);
    }

    private installMessages(): void {
        chrome.runtime.onMessage.addListener((message: StatusMessage, _sender, sendResponse) => {
            if (!message || typeof message.type !== 'string') return false;

            if (message.type === MESSAGES.getStatus) {
                sendResponse(this.getStatus());
                return false;
            }

            if (message.type === MESSAGES.setRate) {
                const value = Number(message.rate);
                if (!Number.isFinite(value)) {
                    sendResponse({ ok: false });
                    return false;
                }

                const rate = clampRate(value);
                if (this.active) {
                    this.player.setRate(rate, true);
                } else {
                    void this.setDefaultRate(rate).catch((error) => {
                        console.warn('[bili-speed] failed to save default rate', error);
                    });
                }
                sendResponse({ ok: true, rate });
                return false;
            }

            if (message.type === MESSAGES.setEnabled) {
                const enabled = Boolean(message.enabled);
                void updateSettings({ enabled }).then((settings) => {
                    this.settings = settings;
                    if (!enabled) this.deactivate();
                }).catch((error) => {
                    console.warn('[bili-speed] failed to save enabled state', error);
                });
                sendResponse({ ok: true, enabled });
                return false;
            }

            return false;
        });
    }

    private getStatus(): Record<string, unknown> {
        return {
            supported: this.active,
            enabled: this.settings.enabled,
            rate: this.active ? this.player.currentRate : this.settings.defaultRate,
            desiredRate: this.active ? this.player.desired : this.settings.defaultRate,
            presets: this.settings.presets,
        };
    }

    private async setDefaultRate(rate: number): Promise<void> {
        const clamped = clampRate(rate);
        this.lastLocalPersistAt = Date.now();
        this.lastLocalPersistValue = clamped;
        const saved = await updateSettings({ defaultRate: clamped });
        this.settings = saved;
    }

    private async persistUserRate(rate: number): Promise<void> {
        const clamped = clampRate(rate);
        if (Math.abs(this.settings.defaultRate - clamped) < 0.0001) return;

        this.lastLocalPersistAt = Date.now();
        this.lastLocalPersistValue = clamped;
        try {
            this.settings = await updateSettings({ defaultRate: clamped });
        } catch (error) {
            console.warn('[bili-speed] failed to save rate', error);
        }
    }

    private onSettingsChanged(settings: Settings): void {
        const previous = this.settings;
        this.settings = settings;

        if (!settings.enabled) {
            this.deactivate();
            return;
        }

        if (!this.active && this.isVideoRoute()) {
            this.activate();
            return;
        }

        if (!this.active) return;

        this.menu.updateSettings(settings);

        const changedElsewhere = Math.abs(settings.defaultRate - previous.defaultRate) > 0.0001
            && !(Date.now() - this.lastLocalPersistAt < 1500
                && Math.abs(settings.defaultRate - this.lastLocalPersistValue) < 0.0001);

        if (changedElsewhere && Math.abs(this.player.desired - settings.defaultRate) > 0.0001) {
            this.player.setRate(settings.defaultRate, false);
        }
    }
}

async function main(): Promise<void> {
    const settings = await getSettings().catch((error) => {
        console.warn('[bili-speed] failed to load settings, using defaults', error);
        return DEFAULT_SETTINGS;
    });

    const app = new App(settings);
    app.start();
}

void main();
