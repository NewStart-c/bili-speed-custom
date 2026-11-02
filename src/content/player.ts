import { SELECTORS } from '../shared/constants';
import { clampRate } from '../shared/rate';

export type RateSource = 'extension' | 'user' | 'native' | 'external';

export interface PlayerCallbacks {
    /** 任意来源的倍速变化，用于同步菜单标签与高亮。 */
    onRateChanged: (rate: number, source: RateSource) => void;
    /** 用户主动改速（原生菜单、扩展菜单、快捷键、Popup），用于持久化。 */
    onUserRate: (rate: number) => void;
}

type MediaElement = HTMLMediaElement;

export class PlayerController {
    private media: MediaElement | null = null;
    private desiredRate = 1;
    private lastApplyAt = 0;
    private lastUserIntentAt = 0;
    private userIntentToken = 0;
    private reapplyTimer: number | null = null;
    private reapplyAttempts = 0;
    private cleanup: Array<() => void> = [];
    private readonly callbacks: PlayerCallbacks;

    constructor(callbacks: PlayerCallbacks) {
        this.callbacks = callbacks;
    }

    get element(): MediaElement | null {
        return this.media;
    }

    get currentRate(): number {
        return this.media ? this.media.playbackRate : this.desiredRate;
    }

    get desired(): number {
        return this.desiredRate;
    }

    findMedia(): MediaElement | null {
        const candidates = Array.from(document.querySelectorAll<MediaElement>('video, bwp-video'));
        const main = candidates.find((element) => Boolean(element.closest(SELECTORS.videoWrap)));
        if (main) return main;

        const playing = candidates.find((element) => !element.paused && !element.muted);
        if (playing) return playing;

        return candidates.find((element) => !element.muted) ?? candidates[0] ?? null;
    }

    /** 返回是否找到了可用的播放器元素。 */
    attach(force = false): boolean {
        const next = this.findMedia();
        if (!next) return false;

        const changed = next !== this.media;
        if (changed) {
            this.detachMedia();
            this.media = next;
            this.bindMedia(next);
        }

        // 只在播放器元素变化或明确要求时写入；不要因为一次 DOM 抖动
        // 恰好发生在用户点原生倍速菜单的瞬间，就把新倍速抢回旧值。
        if (changed || force) {
            this.applyDesiredRate();
        }

        return true;
    }

    setRate(rate: number, persist: boolean): number {
        this.desiredRate = clampRate(rate);
        this.reapplyAttempts = 0;
        this.applyDesiredRate();
        if (persist) {
            this.callbacks.onUserRate(this.desiredRate);
        }
        return this.desiredRate;
    }

    /** 在原生菜单点击前调用，让紧随其后的 ratechange 被识别为用户操作。 */
    markUserIntent(): void {
        const token = ++this.userIntentToken;
        this.lastUserIntentAt = Date.now();

        const check = () => {
            if (token !== this.userIntentToken) return;

            const media = this.media;
            if (!media) {
                this.lastUserIntentAt = 0;
                return;
            }

            const rate = media.playbackRate;
            if (Math.abs(rate - this.desiredRate) > 0.0001) {
                this.desiredRate = clampRate(rate);
                this.lastUserIntentAt = 0;
                this.callbacks.onUserRate(this.desiredRate);
                this.callbacks.onRateChanged(rate, 'user');
                return;
            }

            // 给异步的播放器处理器留一点时间；超时后关闭窗口，
            // 避免之后播放器自动重置倍速时被误判为用户操作。
            if (Date.now() - this.lastUserIntentAt < 250) {
                window.setTimeout(check, 50);
            } else {
                this.lastUserIntentAt = 0;
            }
        };

        window.setTimeout(check, 0);
    }

    destroy(): void {
        this.detachMedia();
        this.clearReapplyTimer();
    }

    private bindMedia(media: MediaElement): void {
        const onLoaded = () => this.scheduleReapply(0);
        const onEmptied = () => this.scheduleReapply(50);
        const onRateChange = () => this.handleRateChange();
        const onPlay = () => this.scheduleReapply(0);

        media.addEventListener('loadedmetadata', onLoaded);
        media.addEventListener('emptied', onEmptied);
        media.addEventListener('ratechange', onRateChange);
        media.addEventListener('play', onPlay);

        this.cleanup.push(() => {
            media.removeEventListener('loadedmetadata', onLoaded);
            media.removeEventListener('emptied', onEmptied);
            media.removeEventListener('ratechange', onRateChange);
            media.removeEventListener('play', onPlay);
        });
    }

    private detachMedia(): void {
        this.cleanup.forEach((dispose) => dispose());
        this.cleanup = [];
        this.media = null;
        this.clearReapplyTimer();
    }

    private applyDesiredRate(): void {
        const media = this.media;
        if (!media) return;

        const desired = clampRate(this.desiredRate);
        this.lastApplyAt = Date.now();

        try {
            media.defaultPlaybackRate = desired;
            media.playbackRate = desired;
        } catch {
            // 某些自定义播放器元素可能暂时不允许写入，后续事件会再尝试。
        }

        this.callbacks.onRateChanged(desired, 'extension');
    }

    private handleRateChange(): void {
        const media = this.media;
        if (!media) return;

        const rate = clampRate(media.playbackRate);
        if (Math.abs(rate - this.desiredRate) < 0.0001) {
            this.reapplyAttempts = 0;
            this.callbacks.onRateChanged(rate, 'native');
            return;
        }

        if (Date.now() - this.lastUserIntentAt < 2000) {
            this.desiredRate = rate;
            this.lastUserIntentAt = 0;
            this.reapplyAttempts = 0;
            this.callbacks.onUserRate(rate);
            this.callbacks.onRateChanged(rate, 'user');
            return;
        }

        // 播放器换源/换清晰度可能把倍速重置；短暂等待后再恢复，
        // 但限制重试次数，避免和播放器互相覆盖。
        this.scheduleReapply(Date.now() - this.lastApplyAt < 400 ? 150 : 0);
    }

    private scheduleReapply(delay: number): void {
        if (this.reapplyAttempts >= 5) return;
        this.clearReapplyTimer();

        this.reapplyTimer = window.setTimeout(() => {
            this.reapplyTimer = null;
            const media = this.media;
            if (!media) return;

            if (Math.abs(media.playbackRate - this.desiredRate) < 0.0001) return;

            this.reapplyAttempts += 1;
            this.applyDesiredRate();
        }, delay);
    }

    private clearReapplyTimer(): void {
        if (this.reapplyTimer !== null) {
            window.clearTimeout(this.reapplyTimer);
            this.reapplyTimer = null;
        }
    }
}
