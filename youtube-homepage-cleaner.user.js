// ==UserScript==
// @name         YouTube 淨化大師
// @namespace    http://tampermonkey.net/
// @version      1.3.7
// @description  為極致體驗而生的內容過濾器。修復會員視窗誤殺問題 (白名單機制)。
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
// @downloadURL https://raw.githubusercontent.com/bennytsai1234/youtube-homepage-cleaner/main/youtube-homepage-cleaner.user.js
// @updateURL https://raw.githubusercontent.com/bennytsai1234/youtube-homepage-cleaner/main/youtube-homepage-cleaner.user.js
// ==/UserScript==

(function () {
'use strict';

// --- 1. 設定與常數 ---
const SCRIPT_INFO = GM_info?.script || { name: 'YouTube 淨化大師', version: '1.3.7' };
const ATTRS = {
    PROCESSED: 'data-yt-purifier-processed',
    HIDDEN_REASON: 'data-yt-purifier-hidden-reason',
    WAIT_COUNT: 'data-yt-purifier-wait-count',
};
const State = { HIDE: 'HIDE', KEEP: 'KEEP', WAIT: 'WAIT' };

const DEFAULT_RULE_ENABLES = {
    ad_block_popup: true,
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
    members_priority: true,
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
    GRACE_PERIOD_HOURS: 4, // 新影片豁免期(小時)
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
    GRACE_PERIOD_HOURS: GM_getValue('gracePeriodHours', DEFAULT_CONFIG.GRACE_PERIOD_HOURS),
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
    injectCSS: () => {
        // This is now handled by the much more powerful StaticCSSManager
        if (typeof GM_addStyle !== 'function') {
            const style = document.createElement('style');
            style.type = 'text/css';
            style.id = 'yt-purifier-fallback-style';
            (document.head || document.documentElement).appendChild(style);
        }
    },

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

    parseTimeAgo: (text) => {
        if (!text) return null;
        const raw = text.toLowerCase();

        if (raw.includes('second') || raw.includes('秒')) return 0.1; // 視為極短時間

        const numMatch = raw.match(/([\d.]+)/);
        if (!numMatch) return null;
        const num = parseFloat(numMatch[1]);
        if (isNaN(num)) return null;

        if (raw.includes('minute') || raw.includes('分鐘')) return num;
        if (raw.includes('hour') || raw.includes('小時')) return num * 60;
        if (raw.includes('day') || raw.includes('天')) return num * 60 * 24;
        if (raw.includes('week') || raw.includes('週')) return num * 60 * 24 * 7;
        if (raw.includes('month') || raw.includes('月')) return num * 60 * 24 * 30; // Approximation
        if (raw.includes('year') || raw.includes('年')) return num * 60 * 24 * 365; // Approximation

        return null;
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

// --- 5. 靜態 CSS 過濾器 (效能核心) ---
const StaticCSSManager = {
    generateAndInject() {
        const videoItemContainers = [
            'ytd-rich-item-renderer',
            'ytd-video-renderer',
            'ytd-compact-video-renderer',
            'ytd-grid-video-renderer',
            'yt-lockup-view-model',
        ];

        const staticRules = [
            // --- Direct element hiding ---
            // Anti-adblock popup: hide dialog, backdrop, and restore scrolling
            { configKey: 'ad_block_popup', selector: 'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model), ytd-enforcement-message-view-model, #immersive-translate-browser-popup, tp-yt-iron-overlay-backdrop:has(~ tp-yt-paper-dialog ytd-enforcement-message-view-model), tp-yt-iron-overlay-backdrop.opened, yt-playability-error-supported-renderers:has(ytd-enforcement-message-view-model)' },
            { configKey: 'ad_block_popup', selector: 'ytd-app:has(ytd-enforcement-message-view-model), body:has(ytd-enforcement-message-view-model), html:has(ytd-enforcement-message-view-model)', style: 'overflow: auto !important; overflow-y: auto !important; position: static !important; pointer-events: auto !important; height: auto !important; top: 0 !important; margin-right: 0 !important; overscroll-behavior: auto !important;' },
            { configKey: 'ad_block_popup', selector: 'ytd-app[aria-hidden="true"]:has(ytd-enforcement-message-view-model)', style: 'aria-hidden: false !important; display: block !important;' },
            { configKey: 'ad_block_popup', selector: 'ytd-app { --ytd-app-scroll-offset: 0 !important; }' },
            { configKey: 'ad_sponsor', selector: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, #masthead-ad' },
            { configKey: 'premium_banner', selector: 'ytd-statement-banner-renderer, ytd-rich-section-renderer:has(ytd-statement-banner-renderer)' },
            { configKey: 'inline_survey', selector: 'ytd-rich-section-renderer:has(ytd-inline-survey-renderer)' },
            { configKey: 'clarify_box', selector: 'ytd-info-panel-container-renderer' },
            { configKey: 'recommended_playlists', selector: 'ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has(a[href^="/playlist?list="]), ytd-browse[page-subtype="home"] ytd-rich-item-renderer:has([content-id^="PL"])' },
            
            // --- Font Consistency ---
            // Force a consistent font stack to fix "thick/thin" issues with CJK characters (Han Unification)
            { configKey: 'ad_block_popup', selector: 'body, html', style: 'font-family: "YouTube Noto", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif !important;' },

            // --- Hiding containers using :has() ---
            // These apply to individual video/playlist items
            { configKey: 'ad_sponsor', containerSelectors: videoItemContainers, innerSelector: '[aria-label*="廣告"], [aria-label*="Sponsor"], [aria-label="贊助商廣告"]' },
            { configKey: 'members_only', containerSelectors: videoItemContainers, innerSelector: '[aria-label*="會員專屬"]' },
            { configKey: 'shorts_item', containerSelectors: videoItemContainers, innerSelector: 'a[href*="/shorts/"]' },
            { configKey: 'mix_only', containerSelectors: videoItemContainers, innerSelector: 'a[aria-label*="合輯"], a[aria-label*="Mix"]' },
        ];

        let cssString = '';

        staticRules.forEach(rule => {
            if (CONFIG.RULE_ENABLES[rule.configKey] === false) return;

            const style = rule.style || 'display: none !important;';

            if (rule.selector) {
                cssString += `${rule.selector} { ${style} }\n`;
            } else if (rule.containerSelectors && rule.innerSelector) {
                cssString += rule.containerSelectors.map(container => `${container}:has(${rule.innerSelector})`).join(',\n') + ` { ${style} }\n`;
            }
        });

        if (CONFIG.DEBUG_MODE) {
            logger.info('Generated Static CSS Rules:', '#2ecc71');
            console.log(cssString);
        }
        if(cssString) GM_addStyle(cssString);
    }
};

// --- 6. 廣告攔截彈窗中和器 (主動移除 + 恢復狀態) ---
// 參考 RemoveAdblockThing 專案的實作方式，採用更積極的策略
const AdBlockPopupNeutralizer = {
    observer: null,
    scrollInterval: null,
    videoInterval: null,
    lastDetectionTime: 0,
    
    // 多語言關鍵字偵測 (Detect keywords in multiple languages)
    // 包含: 英文, 繁體中文, 簡體中文, 日文, 韓文, 西班牙文, 德文, 法文, 俄文, 葡萄牙文
    keywords: [
        'Ad blockers', '廣告攔截器', '广告拦截器', '広告ブロッカー', '광고 차단기', 
        'Bloqueadores de anuncios', 'Werbeblocker', 'Bloqueurs de publicité', 'Блокировщики рекламы', 'Bloqueadores de anúncios',
        'Video player will be blocked', '影片播放器將被封鎖', '视频播放器将被封锁',
        'Allow YouTube', '允許 YouTube', '允许 YouTube',
        'You have an ad blocker', '您使用了廣告攔截器',
        'YouTube 禁止使用廣告攔截器', 'YouTube doesn\'t allow ad blockers'
    ],

    init() {
        if (this.observer) return;
        
        // 1. 啟動 MutationObserver 監控彈窗 (Lightning Speed)
        this.startObserver();
        
        // 2. 啟動定時器進行備用檢查 (Backup Check)
        this.startTimers();
        
        // 3. 立即執行一次清潔
        this.clean();

        if (CONFIG.DEBUG_MODE) logger.info('🛡️ AdBlockPopupNeutralizer Activated (Text-Based Mode)');
    },

    startObserver() {
        const target = document.querySelector('ytd-popup-container') || document.querySelector('ytd-app') || document.body;
        if (!target) return setTimeout(() => this.startObserver(), 500); // Retry

        this.observer = new MutationObserver((mutations) => {
            let detected = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) { // Element
                        // 檢查特定標籤或內容
                        if (this.isAdBlockPopup(node)) {
                            this.removePopup(node);
                            detected = true;
                        }
                    }
                }
            }
            if (detected) {
                this.unlockScroll();
                this.resumeVideo();
            }
        });

        this.observer.observe(target, { childList: true, subtree: true });
    },

    startTimers() {
        // 定期檢查 (每 500ms)
        setInterval(() => this.clean(), 500);

        // 影片播放守護 (每 500ms)
        this.videoInterval = setInterval(() => this.resumeVideo(), 500);

        // 滾動鎖定守護 (每 200ms - 針對 "Snap back" 問題)
        this.scrollInterval = setInterval(() => this.unlockScroll(), 200);
    },

    isAdBlockPopup(node) {
        if (!node || !node.innerHTML) return false;
        
        // 1. 檢查特定標籤
        const tagName = node.tagName.toLowerCase();
        
        // ytd-enforcement-message-view-model 是廣告攔截專屬標籤，直接判定
        if (tagName === 'ytd-enforcement-message-view-model') {
            return true;
        }

        // 2. tp-yt-paper-dialog 需要謹慎檢查，因為它也用於會員視窗等合法對話框
        if (tagName === 'tp-yt-paper-dialog') {
            // ★ 白名單檢查：如果包含這些元素，絕對不是廣告警告
            const whitelistSelectors = [
                'ytd-sponsorships-offer-renderer',   // 會員加入視窗
                'ytd-about-channel-renderer',         // 頻道資訊視窗
                'ytd-report-form-modal-renderer',     // 檢舉視窗
                'ytd-multi-page-menu-renderer',       // 通用選單
                'ytd-playlist-add-to-option-renderer' // 加入播放清單視窗
            ];
            
            for (const sel of whitelistSelectors) {
                if (node.querySelector(sel)) {
                    if (CONFIG.DEBUG_MODE) logger.info(`✅ Whitelist dialog detected: ${sel}`);
                    return false;
                }
            }
            
            // 檢查是否包含廣告攔截專屬標籤
            if (node.querySelector('ytd-enforcement-message-view-model')) {
                return true;
            }
            
            // 深度關鍵字檢查
            return this.containsKeyword(node);
        }

        // 3. 檢查特定的 class 或 id (legacy support)
        if (node.classList.contains('ytd-enforcement-message-view-model') || node.id === 'error-screen') {
            return true;
        }

        // 4. 深度檢查內容關鍵字 (針對一般容器)
        // 為了效能，只檢查包含大量文字的節點
        if (node.textContent.length > 10 && node.textContent.length < 3000) {
            return this.containsKeyword(node);
        }

        return false;
    },

    containsKeyword(node) {
        const text = node.textContent;
        return this.keywords.some(kw => text.includes(kw));
    },

    removePopup(node) {
        if(CONFIG.DEBUG_MODE) logger.info(`🚫 Removing AdBlock Popup detected via ${node.tagName}`);
        
        // 記錄最後一次移除時間
        this.lastDetectionTime = Date.now();

        // 嘗試點擊關閉按鈕 (如果有)
        const dismissBtn = node.querySelector('[aria-label="可能有風險"],[aria-label="Close"], #dismiss-button');
        if (dismissBtn) dismissBtn.click();

        // 移除節點
        node.remove();

        // 處理背景遮罩
        const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop');
        if (backdrop) {
            backdrop.style.display = 'none';
            backdrop.style.pointerEvents = 'none';
            backdrop.remove(); // 直接移除
        }
    },

    clean() {
        // 主動掃描頁面上的潛在彈窗
        const dialogs = document.querySelectorAll('tp-yt-paper-dialog, ytd-enforcement-message-view-model');
        dialogs.forEach(dialog => {
            // 對於這些 específica 的標籤，如果內容匹配，則刪除
            // 這裡寬鬆一點，只要是這些標籤，都假設是目標，除非加上關鍵字檢查證明不是
            // 但為了避免誤殺，還是檢查一下關鍵字比較安全，尤其是 tp-yt-paper-dialog 可能用於其他用途
            if (this.containsKeyword(dialog) || dialog.querySelector('ytd-enforcement-message-view-model')) {
                this.removePopup(dialog);
                this.unlockScroll();
            }
        });
        
        // 確保沒有殘留的遮罩
        const backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop');
        backdrops.forEach(bd => {
             // 只有當它看起來是為了廣告攔截彈窗存在時才移除 (simple heuristic: opened)
             if (bd.classList.contains('opened')) {
                 // 稍微保守一點，只有當頁面上也沒有其他 dialog 時才移除，避免影響播放清單等功能
                 // 但 user 說彈窗出現了，所以這裡可以積極一點
                 bd.style.display = 'none';
                 bd.style.pointerEvents = 'none';
             }
        });
    },

    unlockScroll() {
        // 解決 "Scroll Snap Back" 問題的核心
        // YouTube 透過將 ytd-app 設定為 fixed 來鎖定滾動，或者在 body 上設定 overflow: hidden
        // 以及透過 JS 不斷重設 scroll top
        
        const css = (el, props) => {
            if (!el) return;
            for (const [key, val] of Object.entries(props)) {
                el.style.setProperty(key, val, 'important');
            }
        };

        const allowScrollProps = {
            'overflow-y': 'auto',
            'overflow-x': 'hidden',
            'position': 'static',
            'pointer-events': 'auto',
            'top': 'auto', // 避免 top: 0 造成的錯位
            'left': 'auto',
            'width': '100%',
            'display': 'block', // 確保沒被隱藏
            'z-index': '0',    // 解除可能的層級遮擋
        };

        css(document.body, allowScrollProps);
        css(document.documentElement, allowScrollProps);
        
        // ytd-app 是關鍵，它通常被設為 fixed
        const ytdApp = document.querySelector('ytd-app');
        if (ytdApp) {
            css(ytdApp, allowScrollProps);
            ytdApp.removeAttribute('aria-hidden');
        }

        // 確保播放器本身沒有被遮擋
        const watchPage = document.querySelector('ytd-watch-flexy');
        if (watchPage) {
            watchPage.style.removeProperty('filter'); // 移除模糊效果
        }
    },

    resumeVideo() {
        // 避免過度積極導致使用者無法暫停
        // 只有先前提到的 "最近偵測到彈窗" 時才強制播放
        if (Date.now() - this.lastDetectionTime > 2000) return;

        const video = document.querySelector('video');
        if (!video) return;

        if (video.paused && !video.ended) {
            // 只有當不是使用者主動暫停時才播放 (這很難判斷，但為了對抗廣告攔截偵測，我們假設暫停是惡意的)
            // 簡單判斷：如果剛剛發生了彈窗事件，則強制播放
            try {
                video.play();
            } catch(e) {}
        }
    }
};

// --- 7. 功能增強模組 (點擊優化) ---
const Enhancer = {
    initGlobalClickListener() {
        document.addEventListener('click', (e) => {
            if (!CONFIG.OPEN_IN_NEW_TAB) return;
            if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            const exclusions = 'button, yt-icon-button, #menu, ytd-menu-renderer, ytd-toggle-button-renderer, yt-chip-cloud-chip-renderer, .yt-spec-button-shape-next, .yt-core-attributed-string__link, #subscribe-button, .ytp-progress-bar, .ytp-chrome-bottom';
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
                const hostname = new URL(targetLink.href, location.origin).hostname;
                const isValidTarget = targetLink.href && /(^|\.)youtube\.com$/.test(hostname);
                if (isValidTarget) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.open(targetLink.href, '_blank');
                }
            } catch (err) {}
        }, { capture: true });
    }
};

// --- 7. 核心規則引擎 (動態) ---
const RuleEngine = {
    ruleCache: new Map(),
    globalRules: [],
    _elementDataCache: new WeakMap(),

    init() {
        this.ruleCache.clear();
        this.globalRules = [];
        this._elementDataCache = new WeakMap();

        const activeRules = this._buildBaseRules().filter(rule => CONFIG.RULE_ENABLES[rule.id] !== false);
        this._addConditionalRules(activeRules);
        this._populateRuleCaches(activeRules);
    },

    _buildBaseRules() {
        return [
            // 'ad_sponsor' is now 100% in StaticCSSManager
            // 'shorts_item' is now 100% in StaticCSSManager
            // 'premium_banner' is now 100% in StaticCSSManager
            // 'inline_survey' is now 100% in StaticCSSManager
            // 'clarify_box' is now 100% in StaticCSSManager

            // Kept text-based parts of mixed rules
            { id: 'members_only', name: '會員專屬', conditions: { any: [ { type: 'text', selector: '.badge-shape-wiz__text, .yt-badge-shape__text', keyword: /頻道會員專屬|Members only/i } ] } },
            { id: 'mix_only', name: '合輯 (Mix)', conditions: { any: [ { type: 'text', selector: '.badge-shape-wiz__text, ytd-thumbnail-overlay-side-panel-renderer, .yt-badge-shape__text', keyword: /(^|\s)(合輯|Mix)(\s|$)/i }, { type: 'text', selector: '#video-title, .yt-lockup-metadata-view-model__title', keyword: /^(合輯|Mix)[\s-–]/i } ] } },

            // Kept all rules that rely on text matching for shelf/section titles
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
            { id: 'members_priority', name: '會員優先 (Early Access)', scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model', conditions: { any: [ { type: 'text', selector: '.yt-badge-shape__text, .badge-shape-wiz__text', keyword: /會員優先|Members Early Access/i } ] } },
        ];
    },

    _addConditionalRules(activeRules) {
        const videoScope = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-grid-video-renderer';
        if (CONFIG.ENABLE_LOW_VIEW_FILTER) {
            activeRules.push(
                { id: 'low_viewer_live', name: '低觀眾直播', scope: videoScope, conditions: { any: [{ type: 'liveViewers', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } },
                { id: 'low_view_video', name: '低觀看影片', scope: videoScope, conditions: { any: [{ type: 'viewCount', threshold: CONFIG.LOW_VIEW_THRESHOLD }] } }
            );
        }
        if (CONFIG.ENABLE_KEYWORD_FILTER && CONFIG.KEYWORD_BLACKLIST.length > 0) {
            activeRules.push({ id: 'keyword_blacklist', name: '關鍵字過濾', scope: videoScope, conditions: { any: [{ type: 'titleKeyword', keywords: CONFIG.KEYWORD_BLACKLIST }] } });
        }
        if (CONFIG.ENABLE_CHANNEL_FILTER && CONFIG.CHANNEL_BLACKLIST.length > 0) {
            activeRules.push({ id: 'channel_blacklist', name: '頻道過濾', scope: videoScope, conditions: { any: [{ type: 'channelName', channels: CONFIG.CHANNEL_BLACKLIST }] } });
        }
        if (CONFIG.ENABLE_DURATION_FILTER && (CONFIG.DURATION_MIN > 0 || CONFIG.DURATION_MAX > 0)) {
            activeRules.push({ id: 'duration_filter', name: '影片長度過濾', scope: videoScope, conditions: { any: [{ type: 'duration', min: CONFIG.DURATION_MIN, max: CONFIG.DURATION_MAX }] } });
        }
    },

    _populateRuleCaches(rulesToPopulate) {
        rulesToPopulate.forEach(rule => {
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
        const cachedData = this._getElementData(container);
        try {
            switch (condition.type) {
                case 'selector': return container.querySelector(`:scope ${condition.value}`) ? { state: State.HIDE, reason: `Selector: ${condition.value}` } : { state: State.KEEP };
                case 'text':
                    for (const el of container.querySelectorAll(`:scope ${condition.selector}`)) {
                        if (condition.keyword.test(el.textContent)) return { state: State.HIDE, reason: `Text: "${el.textContent.trim()}"` };
                    }
                    return { state: State.KEEP };
                case 'titleKeyword':
                    if (!cachedData.title) return { state: State.KEEP };
                    return condition.keywords.some(keyword => keyword && cachedData.title.includes(keyword.toLowerCase())) ? { state: State.HIDE, reason: `Keyword: "${condition.keywords.find(kw => cachedData.title.includes(kw.toLowerCase()))}"` } : { state: State.KEEP };
                case 'channelName':
                    if (!cachedData.channelName) return { state: State.KEEP };
                    return condition.channels.some(blocked => blocked && cachedData.channelName === blocked.toLowerCase()) ? { state: State.HIDE, reason: `Channel: "${condition.channels.find(cn => cachedData.channelName === cn.toLowerCase())}"` } : { state: State.KEEP };
                case 'duration': {
                    if (cachedData.durationInSeconds === null) return cachedData.isShorts ? { state: State.KEEP } : { state: State.WAIT };
                    if (condition.min > 0 && cachedData.durationInSeconds < condition.min) return { state: State.HIDE, reason: `Duration ${cachedData.durationInSeconds}s < min ${condition.min}s` };
                    if (condition.max > 0 && cachedData.durationInSeconds > condition.max) return { state: State.HIDE, reason: `Duration ${cachedData.durationInSeconds}s > max ${condition.max}s` };
                    return { state: State.KEEP };
                }
                case 'liveViewers': case 'viewCount': {
                    // 新影片豁免期邏輯
                    if (cachedData.timeAgoInMinutes !== null && cachedData.timeAgoInMinutes < (CONFIG.GRACE_PERIOD_HOURS * 60)) {
                        if (CONFIG.DEBUG_MODE) {
                            console.log(`[Grace Period] Keeping video "${cachedData.title}" (${cachedData.timeAgoInMinutes} mins old)`);
                        }
                        return { state: State.KEEP }; 
                    }
                    const count = condition.type === 'liveViewers' ? cachedData.liveViewers : cachedData.viewCount;
                    if (count === null) return container.tagName.includes('PLAYLIST') ? { state: State.KEEP } : { state: State.WAIT };
                    return count < condition.threshold ? { state: State.HIDE, reason: `${condition.type}: ${count} < ${condition.threshold}` } : { state: State.KEEP };
                }
                default: return { state: State.KEEP };
            }
        } catch (e) { return { state: State.KEEP }; }
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

    _getElementData(container) {
        if (this._elementDataCache.has(container)) return this._elementDataCache.get(container);

        const data = {};
        data.title = container.querySelector('#video-title')?.textContent?.toLowerCase() || '';
        data.channelName = container.querySelector('ytd-channel-name .yt-formatted-string, .ytd-channel-name a')?.textContent?.trim()?.toLowerCase() || '';
        const durationEl = container.querySelector('ytd-thumbnail-overlay-time-status-renderer, span.ytd-thumbnail-overlay-time-status-renderer');
        data.durationInSeconds = utils.parseDuration(durationEl?.textContent);
        const metadataTexts = [ ...Array.from(container.querySelectorAll('#metadata-line .inline-metadata-item, #metadata-line span.ytd-grid-video-renderer, .yt-content-metadata-view-model-wiz__metadata-text, .yt-content-metadata-view-model__metadata-text'), el => el.textContent), utils.extractAriaTextForCounts(container) ];
        data.liveViewers = null;
        data.viewCount = null;
        data.timeAgoInMinutes = null;
        for (const text of metadataTexts) {
            if (data.liveViewers === null) data.liveViewers = utils.parseLiveViewers(text);
            if (data.viewCount === null) data.viewCount = utils.parseViewCount(text);
            if (data.timeAgoInMinutes === null) data.timeAgoInMinutes = utils.parseTimeAgo(text);
        }
        data.isShorts = container.querySelector('a[href*="/shorts/"]') !== null;

        this._elementDataCache.set(container, data);
        return data;
    },

    processContainer(container, source) {
        if (container.hasAttribute(ATTRS.PROCESSED)) return;
        const relevantRules = (this.ruleCache.get(container.tagName) || []).concat(this.globalRules);
        let finalState = State.KEEP;

        for (const rule of relevantRules) {
            const result = this.checkRule(container, rule);
            if (result.state === State.HIDE) {
                let finalTarget = container.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer') || container;
                finalTarget.style.setProperty('display', 'none', 'important');
                finalTarget.setAttribute(ATTRS.PROCESSED, 'hidden');
                finalTarget.setAttribute(ATTRS.HIDDEN_REASON, result.ruleId);
                logger.hide(source, rule.name, result.reason, finalTarget);
                return;
            }
            if (result.state === State.WAIT) finalState = State.WAIT;
        }

        if (finalState === State.WAIT) {
            const count = +(container.getAttribute(ATTRS.WAIT_COUNT) || 0) + 1;
            if (count >= CONFIG.WAIT_MAX_RETRY) container.setAttribute(ATTRS.PROCESSED, 'checked-wait-expired');
            else container.setAttribute(ATTRS.WAIT_COUNT, String(count));
        } else {
            container.setAttribute(ATTRS.PROCESSED, 'checked');
        }
    }
};

// --- 8. 主控台與菜單系統 ---
const Main = {
    menuHandle: null,
    menuStructure: null,

    scanPage: (source) => {
        logger.startBatch();
        document.querySelectorAll(SELECTORS.COMBINED_SELECTOR).forEach(el => RuleEngine.processContainer(el, source));
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
        // Re-inject CSS in case rules were toggled
        StaticCSSManager.generateAndInject();
        RuleEngine.init();
        Main.scanPage('settings-changed');
    },

    _buildMenu() {
        this.menuStructure = {
            title: '【 YouTube 淨化大師 - 設定 】',
            items: {
                '1': { title: '📂 設定詳細過濾規則', type: 'submenu', getItems: () => this._buildRuleSubmenu() },
                '2': { title: '啟用「低觀看數過濾」', type: 'toggle', config: 'ENABLE_LOW_VIEW_FILTER', afterAction: () => this.resetAndRescan() },
                '3': { title: () => `🔢 修改過濾閾值 (目前: ${CONFIG.LOW_VIEW_THRESHOLD})`, type: 'number', config: 'LOW_VIEW_THRESHOLD', promptText: '請輸入新的過濾閾值', afterAction: () => this.resetAndRescan() },
                '4': { title: '🚫 進階過濾設定', type: 'submenu', items: this._buildAdvancedSubmenu() },
                '5': { title: '強制新分頁開啟影片', type: 'toggle', config: 'OPEN_IN_NEW_TAB' },
                '6': { title: 'Debug 模式', type: 'toggle', config: 'DEBUG_MODE', afterAction: () => this.resetAndRescan() },
                '7': { title: '🔄 恢復預設設定', type: 'action', action: () => { if (confirm('⚠️ 確定要恢復預設值嗎？')) this._resetAllToDefaults(); } }
            }
        };
    },

    _buildRuleSubmenu() {
        // We need to get all original rules for the menu, even those in CSS
        const allBaseRules = [
            { id: 'ad_block_popup', name: '反廣告攔截彈窗' },
            { id: 'ad_sponsor', name: '廣告/促銷' },
            { id: 'members_only', name: '會員專屬' },
            { id: 'members_priority', name: '會員優先 (Early Access)' },
            { id: 'shorts_item', name: 'Shorts (單個)'},
            { id: 'mix_only', name: '合輯 (Mix)' },
            { id: 'premium_banner', name: 'Premium 推廣' },
            { id: 'news_block', name: '新聞區塊' },
            { id: 'shorts_block', name: 'Shorts 區塊' },
            { id: 'posts_block', name: '貼文區塊' },
            { id: 'explore_topics', name: '探索更多主題' },
            { id: 'shorts_grid_shelf', name: 'Shorts 區塊 (Grid)' },
            { id: 'movies_shelf', name: '電影推薦區塊' },
            { id: 'youtube_featured_shelf', name: 'YouTube 精選區塊' },
            { id: 'popular_gaming_shelf', name: '熱門遊戲區塊' },
            { id: 'more_from_game_shelf', name: '「更多相關內容」區塊' },
            { id: 'trending_playlist', name: '發燒影片/熱門內容' },
            { id: 'inline_survey', name: '意見調查問卷' },
            { id: 'clarify_box', name: '資訊面板 (Wiki)' },
        ];
        const items = allBaseRules.reduce((acc, rule, index) => {
            acc[index + 1] = { title: rule.name, type: 'toggle', config: `RULE_ENABLES.${rule.id}`, afterAction: () => this.resetAndRescan() };
            return acc;
        }, {});
        items['0'] = { title: '⬅️ 返回主選單', type: 'back' };
        return items;
    },

    _buildAdvancedSubmenu() {
        return {
            '1': { title: '啟用「關鍵字過濾」', type: 'toggle', config: 'ENABLE_KEYWORD_FILTER', afterAction: () => this.resetAndRescan() },
            '2': { title: '📖 管理關鍵字黑名單', type: 'action', action: () => this._manageList('KEYWORD_BLACKLIST', '關鍵字') },
            '3': { title: '啟用「頻道過濾」', type: 'toggle', config: 'ENABLE_CHANNEL_FILTER', afterAction: () => this.resetAndRescan() },
            '4': { title: '👤 管理頻道黑名單', type: 'action', action: () => this._manageList('CHANNEL_BLACKLIST', '頻道') },
            '5': { title: '啟用「影片長度過濾」', type: 'toggle', config: 'ENABLE_DURATION_FILTER', afterAction: () => this.resetAndRescan() },
            '6': { title: '⏱️ 管理影片長度', type: 'action', action: () => this._manageDuration() },
            '7': { 
                title: () => `🛡️ 設定新影片豁免期 (目前: ${CONFIG.GRACE_PERIOD_HOURS} 小時)`, 
                type: 'number', 
                config: 'GRACE_PERIOD_HOURS', 
                promptText: '請輸入新影片豁免期 (小時)\n在此時間內發布的影片將不受觀看數限制：', 
                afterAction: () => this.resetAndRescan() 
            },
            '0': { title: '⬅️ 返回主選單', type: 'back' }
        };
    },

    _renderMenu(menuNode) {
        let text = `${menuNode.title}\n\n`;
        const items = typeof menuNode.getItems === 'function' ? menuNode.getItems() : menuNode.items;
        const s = (val) => val ? '✅' : '❌';
        const separator = '--------------------------\n';

        Object.keys(items).forEach(key => {
            if (menuNode === this.menuStructure && ['2', '5', '7'].includes(key)) text += separator;
            if (key === '0' && menuNode !== this.menuStructure) text += separator;

            const item = items[key];
            let title = typeof item.title === 'function' ? item.title() : item.title;

            if (item.type === 'toggle') {
                const keys = item.config.split('.');
                const value = keys.length > 1 ? CONFIG[keys[0]][keys[1]] : CONFIG[keys[0]];
                title = `${s(value)} ${title}`;
            }
            text += `${key}. ${title}\n`;
        });

        const choice = prompt(text);
        if (choice === null) return;

        const selected = items[choice.trim()];
        if (!selected) { alert('❌ 無效的選項'); return setTimeout(() => this._renderMenu(menuNode), 50); }

        let nextMenu = menuNode;
        switch (selected.type) {
            case 'submenu': selected.parent = menuNode; nextMenu = selected; break;
            case 'toggle': {
                const keys = selected.config.split('.');
                const isNested = keys.length > 1;
                const value = isNested ? !CONFIG[keys[0]][keys[1]] : !CONFIG[keys[0]];
                if (isNested) {
                    const ruleSet = { ...CONFIG[keys[0]], [keys[1]]: value };
                    CONFIG[keys[0]] = ruleSet;
                    GM_setValue('ruleEnables', ruleSet);
                }
                else { CONFIG[keys[0]] = value; GM_setValue(selected.config.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`), value); }
                if (selected.afterAction) selected.afterAction();
                break;
            }
            case 'number': {
                const currentVal = CONFIG[selected.config];
                const input = prompt(selected.promptText, currentVal);
                if (input !== null) {
                    const newVal = parseInt(input, 10);
                    if (!isNaN(newVal) && newVal >= 0) { CONFIG[selected.config] = newVal; GM_setValue(selected.config.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`), newVal); if (selected.afterAction) selected.afterAction(); }
                    else { alert('❌ 請輸入有效的正整數。'); }
                }
                break;
            }
            case 'action': nextMenu = selected.action() || menuNode; break;
            case 'back': nextMenu = menuNode.parent || menuNode; break;
        }
        if (nextMenu) setTimeout(() => this._renderMenu(nextMenu), 50);
    },

    _manageList(configKey, itemName) {
        const list = CONFIG[configKey];
        const text = `【管理${itemName}黑名單】\n目前: ${list.length > 0 ? `[ ${list.join(', ')} ]` : '(無)'}\n\n1.新增, 2.刪除, 3.清空, 0.返回`;
        const choice = parseInt(prompt(text), 10);

        switch (choice) {
            case 1: {
                const items = prompt(`輸入要新增的${itemName} (用逗號分隔)`);
                if (items) {
                    const toAdd = items.split(',').map(i => i.trim().toLowerCase()).filter(i => i && !list.includes(i));
                    if (toAdd.length > 0) { list.push(...toAdd); GM_setValue(configKey.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`), list); this.resetAndRescan(); }
                }
                break;
            }
            case 2: {
                const item = prompt(`輸入要刪除的${itemName}:\n[ ${list.join(', ')} ]`);
                if (item) {
                    const idx = list.findIndex(i => i.toLowerCase() === item.trim().toLowerCase());
                    if (idx > -1) { list.splice(idx, 1); GM_setValue(configKey.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`), list); this.resetAndRescan(); } else { alert('項目不存在'); }
                }
                break;
            }
            case 3: if (confirm(`⚠️ 確定要清空所有${itemName}黑名單嗎？`)) { list.length = 0; GM_setValue(configKey.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`), list); this.resetAndRescan(); } break;
            case 0: return this.menuStructure.items['4'];
        }
        return () => this._manageList(configKey, itemName);
    },

    _manageDuration() {
        const min = CONFIG.DURATION_MIN; const max = CONFIG.DURATION_MAX;
        const text = `【管理影片長度過濾】(0=不限制)\n\n1. 最短長度 (分): ${min > 0 ? min/60 : '無'}\n2. 最長長度 (分): ${max > 0 ? max/60 : '無'}\n3. 重設\n0. 返回`;
        const choice = parseInt(prompt(text), 10);
        const parse = (val) => (val === null || val.trim() === '') ? null : (isNaN(parseFloat(val)) ? null : Math.floor(parseFloat(val) * 60));

        switch (choice) {
            case 1: { const v = parse(prompt('輸入最短影片長度 (分鐘)', min > 0 ? min/60 : '')); if (v !== null) { CONFIG.DURATION_MIN = v; GM_setValue('duration_min', v); this.resetAndRescan(); } break; }
            case 2: { const v = parse(prompt('輸入最長影片長度 (分鐘)', max > 0 ? max/60 : '')); if (v !== null) { CONFIG.DURATION_MAX = v; GM_setValue('duration_max', v); this.resetAndRescan(); } break; }
            case 3: if (confirm('⚠️ 確定要重設長度限制嗎？')) { CONFIG.DURATION_MIN = 0; CONFIG.DURATION_MAX = 0; GM_setValue('duration_min', 0); GM_setValue('duration_max', 0); this.resetAndRescan(); } break;
            case 0: return this.menuStructure.items['4'];
        }
        return () => this._manageDuration();
    },



    _resetAllToDefaults() {
        Object.keys(DEFAULT_CONFIG).forEach(key => {
            const gmKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            CONFIG[key] = DEFAULT_CONFIG[key];
            GM_setValue(gmKey, DEFAULT_CONFIG[key]);
        });
        CONFIG.RULE_ENABLES = { ...DEFAULT_RULE_ENABLES };
        GM_setValue('ruleEnables', CONFIG.RULE_ENABLES);
        this.resetAndRescan('系統已恢復預設值');
        alert('✅ 所有設定已恢復預設值。');
    },

    setupMenu() {
        if (this.menuHandle) { try { GM_unregisterMenuCommand(this.menuHandle); } catch (e) {} }
        this.menuHandle = GM_registerMenuCommand('⚙️ 淨化大師設定 (Settings)...', () => {
             this._buildMenu();
             this._renderMenu(this.menuStructure);
        });
    },

    init() {
        if (window.ytPurifierInitialized) return;
        window.ytPurifierInitialized = true;

        // **ANTI-ADBLOCK PATCH**: Try to block popups via YouTube's own config
        try {
            const patchConfig = () => {
                const config = window.yt?.config_ || window.ytcfg?.data_;
                if (config?.openPopupConfig?.supportedPopups?.adBlockMessageViewModel) {
                    config.openPopupConfig.supportedPopups.adBlockMessageViewModel = false;
                }
                if (config?.EXPERIMENT_FLAGS) {
                    config.EXPERIMENT_FLAGS.ad_blocker_notifications_disabled = true;
                    config.EXPERIMENT_FLAGS.web_enable_adblock_detection_block_playback = false;
                }
            };
            patchConfig();
            window.addEventListener('yt-navigate-finish', patchConfig);
        } catch (e) {}

        logger.logStart();
        // **PERFORMANCE**: Inject static CSS rules first for immediate filtering
        StaticCSSManager.generateAndInject();
        // **ANTI-ADBLOCK**: Initialize the popup neutralizer to actively remove popups
        AdBlockPopupNeutralizer.init();
        RuleEngine.init();
        this.setupMenu();
        Enhancer.initGlobalClickListener();

        const debouncedScan = utils.debounce(() => Main.scanPage('observer'), CONFIG.DEBOUNCE_DELAY);
        const observer = new MutationObserver(debouncedScan);

        const onReady = () => {
            observer.observe(document.body, { childList: true, subtree: true });
            window.addEventListener('yt-navigate-finish', () => Main.scanPage('navigate'));
            Main.scanPage('initial');
        };

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
        else onReady();
    }
};

Main.init();

})();
