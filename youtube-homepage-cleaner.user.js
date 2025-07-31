// ==UserScript==
// @name         YouTube 淨化大師 (Pantheon)
// @namespace    http://tampermonkey.net/
// @version      25.1.1
// @description  v25.1.1: 修正對「頻道會員專屬」徽章的過濾規則 | v25.1: 新增過濾「為你推薦的特選電影」區塊 | v25.0: 完美兼容！實現「懸停預覽播放」與「點擊開啟新分頁」並存。採用智慧型全局 pointerdown 攔截，精確處理預覽播放器與標準項目的點擊事件。
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

    // --- 設定與常數 (Config and Constants) ---
    const SCRIPT_INFO = GM_info?.script || { name: 'YouTube Purifier Pantheon', version: '25.1.1' };
    const ATTRS = {
        PROCESSED: 'data-yt-pantheon-processed',
        HIDDEN_REASON: 'data-yt-pantheon-hidden-reason',
    };
    const State = { HIDE: 'HIDE', KEEP: 'KEEP', WAIT: 'WAIT' };

    const CONFIG = {
        // 使用者設定 (User Settings)
        ENABLE_LOW_VIEW_FILTER: GM_getValue('enableLowViewFilter', true),
        LOW_VIEW_THRESHOLD: GM_getValue('lowViewThreshold', 1000),
        DEBUG_MODE: GM_getValue('debugMode', false),
        // 系統設定 (System Config)
        DEBOUNCE_DELAY: 30,
        PERIODIC_INTERVAL: 250,
    };

    // 主要選擇器 (Selectors)
    const SELECTORS = {
        // 用於過濾規則的頂層元素
        TOP_LEVEL_FILTERS: [
            'ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-video-renderer',
            'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer', 'ytd-ad-slot-renderer',
            'yt-lockup-view-model', 'ytd-statement-banner-renderer', 'grid-shelf-view-model',
            'ytd-playlist-renderer', 'ytd-compact-playlist-renderer'
        ],
        // [v25.0] 用於全局點擊攔截的標準容器
        CLICKABLE_CONTAINERS: [
             'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
             'yt-lockup-view-model', 'ytd-playlist-renderer', 'ytd-compact-playlist-renderer'
        ],
        // [v25.0] 懸停預覽播放器選擇器
        INLINE_PREVIEW_PLAYER: 'ytd-video-preview',
        init() {
            this.UNPROCESSED = this.TOP_LEVEL_FILTERS.map(s => `${s}:not([${ATTRS.PROCESSED}])`).join(', ');
            return this;
        }
    }.init();

    // --- 工具函數 (Utilities) ---
    // (保持不變)
    const utils = {
        debounce: (func, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func(...a), delay); }; },
        injectCSS: () => GM_addStyle('ytd-ad-slot-renderer, ytd-reel-shelf-renderer, ytd-promoted-sparkles-text-search-renderer { display: none !important; }'),
        parseLiveViewers: (text) => {
            if (!text) return null;
            const match = text.match(/([\d,.]+)\s*(人正在觀看|watching)/i);
            if (match && match[1]) {
                const count = parseFloat(match[1].replace(/,/g, ''));
                return isNaN(count) ? null : Math.floor(count);
            }
            return null;
        },
        parseViewCount: (() => {
            const cleanupRegex = /觀看次數：|次|,|views/gi;
            const multipliers = new Map([['萬', 1e4], ['万', 1e4], ['k', 1e3], ['m', 1e6], ['b', 1e9]]);
            return text => {
                if (!text) return null;
                const cleanedText = text.toLowerCase().replace(cleanupRegex, '').trim();
                const numberPart = parseFloat(cleanedText);
                if (isNaN(numberPart)) return null;
                for (const [suffix, multiplier] of multipliers) {
                    if (cleanedText.includes(suffix)) return Math.floor(numberPart * multiplier);
                }
                return Math.floor(numberPart);
            };
        })()
    };

    // --- 日誌記錄器 (Logger) ---
    const logger = {
        prefix: `[${SCRIPT_INFO.name}]`,
        style: (color) => `color:${color}; font-weight:bold;`,
        info: (msg, color = '#3498db') => CONFIG.DEBUG_MODE && console.log(`%c${logger.prefix} [INFO] ${msg}`, logger.style(color)),
        hide: (source, ruleName, reason, element) => CONFIG.DEBUG_MODE && console.log(`%c${logger.prefix} [HIDE] Rule:"${ruleName}" | Reason:${reason} | Src:[${source}]`, logger.style('#e74c3c'), element),
        logStart: () => console.log(`%c🏛️ ${logger.prefix} v${SCRIPT_INFO.version} "Pantheon" 啟動. (Debug: ${CONFIG.DEBUG_MODE})`, 'color:#7f8c8d; font-weight:bold; font-size: 1.2em;'),
    };

    // --- 功能增強模組 (Enhancements) ---
    // [v25.0] 智慧型全局點擊攔截 (處理懸停預覽)
    const Enhancer = {
        initGlobalClickListener() {
            // 使用 pointerdown 以獲得最早的攔截時機 (優於 mousedown)。
            document.addEventListener('pointerdown', (e) => {
                // 1. 過濾點擊類型：只處理滑鼠左鍵 (e.button === 0)，且沒有輔助鍵。
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;

                // 2. 排除功能性按鈕 (例如：選單按鈕 "...")。
                const essentialExclusions = 'button, yt-icon-button, #menu, ytd-menu-renderer, ytd-toggle-button-renderer';
                if (e.target.closest(essentialExclusions)) return;

                let targetLink = null;

                // [v25.0] 場景二：檢查點擊是否發生在活動的懸停預覽播放器 (Inline Preview) 上。
                // 這是關鍵，因為預覽播放器會脫離原本的影片容器。
                const previewPlayer = e.target.closest(SELECTORS.INLINE_PREVIEW_PLAYER);

                if (previewPlayer) {
                    // 如果點擊了預覽播放器，從播放器內部尋找連結。
                    targetLink = previewPlayer.querySelector('a#media-container-link, a.yt-simple-endpoint');
                } else {
                    // 場景一：標準點擊 (非預覽播放狀態)。
                    // 事件委派：檢查點擊是否發生在標準影片容器內。
                    const container = e.target.closest(SELECTORS.CLICKABLE_CONTAINERS.join(', '));
                    if (!container) return;

                    // 檢查是否點擊了頻道連結 (頭像或名稱)。
                    const channelLink = e.target.closest('a#avatar-link, .ytd-channel-name a, a[href^="/@"], a[href^="/channel/"]');

                    if (channelLink && channelLink.href) {
                        targetLink = channelLink;
                    } else {
                        // 尋找影片/播放清單主連結。
                        targetLink = container.querySelector(
                            'a#thumbnail[href*="/watch?"], a#thumbnail[href*="/shorts/"], a#thumbnail[href*="/playlist?"]' +
                            ', a#video-title-link, a.yt-simple-endpoint#video-title, a.yt-lockup-view-model-wiz__title'
                        );
                    }
                }

                // 3. 攔截並開啟新分頁
                if (targetLink && targetLink.href) {
                    e.preventDefault();
                    // 關鍵：立即停止事件傳播，阻止 YouTube 的 SPA 導航啟動。
                    e.stopImmediatePropagation();

                    // 雙重保險：添加臨時的 click 阻擋器 (pointerdown 之後必然會觸發 click)。
                    const clickBlocker = (eClick) => {
                        eClick.preventDefault();
                        eClick.stopImmediatePropagation();
                    };
                    // 使用 { capture: true, once: true } 確保它只執行一次並立即移除。
                    document.addEventListener('click', clickBlocker, { capture: true, once: true });

                    window.open(targetLink.href, '_blank');
                    logger.info(`(Smart Global Intercept) 在新分頁中開啟: ${targetLink.href}`, '#2ecc71');
                }

            }, { capture: true }); // 必須使用捕獲階段 (capture: true)
        }
    };

    // --- 統一規則引擎 (Unified Rule Engine) ---
    // (規則引擎邏輯保持不變)
    const RuleEngine = {
        ruleCache: new Map(),
        globalRules: [],

        init() {
            this.ruleCache.clear();
            this.globalRules = [];

            const allRules = [
                // --- 通用項目過濾 ---
                { id: 'ad_sponsor', name: '廣告/促銷', conditions: { any: [{ type: 'selector', value: '[aria-label*="廣告"], [aria-label*="Sponsor"], [aria-label="贊助商廣告"], ytd-ad-slot-renderer' }] } },
                // --- [已修改] ---
                {
                    id: 'members_only',
                    name: '會員專屬',
                    conditions: {
                        any: [
                            { type: 'selector', value: '[aria-label*="會員專屬"], [aria-label*="Members only"]' },
                            { type: 'text', selector: '.badge-shape-wiz__text', keyword: /頻道會員專屬|Members only/i }
                        ]
                    }
                },
                { id: 'shorts_item', name: 'Shorts (單個)', conditions: { any: [{ type: 'selector', value: 'a[href*="/shorts/"]' }] } },

                // --- 僅過濾「合輯 (Mix)」，保留「播放清單 (Playlist)」 ---
                {
                    id: 'mix_only', name: '合輯 (Mix)',
                    conditions: {
                        any: [
                            { type: 'text', selector: '.badge-shape-wiz__text', keyword: /^合輯|Mix$/i },
                            { type: 'selector', value: 'ytd-thumbnail-overlay-side-panel-renderer:has-text("Mix"), ytd-thumbnail-overlay-side-panel-renderer:has-text("合輯")' }
                        ]
                    }
                },

                // --- 區塊/橫幅過濾 ---
                { id: 'premium_banner', name: 'Premium 推廣', scope: 'ytd-statement-banner-renderer', conditions: { any: [{ type: 'selector', value: 'ytd-button-renderer' }] } },
                { id: 'news_block', name: '新聞區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /新聞快報|Breaking news/i }] } },
                { id: 'shorts_block', name: 'Shorts 區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /^Shorts$/i }] } },
                { id: 'posts_block', name: '貼文區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /貼文|posts/i }] } },
                { id: 'shorts_grid_shelf', name: 'Shorts 區塊 (Grid)', scope: 'grid-shelf-view-model', conditions: { any: [{ type: 'text', selector: 'h2.shelf-header-layout-wiz__title', keyword: /^Shorts$/i }] } },
                
                // [v25.1 新增] 過濾電影推薦區塊
                {
                    id: 'movies_shelf',
                    name: '電影推薦區塊',
                    scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer',
                    conditions: {
                        any: [
                            { type: 'text', selector: '#title', keyword: /為你推薦的特選電影|featured movies for you/i },
                            { type: 'text', selector: 'p.ytd-badge-supported-renderer', keyword: /^YouTube 精選$/i }
                        ]
                    }
                },

                // --- 低觀看數過濾 (條件性啟用) ---
                ...(CONFIG.ENABLE_LOW_VIEW_FILTER ? [
                    { id: 'low_viewer_live', name: '低觀眾直播', isConditional: true, scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'liveViewers', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } },
                    { id: 'low_view_video', name: '低觀看影片', isConditional: true, scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'viewCount', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } }
                ] : [])
            ];

            // 初始化規則緩存
            allRules.forEach(rule => {
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

        // (RuleEngine 的 checkCondition, checkNumericMetadata, checkRule, processContainer 方法保持不變)
        checkCondition(container, condition) {
            try {
                switch (condition.type) {
                    case 'selector':
                        return container.querySelector(`:scope ${condition.value}`)
                            ? { state: State.HIDE, reason: `Selector: ${condition.value}` }
                            : { state: State.KEEP };
                    case 'text': {
                        const el = container.querySelector(`:scope ${condition.selector}`);
                        const text = el?.textContent?.trim() ?? '';
                        return el && condition.keyword.test(text)
                            ? { state: State.HIDE, reason: `Text: "${text}"` }
                            : { state: State.KEEP };
                    }
                    case 'liveViewers':
                    case 'viewCount':
                        return this.checkNumericMetadata(container, condition);
                    default:
                        return { state: State.KEEP };
                }
            } catch (e) {
                return { state: State.KEEP };
            }
        },

        checkNumericMetadata(container, condition) {
            const isLive = condition.type === 'liveViewers';
            const parser = isLive ? utils.parseLiveViewers : utils.parseViewCount;
            const metadataSelector = '#metadata-line .inline-metadata-item, .yt-content-metadata-view-model-wiz__metadata-text';

            for (const item of container.querySelectorAll(metadataSelector)) {
                const textContent = item.textContent?.trim();
                if (!textContent) continue;

                if (/(觀看|watching|views)/i.test(textContent)) {
                    const count = parser(textContent);
                    if (count === null) return { state: State.KEEP };

                    return count < condition.threshold
                        ? { state: State.HIDE, reason: `${condition.type}: ${count} < ${condition.threshold}` }
                        : { state: State.KEEP };
                }
            }
            if (container.tagName.includes('PLAYLIST')) {
                return { state: State.KEEP };
            }
            return { state: State.WAIT };
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
                if (result.state === State.WAIT) {
                    finalState = State.WAIT;
                }
            }

            if (finalState === State.KEEP) {
                container.setAttribute(ATTRS.PROCESSED, 'checked');
            }
        }
    };

    // --- 主執行流程 (Main Execution Flow) ---
    const Main = {
        menuIds: [],

        scanPage: (source) => {
            // 只負責過濾內容。
            document.querySelectorAll(SELECTORS.UNPROCESSED).forEach(el => RuleEngine.processContainer(el, source));
        },

        // (toggleSetting 和 setupMenu 保持不變)
        toggleSetting(key, options) {
            CONFIG[key] = !CONFIG[key];
            GM_setValue(key, CONFIG[key]);
            logger.info(`${options.message}已${CONFIG[key] ? '啟用' : '停用'} (即時)。`, CONFIG[key] ? '#2ecc71' : '#f39c12');

            if (CONFIG[key] && options.onEnable) options.onEnable();
            if (!CONFIG[key] && options.onDisable) options.onDisable();

            RuleEngine.init();
            this.scanPage('settings-update');
            this.setupMenu();
        },

        setupMenu() {
            this.menuIds.forEach(id => { try { GM_unregisterMenuCommand(id); } catch (e) { } });
            this.menuIds = [];

            const lvStatus = CONFIG.ENABLE_LOW_VIEW_FILTER ? '✅ 啟用' : '❌ 停用';
            const dbStatus = CONFIG.DEBUG_MODE ? '✅ 啟用' : '❌ 停用';

            this.menuIds.push(GM_registerMenuCommand(`低觀看數過濾 (閾值: ${CONFIG.LOW_VIEW_THRESHOLD}): ${lvStatus}`, () => {
                this.toggleSetting('ENABLE_LOW_VIEW_FILTER', {
                    message: '低觀看數過濾',
                    onEnable: () => {
                        document.querySelectorAll(`[${ATTRS.PROCESSED}]`).forEach(el => el.removeAttribute(ATTRS.PROCESSED));
                    },
                    onDisable: () => {
                        const lowViewRuleIds = ['low_viewer_live', 'low_view_video'];
                        document.querySelectorAll(`[${ATTRS.HIDDEN_REASON}]`).forEach(e => {
                            if (lowViewRuleIds.includes(e.getAttribute(ATTRS.HIDDEN_REASON))) {
                                e.style.display = '';
                                e.removeAttribute(ATTRS.PROCESSED);
                                e.removeAttribute(ATTRS.HIDDEN_REASON);
                            }
                        });
                    }
                });
            }));

            this.menuIds.push(GM_registerMenuCommand(`Debug 模式: ${dbStatus}`, () => this.toggleSetting('DEBUG_MODE', { message: 'Debug 模式' })));
        },

        init() {
            if (window.ytPantheonInitialized) return;
            window.ytPantheonInitialized = true;

            logger.logStart();
            utils.injectCSS();
            RuleEngine.init();
            this.setupMenu();

            // [v25.0] 初始化全局點擊監聽器 (在 document-start 階段盡早執行)
            // 不再需要 disableInlinePlayback，因為 initGlobalClickListener 已經可以處理預覽播放器的點擊。
            Enhancer.initGlobalClickListener();

            const debouncedScan = utils.debounce(() => this.scanPage('observer'), CONFIG.DEBOUNCE_DELAY);
            const observer = new MutationObserver(debouncedScan);

            const onReady = () => {
                if (!document.body) return;
                observer.observe(document.body, { childList: true, subtree: true });

                window.addEventListener('yt-navigate-finish', () => this.scanPage('navigate'));
                this.scanPage('initial');
                setInterval(() => this.scanPage('periodic'), CONFIG.PERIODIC_INTERVAL);
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
