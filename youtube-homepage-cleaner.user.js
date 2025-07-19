// ==UserScript==
// @name         YouTube 淨化大師 (Pantheon) - Optimized
// @namespace    http://tampermonkey.net/
// @version      15.1
// @description  v15.1: 優化設定儲存邏輯與規則快取匹配精確度。基於 v15.0 的穩定架構進行微調，確保效能與穩定性。
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

    // 防止腳本重複注入
    if (window.ytPantheonInitialized) return;
    window.ytPantheonInitialized = true;

    // --- 設定與常數 (Settings and Constants) ---

    // 映射內部設定鍵名到 GM_getValue 儲存鍵名
    const SETTING_KEYS = {
        ENABLE_LOW_VIEW_FILTER: 'enableLowViewFilter',
        LOW_VIEW_THRESHOLD: 'lowViewThreshold',
        DEBUG_MODE: 'debugMode',
    };

    const SETTINGS = {
        ENABLE_LOW_VIEW_FILTER: GM_getValue(SETTING_KEYS.ENABLE_LOW_VIEW_FILTER, true),
        LOW_VIEW_THRESHOLD: GM_getValue(SETTING_KEYS.LOW_VIEW_THRESHOLD, 1000),
        DEBUG_MODE: GM_getValue(SETTING_KEYS.DEBUG_MODE, false),
    };

    const CONFIG = { DEBOUNCE_DELAY: 30, PERIODIC_INTERVAL: 250 };
    const PROCESSED_ATTR = 'data-yt-pantheon-processed';
    const HIDDEN_REASON_ATTR = 'data-yt-pantheon-hidden-reason';
    const SCRIPT_INFO = GM_info?.script || { name: 'YouTube Purifier Pantheon', version: '15.1' };
    const State = { HIDE: 'HIDE', KEEP: 'KEEP', WAIT: 'WAIT' }; // WAIT 用於元數據異步加載

    const SELECTORS = {
        TOP_LEVEL: [
            'ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-video-renderer',
            'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer', 'ytd-ad-slot-renderer',
            'yt-lockup-view-model', 'ytd-statement-banner-renderer'
        ],
        // 初始化未處理元素選擇器字串
        init() {
            this.UNPROCESSED = this.TOP_LEVEL.map(s => `${s}:not([${PROCESSED_ATTR}])`).join(', ');
            return this;
        }
    }.init();

    // --- 工具函數 (Utility Functions) ---
    const utils = {
        debounce: (func, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func(...a), delay); }; },
        // 預先注入 CSS 以快速隱藏已知結構
        injectCSS: () => GM_addStyle(`
            ytd-ad-slot-renderer,
            ytd-reel-shelf-renderer,
            ytd-promoted-sparkles-text-search-renderer {
                display: none !important;
            }
        `),
        // 解析直播觀看人數
        parseLiveViewers: (text) => {
            if (!text) return null;
            const match = text.match(/([\d,.]+)\s*(人正在觀看|watching)/i);
            if (match && match[1]) {
                const count = parseFloat(match[1].replace(/,/g, ''));
                return isNaN(count) ? null : Math.floor(count);
            }
            return null;
        },
        // 解析影片觀看次數 (支持多語言和單位)
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

    // --- 日誌記錄器 (Logger) ---
    const logger = {
        prefix: `[${SCRIPT_INFO.name}]`,
        info: (msg, style = 'color:#3498db;') => SETTINGS.DEBUG_MODE && console.log(`%c${logger.prefix} [INFO] ${msg}`, style),
        // 優化: 確保隱藏日誌包含元素本身，方便調試
        hide: (source, ruleName, reason, element) => SETTINGS.DEBUG_MODE && console.log(`%c${logger.prefix} [HIDE] Rule:"${ruleName}" | Reason:${reason} | Src:[${source}]`, 'color:#e74c3c;', element),
        logStart: () => console.log(`%c🏛️ ${logger.prefix} v${SCRIPT_INFO.version} "Pantheon" 啟動. Debug: ${SETTINGS.DEBUG_MODE ? 'ON' : 'OFF'}.`, 'color:#7f8c8d; font-weight:bold; font-size: 1.2em;'),
    };

    // --- 統一規則引擎 (Unified Rule Engine) ---
    const RuleEngine = {
        ruleCache: new Map(), // 按標籤名稱快取規則
        globalRules: [],

        init() {
            this.ruleCache.clear();
            this.globalRules = [];
            const allRules = [
                // 靜態內容過濾
                { id: 'ad_sponsor', name: '廣告/促銷', conditions: { any: [{ type: 'selector', value: '[aria-label*="廣告"], [aria-label*="Sponsor"]' }] } },
                { id: 'members_only', name: '會員專屬', conditions: { any: [{ type: 'selector', value: '[aria-label*="會員專屬"], [aria-label*="Members only"]' }] } },
                { id: 'shorts_item', name: 'Shorts (單個)', conditions: { any: [{ type: 'selector', value: 'a#thumbnail[href*="/shorts/"]' }] } },
                { id: 'playlist_link', name: '播放清單 (連結)', conditions: { any: [{ type: 'selector', value: 'a[href*="&list="]' }] } },
                { id: 'premium_banner', name: 'Premium 推廣', scope: 'ytd-statement-banner-renderer', conditions: { any: [{ type: 'selector', value: 'ytd-button-renderer' }] }},

                // 區塊內容過濾 (Scoped)
                { id: 'news_block', name: '新聞區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /新聞快報|Breaking news/i }, { type: 'selector', value: 'yt-icon[icon^="yt-icons:explore_"]' }] }},
                { id: 'shorts_block', name: 'Shorts 區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /^Shorts$/i }] } },
                // v15.0 修正確認: scope 包含 ytd-rich-section-renderer 以正確匹配外層容器
                { id: 'posts_block', name: '貼文區塊', scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /貼文|posts/i }] } },

                // 動態內容過濾 (Conditional)
                ...(SETTINGS.ENABLE_LOW_VIEW_FILTER ? [
                    { id: 'low_viewer_live', name: '低觀眾直播', scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'liveViewers', threshold: SETTINGS.LOW_VIEW_THRESHOLD }] }},
                    { id: 'low_view_video', name: '低觀看影片', scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [{ type: 'viewCount', threshold: SETTINGS.LOW_VIEW_THRESHOLD }] }}
                ] : [])
            ];

            // 將規則分類並快取
            allRules.forEach(rule => {
                if (rule.scope) {
                    rule.scope.split(',').forEach(scope => {
                        // 優化: 確保快取鍵名為小寫，以匹配 processContainer 中的 tagName
                        const tagName = scope.trim().toLowerCase();
                        if (!this.ruleCache.has(tagName)) this.ruleCache.set(tagName, []);
                        this.ruleCache.get(tagName).push(rule);
                    });
                } else {
                    this.globalRules.push(rule);
                }
            });
        },

        // 檢查單一條件
        checkCondition(container, condition) {
            try {
                switch (condition.type) {
                    case 'selector': {
                        return container.querySelector(condition.value)
                            ? { state: State.HIDE, reason: `Selector: ${condition.value}` }
                            : { state: State.KEEP };
                    }
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
                // 發生錯誤時預設為 KEEP
                return { state: State.KEEP };
            }
        },

        // 處理觀看數/直播人數的檢查 (可能需要等待數據加載)
        checkNumericMetadata(container, condition) {
            const isLive = condition.type === 'liveViewers';
            const parser = isLive ? utils.parseLiveViewers : utils.parseViewCount;
            const keyword = isLive ? 'watching' : 'view';
            const keywordZh = isLive ? '人正在觀看' : '觀看';

            // 適配新舊 UI 的元數據選擇器
            const metadataSelector = '#metadata-line .inline-metadata-item, .yt-content-metadata-view-model-wiz__metadata-text';

            for (const item of container.querySelectorAll(metadataSelector)) {
                const textContent = item.textContent?.trim();
                if (!textContent) continue;

                if (textContent.includes(keywordZh) || textContent.toLowerCase().includes(keyword)) {
                    const count = parser(textContent);
                    if (count === null) return { state: State.KEEP }; // 解析失敗

                    return count < condition.threshold
                        ? { state: State.HIDE, reason: `${condition.type}: ${count}` }
                        : { state: State.KEEP };
                }
            }
            // 如果找不到元數據，返回 WAIT，稍後重試
            return { state: State.WAIT };
        },

        // 檢查單一規則
        checkRule(container, rule) {
            // 範圍檢查
            if (rule.scope && !container.matches(rule.scope)) return { state: State.KEEP };

            if (rule.conditions.any) {
                let requiresWait = false;
                for (const condition of rule.conditions.any) {
                    const result = this.checkCondition(container, condition);
                    if (result.state === State.HIDE) {
                        // 確保返回規則名稱和 ID，供日誌和屬性使用
                        return { ...result, ruleId: rule.id, ruleName: rule.name };
                    }
                    if (result.state === State.WAIT) requiresWait = true;
                }
                return requiresWait ? { state: State.WAIT } : { state: State.KEEP };
            }
            return { state: State.KEEP };
        },

        // 處理單個容器元素
        processContainer(container, source) {
            if (container.hasAttribute(PROCESSED_ATTR)) return;

            const tagName = container.tagName.toLowerCase();
            const relevantRules = (this.ruleCache.get(tagName) || []).concat(this.globalRules);
            let finalState = State.KEEP;

            for (const rule of relevantRules) {
                const result = this.checkRule(container, rule);

                if (result.state === State.HIDE) {
                    // 執行隱藏
                    container.style.setProperty('display', 'none', 'important');
                    container.setAttribute(PROCESSED_ATTR, 'hidden');
                    container.setAttribute(HIDDEN_REASON_ATTR, result.ruleId);
                    logger.hide(source, result.ruleName, result.reason, container);
                    return; // 命中後停止處理
                }
                if (result.state === State.WAIT) {
                    finalState = State.WAIT;
                }
            }

            // 如果是 KEEP，標記為已檢查；如果是 WAIT，不標記，等待定期重試
            if (finalState === State.KEEP) {
                container.setAttribute(PROCESSED_ATTR, 'checked');
            }
        }
    };

    // --- 主執行流程 (Main Execution Flow) ---
    const Main = {
        menuIds: [],
        // 掃描頁面並處理所有未處理的元素
        scanPage: (source) => {
            const elements = document.querySelectorAll(SELECTORS.UNPROCESSED);
            if (elements.length > 0 && SETTINGS.DEBUG_MODE) {
                 logger.info(`Scanning ${elements.length} elements (Source: ${source})`);
            }
            elements.forEach(el => RuleEngine.processContainer(el, source));
        },

        // 切換設定
        toggleSetting(key, options) {
            SETTINGS[key] = !SETTINGS[key];
            // 優化: 使用映射的鍵名進行儲存
            const gmKey = SETTING_KEYS[key];
            if (gmKey) {
                GM_setValue(gmKey, SETTINGS[key]);
            }

            logger.info(`${options.message}已${SETTINGS[key] ? '啟用' : '停用'} (即時)。`, `color:${SETTINGS[key] ? '#2ecc71' : '#f39c12'};`);

            if (SETTINGS[key] && options.onEnable) options.onEnable();
            if (!SETTINGS[key] && options.onDisable) options.onDisable();

            RuleEngine.init(); // 重新初始化規則
            this.scanPage('real-time-update');
            this.setupMenu(); // 更新菜單顯示
        },

        // 設定 Tampermonkey 選單
        setupMenu() {
            if (typeof GM_unregisterMenuCommand !== 'undefined') {
                this.menuIds.forEach(id => { try { GM_unregisterMenuCommand(id); } catch (e) {} });
            }
            this.menuIds = [];

            const lvStatus = SETTINGS.ENABLE_LOW_VIEW_FILTER ? '✅ 啟用' : '❌ 停用';
            const dbStatus = SETTINGS.DEBUG_MODE ? '✅ 啟用' : '❌ 停用';

            this.menuIds.push(GM_registerMenuCommand(`低觀看數過濾 (${SETTINGS.LOW_VIEW_THRESHOLD}以下): ${lvStatus}`, () => {
                this.toggleSetting('ENABLE_LOW_VIEW_FILTER', {
                    message: '低觀看數過濾',
                    onEnable: () => {
                        // 啟用時：重置所有元素的處理狀態，以便重新評估
                        document.querySelectorAll(`[${PROCESSED_ATTR}]`).forEach(el => el.removeAttribute(PROCESSED_ATTR));
                    },
                    onDisable: () => {
                        // 停用時：恢復顯示先前因低觀看規則而被隱藏的元素
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

        // 初始化腳本
        init() {
            logger.logStart();
            utils.injectCSS();
            RuleEngine.init();
            this.setupMenu();

            // 使用防抖優化 MutationObserver 的調用頻率
            const debouncedScan = utils.debounce(() => this.scanPage('observer'), CONFIG.DEBOUNCE_DELAY);
            const observer = new MutationObserver(debouncedScan);

            const onReady = () => {
                observer.observe(document.body, { childList: true, subtree: true });
                // 監聽 YouTube SPA 導航
                window.addEventListener('yt-navigate-finish', () => this.scanPage('navigate'));
                this.scanPage('initial');
                // 定期檢查，處理 WAIT 狀態的元素
                setInterval(() => this.scanPage('periodic'), CONFIG.PERIODIC_INTERVAL);
            };

            if (document.body) onReady();
            else document.addEventListener('DOMContentLoaded', onReady, { once: true });
        }
    };

    Main.init();
})();
