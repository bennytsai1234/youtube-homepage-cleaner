// ==UserScript==
// @name         YouTube 首頁淨化大師 (v10.12 - 擴充播放清單過濾)
// @namespace    http://tampermonkey.net/
// @version      10.12
// @description  v10.12: 新增對觀看頁面右側播放清單/Podcast 的過濾規則，提升過濾覆蓋範圍。
// @author       Benny, Gemini, Claude-3 & GPT-4 (v8.1-v10.12)
// @match        https://www.youtube.com/*
// @grant        GM_info
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    // --- 設定區 ---
    const CONFIG = {
        DEBUG_MODE: false,
        ENABLE_LOW_VIEW_FILTER: true,
        LOW_VIEW_THRESHOLD: 1000,
        ALWAYS_FILTER_LOW_VIEWS: true,
        ENABLE_PERIODIC_SCAN: true,
        PERIODIC_SCAN_INTERVAL: 1000,
        DEBOUNCE_DELAY: 50,
        // 新增：初始化相關設定
        INITIAL_SCAN_DELAY: 50,
        // 首次掃描延遲
        INITIAL_SCAN_RETRIES: 5,
        // 初始掃描重試次數
        INITIAL_RETRY_INTERVAL: 100,
        // 重試間隔
        CONTENT_WAIT_TIMEOUT: 10000,
        // 等待內容載入的最大時間
    };

    // --- 選擇器與腳本資訊 ---
    const PROCESSED_ATTR = 'data-yt-purifier-processed';
    const SELECTORS = {
        // 【修改 1】: 新增 'yt-lockup-view-model' 來識別右側播放清單容器
        TOP_LEVEL_CONTAINERS: ['ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer', 'ytd-ad-slot-renderer', 'ytd-statement-banner-renderer', 'ytd-promoted-sparkles-text-search-renderer', 'yt-lockup-view-model'],
        // 新增：用於偵測頁面是否已載入主要內容的選擇器
        CONTENT_INDICATORS: ['ytd-rich-grid-renderer', 'ytd-two-column-browse-results-renderer', '#contents'],
        init() {
            this.ALL = this.TOP_LEVEL_CONTAINERS.join(', ');
            this.UNPROCESSED = this.TOP_LEVEL_CONTAINERS.map(s => `${s}:not([${PROCESSED_ATTR}])`).join(', ');
            this.CONTENT_CHECK = this.CONTENT_INDICATORS.join(', ');
            return this;
        }
    }.init();

    const SCRIPT_INFO = (() => {
        try {
            // 版本號更新為 10.12
            return { version: '10.12', name: GM_info.script.name };
        } catch (e) {
            return { version: '10.12', name: 'YouTube Purifier' };
        }
    })();

    const logger = (() => {
        let h = 0;
        return {
            info: (m) => console.log(`%c[${SCRIPT_INFO.name}] ${m}`, 'color:#17a2b8;font-weight:bold;'),
            success: (m) => console.log(`%c[${SCRIPT_INFO.name}] ${m}`, 'color:#28a745;font-style:italic;'),
            warning: (m) => console.log(`%c[${SCRIPT_INFO.name}] ${m}`, 'color:#ffc107;font-weight:bold;'),
            hide: (s, r, c) => {
                h++;
                console.log(`%c[${SCRIPT_INFO.name}] 已隱藏 (${s}): "${r}" (${c.tagName.toLowerCase()})`, 'color:#fd7e14;');
            },
            getStats: () => ({ hidden: h })
        };
    })();

    const utils = {
        debounce: (f, d) => {
            let t;
            return (...a) => {
                clearTimeout(t);
                t = setTimeout(() => f(...a), d);
            };
        },
        parseLiveViewers: (t) => {
            const m = t?.match(/([\d,.]+)\s*(人正在觀看|watching)/);
            return m?.[1] ? Math.floor(parseFloat(m[1].replace(/,/g, '')) || 0) : null;
        },
        // 新增：檢查頁面主要內容是否已載入
        hasMainContent: () => {
            return document.querySelector(SELECTORS.CONTENT_CHECK) !== null;
        },
        // 新增：等待主要內容載入
        waitForContent: (timeout = CONFIG.CONTENT_WAIT_TIMEOUT) => {
            return new Promise((resolve) => {
                const startTime = Date.now();
                const checkContent = () => {
                    if (utils.hasMainContent()) {
                        resolve(true);
                        return;
                    }
                    if (Date.now() - startTime > timeout) {
                        resolve(false);
                        return;
                    }
                    setTimeout(checkContent, 100);
                };
                checkContent();
            });
        }
    };

    const parseViewCount = (() => {
        const r = /觀看次數：|次|,|views/gi, m = new Map([['萬', 1e4],['万', 1e4],['k', 1e3],['m', 1e6],['b', 1e9]]);
        return t => {
            if (!t) return null;
            const c = t.toLowerCase().replace(r, '').trim(), n = parseFloat(c);
            if (isNaN(n)) return null;
            for (const [s, x] of m) if (c.includes(s)) return Math.floor(n * x);
            return Math.floor(n);
        };
    })();

    // --- 規則系統 ---
    const RULES = {
        MUST_HIDE: [
            { name: '各類廣告/促銷', selector: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-premium-promo-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, .ytp-ad-text, [aria-label*="廣告"], [aria-label*="Sponsor"]' },
            { name: '會員專屬內容', selector: '.badge-style-type-members-only, [aria-label*="會員專屬"], [aria-label*="Members only"]' },
            { name: '頂部橫幅', selector: 'ytd-statement-banner-renderer' },
            { name: '單一 Shorts 影片', selector: 'a#thumbnail[href*="/shorts/"]' },
            { name: 'Shorts 區塊', selector: '#title', textKeyword: /^Shorts$/i, scope: 'ytd-rich-shelf-renderer, ytd-reel-shelf-renderer, ytd-rich-section-renderer' },
            { name: '新聞快報區塊', selector: '#title', textKeyword: /新聞快報|Breaking news/i, scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer' },
            { name: '最新貼文區塊', selector: '#title', textKeyword: /最新( YouTube )?貼文|Latest (community )?posts/i, scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer' },
            { name: '頻道推薦區塊', selector: '#title', textKeyword: /推薦頻道|Channels for you|Similar channels/i, scope: 'ytd-rich-shelf-renderer, ytd-rich-section-renderer' },
            // 【修改 2】: 擴充播放清單關鍵字 (新增 Podcast|集) 和作用範圍 (新增 yt-lockup-view-model)
            { name: '播放清單/合輯 (關鍵字)', selector: '#title, .yt-lockup-metadata-view-model-wiz__title, .badge-shape-wiz__text', textKeyword: /合輯|Mixes|Playlist|部影片|videos|Podcast|集/i, scope: 'ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-rich-shelf-renderer, yt-lockup-view-model' },
            // 【修改 3】: 擴充播放清單連結屬性規則的作用範圍 (新增 yt-lockup-view-model)
            { name: '播放清單/合輯 (連結屬性)', selector: 'a.yt-simple-endpoint[href*="&list="], a.yt-lockup-view-model-wiz__title[href*="&list="]', scope: 'ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-rich-shelf-renderer, yt-lockup-view-model' },
        ],
        MUST_KEEP: [
            { name: '豁免：認證頻道', selector: '#channel-name ytd-badge-supported-renderer:not([hidden])', scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer' },
        ],
        CONDITIONAL_HIDE: CONFIG.ENABLE_LOW_VIEW_FILTER ? [
            { name: `低觀眾數直播`, scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer', check: c => { for (const i of c.querySelectorAll('#metadata-line .inline-metadata-item')) { const t=i.textContent?.trim(); if (t && (t.includes('人正在觀看')||t.toLowerCase().includes('watching'))) { const v = utils.parseLiveViewers(t); return v === null ? {h:0,f:1} : {h:v<CONFIG.LOW_VIEW_THRESHOLD, f:1}; } } return {h:0,f:0}; } },
            { name: `低觀看數影片`, scope: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer', check: c => { for (const i of c.querySelectorAll('#metadata-line .inline-metadata-item')) { const t=i.textContent?.trim(); if (t && (t.includes('觀看')||t.toLowerCase().includes('view'))) { const v = parseViewCount(t); return v === null ? {h:0,f:1} : {h:v<CONFIG.LOW_VIEW_THRESHOLD, f:1}; } } return {h:0,f:0}; } },
        ] : [],
    };

    // --- 元素處理 ---
    const hideElement = (element, ruleName, source) => {
        if (element.getAttribute(PROCESSED_ATTR) === 'hidden') return;
        element.style.setProperty('display', 'none', 'important');
        element.setAttribute(PROCESSED_ATTR, 'hidden');
        logger.hide(source, ruleName, element);
    };

    const markAsChecked = (element) => {
        if (element.hasAttribute(PROCESSED_ATTR)) return;
        element.setAttribute(PROCESSED_ATTR, 'checked');
    };

    // --- 核心容器處理邏輯 ---
    const processContainer = (container, source) => {
        if (container.hasAttribute(PROCESSED_ATTR)) return;
        try {
            for (const rule of RULES.MUST_HIDE) {
                // 如果規則有 scope 限制，但當前容器不匹配，則跳過此規則
                if (rule.scope && !container.matches(rule.scope)) continue;
                // 在容器內尋找符合規則的子元素
                const elements = container.querySelectorAll(rule.selector);
                for (const element of elements) {
                    if (element && (!rule.textKeyword || rule.textKeyword.test(element.textContent?.trim() ?? ''))) {
                        hideElement(container, rule.name, source);
                        return; // 隱藏後立即返回，不再處理此容器
                    }
                }
            }
            if (CONFIG.ALWAYS_FILTER_LOW_VIEWS) {
                for (const rule of RULES.CONDITIONAL_HIDE) {
                    if (rule.scope && !container.matches(rule.scope)) continue;
                    const result = rule.check(container);
                    if (result.h) {
                        hideElement(container, rule.name, source);
                        return;
                    }
                    if (result.f) {
                        markAsChecked(container);
                        return;
                    }
                }
            }
            for (const rule of RULES.MUST_KEEP) {
                if (rule.scope && !container.matches(rule.scope)) continue;
                if (container.querySelector(rule.selector)) {
                    markAsChecked(container);
                    return;
                }
            }
            if (!CONFIG.ALWAYS_FILTER_LOW_VIEWS) {
                for (const rule of RULES.CONDITIONAL_HIDE) {
                    if (rule.scope && !container.matches(rule.scope)) continue;
                    const result = rule.check(container);
                    if (result.h) {
                        hideElement(container, rule.name, source);
                        return;
                    }
                    if (result.f) {
                        markAsChecked(container);
                        return;
                    }
                }
            }
        } catch (error) {
            markAsChecked(container);
        }
    };

    // --- 頁面掃描與監控 ---
    const scanPage = (source = 'scan') => {
        const elements = document.querySelectorAll(SELECTORS.UNPROCESSED);
        // 只有在找到元素時才打印日誌，避免刷屏
        if (elements.length > 0) {
            logger.info(`${source} 掃描發現 ${elements.length} 個未處理元素`);
        }
        elements.forEach(e => processContainer(e, source));
    };

    // 新增：增強的初始化掃描
    const performInitialScan = async () => {
        logger.info('開始初始化掃描...');

        // 等待主要內容載入
        const contentLoaded = await utils.waitForContent();
        if (!contentLoaded) {
            logger.warning('等待主要內容載入超時，繼續執行掃描');
        } else {
            logger.success('主要內容已載入');
        }

        // 延遲掃描以確保內容完全渲染
        await new Promise(resolve => setTimeout(resolve, CONFIG.INITIAL_SCAN_DELAY));

        // 執行初始掃描
        scanPage('initial');

        // 重試機制：如果沒有找到足夠的內容，進行重試
        for (let i = 0; i < CONFIG.INITIAL_SCAN_RETRIES; i++) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.INITIAL_RETRY_INTERVAL));

            const unprocessedCount = document.querySelectorAll(SELECTORS.UNPROCESSED).length;
            if (unprocessedCount > 0) {
                logger.info(`重試掃描 ${i + 1}/${CONFIG.INITIAL_SCAN_RETRIES}，發現 ${unprocessedCount} 個新元素`);
                scanPage(`retry-${i + 1}`);
            } else {
                // 為了避免在快速導航時誤判，即使沒找到也稍微等待一下
                if (i < 2) continue;
                logger.success('初始化掃描完成，無需進一步重試');
                break;
            }
        }
    };

    const observer = new MutationObserver(utils.debounce(mutations => {
        const elements = new Set();
        for (const m of mutations) {
            for (const n of m.addedNodes) {
                if (n.nodeType === 1) {
                    if (n.matches?.(SELECTORS.ALL)) elements.add(n);
                    n.querySelectorAll?.(SELECTORS.ALL).forEach(c => elements.add(c));
                }
            }
        }
        if (elements.size > 0) {
            logger.info(`觀察器發現 ${elements.size} 個新頂層元素`);
            elements.forEach(e => processContainer(e, 'observer'));
        }
    }, CONFIG.DEBOUNCE_DELAY));

    // --- 主要執行邏輯 (v10.11 增強初始化版本) ---
    const run = async () => {
        logger.info(`v${SCRIPT_INFO.version} 初始化開始，增強首次載入過濾能力`);

        // 啟動 DOM 觀察器
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // 執行增強的初始化掃描
        await performInitialScan();

        // 啟動週期性掃描
        if (CONFIG.ENABLE_PERIODIC_SCAN) {
            setInterval(() => {
                scanPage('periodic-continuous');
            }, CONFIG.PERIODIC_SCAN_INTERVAL);
            logger.success('持續性背景掃描已啟動');
        }

        logger.success('過濾系統完全啟動');
    };

    // --- 頁面載入事件處理 ---
    const startScript = () => {
        if (window.ytPurifierInitialized) {
            logger.warning('腳本已初始化，跳過重複執行。');
            return;
        }
        window.ytPurifierInitialized = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
            setTimeout(run, 100);
        }
    };

    // 新增：監聽 YouTube 的頁面導覽事件
    const setupNavigationListener = () => {
        let lastUrl = location.href;
        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                logger.info('偵測到頁面導覽，重新執行掃描');
                // 在導覽後稍作延遲，等待新頁面內容渲染
                setTimeout(() => performInitialScan(), 500);
            }
        });
        // 觀察 body 的變化，因為 YouTube 的 SPA 導航會改變 body 的內容
        observer.observe(document.body, { childList: true, subtree: true });
    };

    // 啟動腳本
    startScript();
    
    // 導覽監聽器在 body 存在後再設定
    if (document.body) {
        setupNavigationListener();
    } else {
        document.addEventListener('DOMContentLoaded', setupNavigationListener, { once: true });
    }
    
    // 清理工作
    window.addEventListener('beforeunload', () => {
        if (observer) observer.disconnect();
    });

})();
