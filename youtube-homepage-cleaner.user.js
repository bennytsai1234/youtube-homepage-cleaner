// ==UserScript==
// @name         YouTube 淨化大師
// @namespace    http://tampermonkey.net/
// @version      1.1.6
// @description  為極致體驗而生的內容過濾器，可掃除Premium廣告/Shorts/推薦/問卷，優化點擊（一律新分頁開啟），規則可高度自訂。
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

// --- 設定與常數 ---
const SCRIPT_INFO = GM_info?.script || { name: 'YouTube 淨化大師', version: '1.1.6' };
const ATTRS = {
    PROCESSED: 'data-yt-purifier-processed',
    HIDDEN_REASON: 'data-yt-purifier-hidden-reason',
    WAIT_COUNT: 'data-yt-purifier-wait-count',
};
const State = { HIDE: 'HIDE', KEEP: 'KEEP', WAIT: 'WAIT' };

const DEFAULT_RULE_ENABLES = {
    ad_sponsor: true, members_only: true, shorts_item: true, mix_only: true,
    premium_banner: true, news_block: true, shorts_block: true, posts_block: true,
    shorts_grid_shelf: true, movies_shelf: true, youtube_featured_shelf: true,
    popular_gaming_shelf: true,
    more_from_game_shelf: true,
    trending_playlist: true,
    inline_survey: true,
};
const DEFAULT_LOW_VIEW_THRESHOLD = 1000;

const CONFIG = {
    ENABLE_LOW_VIEW_FILTER: GM_getValue('enableLowViewFilter', true),
    LOW_VIEW_THRESHOLD: GM_getValue('lowViewThreshold', DEFAULT_LOW_VIEW_THRESHOLD),
    DEBUG_MODE: GM_getValue('debugMode', false),
    RULE_ENABLES: GM_getValue('ruleEnables', { ...DEFAULT_RULE_ENABLES }),
    DEBOUNCE_DELAY: 50,
    PERIODIC_INTERVAL: 350,
    WAIT_MAX_RETRY: 5,
};

// 主要選擇器
const SELECTORS = {
    TOP_LEVEL_FILTERS: [
        'ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-rich-shelf-renderer',
        'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer',
        'ytd-ad-slot-renderer', 'yt-lockup-view-model', 'ytd-statement-banner-renderer',
        'grid-shelf-view-model', 'ytd-playlist-renderer', 'ytd-compact-playlist-renderer',
        'ytd-grid-video-renderer' // *** ADDED for channel pages etc. ***
    ],
    CLICKABLE_CONTAINERS: [
        'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
        'yt-lockup-view-model', 'ytd-playlist-renderer', 'ytd-compact-playlist-renderer',
        'ytd-video-owner-renderer',
        'ytd-grid-video-renderer' // *** ADDED for channel pages etc. ***
    ],
    INLINE_PREVIEW_PLAYER: 'ytd-video-preview',
    init() {
        this.UNPROCESSED = this.TOP_LEVEL_FILTERS.map(s => `${s}:not([${ATTRS.PROCESSED}])`).join(', ');
        return this;
    }
}.init();

// --- 工具函數 ---
const utils = {
    debounce: (func, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func(...a), delay); }; },
    injectCSS: () => GM_addStyle('ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer { display: none !important; }'),
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

// --- 日誌記錄器 ---
const logger = {
    _batch: [],
    prefix: `[${SCRIPT_INFO.name}]`,
    style: (color) => `color:${color}; font-weight:bold;`,
    info: (msg, color = '#3498db') => CONFIG.DEBUG_MODE && console.log(`%c${logger.prefix} [INFO] ${msg}`, logger.style(color)),
    startBatch() { this._batch = []; },
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

// --- 功能增強模組 ---
const Enhancer = {
    initGlobalClickListener() {
        document.addEventListener('click', (e) => {
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

// --- 統一規則引擎 ---
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
            { id: 'news_block', name: '新聞區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: 'h2 #title', keyword: /新聞快報|Breaking News|ニュース/i }] } },
            { id: 'shorts_block', name: 'Shorts 區塊', scope: 'ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title, h2 #title', keyword: /^Shorts$/i }] } },
            { id: 'posts_block', name: '貼文區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: 'h2 #title', keyword: /貼文|Posts|投稿|Publicaciones/i }] } },
            { id: 'shorts_grid_shelf', name: 'Shorts 區塊 (Grid)', scope: 'grid-shelf-view-model', conditions: { any: [{ type: 'text', selector: 'h2.shelf-header-layout-wiz__title', keyword: /^Shorts$/i }] } },
            { id: 'movies_shelf', name: '電影推薦區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [ { type: 'text', selector: 'h2 #title', keyword: /為你推薦的特選電影|featured movies/i }, { type: 'text', selector: 'p.ytd-badge-supported-renderer', keyword: /YouTube 精選/i } ] } },
            { id: 'youtube_featured_shelf', name: 'YouTube 精選推廣區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [ { type: 'text', selector: '.yt-shelf-header-layout__sublabel', keyword: /YouTube 精選/i } ] } },
            { id: 'popular_gaming_shelf', name: '熱門遊戲直播區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: 'h2 #title', keyword: /^熱門遊戲直播$/i }] } },
            { id: 'more_from_game_shelf', name: '「更多相關內容」區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#subtitle', keyword: /^更多此遊戲相關內容$/i }] } },
            {
                id: 'trending_playlist',
                name: '發燒影片/熱門內容',
                scope: 'ytd-rich-item-renderer, yt-lockup-view-model',
                conditions: { any: [{ type: 'text', selector: 'h3 a, #video-title', keyword: /發燒影片|Trending/i }] }
            },
            {
                id: 'inline_survey',
                name: '意見調查問卷',
                scope: 'ytd-rich-section-renderer',
                conditions: { any: [{ type: 'selector', value: 'ytd-inline-survey-renderer' }] }
            },
        ];

        const activeRules = this.rawRuleDefinitions.filter(rule => CONFIG.RULE_ENABLES[rule.id] !== false);
        if (CONFIG.ENABLE_LOW_VIEW_FILTER) {
            const lowViewScope = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-grid-video-renderer';
            activeRules.push(
                { id: 'low_viewer_live', name: '低觀眾直播', scope: lowViewScope, isConditional: true, conditions: { any: [{ type: 'liveViewers', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } },
                { id: 'low_view_video', name: '低觀看影片', scope: lowViewScope, isConditional: true, conditions: { any: [{ type: 'viewCount', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } }
            );
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
                const parentWrapper = container.closest(parentSelectors);

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

// --- 主執行流程與菜單管理 ---
const Main = {
    menuIds: [],
    scanPage: (source) => {
        logger.startBatch();
        for (const sel of SELECTORS.TOP_LEVEL_FILTERS) {
            try { document.querySelectorAll(`${sel}:not([${ATTRS.PROCESSED}])`).forEach(el => RuleEngine.processContainer(el, source)); } catch (e) {}
        }
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
        this.setupMenu();
    },

    toggleRulesMenu() {
        let menuText = '請輸入要切換的規則編號：\n\n';
        RuleEngine.rawRuleDefinitions.forEach((rule, index) => {
            const mark = CONFIG.RULE_ENABLES[rule.id] !== false ? '✅' : '❌';
            menuText += `${index + 1}. ${mark} ${rule.name}\n`;
        });
        menuText += '\n輸入數字後按確定即可切換。';

        const choice = prompt(menuText);
        if (choice === null) return; // User cancelled

        const index = parseInt(choice, 10) - 1;
        if (!isNaN(index) && index >= 0 && index < RuleEngine.rawRuleDefinitions.length) {
            const rule = RuleEngine.rawRuleDefinitions[index];
            const isEnabled = CONFIG.RULE_ENABLES[rule.id] !== false;
            CONFIG.RULE_ENABLES[rule.id] = !isEnabled;
            GM_setValue('ruleEnables', CONFIG.RULE_ENABLES);
            this.resetAndRescan(`規則「${rule.name}」已${!isEnabled ? '啟用' : '停用'}`);
        } else if (choice.trim() !== '') {
            alert('無效的輸入，請輸入列表中的數字。');
        }
    },

    setupMenu() {
        this.menuIds.forEach(id => { try { GM_unregisterMenuCommand(id); } catch (e) {} });
        this.menuIds = [];

        const addCmd = (text, func) => this.menuIds.push(GM_registerMenuCommand(text, func));
        const s = (key) => CONFIG[key] ? '✅' : '❌';

        addCmd(`${s('ENABLE_LOW_VIEW_FILTER')} 低觀看數過濾 (閾值: ${CONFIG.LOW_VIEW_THRESHOLD})`, () => {
            CONFIG.ENABLE_LOW_VIEW_FILTER = !CONFIG.ENABLE_LOW_VIEW_FILTER;
            GM_setValue('enableLowViewFilter', CONFIG.ENABLE_LOW_VIEW_FILTER);
            this.resetAndRescan(`低觀看數過濾 已${s('ENABLE_LOW_VIEW_FILTER') === '✅' ? '啟用' : '停用'}`);
        });
        addCmd(`🔧 修改觀看數過濾閾值`, () => {
            const newThreshold = parseInt(prompt('請輸入新的低觀看數過濾閾值（純數字）:', CONFIG.LOW_VIEW_THRESHOLD));
            if (!isNaN(newThreshold) && newThreshold >= 0) {
                CONFIG.LOW_VIEW_THRESHOLD = newThreshold;
                GM_setValue('lowViewThreshold', newThreshold);
                this.resetAndRescan(`觀看數過濾閾值已更新為 ${newThreshold}`);
            }
        });

        addCmd('⚙️ 設定過濾規則...', () => { this.toggleRulesMenu(); });

        addCmd('--- 系統 ---', () => {});
        addCmd(`${s('DEBUG_MODE')} Debug 模式`, () => {
            CONFIG.DEBUG_MODE = !CONFIG.DEBUG_MODE;
            GM_setValue('debugMode', CONFIG.DEBUG_MODE);
            logger.info(`Debug 模式 已${s('DEBUG_MODE') === '✅' ? '啟用' : '停用'}`);
            this.setupMenu();
        });
        addCmd('🔄 恢復預設設定', () => {
            if (confirm('確定要將所有過濾規則和設定恢復為預設值嗎？')) {
                GM_setValue('ruleEnables', { ...DEFAULT_RULE_ENABLES });
                GM_setValue('lowViewThreshold', DEFAULT_LOW_VIEW_THRESHOLD);
                GM_setValue('enableLowViewFilter', true);

                CONFIG.RULE_ENABLES = { ...DEFAULT_RULE_ENABLES };
                CONFIG.LOW_VIEW_THRESHOLD = DEFAULT_LOW_VIEW_THRESHOLD;
                CONFIG.ENABLE_LOW_VIEW_FILTER = true;

                this.resetAndRescan('所有設定已恢復為預設值。');
            }
        });
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
            if (!document.body) return;
            observer.observe(document.querySelector('ytd-app') || document.body, { childList: true, subtree: true });
            window.addEventListener('yt-navigate-finish', () => this.scanPage('navigate'));
            this.scanPage('initial');
            setInterval(() => { try { this.scanPage('periodic'); } catch(e){} }, CONFIG.PERIODIC_INTERVAL);
        };
        
        document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', onReady, { once: true }) : onReady();
    }
};

Main.init();

})();
