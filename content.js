(() => {
    'use strict';

    const STORAGE_KEY = 'bili_global_speed';
    const PRESETS = [2.5, 3, 3.5, 4]; // 原生菜单之外的额外预设
    const MIN_RATE = 0.0625;
    const MAX_RATE = 16;

    const RATE_CONTROL_SELECTOR = '.bpx-player-ctrl-playbackrate';
    const RATE_MENU_SELECTOR = '.bpx-player-ctrl-playbackrate-menu';

    let currentVideo = null;
    let observer = null;

    // ---------- 读取持久化倍速 ----------
    async function getSavedSpeed() {
        return new Promise((resolve) => {
            chrome.storage.local.get([STORAGE_KEY], (result) => {
                resolve(result[STORAGE_KEY] || null);
            });
        });
    }

    async function saveSpeed(rate) {
        const clamped = Math.min(MAX_RATE, Math.max(MIN_RATE, Number(rate)));
        return new Promise((resolve) => {
            chrome.storage.local.set({ [STORAGE_KEY]: clamped }, resolve);
        });
    }

    // ---------- 应用倍速到 video ----------
    function applyRate(rate) {
        if (!currentVideo) return;
        const clamped = Math.min(MAX_RATE, Math.max(MIN_RATE, Number(rate)));
        try {
            currentVideo.playbackRate = clamped;
        } catch (e) {
            // 某些情况下赋值可能失败，静默忽略
        }
        syncNativeLabel(clamped);
        syncActiveItem(clamped);
        saveSpeed(clamped);
    }

    // ---------- 同步 B 站原生倍速显示文字 ----------
    function syncNativeLabel(rate) {
        const resultEl = document.querySelector('.bpx-player-ctrl-playbackrate-result');
        if (resultEl) {
            resultEl.innerText = `${rate}x`;
        }
    }

    // ---------- 同步菜单项的选中高亮 ----------
    function syncActiveItem(rate) {
        document.querySelectorAll(`${RATE_MENU_SELECTOR} .bpx-player-ctrl-playbackrate-menu-item`).forEach((item) => {
            const value = parseFloat(item.dataset.value);
            item.classList.toggle('bpx-state-active', Number.isFinite(value) && Math.abs(value - rate) < 0.0001);
        });
    }

    // ---------- 注入预设项与输入框到原生菜单 ----------
    function injectMenuItems() {
        const menu = document.querySelector(RATE_MENU_SELECTOR);
        if (!menu) return;

        bindMenuReopen(menu);

        // 原生播放器可能重建菜单内容；按实际元素判断，避免标记残留导致漏注入
        const hasPresets = !!menu.querySelector('.custom-speed-item');
        const hasInput = !!menu.querySelector('.custom-speed-input');
        if (hasPresets && hasInput) return;

        // 追加固定预设
        if (!hasPresets) {
            PRESETS.forEach((rate) => {
                const li = document.createElement('li');
                li.className = 'bpx-player-ctrl-playbackrate-menu-item custom-speed-item';
                li.dataset.value = rate;
                li.innerText = `${rate}x`;
                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applyRate(rate);
                    closeMenu();
                });
                menu.appendChild(li);
            });
        }

        // 追加输入框
        if (!hasInput) {
            const inputWrap = document.createElement('li');
            inputWrap.className = 'custom-speed-input-wrap';
            const input = document.createElement('input');
            input.type = 'number';
            input.min = MIN_RATE;
            input.max = MAX_RATE;
            input.step = '0.1';
            input.placeholder = '输入倍速';
            input.className = 'custom-speed-input';
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const val = parseFloat(input.value);
                    if (!isNaN(val)) {
                        applyRate(val);
                        closeMenu();
                    }
                }
                // 防止快捷键在输入框内触发
                e.stopPropagation();
            });
            input.addEventListener('click', (e) => e.stopPropagation());
            inputWrap.appendChild(input);
            menu.appendChild(inputWrap);
        }
    }

    // 用户再次操作倍速控件时，清除兜底隐藏时写入的内联样式
    function bindMenuReopen(menu) {
        const control = menu.closest(RATE_CONTROL_SELECTOR) || menu.parentElement;
        if (!control || control.dataset.customReopenBound) return;
        control.dataset.customReopenBound = 'true';

        const clearInlineHide = () => {
            const currentMenu = control.querySelector(RATE_MENU_SELECTOR);
            if (currentMenu) currentMenu.style.removeProperty('display');
        };

        control.addEventListener('mouseenter', clearInlineHide, true);
        control.addEventListener('pointerdown', clearInlineHide, true);
        control.addEventListener('click', clearInlineHide, true);
    }

    function closeMenu() {
        const menu = document.querySelector(RATE_MENU_SELECTOR);
        if (!menu) return;

        // B 站原生通过父容器的 bpx-state-show 类控制菜单显隐。
        // 不能把内联 display:none 留在菜单上：它会覆盖原生样式，
        // 导致选择一次倍速后菜单再也打不开，只能刷新页面。
        const control = menu.closest(RATE_CONTROL_SELECTOR) || menu.parentElement;
        if (control) control.classList.remove('bpx-state-show');
        menu.classList.remove('bpx-state-show');

        // 清理旧版本或其他脚本可能残留的内联样式
        menu.style.removeProperty('display');

        // 兜底：若某些版本不是靠上述类控制显隐，先临时隐藏；
        // bindMenuReopen 会在用户下次操作倍速控件时自动清除它。
        if (getComputedStyle(menu).display !== 'none') {
            menu.style.display = 'none';
        }
    }

    // ---------- 快捷键 Shift+1 / 2 / 3 ----------
    document.addEventListener('keydown', (e) => {
        // 输入框聚焦时禁用快捷键
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (!e.shiftKey) return;

        const keyMap = { '!': 1, '@': 2, '#': 3 }; // Shift+1/2/3 产生的字符
        const rate = keyMap[e.key];
        if (rate !== undefined) {
            e.preventDefault();
            e.stopPropagation();
            applyRate(rate);
        }
    }, true);

    // ---------- 监听 video 元素变化（SPA 兼容） ----------
    function watchVideo() {
        if (observer) observer.disconnect();

        observer = new MutationObserver(() => {
            const video = document.querySelector('video');
            if (video && video !== currentVideo) {
                currentVideo = video;
                // 等待元数据加载后再应用保存的倍速
                if (video.readyState >= 1) {
                    const saved = getSavedSpeed();
                    saved.then((rate) => { if (rate) applyRate(rate); });
                } else {
                    video.addEventListener('loadedmetadata', () => {
                        getSavedSpeed().then((rate) => { if (rate) applyRate(rate); });
                    }, { once: true });
                }
            }

            // 菜单可能出现/重建，重新注入
            injectMenuItems();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    // ---------- 初始应用 + 启动监听 ----------
    async function init() {
        const saved = await getSavedSpeed();
        const video = document.querySelector('video');
        if (video) {
            currentVideo = video;
            if (saved) applyRate(saved);
        }
        watchVideo();
        injectMenuItems();
    }

    // 等待页面基本就绪
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();