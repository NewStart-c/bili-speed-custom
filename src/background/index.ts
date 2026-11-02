import { getSettings } from '../shared/storage';

function ensureSettings(): void {
    void getSettings().catch((error) => {
        console.warn('[bili-speed] failed to initialize settings', error);
    });
}

// 首次安装或更新时触发设置迁移，确保 Popup/Options 打开前默认值已落盘。
chrome.runtime.onInstalled.addListener(ensureSettings);
chrome.runtime.onStartup.addListener(ensureSettings);
