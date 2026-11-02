import { SELECTORS } from '../shared/constants';
import { clampRate, formatRate, formatRateValue, parseRateInput } from '../shared/rate';
import type { Settings } from '../shared/settings';

export interface MenuCallbacks {
    getCurrentRate: () => number;
    onSelectRate: (rate: number) => void;
    onNativeUserIntent: () => void;
    onClose: () => void;
}

type MenuItem = HTMLElement;

export class MenuController {
    private settings: Settings;
    private readonly callbacks: MenuCallbacks;
    private control: HTMLElement | null = null;
    private menu: HTMLElement | null = null;
    private cleanup: Array<() => void> = [];
    private classObserver: MutationObserver | null = null;
    private feedbackTimer: number | null = null;

    constructor(settings: Settings, callbacks: MenuCallbacks) {
        this.settings = settings;
        this.callbacks = callbacks;
    }

    updateSettings(settings: Settings): void {
        this.settings = settings;
        this.inject();
    }

    /** 尝试找到并注入原生菜单；返回是否找到菜单。 */
    inject(): boolean {
        const videoWrap = document.querySelector<HTMLElement>(SELECTORS.videoWrap);
        const playerRoot = videoWrap?.closest<HTMLElement>(SELECTORS.playerContainer)
            ?? document.querySelector<HTMLElement>(SELECTORS.playerContainer);
        const control = playerRoot?.querySelector<HTMLElement>(SELECTORS.rateControl)
            ?? document.querySelector<HTMLElement>(SELECTORS.rateControl);
        const menu = control?.querySelector<HTMLElement>(SELECTORS.rateMenu)
            ?? document.querySelector<HTMLElement>(SELECTORS.rateMenu);

        if (!menu) return false;

        if (control !== this.control || menu !== this.menu) {
            this.detachControl();
            this.control = control;
            this.menu = menu;
            if (control) this.bindControl(control);
        }

        this.renderPresets();
        this.renderInput();
        this.syncRate(this.callbacks.getCurrentRate());
        return true;
    }

    syncRate(rate: number): void {
        const menu = this.menu;
        if (!menu) return;

        const result = this.control?.querySelector<HTMLElement>(SELECTORS.rateResult)
            ?? document.querySelector<HTMLElement>(SELECTORS.rateResult);
        const label = formatRate(rate);
        if (result && result.innerText !== label) {
            result.innerText = label;
        }

        menu.querySelectorAll<HTMLElement>(SELECTORS.rateItem).forEach((item) => {
            const value = Number(item.dataset.value);
            const matches = Number.isFinite(value) && Math.abs(value - rate) < 0.0001;
            item.classList.toggle('bpx-state-active', matches);
        });
    }

    close(): void {
        const control = this.control ?? document.querySelector<HTMLElement>(SELECTORS.rateControl);
        const menu = this.menu ?? control?.querySelector<HTMLElement>(SELECTORS.rateMenu);
        if (!menu && !control) return;

        control?.classList.remove('bpx-state-show');
        menu?.classList.remove('bpx-state-show');
        menu?.style.removeProperty('display');

        // 个别播放器版本不通过 bpx-state-show 控制显隐时，用我们自己的类兜底。
        // 该禁用类会在用户再次操作控件时被移除，不会永久挡住菜单。
        if (menu && getComputedStyle(menu).display !== 'none') {
            menu.classList.add(SELECTORS.hiddenClass);
        }

        this.callbacks.onClose();
    }

    destroy(): void {
        const menu = this.menu;
        menu?.querySelectorAll(SELECTORS.customItem).forEach((element) => element.remove());
        menu?.querySelector(SELECTORS.customInputWrap)?.remove();
        menu?.classList.remove(SELECTORS.hiddenClass);
        this.detachControl();
    }

    private bindControl(control: HTMLElement): void {
        const clearHidden = () => {
            control.querySelector<HTMLElement>(SELECTORS.rateMenu)?.classList.remove(SELECTORS.hiddenClass);
        };

        const onPointer = (event: Event) => {
            clearHidden();
            const target = event.target as HTMLElement | null;
            const item = target?.closest(SELECTORS.rateItem);
            // 扩展自己的预设项由 setRate 直接处理，不需要再走“原生用户意图”窗口。
            if (item && !item.classList.contains('custom-speed-item')) {
                this.callbacks.onNativeUserIntent();
            }
        };

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const target = event.target as HTMLElement | null;
            const item = target?.closest(SELECTORS.rateItem);
            if (item && !item.classList.contains('custom-speed-item')) {
                this.callbacks.onNativeUserIntent();
            }
        };

        control.addEventListener('mouseenter', clearHidden, true);
        control.addEventListener('pointerdown', onPointer, true);
        control.addEventListener('click', onPointer, true);
        control.addEventListener('focusin', clearHidden, true);
        control.addEventListener('keydown', onKeyDown, true);

        const observer = new MutationObserver(() => {
            if (control.classList.contains('bpx-state-show')) clearHidden();
        });
        observer.observe(control, { attributes: true, attributeFilter: ['class'] });
        this.classObserver = observer;

        this.cleanup.push(() => {
            control.removeEventListener('mouseenter', clearHidden, true);
            control.removeEventListener('pointerdown', onPointer, true);
            control.removeEventListener('click', onPointer, true);
            control.removeEventListener('focusin', clearHidden, true);
            control.removeEventListener('keydown', onKeyDown, true);
        });
    }

    private renderPresets(): void {
        const menu = this.menu;
        if (!menu) return;

        const desiredRates = this.desiredPresetRates(menu);
        const existing = Array.from(menu.querySelectorAll<HTMLElement>(SELECTORS.customItem));
        const values = existing.map((element) => Number(element.dataset.value));
        const unchanged = values.length === desiredRates.length
            && values.every((value, index) => Math.abs(value - desiredRates[index]!) < 0.0001);
        if (unchanged) return;

        existing.forEach((element) => element.remove());

        const inputWrap = menu.querySelector<HTMLElement>(SELECTORS.customInputWrap);
        desiredRates.forEach((rate) => {
            const item = this.createPresetItem(rate);
            if (inputWrap) {
                menu.insertBefore(item, inputWrap);
            } else {
                menu.appendChild(item);
            }
        });
    }

    /**
     * 如果原生播放器或其他倍速脚本已经提供了同一档位，就不再重复注入。
     * 这能让本扩展与 Bilibili-Evolved 等脚本同时使用时更干净。
     */
    private desiredPresetRates(menu: HTMLElement): number[] {
        const external: number[] = [];
        menu.querySelectorAll<HTMLElement>(SELECTORS.rateItem).forEach((item) => {
            if (item.classList.contains('custom-speed-item')) return;
            const value = Number(item.dataset.value);
            if (Number.isFinite(value)) external.push(value);
        });

        return this.settings.presets.filter(
            (rate) => !external.some((value) => Math.abs(value - rate) < 0.0001),
        );
    }

    private createPresetItem(rate: number): MenuItem {
        const item = document.createElement('li');
        item.className = 'bpx-player-ctrl-playbackrate-menu-item custom-speed-item';
        item.dataset.value = String(rate);
        item.dataset.customRate = 'true';
        item.textContent = formatRate(rate);
        item.tabIndex = 0;
        item.setAttribute('role', 'menuitem');

        const select = (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            this.callbacks.onSelectRate(rate);
            this.close();
        };

        item.addEventListener('click', select);
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                select(event);
            }
        });

        return item;
    }

    private renderInput(): void {
        const menu = this.menu;
        if (!menu || menu.querySelector(SELECTORS.customInput)) return;

        const wrap = document.createElement('li');
        wrap.className = 'custom-speed-input-wrap';
        wrap.setAttribute('role', 'presentation');

        const row = document.createElement('div');
        row.className = 'custom-speed-input-row';

        const minus = this.createStepButton('−', -1);
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.className = 'custom-speed-input';
        input.placeholder = '自定义倍速';
        input.title = '输入倍速后按 Enter 应用，Esc 关闭';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('aria-label', '自定义播放倍速，输入后按 Enter 应用');

        const plus = this.createStepButton('+', 1);
        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'custom-speed-reset';
        reset.textContent = '1x';
        reset.title = '恢复 1 倍速';
        reset.setAttribute('aria-label', '恢复 1 倍速');

        const feedback = document.createElement('span');
        feedback.className = 'custom-speed-feedback';
        feedback.setAttribute('role', 'status');

        const applyInput = () => {
            const parsed = parseRateInput(input.value);
            if (!parsed) {
                input.classList.add(SELECTORS.invalidClass);
                input.setAttribute('aria-invalid', 'true');
                this.showFeedback('请输入 0.0625–16 之间的数字');
                return;
            }
            if (parsed.clamped) {
                this.showFeedback(`已限制为 ${formatRate(parsed.value)}`);
            }
            this.callbacks.onSelectRate(parsed.value);
            this.close();
        };

        input.addEventListener('focus', () => {
            if (!input.value) {
                input.value = formatRateValue(this.callbacks.getCurrentRate());
            }
            input.select();
        });
        input.addEventListener('input', () => {
            input.classList.remove(SELECTORS.invalidClass);
            input.removeAttribute('aria-invalid');
        });
        input.addEventListener('keydown', (event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
                event.preventDefault();
                applyInput();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
            }
        });
        input.addEventListener('click', (event) => event.stopPropagation());

        reset.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.callbacks.onSelectRate(1);
            this.close();
        });

        minus.addEventListener('click', (event) => event.stopPropagation());
        plus.addEventListener('click', (event) => event.stopPropagation());

        row.append(minus, input, plus, reset);
        wrap.append(row, feedback);
        menu.appendChild(wrap);
    }

    private createStepButton(text: string, direction: -1 | 1): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'custom-speed-step';
        button.textContent = text;
        button.title = `${direction < 0 ? '降低' : '提高'}倍速（步长 ${this.settings.step}）`;
        button.setAttribute('aria-label', direction < 0 ? '降低倍速' : '提高倍速');

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const input = this.menu?.querySelector<HTMLInputElement>(SELECTORS.customInput);
            if (!input) return;

            const parsed = parseRateInput(input.value) ?? { value: this.callbacks.getCurrentRate(), clamped: false };
            const next = clampRate(parsed.value + direction * this.settings.step);
            input.value = formatRateValue(next);
            input.classList.remove(SELECTORS.invalidClass);
            input.removeAttribute('aria-invalid');
            this.callbacks.onSelectRate(next);
        });

        return button;
    }

    private showFeedback(text: string): void {
        const feedback = this.menu?.querySelector<HTMLElement>('.custom-speed-feedback');
        if (!feedback) return;

        if (this.feedbackTimer !== null) {
            window.clearTimeout(this.feedbackTimer);
        }
        feedback.textContent = text;
        feedback.classList.add('visible');
        this.feedbackTimer = window.setTimeout(() => {
            feedback.textContent = '';
            feedback.classList.remove('visible');
            this.feedbackTimer = null;
        }, 1800);
    }

    private detachControl(): void {
        this.cleanup.forEach((dispose) => dispose());
        this.cleanup = [];
        this.classObserver?.disconnect();
        this.classObserver = null;
        this.control = null;
        this.menu = null;
    }
}
