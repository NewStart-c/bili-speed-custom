export const STORAGE_KEYS = {
    settings: 'bili_speed_settings',
    legacyRate: 'bili_global_speed',
} as const;

export const SELECTORS = {
    playerContainer: '.bpx-player-container',
    videoWrap: '.bpx-player-video-wrap',
    media: '.bpx-player-video-wrap video, .bpx-player-video-wrap bwp-video, video',
    rateControl: '.bpx-player-ctrl-playbackrate',
    rateMenu: '.bpx-player-ctrl-playbackrate-menu',
    rateResult: '.bpx-player-ctrl-playbackrate-result',
    rateItem: '.bpx-player-ctrl-playbackrate-menu-item',
    customItem: '.custom-speed-item',
    customInput: '.custom-speed-input',
    customInputWrap: '.custom-speed-input-wrap',
    hiddenClass: 'custom-speed-hidden',
    invalidClass: 'custom-speed-invalid',
} as const;

export const MESSAGES = {
    getStatus: 'bili-speed:get-status',
    setRate: 'bili-speed:set-rate',
    setEnabled: 'bili-speed:set-enabled',
} as const;

export const SITE_ORIGIN = 'https://www.bilibili.com';
