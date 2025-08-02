// ==UserScript==
// @name         YouTube 淨化大師 (Pantheon)
// @namespace    http://tampermonkey.net/
// @version      26.0.0
// @description  v26.0: 終極強化版！整合AI建議，實現【可配置規則開關】、【超強健觀看數解析】(多語系/防誤判)、【點擊攔截優化】、【WAIT狀態防循環】及【多項穩定性修正】。
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
// ==/UserScript==

(function () {
'use strict';

// --- 設定與常數 ---
const SCRIPT_INFO = GM_info?.script || { name: 'YouTube Purifier Pantheon', version: '26.0.0' };
const ATTRS = {
    PROCESSED: 'data-yt-pantheon-processed',
    HIDDEN_REASON: 'data-yt-pantheon-hidden-reason',
    WAIT_COUNT: 'data-yt-pantheon-wait-count',
};
const State = { HIDE: 'HIDE', KEEP: 'KEEP', WAIT: 'WAIT' };

// [v26] 規則開關的預設值，使用者可在菜單中自訂
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
};

const CONFIG = {
    ENABLE_LOW_VIEW_FILTER: GM_getValue('enableLowViewFilter', true),
    LOW_VIEW_THRESHOLD: GM_getValue('lowViewThreshold', 1000),
    DEBUG_MODE: GM_getValue('debugMode', false),
    RULE_ENABLES: GM_getValue('ruleEnables', { ...DEFAULT_RULE_ENABLES }), // 使用拷貝確保預設值不被污染
    DEBOUNCE_DELAY: 50,      // 稍微增加延遲以應對更複雜的DOM變化
    PERIODIC_INTERVAL: 350,
    WAIT_MAX_RETRY: 5,       // 降低重試次數，更快放棄無效等待
};

// 主要選擇器
const SELECTORS = {
    TOP_LEVEL_FILTERS: [
        'ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-rich-shelf-renderer',
        'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer',
        'ytd-ad-slot-renderer', 'yt-lockup-view-model', 'ytd-statement-banner-renderer',
        'grid-shelf-view-model', 'ytd-playlist-renderer', 'ytd-compact-playlist-renderer'
    ],
    CLICKABLE_CONTAINERS: [
        'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
        'yt-lockup-view-model', 'ytd-playlist-renderer', 'ytd-compact-playlist-renderer'
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
    // [v26] 最小化CSS注入，將顯示邏輯交給規則引擎
    injectCSS: () => GM_addStyle('ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer { display: none !important; }'),

    unitMultiplier: (u) => {
        if (!u) return 1;
        const m = { 'k': 1e3, 'm': 1e6, 'b': 1e9, '千': 1e3, '萬': 1e4, '万': 1e4, '億': 1e8, '亿': 1e8 };
        return m[u.toLowerCase()] || 1;
    },

    // [v26] 極度強健的觀看/直播數解析器
    parseNumeric: (text, type) => {
        if (!text) return null;
        const raw = text.replace(/,/g, '').toLowerCase();

        const keywords = {
            live: /(正在觀看|觀眾|watching|viewers)/i,
            view: /(view|觀看|次)/i,
        };
        const antiKeywords = /(分鐘|小時|天|週|月|年|ago|minute|hour|day|week|month|year)/i;

        // 如果是計數，但包含時間關鍵字，則很可能是發布時間，予以排除
        if (type === 'view' && antiKeywords.test(raw) && !keywords.view.test(raw)) return null;
        // 如果文本不包含對應類型的關鍵字，也排除
        if (!keywords[type].test(raw)) return null;

        const m = raw.match(/([\d,.]+)\s*([kmb千萬万億亿])?/i);
        if (!m) return null;

        const num = parseFloat(m[1].replace(/,/g, ''));
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
        const candidates = [
            'a#thumbnail[href*="/watch?"]', 'a#thumbnail[href*="/shorts/"]', 'a#thumbnail[href*="/playlist?"]',
            'a#video-title-link', 'a.yt-simple-endpoint#video-title', 'a.yt-lockup-view-model-wiz__title'
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
    prefix: `[${SCRIPT_INFO.name}]`,
    style: (color) => `color:${color}; font-weight:bold;`,
    info: (msg, color = '#3498db') => CONFIG.DEBUG_MODE && console.log(`%c${logger.prefix} [INFO] ${msg}`, logger.style(color)),
    hide: (source, ruleName, reason, element) => CONFIG.DEBUG_MODE && console.log(`%c${logger.prefix} [HIDE] Rule:"${ruleName}" | Reason:${reason} | Src:[${source}]`, logger.style('#e74c3c'), element),
    logStart: () => console.log(`%c🏛️ ${logger.prefix} v${SCRIPT_INFO.version} "Pantheon" 啟動. (Debug: ${CONFIG.DEBUG_MODE})`, 'color:#7f8c8d; font-weight:bold; font-size: 1.2em;'),
};

// --- 功能增強模組 ---
const Enhancer = {
    initGlobalClickListener() {
        document.addEventListener('pointerdown', (e) => {
            // [v26] 只處理左鍵，並尊重Ctrl/Cmd/Shift/Alt的原生行為
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

            // [v26] 擴大排除列表，防止誤傷
            const essentialExclusions = 'button, yt-icon-button, #menu, ytd-menu-renderer, ytd-toggle-button-renderer, yt-chip-cloud-chip-renderer, .yt-spec-button-shape-next';
            if (e.target.closest(essentialExclusions)) return;

            let targetLink = null;
            const previewPlayer = e.target.closest(SELECTORS.INLINE_PREVIEW_PLAYER);
            if (previewPlayer) {
                targetLink = utils.findPrimaryLink(previewPlayer);
            } else {
                const container = e.target.closest(SELECTORS.CLICKABLE_CONTAINERS.join(', '));
                if (!container) return;
                const channelLink = e.target.closest('a#avatar-link, .ytd-channel-name a, a[href^="/@"], a[href^="/channel/"]');
                targetLink = channelLink?.href ? channelLink : utils.findPrimaryLink(container);
            }

            // [v26] 確保是有效的YT內部連結才攔截
            const isValidTarget = targetLink?.href && (new URL(targetLink.href, location.origin)).hostname.includes('youtube.com');
            if (isValidTarget) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const clickBlocker = (eClick) => { eClick.preventDefault(); eClick.stopImmediatePropagation(); };
                document.addEventListener('click', clickBlocker, { capture: true, once: true });
                window.open(targetLink.href, '_blank');
                logger.info(`(Smart Global Intercept) 在新分頁中開啟: ${targetLink.href}`, '#2ecc71');
            }
        }, { capture: true });
    }
};

// --- 統一規則引擎 ---
const RuleEngine = {
    ruleCache: new Map(),
    globalRules: [],
    rawRuleDefinitions: [], // [v26] 存儲原始規則定義，用於菜單生成

    init() {
        this.ruleCache.clear();
        this.globalRules = [];

        // [v26] 將原始規則定義存儲起來，便於菜單生成
        this.rawRuleDefinitions = [
            // 通用過濾
            { id: 'ad_sponsor', name: '廣告/促銷', conditions: { any: [{ type: 'selector', value: '[aria-label*="廣告"], [aria-label*="Sponsor"], [aria-label="贊助商廣告"], ytd-ad-slot-renderer' }] } },
            // 項目過濾
            { id: 'members_only', name: '會員專屬', conditions: { any: [ { type: 'selector', value: '[aria-label*="會員專屬"]' }, { type: 'text', selector: '.badge-shape-wiz__text', keyword: /頻道會員專屬|Members only/i } ] } },
            { id: 'shorts_item', name: 'Shorts (單個)', conditions: { any: [{ type: 'selector', value: 'a[href*="/shorts/"]' }] } },
            { id: 'mix_only', name: '合輯 (Mix)', conditions: { any: [{ type: 'text', selector: '.badge-shape-wiz__text, ytd-thumbnail-overlay-side-panel-renderer', keyword: /(^|\s)(合輯|Mix)(\s|$)/i }] } }, // [v26] 移除:has-text
            // 區塊過濾
            { id: 'premium_banner', name: 'Premium 推廣', scope: 'ytd-statement-banner-renderer', conditions: { any: [{ type: 'selector', value: 'ytd-button-renderer' }] } },
            { id: 'news_block', name: '新聞區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /新聞快報|Breaking news|ニュース/i }] } },
            { id: 'shorts_block', name: 'Shorts 區塊', scope: 'ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title, .ytd-rich-shelf-renderer.title', keyword: /^Shorts$/i }] } },
            { id: 'posts_block', name: '貼文區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /貼文|posts|投稿/i }] } },
            { id: 'shorts_grid_shelf', name: 'Shorts 區塊 (Grid)', scope: 'grid-shelf-view-model', conditions: { any: [{ type: 'text', selector: 'h2.shelf-header-layout-wiz__title', keyword: /^Shorts$/i }] } },
            { id: 'movies_shelf', name: '電影推薦區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [ { type: 'text', selector: '#title', keyword: /為你推薦的特選電影|featured movies for you/i }, { type: 'text', selector: 'p.ytd-badge-supported-renderer', keyword: /^YouTube 精選$/i } ] } },
        ];

        // 過濾出啟用的規則
        const activeRules = this.rawRuleDefinitions.filter(rule => CONFIG.RULE_ENABLES[rule.id]);

        // 添加條件式規則
        if (CONFIG.ENABLE_LOW_VIEW_FILTER) {
            activeRules.push(
                { id: 'low_viewer_live', name: '低觀眾直播', isConditional: true, scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'liveViewers', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } },
                { id: 'low_view_video', name: '低觀看影片', isConditional: true, scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'viewCount', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } }
            );
        }

        // 初始化規則緩存
        activeRules.forEach(rule => {
            if (rule.scope) {
                rule.scope.split(',').forEach(scope => {
                    const tagName = scope.trim().toUpperCase();
                    if (!this.ruleCache.has(tagName)) this.ruleCache.set(tagName, []);
                    this.ruleCache.get(tagName).push(rule);
                });
            } else {
                this.globalRules.push(rule);
            }
        });
    },

    checkCondition(container, condition) {
        try {
            switch (condition.type) {
                case 'selector': return container.querySelector(`:scope ${condition.value}`) ? { state: State.HIDE, reason: `Selector: ${condition.value}` } : { state: State.KEEP };
                case 'text': {
                    const el = container.querySelector(`:scope ${condition.selector}`);
                    const text = el?.textContent?.trim() ?? '';
                    return el && condition.keyword.test(text) ? { state: State.HIDE, reason: `Text: "${text}"` } : { state: State.KEEP };
                }
                case 'liveViewers': case 'viewCount': return this.checkNumericMetadata(container, condition);
                default: return { state: State.KEEP };
            }
        } catch (e) { return { state: State.KEEP }; }
    },

    checkNumericMetadata(container, condition) {
        const parser = condition.type === 'liveViewers' ? utils.parseLiveViewers : utils.parseViewCount;
        const textSources = [
            ...Array.from(container.querySelectorAll('#metadata-line .inline-metadata-item, .yt-content-metadata-view-model-wiz__metadata-text'), el => el.textContent),
            utils.extractAriaTextForCounts(container)
        ];

        for (const text of textSources) {
            if (!text) continue;
            const count = parser(text);
            if (count !== null) {
                return count < condition.threshold
                    ? { state: State.HIDE, reason: `${condition.type}: ${count} < ${condition.threshold}` }
                    : { state: State.KEEP };
            }
        }
        return container.tagName.includes('PLAYLIST') ? { state: State.KEEP } : { state: State.WAIT };
    },

    checkRule(container, rule) {
        if (rule.scope && !container.matches(rule.scope)) return { state: State.KEEP };
        if (rule.conditions.any) {
            let requiresWait = false;
            for (const condition of rule.conditions.any) {
                const result = this.checkCondition(container, condition);
                if (result.state === State.HIDE) return { ...result, ruleId: rule.id };
                if (result.state === State.WAIT) requiresWait = true;
            }
            return requiresWait ? { state: State.WAIT } : { state: State.KEEP };
        }
        return { state: State.KEEP };
    },

    processContainer(container, source) {
        if (container.hasAttribute(ATTRS.PROCESSED)) return;
        const tagName = container.tagName;
        const relevantRules = (this.ruleCache.get(tagName) || []).concat(this.globalRules);
        let finalState = State.KEEP;

        for (const rule of relevantRules) {
            const result = this.checkRule(container, rule);
            if (result.state === State.HIDE) {
                container.style.setProperty('display', 'none', 'important');
                container.setAttribute(ATTRS.PROCESSED, 'hidden');
                container.setAttribute(ATTRS.HIDDEN_REASON, result.ruleId);
                logger.hide(source, rule.name, result.reason, container);
                return;
            }
            if (result.state === State.WAIT) finalState = State.WAIT;
        }

        if (finalState === State.WAIT) {
            const count = +(container.getAttribute(ATTRS.WAIT_COUNT) || 0) + 1;
            const maxRetries = container.tagName === 'YT-LOCKUP-VIEW-MODEL' ? 2 : CONFIG.WAIT_MAX_RETRY;
            if (count >= maxRetries) {
                container.setAttribute(ATTRS.PROCESSED, 'checked-wait-expired');
            } else {
                container.setAttribute(ATTRS.WAIT_COUNT, String(count));
            }
        } else {
            container.setAttribute(ATTRS.PROCESSED, 'checked');
        }
    }
};

// --- 主執行流程 ---
const Main = {
    menuIds: [],

    scanPage: (source) => {
        // [v26] 分片查詢，提高性能
        for (const sel of SELECTORS.TOP_LEVEL_FILTERS) {
            try {
                document.querySelectorAll(`${sel}:not([${ATTRS.PROCESSED}])`).forEach(el => RuleEngine.processContainer(el, source));
            } catch (e) { /* 忽略無效選擇器錯誤 */ }
        }
    },
    
    // [v26] 通用的設定重置與重掃流程
    resetAndRescan(message) {
        logger.info(message);
        // 清理所有狀態，以便重新應用規則
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

    toggleSetting(key, message) {
        CONFIG[key] = !CONFIG[key];
        GM_setValue(key, CONFIG[key]);
        this.resetAndRescan(`${message} 已${CONFIG[key] ? '啟用' : '停用'}`);
    },

    toggleRule(id, name) {
        const current = CONFIG.RULE_ENABLES[id] !== false;
        CONFIG.RULE_ENABLES[id] = !current;
        GM_setValue('ruleEnables', CONFIG.RULE_ENABLES);
        this.resetAndRescan(`規則「${name}」已${!current ? '啟用' : '停用'}`);
    },

    setupMenu() {
        this.menuIds.forEach(id => { try { GM_unregisterMenuCommand(id); } catch (e) { } });
        this.menuIds = [];

        // 主要功能開關
        const lvStatus = CONFIG.ENABLE_LOW_VIEW_FILTER ? '✅' : '❌';
        this.menuIds.push(GM_registerMenuCommand(`${lvStatus} 低觀看數過濾 (閾值: ${CONFIG.LOW_VIEW_THRESHOLD})`, () => this.toggleSetting('ENABLE_LOW_VIEW_FILTER', '低觀看數過濾')));
        const dbStatus = CONFIG.DEBUG_MODE ? '✅' : '❌';
        this.menuIds.push(GM_registerMenuCommand(`${dbStatus} Debug 模式`, () => this.toggleSetting('DEBUG_MODE', 'Debug 模式')));
        
        this.menuIds.push(GM_registerMenuCommand('--- 過濾規則開關 ---', () => {}));

        // [v26] 動態生成所有規則的開關菜單
        RuleEngine.rawRuleDefinitions.forEach(rule => {
            const enabled = CONFIG.RULE_ENABLES[rule.id] !== false;
            const mark = enabled ? '✅' : '❌';
            this.menuIds.push(GM_registerMenuCommand(`${mark} 過濾：${rule.name}`, () => this.toggleRule(rule.id, rule.name)));
        });
    },

    init() {
        if (window.ytPantheonInitialized) return;
        window.ytPantheonInitialized = true;

        logger.logStart();
        utils.injectCSS();
        RuleEngine.init();
        this.setupMenu();
        Enhancer.initGlobalClickListener();

        const debouncedScan = utils.debounce(() => this.scanPage('observer'), CONFIG.DEBOUNCE_DELAY);
        const observer = new MutationObserver(debouncedScan);

        const onReady = () => {
            if (!document.body) return;
            const root = document.querySelector('ytd-app') || document.body;
            observer.observe(root, { childList: true, subtree: true });
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
