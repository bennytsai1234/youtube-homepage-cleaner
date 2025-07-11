// ==UserScript==
// @name         YouTube 淨化大師 (Aegis 宙斯之盾)
// @namespace    http://tampermonkey.net/
// @version      13.4
// @description  v13.4: 增強「即時配置更新」。現在切換過濾器（開/關）都會立即重新掃描當前頁面上的所有影片，無需刷新即可生效。修復了側邊欄過濾和相容性問題。
// @author       Benny, AI Collaborators & Optimizer
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

    // --- 設定與常數 (Settings & Constants) ---
    // 為了相容性，確保 GM_getValue 存在
    const _GM_getValue = typeof GM_getValue !== 'undefined' ? GM_getValue : (key, defaultValue) => defaultValue;

    const SETTINGS = {
        ENABLE_LOW_VIEW_FILTER: _GM_getValue('enableLowViewFilter', true),
        LOW_VIEW_THRESHOLD: _GM_getValue('lowViewThreshold', 1000),
        DEBUG_MODE: _GM_getValue('debugMode', false),
    };

    const CONFIG = { DEBOUNCE_DELAY: 50, PERIODIC_INTERVAL: 1500 };
    // 用於即時恢復的屬性
    const PROCESSED_ATTR = 'data-yt-aegis-processed';
    const HIDDEN_REASON_ATTR = 'data-yt-aegis-hidden-reason';

    // 為了相容性，確保 GM_info 存在並使用相容寫法
    const SCRIPT_INFO = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script : { name: 'YouTube Purifier Aegis', version: '13.4' };

    // 定義狀態常量
    const State = { HIDE: 'HIDE', KEEP: 'KEEP', WAIT: 'WAIT' };

    const SELECTORS = {
        // yt-lockup-view-model 是播放頁面側邊欄的新組件
        TOP_LEVEL: ['ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer', 'ytd-ad-slot-renderer', 'yt-lockup-view-model'],
        init() { this.UNPROCESSED = this.TOP_LEVEL.map(s => `${s}:not([${PROCESSED_ATTR}])`).join(', '); return this; }
    }.init();

    // --- 工具函數 (Utilities) ---
    const utils = {
        debounce: (func, delay) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => func(...a), delay); }; },
        injectCSS: () => {
             if (typeof GM_addStyle !== 'undefined') {
                 GM_addStyle('ytd-ad-slot-renderer, ytd-reel-shelf-renderer, ytd-promoted-sparkles-text-search-renderer { display: none !important; }');
             }
        },
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

    // --- 日誌記錄器 (Logger) ---
    const logger = {
        prefix: `[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}]`,
        info: (msg, style = 'color:#3498db;') => SETTINGS.DEBUG_MODE && console.log(`%c${logger.prefix} [INFO] ${msg}`, style),
        hide: (source, ruleName, reason, element) => {
            if (SETTINGS.DEBUG_MODE) console.log(`%c${logger.prefix} [HIDE] Rule: "${ruleName}" | Reason: ${reason} | Source: [${source}]`, 'color:#e74c3c;', element);
        },
        logStart: () => console.log(`%c🛡️ ${logger.prefix} "Aegis" 啟動.`, 'color:#2980b9; font-weight:bold; font-size: 1.1em;'),
    };

    // --- 統一規則引擎 (Unified Rule Engine) ---
    const RuleEngine = {
        RULES: [],

        // 初始化聲明式規則 (使用 ID 追蹤原因)
        init() {
            this.RULES = [
                { id: 'ad_sponsor', name: '廣告/促銷', conditions: { any: [{ type: 'selector', value: '[aria-label*="廣告"], [aria-label*="Sponsor"]' }] } },
                { id: 'members_only', name: '會員專屬', conditions: { any: [{ type: 'selector', value: '[aria-label*="會員專屬"], [aria-label*="Members only"]' }] } },
                { id: 'shorts_item', name: 'Shorts (單個)', conditions: { any: [{ type: 'selector', value: 'a#thumbnail[href*="/shorts/"]' }] } },
                { id: 'playlist_link', name: '播放清單 (連結)', conditions: { any: [{ type: 'selector', value: 'a[href*="&list="]' }] } },
                {
                    id: 'news_block',
                    name: '新聞區塊 (雙重驗證)',
                    scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer',
                    conditions: {
                        any: [
                            { type: 'text', selector: '#title', keyword: /新聞快報|Breaking news/i },
                            { type: 'selector', value: 'yt-icon[icon^="yt-icons:explore_"]' }
                        ]
                    }
                },
                { id: 'shorts_block', name: 'Shorts 區塊', scope: 'ytd-rich-shelf-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /^Shorts$/i }] } },
                { id: 'posts_block', name: '貼文區塊', scope: 'ytd-rich-shelf-renderer', conditions: { any: [{ type: 'text', selector: '#title', keyword: /貼文|posts/i }] } },

                // 條件規則 (包含新組件 yt-lockup-view-model)
                ...(SETTINGS.ENABLE_LOW_VIEW_FILTER ? [
                    {
                        id: 'low_viewer_live',
                        name: '低觀眾直播',
                        isConditional: true,
                        scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model',
                        conditions: { any: [{ type: 'liveViewers', threshold: SETTINGS.LOW_VIEW_THRESHOLD }] }
                    },
                    {
                        id: 'low_view_video',
                        name: '低觀看影片',
                        isConditional: true,
                        scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model',
                        conditions: { any: [{ type: 'viewCount', threshold: SETTINGS.LOW_VIEW_THRESHOLD }] }
                    }
                ] : [])
            ];
        },

        // 條件檢查器 (負責解析單一條件)
        checkCondition(container, condition) {
            try {
                switch (condition.type) {
                    case 'selector':
                        return container.querySelector(condition.value) ? { state: State.HIDE, reason: `Selector: ${condition.value}` } : { state: State.KEEP };

                    // 增加大括號 {} 以建立獨立的區塊作用域 (v13.2)
                    case 'text': {
                        const el = container.querySelector(condition.selector);
                        // 使用相容性更好的寫法替換現代 JS 語法 (v13.1)
                        const text = (el && el.textContent) ? el.textContent.trim() : '';
                        return el && condition.keyword.test(text) ? { state: State.HIDE, reason: `Text: "${text}"` } : { state: State.KEEP };
                    }

                    case 'liveViewers':
                    case 'viewCount':
                        return this.checkNumericMetadata(container, condition);

                    default:
                        return { state: State.KEEP };
                }
            } catch (e) {
                return { state: State.KEEP }; // 出錯則默認保留
            }
        },

        checkNumericMetadata(container, condition) {
            const isLive = condition.type === 'liveViewers';
            const parser = isLive ? utils.parseLiveViewers : utils.parseViewCount;
            const keyword = isLive ? 'watching' : 'view';
            const keywordZh = isLive ? '人正在觀看' : '觀看';

            // 支援舊版 (#metadata-line) 和新版 (Wiz 組件) 的選擇器 (v13.3)
            const METADATA_SELECTOR = '#metadata-line .inline-metadata-item, .yt-content-metadata-view-model-wiz__metadata-text';

            for (const item of container.querySelectorAll(METADATA_SELECTOR)) {
                // 確保 textContent 存在並使用 trim()
                const textContent = (item.textContent) ? item.textContent.trim() : '';
                if (!textContent) continue;

                const containsKeyword = textContent.includes(keywordZh) || textContent.toLowerCase().includes(keyword);

                if (containsKeyword) {
                    const count = parser(textContent);

                    if (count === null) return { state: State.KEEP }; // 解析失敗，視為保留

                    const isLow = count < condition.threshold;
                    if (isLow) {
                        return { state: State.HIDE, reason: `${condition.type}: ${count}` };
                    } else {
                        return { state: State.KEEP };
                    }
                }
            }

            // 如果循環結束仍未返回，說明數據可能尚未加載，返回 WAIT
            return { state: State.WAIT };
        },

        // 規則處理器 (負責組合單一規則內的多個條件)
        checkRule(container, rule) {
            if (rule.scope && !container.matches(rule.scope)) {
                return { state: State.KEEP };
            }

            // 處理 'any' 條件組合 (滿足任一即可 HIDE)
            if (rule.conditions.any) {
                let requiresWait = false;
                for (const condition of rule.conditions.any) {
                    const result = this.checkCondition(container, condition);
                    if (result.state === State.HIDE) {
                        return result; // 立即返回 HIDE
                    }
                    if (result.state === State.WAIT) {
                        requiresWait = true;
                    }
                }
                return requiresWait ? { state: State.WAIT } : { state: State.KEEP };
            }

            return { state: State.KEEP };
        },

        // 容器處理器 (核心調度邏輯)
        processContainer(container, source) {
            if (container.hasAttribute(PROCESSED_ATTR)) return;

            let finalState = State.KEEP; // 默認為保留

            for (const rule of this.RULES) {
                const result = this.checkRule(container, rule);

                if (result.state === State.HIDE) {
                    // 隱藏時記錄原因 ID
                    container.style.setProperty('display', 'none', 'important');
                    container.setAttribute(PROCESSED_ATTR, 'hidden');
                    container.setAttribute(HIDDEN_REASON_ATTR, rule.id); // 記錄隱藏原因
                    logger.hide(source, rule.name, result.reason, container);
                    return;
                }

                if (result.state === State.WAIT) {
                    finalState = State.WAIT;
                }
            }

            // 所有規則檢查完畢
            if (finalState === State.KEEP) {
                container.setAttribute(PROCESSED_ATTR, 'checked');
            }
            // 如果是 WAIT，則不標記，等待下次掃描 (例如 periodic scan)
        }
    };

     // --- 應用程序邏輯 (Application Logic) ---
    const App = {
        menuIds: [], // 用於儲存選單命令的 ID

        scanPage: (source) => {
            const unprocessedElements = document.querySelectorAll(SELECTORS.UNPROCESSED);
            if (SETTINGS.DEBUG_MODE && unprocessedElements.length > 0 && source !== 'periodic') {
                logger.info(`[${source}] 掃描中，發現 ${unprocessedElements.length} 個元素。`);
            }
            unprocessedElements.forEach(el => RuleEngine.processContainer(el, source));
        },

        // 【修復點 v13.4】即時更新處理函數
        toggleLowViewFilter: () => {
            SETTINGS.ENABLE_LOW_VIEW_FILTER = !SETTINGS.ENABLE_LOW_VIEW_FILTER;
             if (typeof GM_setValue !== 'undefined') {
                GM_setValue('enableLowViewFilter', SETTINGS.ENABLE_LOW_VIEW_FILTER);
             }

            // 重新初始化規則引擎以應用新設定
            RuleEngine.init();

            if (SETTINGS.ENABLE_LOW_VIEW_FILTER) {
                // 啟用 (ON): 必須清除現有元素的 "checked" 標記，強制重新掃描
                logger.info('低觀看數過濾已啟用 (即時)。正在重新掃描頁面...', 'color:#2ecc71;');

                // 找到所有先前被標記為保留 (checked) 的元素
                document.querySelectorAll(`[${PROCESSED_ATTR}="checked"]`).forEach(el => {
                    // 移除處理標記，讓它們在下一次 scanPage 中被重新評估
                    el.removeAttribute(PROCESSED_ATTR);
                });

            } else {
                // 停用 (OFF): 必須恢復被此規則隱藏的元素
                logger.info('低觀看數過濾已停用 (即時)，正在恢復元素...', 'color:#f39c12;');
                const lowViewRuleIds = ['low_viewer_live', 'low_view_video'];

                document.querySelectorAll(`[${HIDDEN_REASON_ATTR}]`).forEach(el => {
                    const reason = el.getAttribute(HIDDEN_REASON_ATTR);
                    if (lowViewRuleIds.includes(reason)) {
                        el.style.display = ''; // 恢復顯示
                        // 移除處理標記，讓後續掃描重新評估該元素 (例如檢查其他規則)
                        el.removeAttribute(PROCESSED_ATTR);
                        el.removeAttribute(HIDDEN_REASON_ATTR);
                    }
                });
            }
            // 執行一次全頁掃描以應用變更 (現在會正確處理 ON 和 OFF 的情況)
            App.scanPage('real-time-update');
            App.setupMenu(); // 更新選單狀態文字
        },

        toggleDebugMode: () => {
            SETTINGS.DEBUG_MODE = !SETTINGS.DEBUG_MODE;
            if (typeof GM_setValue !== 'undefined') {
                GM_setValue('debugMode', SETTINGS.DEBUG_MODE);
            }
            // Debug 模式切換只需更新選單
            App.setupMenu();
            logger.info(`Debug 模式已 ${SETTINGS.DEBUG_MODE ? '啟用' : '停用'} (即時)。`);
        },

        setupMenu: () => {
            // 確保 GM_registerMenuCommand 和 GM_unregisterMenuCommand 存在
            if (typeof GM_registerMenuCommand === 'undefined') return;

            // 清除舊的選單命令
            if (typeof GM_unregisterMenuCommand !== 'undefined' && App.menuIds.length > 0) {
                App.menuIds.forEach(id => {
                    try {
                        GM_unregisterMenuCommand(id);
                    } catch (e) {
                        if (SETTINGS.DEBUG_MODE) console.error("移除選單命令失敗:", id, e);
                    }
                });
            }
            App.menuIds = []; // 清空 ID 列表

            const lvStatus = SETTINGS.ENABLE_LOW_VIEW_FILTER ? '✅ 啟用' : '❌ 停用';
            const dbStatus = SETTINGS.DEBUG_MODE ? '✅ 啟用' : '❌ 停用';

            // 註冊新的命令並儲存 ID
            App.menuIds.push(GM_registerMenuCommand(`低觀看數過濾: ${lvStatus} (閾值: ${SETTINGS.LOW_VIEW_THRESHOLD})`, App.toggleLowViewFilter));
            App.menuIds.push(GM_registerMenuCommand(`Debug 模式: ${dbStatus}`, App.toggleDebugMode));
        },

        init: () => {
            if (window.ytAegisInitialized) return;
            window.ytAegisInitialized = true;

            logger.logStart();
            utils.injectCSS();
            RuleEngine.init();
            App.setupMenu();

            const debouncedScan = utils.debounce(() => App.scanPage('observer'), CONFIG.DEBOUNCE_DELAY);
            const observer = new MutationObserver(debouncedScan);

            const onReady = () => {
                observer.observe(document.body, { childList: true, subtree: true });
                window.addEventListener('yt-navigate-finish', () => App.scanPage('navigate'));
                App.scanPage('initial');
                // 定期掃描對於處理 State.WAIT 的元素至關重要
                setInterval(() => App.scanPage('periodic'), CONFIG.PERIODIC_INTERVAL);
            };

            if (document.body) onReady();
            else document.addEventListener('DOMContentLoaded', onReady, { once: true });
        }
    };

    // 啟動腳本
    App.init();
})();
