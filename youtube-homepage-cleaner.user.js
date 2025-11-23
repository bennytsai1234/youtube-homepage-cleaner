// ==UserScript==
// @name         YouTube 淨化大師
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  為極致體驗而生的內容過濾器。透過移除定期掃描和新增快取機制，顯著提升效能。重構選單系統，提高可維護性。
// @author       Benny, AI Collaborators & The Final Optimizer
// @match        https://www.youtube.com/*
// @grant        GM_info
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @downloadURL https://update.greasyfork.org/scripts/543292/YouTube%20%E6%B7%A8%E5%8C%96%E5%A4%A7%E5%B8%AB.user.js
// @updateURL https://update.greasyfork.org/scripts/543292/YouTube%20%E6%B7%A8%E5%8C%96%E5%A4%A7%E5%B8%AB.meta.js
// ==/UserScript==

(function () {
'use strict';

// --- 1. 設定與常數 ---
const SCRIPT_INFO = GM_info?.script || { name: 'YouTube 淨化大師', version: '1.2.0' };
const ATTRS = {
    PROCESSED: 'data-yt-purifier-processed',
    HIDDEN_REASON: 'data-yt-purifier-hidden-reason',
    WAIT_COUNT: 'data-yt-purifier-wait-count',
};
const State = { HIDE: 'HIDE', KEEP: 'KEEP', WAIT: 'WAIT' };

const DEFAULT_RULE_ENABLES = {
    ad_sponsor: true,
    members_only: true,
    shorts_item: true,
    mix_only: true,
    premium_banner: true,
    news_block: true,
    shorts_block: true,
    posts_block: true,
    shorts_grid_shelf: true,
    movies_shelf: true,
    youtube_featured_shelf: true,
    popular_gaming_shelf: true,
    more_from_game_shelf: true,
    trending_playlist: true,
    inline_survey: true,
    clarify_box: true,
    explore_topics: true,
};

const DEFAULT_CONFIG = {
    LOW_VIEW_THRESHOLD: 1000,
    ENABLE_LOW_VIEW_FILTER: true,
    DEBUG_MODE: false,
    OPEN_IN_NEW_TAB: true, // 預設開啟強制新分頁
    ENABLE_KEYWORD_FILTER: false, // 預設關閉關鍵字過濾
    KEYWORD_BLACKLIST: [], // 預設空的關鍵字黑名單
    ENABLE_CHANNEL_FILTER: false, // 預設關閉頻道過濾
    CHANNEL_BLACKLIST: [], // 預設空的頻道黑名單
    ENABLE_DURATION_FILTER: false, // 預設關閉長度過濾
    DURATION_MIN: 0, // 最短影片長度(秒)，0為不限制
    DURATION_MAX: 0, // 最長影片長度(秒)，0為不限制
};

const CONFIG = {
    ENABLE_LOW_VIEW_FILTER: GM_getValue('enableLowViewFilter', DEFAULT_CONFIG.ENABLE_LOW_VIEW_FILTER),
    LOW_VIEW_THRESHOLD: GM_getValue('lowViewThreshold', DEFAULT_CONFIG.LOW_VIEW_THRESHOLD),
    DEBUG_MODE: GM_getValue('debugMode', DEFAULT_CONFIG.DEBUG_MODE),
    OPEN_IN_NEW_TAB: GM_getValue('openInNewTab', DEFAULT_CONFIG.OPEN_IN_NEW_TAB),
    RULE_ENABLES: GM_getValue('ruleEnables', { ...DEFAULT_RULE_ENABLES }),
    ENABLE_KEYWORD_FILTER: GM_getValue('enableKeywordFilter', DEFAULT_CONFIG.ENABLE_KEYWORD_FILTER),
    KEYWORD_BLACKLIST: GM_getValue('keywordBlacklist', [ ...DEFAULT_CONFIG.KEYWORD_BLACKLIST ]),
    ENABLE_CHANNEL_FILTER: GM_getValue('enableChannelFilter', DEFAULT_CONFIG.ENABLE_CHANNEL_FILTER),
    CHANNEL_BLACKLIST: GM_getValue('channelBlacklist', [ ...DEFAULT_CONFIG.CHANNEL_BLACKLIST ]),
    ENABLE_DURATION_FILTER: GM_getValue('enableDurationFilter', DEFAULT_CONFIG.ENABLE_DURATION_FILTER),
    DURATION_MIN: GM_getValue('durationMin', DEFAULT_CONFIG.DURATION_MIN),
    DURATION_MAX: GM_getValue('durationMax', DEFAULT_CONFIG.DURATION_MAX),
    DEBOUNCE_DELAY: 50,
    WAIT_MAX_RETRY: 5,
};

// --- 2. 選擇器定義 ---
const SELECTORS = {
    TOP_LEVEL_FILTERS: [
        'ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-rich-shelf-renderer',
        'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer',
        'ytd-ad-slot-renderer', 'yt-lockup-view-model', 'ytd-statement-banner-renderer',
        'grid-shelf-view-model', 'ytd-playlist-renderer', 'ytd-compact-playlist-renderer',
        'ytd-grid-video-renderer', 'ytd-info-panel-container-renderer'
    ],
    CLICKABLE_CONTAINERS: [
        'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
        'yt-lockup-view-model', 'ytd-playlist-renderer', 'ytd-compact-playlist-renderer',
        'ytd-video-owner-renderer', 'ytd-grid-video-renderer'
    ],
    INLINE_PREVIEW_PLAYER: 'ytd-video-preview',
    TITLE_TEXT: '#title, #title-text, h2, .yt-shelf-header-layout__title',

    init() {
        this.COMBINED_SELECTOR = this.TOP_LEVEL_FILTERS.map(s => `${s}:not([${ATTRS.PROCESSED}])`).join(',');
        return this;
    }
}.init();

// --- 3. 工具函數 ---
const utils = {
    debounce: (func, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func(...a), delay); }; },
    injectCSS: () => GM_addStyle('ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-statement-banner-renderer { display: none !important; }'),

    unitMultiplier: (u) => {
        if (!u) return 1;
        const m = { 'k': 1e3, 'm': 1e6, 'b': 1e9, '千': 1e3, '萬': 1e4, '万': 1e4, '億': 1e8, '亿': 1e8 };
        return m[u.toLowerCase()] || 1;
    },

    parseNumeric: (text, type) => {
        if (!text) return null;
        const keywords = {
            live: /(正在觀看|觀眾|watching|viewers)/i,
            view: /(view|觀看|次)/i,
        };
        const antiKeywords = /(分鐘|小時|天|週|月|年|ago|minute|hour|day|week|month|year)/i;
        const raw = text.replace(/,/g, '').toLowerCase().trim();

        if (!keywords[type].test(raw)) return null;
        if (type === 'view' && antiKeywords.test(raw) && !keywords.view.test(raw)) return null;

        const m = raw.match(/([\d.]+)\s*([kmb千萬万億亿])?/i);
        if (!m) return null;

        const num = parseFloat(m[1]);
        if (isNaN(num)) return null;
        return Math.floor(num * utils.unitMultiplier(m[2]));
    },

    parseLiveViewers: (text) => utils.parseNumeric(text, 'live'),
    parseViewCount: (text) => utils.parseNumeric(text, 'view'),

    parseDuration: (text) => {
        if (!text) return null;
        const parts = text.trim().split(':').map(Number);
        if (parts.some(isNaN)) return null;
        let seconds = 0;
        if (parts.length === 3) { // HH:MM:SS
            seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) { // MM:SS
            seconds = parts[0] * 60 + parts[1];
        } else {
            return null;
        }
        return seconds;
    },

    extractAriaTextForCounts(container) {
        const a1 = container.querySelector(':scope a#video-title-link[aria-label]');
        if (a1?.ariaLabel) return a1.ariaLabel;
        const a2 = container.querySelector(':scope a#thumbnail[aria-label]');
        if (a2?.ariaLabel) return a2.ariaLabel;
        return '';
    },

    findPrimaryLink(container) {
        if (!container) return null;
        const candidates = [
            'a#thumbnail[href*="/watch?"]', 'a#thumbnail[href*="/shorts/"]', 'a#thumbnail[href*="/playlist?"]',
            'a#video-title-link', 'a#video-title', 'a.yt-simple-endpoint#video-title', 'a.yt-lockup-view-model-wiz__title'
        ];
        for (const sel of candidates) {
            const a = container.querySelector(sel);
            if (a?.href) return a;
        }
        return container.querySelector('a[href*="/watch?"], a[href*="/shorts/"], a[href*="/playlist?"]');
    }
};

// --- 4. 日誌系統 ---
const logger = {
    _batch: [],
    prefix: `[${SCRIPT_INFO.name}]`,
    style: (color) => `color:${color}; font-weight:bold;`,
    info: (msg, color = '#3498db') => CONFIG.DEBUG_MODE && console.log(`%c${logger.prefix} [INFO] ${msg}`, logger.style(color)),

    startBatch() { if(CONFIG.DEBUG_MODE) this._batch = []; },

    hide(source, ruleName, reason, element) {
        if (!CONFIG.DEBUG_MODE) return;
        this._batch.push({ ruleName, reason, element, source });
    },

    flushBatch() {
        if (!CONFIG.DEBUG_MODE || this._batch.length === 0) return;
        const summary = this._batch.reduce((acc, item) => {
            acc[item.ruleName] = (acc[item.ruleName] || 0) + 1;
            return acc;
        }, {});
        const summaryString = Object.entries(summary).map(([name, count]) => `${name}: ${count}`).join(', ');
        console.groupCollapsed(`%c${this.prefix} [HIDE BATCH] Hiding ${this._batch.length} items from ${this._batch[0].source} | ${summaryString}`, this.style('#e74c3c'));
        this._batch.forEach(item => console.log(`Rule: