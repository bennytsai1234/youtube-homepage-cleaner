// ==UserScript==
// @name         YouTube 淨化大師 (Elysian)
// @namespace    http://tampermonkey.net/
// @version      14.0
// @description  v14.0: 最終修正。遵循最嚴格的程式碼規範，修正所有已知的 Linter 錯誤，達到品質與功能的真正終點。
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
    const SETTINGS = {
        ENABLE_LOW_VIEW_FILTER: GM_getValue('enableLowViewFilter', true),
        LOW_VIEW_THRESHOLD: GM_getValue('lowViewThreshold', 1000),
        DEBUG_MODE: GM_getValue('debugMode', false),
    };

    const CONFIG = { DEBOUNCE_DELAY: 30, PERIODIC_INTERVAL: 250 };
    const PROCESSED_ATTR = 'data-yt-elysian-processed';
    const HIDDEN_REASON_ATTR = 'data-yt-elysian-hidden-reason';
    const SCRIPT_INFO = GM_info?.script || { name: 'YouTube Purifier Elysian', version: '14.0' };
    const State = { HIDE: 'HIDE', KEEP: 'KEEP', WAIT: 'WAIT' };

    const SELECTORS = {
        TOP_LEVEL: ['ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer', 'ytd-ad-slot-renderer', 'yt-lockup-view-model', 'ytd-statement-banner-renderer'],
        init() { this.UNPROCESSED = this.TOP_LEVEL.map(s => `${s}:not([${PROCESSED_ATTR}])`).join(', '); return this; }
    }.init();

    // --- 工具函數 ---
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
            const multipliers = new Map([['萬', 1e4], ['万', 1e4], ['k', 1e3], ['m', 1e6]]);
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

    // --- 日誌記錄器 ---
    const logger = {
        prefix: `[${SCRIPT_INFO.name}]`,
        info: (msg, style = 'color:#3498db;') => SETTINGS.DEBUG_MODE && console.log(`%c${logger.prefix} [INFO] ${msg}`, style),
        hide: (source, ruleName, reason, element) => SETTINGS.DEBUG_MODE && console.log(`%c${logger.prefix} [HIDE] Rule:"${ruleName}" | Reason:${reason} | Src:[${source}]`, 'color:#e74c3c;', element),
        logStart: () => console.log(`%c✨ ${logger.prefix} v${SCRIPT_INFO.version} "Elysian" 啟動.`, 'color:#16a085; font-weight:bold; font-size: 1.2em;'),
    };

    // --- 統一規則引擎 ---
    const RuleEngine = {
        ruleCache: new Map(),
        globalRules: [],

        init() {
            this.ruleCache.clear();
            this.globalRules = [];
            const allRules = [
                { id: 'ad_sponsor', name: '廣告/促銷', conditions: { any: [{ type: 'selector', value: '[aria-label*="廣告"], [aria-label*="Sponsor"]' }] } },
                { id: 'members_only', name: '會員專屬', conditions: { any: [{ type: 'selector', value: '[aria-label*="會員專屬"], [aria-label*="Members only"]' }] } },
                { id: 'shorts_item', name: 'Shorts (單個)', conditions: { any: [{ type: 'selector', value: 'a#thumbnail[href*="/shorts/"]' }] } },
                { id: 'playlist_link', name: '播放清單 (連結)', conditions: { any: [{ type: 'selector', value: 'a[href*="&list="]' }] } },
                { id: 'premium_banner', name: 'Premium 推廣', scope: 'ytd-statement-banner-renderer', conditions: { any: [{ type: 'selector', value: 'ytd-button-renderer' }] }},
                { id: 'news_block', name: '新聞區塊', scope: 'ytd-rich-shelf-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /新聞快報|Breaking news/i }, { type: 'selector', value: 'yt-icon[icon^="yt-icons:explore_"]' }] }},
                { id: 'shorts_block', name: 'Shorts 區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /^Shorts$/i }] } },
                { id: 'posts_block', name: '貼文區塊', scope: 'ytd-rich-shelf-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /貼文|posts/i }] } },
                ...(SETTINGS.ENABLE_LOW_VIEW_FILTER ? [
                    { id: 'low_viewer_live', name: '低觀眾直播', isConditional: true, scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'liveViewers', threshold: SETTINGS.LOW_VIEW_THRESHOLD }] }},
                    { id: 'low_view_video', name: '低觀看影片', isConditional: true, scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'viewCount', threshold: SETTINGS.LOW_VIEW_THRESHOLD }] }}
                ] : [])
            ];
            allRules.forEach(rule => {
                if (rule.scope) {
                    rule.scope.split(',').forEach(scope => {
                        const tagName = scope.trim();
                        if (!this.ruleCache.has(tagName)) this.ruleCache.set(tagName, []);
                        this.ruleCache.get(tagName).push(rule);
                    });
                } else { this.globalRules.push(rule); }
            });
        },

        checkCondition(container, condition) {
            try {
                switch (condition.type) {
                    case 'selector':
                        return container.querySelector(condition.value)
                            ? { state: State.HIDE, reason: `Selector: ${condition.value}` }
                            : { state: State.KEEP };

                    // 【最終修正】為 case 區塊添加大括號 {}，創建獨立的塊級作用域，以符合 no-case-declarations 規則。
                    case 'text': {
                        const el = container.querySelector(condition.selector);
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
            const keyword = isLive ? 'watching' : 'view';
            const keywordZh = isLive ? '人正在觀看' : '觀看';
            const metadataSelector = '#metadata-line .inline-metadata-item, .yt-content-metadata-view-model-wiz__metadata-text';

            for (const item of container.querySelectorAll(metadataSelector)) {
                const textContent = item.textContent?.trim();
                if (!textContent) continue;
                if (textContent.includes(keywordZh) || textContent.toLowerCase().includes(keyword)) {
                    const count = parser(textContent);
                    if (count === null) return { state: State.KEEP };
                    return count < condition.threshold
                        ? { state: State.HIDE, reason: `${condition.type}: ${count}` }
                        : { state: State.KEEP };
                }
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
            if (container.hasAttribute(PROCESSED_ATTR)) return;
            const tagName = container.tagName.toLowerCase();
            const relevantRules = (this.ruleCache.get(tagName) || []).concat(this.globalRules);
            let finalState = State.KEEP;

            for (const rule of relevantRules) {
                const result = this.checkRule(container, rule);
                if (result.state === State.HIDE) {
                    container.style.setProperty('display', 'none', 'important');
                    container.setAttribute(PROCESSED_ATTR, 'hidden');
                    container.setAttribute(HIDDEN_REASON_ATTR, result.ruleId);
                    logger.hide(source, rule.name, result.reason, container);
                    return;
                }
                if (result.state === State.WAIT) finalState = State.WAIT;
            }
            if (finalState === State.KEEP) container.setAttribute(PROCESSED_ATTR, 'checked');
        }
    };

    // --- 主執行流程 ---
    const Main = {
        menuIds: [],
        scanPage: (source) => document.querySelectorAll(SELECTORS.UNPROCESSED).forEach(el => RuleEngine.processContainer(el, source)),

        toggleSetting(key, options) {
            SETTINGS[key] = !SETTINGS[key];
            GM_setValue(key, SETTINGS[key]);
            logger.info(`${options.message}已${SETTINGS[key] ? '啟用' : '停用'} (即時)。`, `color:${SETTINGS[key] ? '#2ecc71' : '#f39c12'};`);
            if (SETTINGS[key] && options.onEnable) options.onEnable();
            if (!SETTINGS[key] && options.onDisable) options.onDisable();
            RuleEngine.init();
            this.scanPage('real-time-update');
            this.setupMenu();
        },

        setupMenu() {
            if (typeof GM_unregisterMenuCommand !== 'undefined') {
                this.menuIds.forEach(id => { try { GM_unregisterMenuCommand(id); } catch (e) {} });
            }
            this.menuIds = [];
            const lvStatus = SETTINGS.ENABLE_LOW_VIEW_FILTER ? '✅ 啟用' : '❌ 停用';
            const dbStatus = SETTINGS.DEBUG_MODE ? '✅ 啟用' : '❌ 停用';
            this.menuIds.push(GM_registerMenuCommand(`低觀看數過濾: ${lvStatus}`, () => {
                this.toggleSetting('ENABLE_LOW_VIEW_FILTER', {
                    message: '低觀看數過濾',
                    onEnable: () => document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => el.removeAttribute(PROCESSED_ATTR)),
                    onDisable: () => {
                        const lowViewRuleIds = ['low_viewer_live', 'low_view_video'];
                        document.querySelectorAll(`[${HIDDEN_REASON_ATTR}]`).forEach(e => {
                            if (lowViewRuleIds.includes(e.getAttribute(HIDDEN_REASON_ATTR))) {
                                e.style.display = '';
                                e.removeAttribute(PROCESSED_ATTR);
                                e.removeAttribute(HIDDEN_REASON_ATTR);
                            }
                        });
                    }
                });
            }));
            this.menuIds.push(GM_registerMenuCommand(`Debug 模式: ${dbStatus}`, () => this.toggleSetting('DEBUG_MODE', { message: 'Debug 模式' })));
        },

        init() {
            if (window.ytElysianInitialized) return;
            window.ytElysianInitialized = true;

            logger.logStart();
            utils.injectCSS();
            RuleEngine.init();
            this.setupMenu();
            const debouncedScan = utils.debounce(() => this.scanPage('observer'), CONFIG.DEBOUNCE_DELAY);
            const observer = new MutationObserver(debouncedScan);
            const onReady = () => {
                observer.observe(document.body, { childList: true, subtree: true });
                window.addEventListener('yt-navigate-finish', () => this.scanPage('navigate'));
                this.scanPage('initial');
                setInterval(() => this.scanPage('periodic'), CONFIG.PERIODIC_INTERVAL);
            };
            if (document.body) onReady();
            else document.addEventListener('DOMContentLoaded', onReady, { once: true });
        }
    };

    Main.init();
})();
