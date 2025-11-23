// ==UserScript==
// @name         YouTube 淨化大師
// @namespace    http://tampermonkey.net/
// @version      1.1.11
// @description  為極致體驗而生的內容過濾器。解決選單顯示不全問題，將設定分為主選單與規則子選單。可掃除Premium廣告/Shorts/推薦/問卷，並優化點擊體驗。
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
const SCRIPT_INFO = GM_info?.script || { name: 'YouTube 淨化大師', version: '1.1.11' };
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
    PERIODIC_INTERVAL: 2000, // 優化掃描頻率
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
        this._batch.forEach(item => console.log(`Rule:"${item.ruleName}" | Reason:${item.reason}`, item.element));
        console.groupEnd();
    },

    logStart: () => console.log(`%c🚀 ${SCRIPT_INFO.name} v${SCRIPT_INFO.version} 啟動. (Debug: ${CONFIG.DEBUG_MODE})`, 'color:#3498db; font-weight:bold; font-size: 1.2em;'),
};

// --- 5. 功能增強模組 (點擊優化) ---
const Enhancer = {
    initGlobalClickListener() {
        document.addEventListener('click', (e) => {
            // 檢查設定是否開啟強制新分頁
            if (!CONFIG.OPEN_IN_NEW_TAB) return;

            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

            const exclusions = 'button, yt-icon-button, #menu, ytd-menu-renderer, ytd-toggle-button-renderer, yt-chip-cloud-chip-renderer, .yt-spec-button-shape-next, .yt-core-attributed-string__link, #subscribe-button';
            if (e.target.closest(exclusions)) return;

            let targetLink = null;
            const previewPlayer = e.target.closest(SELECTORS.INLINE_PREVIEW_PLAYER);

            if (previewPlayer) {
                 targetLink = utils.findPrimaryLink(previewPlayer) || utils.findPrimaryLink(previewPlayer.closest(SELECTORS.CLICKABLE_CONTAINERS.join(',')));
            } else {
                 const container = e.target.closest(SELECTORS.CLICKABLE_CONTAINERS.join(', '));
                 if (!container) return;
                 const channelLink = e.target.closest('a#avatar-link, .ytd-channel-name a, a[href^="/@"], a[href^="/channel/"]');
                 targetLink = channelLink?.href ? channelLink : utils.findPrimaryLink(container);
            }

            if (!targetLink) return;

            try {
                const isValidTarget = targetLink.href && (new URL(targetLink.href, location.origin)).hostname.includes('youtube.com');
                if (isValidTarget) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.open(targetLink.href, '_blank');
                }
            } catch (err) {}
        }, { capture: true });
    }
};

// --- 6. 核心規則引擎 ---
const RuleEngine = {
    ruleCache: new Map(),
    globalRules: [],
    rawRuleDefinitions: [],

    init() {
        this.ruleCache.clear();
        this.globalRules = [];

        this.rawRuleDefinitions = [
            { id: 'ad_sponsor', name: '廣告/促銷', conditions: { any: [{ type: 'selector', value: '[aria-label*="廣告"], [aria-label*="Sponsor"], [aria-label="贊助商廣告"], ytd-ad-slot-renderer' }] } },
            { id: 'members_only', name: '會員專屬', conditions: { any: [ { type: 'selector', value: '[aria-label*="會員專屬"]' }, { type: 'text', selector: '.badge-shape-wiz__text, .yt-badge-shape__text', keyword: /頻道會員專屬|Members only/i } ] } },
            { id: 'shorts_item', name: 'Shorts (單個)', conditions: { any: [{ type: 'selector', value: 'a[href*="/shorts/"]' }] } },
            {
                id: 'mix_only',
                name: '合輯 (Mix)',
                conditions: {
                    any: [
                        { type: 'text', selector: '.badge-shape-wiz__text, ytd-thumbnail-overlay-side-panel-renderer, .yt-badge-shape__text', keyword: /(^|\s)(合輯|Mix)(\s|$)/i },
                        { type: 'selector', value: 'a[aria-label*="合輯"], a[aria-label*="Mix"]' },
                        { type: 'text', selector: '#video-title, .yt-lockup-metadata-view-model__title', keyword: /^(合輯|Mix)[\s-–]/i }
                    ]
                }
            },
            { id: 'premium_banner', name: 'Premium 推廣', scope: 'ytd-statement-banner-renderer', conditions: { any: [{ type: 'selector', value: 'ytd-button-renderer' }] } },

            { id: 'news_block', name: '新聞區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: SELECTORS.TITLE_TEXT, keyword: /新聞快報|Breaking News|ニュース/i }] } },
            { id: 'shorts_block', name: 'Shorts 區塊', scope: 'ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: SELECTORS.TITLE_TEXT, keyword: /^Shorts$/i }] } },
            { id: 'posts_block', name: '貼文區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: SELECTORS.TITLE_TEXT, keyword: /貼文|Posts|投稿|Publicaciones|最新 YouTube 貼文/i }] } },
            { id: 'explore_topics', name: '探索更多主題', scope: 'ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: SELECTORS.TITLE_TEXT, keyword: /探索更多主題|Explore more topics/i }] } },
            { id: 'shorts_grid_shelf', name: 'Shorts 區塊 (Grid)', scope: 'grid-shelf-view-model', conditions: { any: [{ type: 'text', selector: 'h2.shelf-header-layout-wiz__title', keyword: /^Shorts$/i }] } },
            { id: 'movies_shelf', name: '電影推薦區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [ { type: 'text', selector: SELECTORS.TITLE_TEXT, keyword: /為你推薦的特選電影|featured movies/i }, { type: 'text', selector: 'p.ytd-badge-supported-renderer', keyword: /YouTube 精選/i } ] } },
            { id: 'youtube_featured_shelf', name: 'YouTube 精選區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [ { type: 'text', selector: '.yt-shelf-header-layout__sublabel', keyword: /YouTube 精選/i } ] } },
            { id: 'popular_gaming_shelf', name: '熱門遊戲區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: SELECTORS.TITLE_TEXT, keyword: /^熱門遊戲直播$/i }] } },
            { id: 'more_from_game_shelf', name: '「更多相關內容」區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#subtitle', keyword: /^更多此遊戲相關內容$/i }] } },
            { id: 'trending_playlist', name: '發燒影片/熱門內容', scope: 'ytd-rich-item-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'text', selector: 'h3 a, #video-title', keyword: /發燒影片|Trending/i }] } },
            { id: 'inline_survey', name: '意見調查問卷', scope: 'ytd-rich-section-renderer', conditions: { any: [{ type: 'selector', value: 'ytd-inline-survey-renderer' }] } },
            { id: 'clarify_box', name: '資訊面板 (Wiki)', scope: 'ytd-info-panel-container-renderer', conditions: { any: [{ type: 'selector', value: 'h2.header-left-items' }] } },
        ];

        const activeRules = this.rawRuleDefinitions.filter(rule => CONFIG.RULE_ENABLES[rule.id] !== false);

        if (CONFIG.ENABLE_LOW_VIEW_FILTER) {
            const lowViewScope = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-grid-video-renderer';
            activeRules.push(
                { id: 'low_viewer_live', name: '低觀眾直播', scope: lowViewScope, isConditional: true, conditions: { any: [{ type: 'liveViewers', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } },
                { id: 'low_view_video', name: '低觀看影片', scope: lowViewScope, isConditional: true, conditions: { any: [{ type: 'viewCount', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } }
            );
        }

        if (CONFIG.ENABLE_KEYWORD_FILTER && CONFIG.KEYWORD_BLACKLIST.length > 0) {
            const videoScope = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-grid-video-renderer';
            activeRules.push({
                id: 'keyword_blacklist',
                name: '關鍵字過濾',
                scope: videoScope,
                isConditional: true,
                conditions: { any: [{ type: 'titleKeyword', keywords: CONFIG.KEYWORD_BLACKLIST }] }
            });
        }

        if (CONFIG.ENABLE_CHANNEL_FILTER && CONFIG.CHANNEL_BLACKLIST.length > 0) {
            const videoScope = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-grid-video-renderer';
            activeRules.push({
                id: 'channel_blacklist',
                name: '頻道過濾',
                scope: videoScope,
                isConditional: true,
                conditions: { any: [{ type: 'channelName', channels: CONFIG.CHANNEL_BLACKLIST }] }
            });
        }

        if (CONFIG.ENABLE_DURATION_FILTER && (CONFIG.DURATION_MIN > 0 || CONFIG.DURATION_MAX > 0)) {
            const videoScope = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-grid-video-renderer';
            activeRules.push({
                id: 'duration_filter',
                name: '影片長度過濾',
                scope: videoScope,
                isConditional: true,
                conditions: { any: [{ type: 'duration', min: CONFIG.DURATION_MIN, max: CONFIG.DURATION_MAX }] }
            });
        }

        activeRules.forEach(rule => {
            const scopes = rule.scope ? rule.scope.split(',') : [null];
            scopes.forEach(scope => {
                const target = scope ? scope.trim().toUpperCase() : 'GLOBAL';
                if (target === 'GLOBAL') {
                    this.globalRules.push(rule);
                } else {
                    if (!this.ruleCache.has(target)) this.ruleCache.set(target, []);
                    this.ruleCache.get(target).push(rule);
                }
            });
        });
    },

    checkCondition(container, condition) {
        try {
            switch (condition.type) {
                case 'selector':
                    return container.querySelector(`:scope ${condition.value}`) ? { state: State.HIDE, reason: `Selector: ${condition.value}` } : { state: State.KEEP };
                case 'text': {
                    const elements = container.querySelectorAll(`:scope ${condition.selector}`);
                    for (const el of elements) {
                        if (condition.keyword.test(el.textContent)) {
                            return { state: State.HIDE, reason: `Text: "${el.textContent.trim()}"` };
                        }
                    }
                    return { state: State.KEEP };
                }
                case 'titleKeyword': {
                    const titleEl = container.querySelector('#video-title');
                    if (!titleEl?.textContent) return { state: State.KEEP };
                    const title = titleEl.textContent.toLowerCase();
                    for (const keyword of condition.keywords) {
                        if (keyword && title.includes(keyword.toLowerCase())) {
                            return { state: State.HIDE, reason: `Keyword: "${keyword}"` };
                        }
                    }
                    return { state: State.KEEP };
                }
                case 'channelName': {
                    const channelEl = container.querySelector('ytd-channel-name .yt-formatted-string, .ytd-channel-name a');
                    if (!channelEl?.textContent) return { state: State.KEEP };
                    const channelName = channelEl.textContent.trim().toLowerCase();
                    for (const blockedChannel of condition.channels) {
                        if (blockedChannel && channelName === blockedChannel.toLowerCase()) {
                            return { state: State.HIDE, reason: `Channel: "${blockedChannel}"` };
                        }
                    }
                    return { state: State.KEEP };
                }
                case 'duration': {
                    const durationEl = container.querySelector('ytd-thumbnail-overlay-time-status-renderer');
                    if (!durationEl?.textContent) {
                        return container.querySelector('a[href*="/shorts/"]') ? { state: State.KEEP } : { state: State.WAIT };
                    }
                    const durationInSeconds = utils.parseDuration(durationEl.textContent);
                    if (durationInSeconds === null) return { state: State.WAIT };

                    if (condition.min > 0 && durationInSeconds < condition.min) {
                        return { state: State.HIDE, reason: `Duration ${durationInSeconds}s < min ${condition.min}s` };
                    }
                    if (condition.max > 0 && durationInSeconds > condition.max) {
                        return { state: State.HIDE, reason: `Duration ${durationInSeconds}s > max ${condition.max}s` };
                    }
                    return { state: State.KEEP };
                }
                case 'liveViewers': case 'viewCount':
                    return this.checkNumericMetadata(container, condition);
                default:
                    return { state: State.KEEP };
            }
        } catch (e) { return { state: State.KEEP }; }
    },

    checkNumericMetadata(container, condition) {
        const parser = condition.type === 'liveViewers' ? utils.parseLiveViewers : utils.parseViewCount;
        const selectors = [
            '#metadata-line .inline-metadata-item', '#metadata-line span.ytd-grid-video-renderer',
            '.yt-content-metadata-view-model-wiz__metadata-text',
            '.yt-content-metadata-view-model__metadata-text'
        ].join(', ');

        const textSources = [ ...Array.from(container.querySelectorAll(selectors), el => el.textContent), utils.extractAriaTextForCounts(container) ];

        for (const text of textSources) {
            const count = parser(text);
            if (count !== null) return count < condition.threshold ? { state: State.HIDE, reason: `${condition.type}: ${count} < ${condition.threshold}` } : { state: State.KEEP };
        }
        return container.tagName.includes('PLAYLIST') ? { state: State.KEEP } : { state: State.WAIT };
    },

    checkRule(container, rule) {
        if (rule.scope && !container.matches(rule.scope)) return { state: State.KEEP };
        let requiresWait = false;
        for (const condition of rule.conditions.any) {
            const result = this.checkCondition(container, condition);
            if (result.state === State.HIDE) return { ...result, ruleId: rule.id };
            if (result.state === State.WAIT) requiresWait = true;
        }
        return requiresWait ? { state: State.WAIT } : { state: State.KEEP };
    },

    processContainer(container, source) {
        if (container.hasAttribute(ATTRS.PROCESSED)) return;
        const relevantRules = (this.ruleCache.get(container.tagName) || []).concat(this.globalRules);
        let finalState = State.KEEP;

        for (const rule of relevantRules) {
            const result = this.checkRule(container, rule);
            if (result.state === State.HIDE) {
                let finalTarget = container;
                const parentSelectors = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer';
                const isInfoPanel = container.tagName === 'YTD-INFO-PANEL-CONTAINER-RENDERER';
                const parentWrapper = isInfoPanel ? null : container.closest(parentSelectors);

                if (parentWrapper && parentWrapper !== container) {
                    finalTarget = parentWrapper;
                }

                finalTarget.style.setProperty('display', 'none', 'important');

                container.setAttribute(ATTRS.PROCESSED, 'hidden');
                finalTarget.setAttribute(ATTRS.PROCESSED, 'hidden');
                finalTarget.setAttribute(ATTRS.HIDDEN_REASON, result.ruleId);

                logger.hide(source, rule.name, result.reason, finalTarget);
                return;
            }
            if (result.state === State.WAIT) finalState = State.WAIT;
        }

        if (finalState === State.WAIT) {
            const count = +(container.getAttribute(ATTRS.WAIT_COUNT) || 0) + 1;
            const maxRetries = container.tagName === 'YT-LOCKUP-VIEW-MODEL' ? 2 : CONFIG.WAIT_MAX_RETRY;
            if (count >= maxRetries) container.setAttribute(ATTRS.PROCESSED, 'checked-wait-expired');
            else container.setAttribute(ATTRS.WAIT_COUNT, String(count));
        } else {
            container.setAttribute(ATTRS.PROCESSED, 'checked');
        }
    }
};

// --- 7. 主控台與菜單系統 (分層選單修正版) ---
const Main = {
    menuHandle: null,

    scanPage: (source) => {
        logger.startBatch();
        try {
            document.querySelectorAll(SELECTORS.COMBINED_SELECTOR).forEach(el => RuleEngine.processContainer(el, source));
        } catch (e) {}
        logger.flushBatch();
    },

    resetAndRescan(message) {
        logger.info(message);
        document.querySelectorAll(`[${ATTRS.PROCESSED}]`).forEach(el => {
            el.style.display = '';
            el.removeAttribute(ATTRS.PROCESSED);
            el.removeAttribute(ATTRS.HIDDEN_REASON);
            el.removeAttribute(ATTRS.WAIT_COUNT);
        });
        RuleEngine.init();
        this.scanPage('settings-changed');
    },

    // 顯示規則子選單
    openRulesMenu() {
        const rules = RuleEngine.rawRuleDefinitions;

        let menuText = '【 詳細過濾規則開關 】\n請輸入編號切換 (輸入 0 返回)：\n\n';
        rules.forEach((rule, index) => {
            const mark = CONFIG.RULE_ENABLES[rule.id] !== false ? '✅' : '❌';
            menuText += `${index + 1}. ${mark} ${rule.name}\n`;
        });
        menuText += '\n0. ⬅️ 返回主選單';

        const choice = prompt(menuText);
        if (choice === null) return;

        const index = parseInt(choice.trim(), 10);
        if (isNaN(index)) return;

        if (index === 0) {
            this.toggleMainMenu();
        } else if (index >= 1 && index <= rules.length) {
            const rule = rules[index - 1];
            const isEnabled = CONFIG.RULE_ENABLES[rule.id] !== false;
            CONFIG.RULE_ENABLES[rule.id] = !isEnabled;
            GM_setValue('ruleEnables', CONFIG.RULE_ENABLES);
            this.resetAndRescan(`規則「${rule.name}」已${!isEnabled ? '啟用' : '停用'}`);
            // 操作後停留在規則選單方便繼續修改
            setTimeout(() => this.openRulesMenu(), 100);
        } else {
            alert('無效的選擇');
            setTimeout(() => this.openRulesMenu(), 100);
        }
    },

    // 通用黑名單管理
    manageBlacklist(configKey, storageKey, itemName) {
        const list = CONFIG[configKey];
        let menuText = `【管理${itemName}黑名單】\n目前列表: ${list.length > 0 ? `\n[ ${list.join(', ')} ]` : '(無)'}\n\n`;
        menuText += `1. ➕ 新增${itemName}\n`;
        menuText += `2. 🗑️ 刪除${itemName}\n`;
        menuText += '3. ❌ 清空列表\n';
        menuText += '--------------------------\n';
        menuText += '0. ⬅️ 返回上一層';

        const choice = prompt(menuText);
        if (choice === null) return;

        const index = parseInt(choice.trim(), 10);
        if (isNaN(index)) {
             setTimeout(() => this.manageBlacklist(configKey, storageKey, itemName), 100);
             return;
        }

        switch (index) {
            case 1: { // 新增
                const newItems = prompt(`請輸入要加入黑名單的${itemName}，多個請用逗號 (,) 分隔:`);
                if (newItems) {
                    const toAdd = newItems.split(',').map(item => item.trim()).filter(item => item && !list.includes(item));
                    if (toAdd.length > 0) {
                        CONFIG[configKey].push(...toAdd);
                        GM_setValue(storageKey, CONFIG[configKey]);
                        this.resetAndRescan(`${itemName}黑名單已更新`);
                    }
                }
                break;
            }
            case 2: { // 刪除
                if (list.length === 0) {
                    alert('目前列表為空。');
                    break;
                }
                const toDelete = prompt(`請輸入要從黑名單中刪除的${itemName}:\n[ ${list.join(', ')} ]`);
                if (toDelete) {
                    const idx = list.findIndex(item => item.toLowerCase() === toDelete.trim().toLowerCase());
                    if (idx > -1) {
                        CONFIG[configKey].splice(idx, 1);
                        GM_setValue(storageKey, CONFIG[configKey]);
                        this.resetAndRescan(`${itemName} "${toDelete}" 已被移除`);
                    } else {
                        alert(`${itemName} "${toDelete}" 不在列表中。`);
                    }
                }
                break;
            }
            case 3: { // 清空
                if (confirm(`⚠️ 確定要清空所有${itemName}黑名單嗎？`)) {
                    CONFIG[configKey] = [];
                    GM_setValue(storageKey, CONFIG[configKey]);
                    this.resetAndRescan(`${itemName}黑名單已清空`);
                    alert(`✅ ${itemName}黑名單已清空。`);
                }
                break;
            }
            case 0: { // 返回
                this.openAdvancedFilterMenu();
                return;
            }
        }
        setTimeout(() => this.manageBlacklist(configKey, storageKey, itemName), 100);
    },

    // 管理影片長度過濾
    manageDurationFilter() {
        const min = CONFIG.DURATION_MIN;
        const max = CONFIG.DURATION_MAX;
        let menuText = `【管理影片長度過濾】\n過濾掉長度在此範圍之外的影片。\n(0 代表不限制)\n\n`;
        menuText += `1. ⏱️ 設定最短長度 (目前: ${min > 0 ? `${min / 60} 分鐘` : '無'})
`;
        menuText += `2. ⏱️ 設定最長長度 (目前: ${max > 0 ? `${max / 60} 分鐘` : '無'})
`;
        menuText += `3. ❌ 重設長度限制\n`;
        menuText += '--------------------------\n';
        menuText += '0. ⬅️ 返回上一層';

        const choice = prompt(menuText);
        if (choice === null) return;

        const index = parseInt(choice.trim(), 10);
        if (isNaN(index)) {
             setTimeout(() => this.manageDurationFilter(), 100);
             return;
        }

        const parseMinutes = (input, type) => {
            if (input === null) return;
            const minutes = parseFloat(input);
            if (isNaN(minutes) || minutes < 0) {
                alert('請輸入有效的數字 (分鐘)。');
                return;
            }
            const seconds = Math.floor(minutes * 60);
            if (type === 'min') {
                CONFIG.DURATION_MIN = seconds;
                GM_setValue('durationMin', seconds);
            } else {
                CONFIG.DURATION_MAX = seconds;
                GM_setValue('durationMax', seconds);
            }
            this.resetAndRescan('影片長度過濾已更新');
        };

        switch (index) {
            case 1: { // 設定最短
                const input = prompt('請輸入最短影片長度 (分鐘)。\n(例如：輸入 5 過濾掉短於 5 分鐘的影片)', min > 0 ? min / 60 : 0);
                parseMinutes(input, 'min');
                break;
            }
            case 2: { // 設定最長
                const input = prompt('請輸入最長影片長度 (分鐘)。\n(例如：輸入 30 過濾掉長於 30 分鐘的影片)', max > 0 ? max / 60 : 0);
                parseMinutes(input, 'max');
                break;
            }
            case 3: { // 重設
                if (confirm('⚠️ 確定要重設所有長度限制嗎？')) {
                    CONFIG.DURATION_MIN = DEFAULT_CONFIG.DURATION_MIN;
                    CONFIG.DURATION_MAX = DEFAULT_CONFIG.DURATION_MAX;
                    GM_setValue('durationMin', CONFIG.DURATION_MIN);
                    GM_setValue('durationMax', CONFIG.DURATION_MAX);
                    this.resetAndRescan('影片長度過濾已重設');
                    alert('✅ 影片長度過濾已重設。');
                }
                break;
            }
            case 0: { // 返回
                this.openAdvancedFilterMenu();
                return;
            }
        }
        setTimeout(() => this.manageDurationFilter(), 100);
    },

    // 顯示進階過濾選單
    openAdvancedFilterMenu() {
        const s = (val) => val ? '✅' : '❌';
        let menuText = '【 進階過濾設定 】\n\n';
        menuText += `1. ${s(CONFIG.ENABLE_KEYWORD_FILTER)} 啟用「關鍵字過濾」\n`;
        menuText += '2. 📖 管理關鍵字黑名單...\n';
        menuText += '--------------------------\n';
        menuText += `3. ${s(CONFIG.ENABLE_CHANNEL_FILTER)} 啟用「頻道過濾」\n`;
        menuText += '4. 👤 管理頻道黑名單...\n';
        menuText += '--------------------------\n';
        menuText += `5. ${s(CONFIG.ENABLE_DURATION_FILTER)} 啟用「影片長度過濾」\n`;
        menuText += '6. ⏱️ 管理影片長度...\n';
        menuText += '--------------------------\n';
        menuText += '0. ⬅️ 返回主選單';

        const choice = prompt(menuText);
        if (choice === null) return;
        const index = parseInt(choice.trim(), 10);
        if (isNaN(index)) {
             setTimeout(() => this.openAdvancedFilterMenu(), 100);
             return;
        }

        switch (index) {
            case 1: { // 開關關鍵字過濾
                CONFIG.ENABLE_KEYWORD_FILTER = !CONFIG.ENABLE_KEYWORD_FILTER;
                GM_setValue('enableKeywordFilter', CONFIG.ENABLE_KEYWORD_FILTER);
                this.resetAndRescan(`關鍵字過濾已 ${CONFIG.ENABLE_KEYWORD_FILTER ? '啟用' : '停用'}`);
                setTimeout(() => this.openAdvancedFilterMenu(), 100);
                break;
            }
            case 2: { // 管理關鍵字
                this.manageBlacklist('KEYWORD_BLACKLIST', 'keywordBlacklist', '關鍵字');
                break;
            }
            case 3: { // 開關頻道過濾
                CONFIG.ENABLE_CHANNEL_FILTER = !CONFIG.ENABLE_CHANNEL_FILTER;
                GM_setValue('enableChannelFilter', CONFIG.ENABLE_CHANNEL_FILTER);
                this.resetAndRescan(`頻道過濾已 ${CONFIG.ENABLE_CHANNEL_FILTER ? '啟用' : '停用'}`);
                setTimeout(() => this.openAdvancedFilterMenu(), 100);
                break;
            }
            case 4: { // 管理頻道
                this.manageBlacklist('CHANNEL_BLACKLIST', 'channelBlacklist', '頻道');
                break;
            }
            case 5: { // 開關長度過濾
                CONFIG.ENABLE_DURATION_FILTER = !CONFIG.ENABLE_DURATION_FILTER;
                GM_setValue('enableDurationFilter', CONFIG.ENABLE_DURATION_FILTER);
                this.resetAndRescan(`影片長度過濾已 ${CONFIG.ENABLE_DURATION_FILTER ? '啟用' : '停用'}`);
                setTimeout(() => this.openAdvancedFilterMenu(), 100);
                break;
            }
            case 6: { // 管理長度
                this.manageDurationFilter();
                break;
            }
            case 0: { // 返回主選單
                this.toggleMainMenu();
                break;
            }
        }
    },

    // 顯示主選單
    toggleMainMenu() {
        const s = (val) => val ? '✅' : '❌';

        let menuText = '【 YouTube 淨化大師 - 設定 】\n\n';
        menuText += '1. 📂 設定詳細過濾規則 (進入子選單)...
';
        menuText += '--------------------------\n';
        menuText += `2. ${s(CONFIG.ENABLE_LOW_VIEW_FILTER)} 啟用「低觀看數過濾」\n`;
        menuText += `3. 🔢 修改過濾閾值 (目前: ${CONFIG.LOW_VIEW_THRESHOLD})
`;
        menuText += '4. 🚫 進階過濾設定...\n';
        menuText += '--------------------------\n';
        menuText += `5. ${s(CONFIG.OPEN_IN_NEW_TAB)} 強制新分頁開啟影片 (可能影響速度)\n`;
        menuText += `6. ${s(CONFIG.DEBUG_MODE)} Debug 模式\n`;
        menuText += '--------------------------\n';
        menuText += `7. 🔄 恢復預設設定\n`;

        menuText += '\n請輸入數字：';

        const choice = prompt(menuText);
        if (choice === null) return;

        const index = parseInt(choice.trim(), 10);
        if (isNaN(index)) return;

        switch (index) {
            case 1: {
                this.openRulesMenu();
                break;
            }
            case 2: {
                CONFIG.ENABLE_LOW_VIEW_FILTER = !CONFIG.ENABLE_LOW_VIEW_FILTER;
                GM_setValue('enableLowViewFilter', CONFIG.ENABLE_LOW_VIEW_FILTER);
                this.resetAndRescan(`低觀看數過濾 已${CONFIG.ENABLE_LOW_VIEW_FILTER ? '啟用' : '停用'}`);
                break;
            }
            case 3: {
                const input = prompt(`請輸入新的低觀看數過濾閾值 (純數字)\n當前值: ${CONFIG.LOW_VIEW_THRESHOLD}`, CONFIG.LOW_VIEW_THRESHOLD);
                if (input !== null) {
                    const newThreshold = parseInt(input, 10);
                    if (!isNaN(newThreshold) && newThreshold >= 0) {
                        CONFIG.LOW_VIEW_THRESHOLD = newThreshold;
                        GM_setValue('lowViewThreshold', newThreshold);
                        this.resetAndRescan(`觀看數過濾閾值已更新為 ${newThreshold}`);
                    } else {
                        alert('❌ 請輸入有效的正整數。');
                    }
                }
                break;
            }
            case 4: { // 進階過濾設定
                this.openAdvancedFilterMenu();
                break;
            }
            case 5: {
                CONFIG.OPEN_IN_NEW_TAB = !CONFIG.OPEN_IN_NEW_TAB;
                GM_setValue('openInNewTab', CONFIG.OPEN_IN_NEW_TAB);
                alert(`強制新分頁開啟已${CONFIG.OPEN_IN_NEW_TAB ? '啟用' : '停用'}。\n(停用此功能可獲得較佳的頁面加載速度)`);
                break;
            }
            case 6: {
                CONFIG.DEBUG_MODE = !CONFIG.DEBUG_MODE;
                GM_setValue('debugMode', CONFIG.DEBUG_MODE);
                alert(`Debug 模式已${CONFIG.DEBUG_MODE ? '啟用' : '停用'}。\n請按 F12 開啟 Console 查看日誌。`);
                this.resetAndRescan('Debug 設定變更');
                break;
            }
            case 7: {
                if (confirm('⚠️ 確定要將所有設定（包含規則、閾值）恢復為預設值嗎？')) {
                    CONFIG.RULE_ENABLES = { ...DEFAULT_RULE_ENABLES };
                    CONFIG.LOW_VIEW_THRESHOLD = DEFAULT_CONFIG.LOW_VIEW_THRESHOLD;
                    CONFIG.ENABLE_LOW_VIEW_FILTER = DEFAULT_CONFIG.ENABLE_LOW_VIEW_FILTER;
                    CONFIG.DEBUG_MODE = DEFAULT_CONFIG.DEBUG_MODE;
                    CONFIG.OPEN_IN_NEW_TAB = DEFAULT_CONFIG.OPEN_IN_NEW_TAB;
                    CONFIG.ENABLE_KEYWORD_FILTER = DEFAULT_CONFIG.ENABLE_KEYWORD_FILTER;
                    CONFIG.KEYWORD_BLACKLIST = [ ...DEFAULT_CONFIG.KEYWORD_BLACKLIST ];
                    CONFIG.ENABLE_CHANNEL_FILTER = DEFAULT_CONFIG.ENABLE_CHANNEL_FILTER;
                    CONFIG.CHANNEL_BLACKLIST = [ ...DEFAULT_CONFIG.CHANNEL_BLACKLIST ];
                    CONFIG.ENABLE_DURATION_FILTER = DEFAULT_CONFIG.ENABLE_DURATION_FILTER;
                    CONFIG.DURATION_MIN = DEFAULT_CONFIG.DURATION_MIN;
                    CONFIG.DURATION_MAX = DEFAULT_CONFIG.DURATION_MAX;
                    GM_setValue('ruleEnables', CONFIG.RULE_ENABLES);
                    GM_setValue('lowViewThreshold', CONFIG.LOW_VIEW_THRESHOLD);
                    GM_setValue('enableLowViewFilter', CONFIG.ENABLE_LOW_VIEW_FILTER);
                    GM_setValue('debugMode', CONFIG.DEBUG_MODE);
                    GM_setValue('openInNewTab', CONFIG.OPEN_IN_NEW_TAB);
                    GM_setValue('enableKeywordFilter', CONFIG.ENABLE_KEYWORD_FILTER);
                    GM_setValue('keywordBlacklist', CONFIG.KEYWORD_BLACKLIST);
                    GM_setValue('enableChannelFilter', CONFIG.ENABLE_CHANNEL_FILTER);
                    GM_setValue('channelBlacklist', CONFIG.CHANNEL_BLACKLIST);
                    GM_setValue('enableDurationFilter', CONFIG.ENABLE_DURATION_FILTER);
                    GM_setValue('durationMin', CONFIG.DURATION_MIN);
                    GM_setValue('durationMax', CONFIG.DURATION_MAX);
                    this.resetAndRescan('系統已恢復預設值');
                    alert('✅ 所有設定已恢復預設值。');
                }
                break;
            }
            default: {
                alert('❌ 無效的選項');
            }
        }
    },

    setupMenu() {
        if (this.menuHandle) {
            try { GM_unregisterMenuCommand(this.menuHandle); } catch (e) {}
        }
        this.menuHandle = GM_registerMenuCommand('⚙️ 淨化大師設定 (Settings)...', () => { this.toggleMainMenu(); });
    },

    init() {
        if (window.ytPurifierInitialized) return;
        window.ytPurifierInitialized = true;

        logger.logStart();
        utils.injectCSS();
        RuleEngine.init();
        this.setupMenu();
        Enhancer.initGlobalClickListener();

        const debouncedScan = utils.debounce(() => this.scanPage('observer'), CONFIG.DEBOUNCE_DELAY);
        const observer = new MutationObserver(debouncedScan);

        const onReady = () => {
            const target = document.querySelector('ytd-app') || document.body;
            if (target) {
                observer.observe(target, { childList: true, subtree: true });
            }
            window.addEventListener('yt-navigate-finish', () => this.scanPage('navigate'));
            this.scanPage('initial');
            setInterval(() => { try { this.scanPage('periodic'); } catch(e){} }, CONFIG.PERIODIC_INTERVAL);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', onReady, { once: true });
        } else {
            onReady();
        }
    }
};

Main.init();

})();