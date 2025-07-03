// ==UserScript==
// @name         YouTube 首頁淨化大師 (v9.7 - 範圍檢查最終版)
// @namespace    http://tampermonkey.net/
// @version      9.7
// @description  終極穩定版！引入「範圍預判」機制，徹底解決非同步載入競爭條件。透過預先判定規則適用範圍，確保即使內容延遲載入也能被精準捕獲，實現零遺漏過濾。
// @author       Benny (v6.2) & Gemini (v8.0) & GPT-4 (v8.1-v9.2) & Claude-3 (v9.5-v9.7)
// @match        https://www.youtube.com/*
// @grant        GM_info
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    // --- 設定區 (Configuration Area) ---
    const CONFIG = {
        DEBUG_MODE: true,

        ENABLE_LOW_VIEW_FILTER: true,
        LOW_VIEW_THRESHOLD: 1000,

        ENABLE_PERIODIC_SCAN: true,
        PERIODIC_SCAN_INTERVAL: 750, // 提升巡邏頻率以應對極端延遲
        MAX_PATROLS: 20,

        TOP_LEVEL_CONTAINER_SELECTOR: `
            ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-video-renderer,
            ytd-compact-video-renderer, ytd-reel-shelf-renderer, ytd-ad-slot-renderer,
            ytd-statement-banner-renderer, ytd-promoted-sparkles-text-search-renderer
        `,

        // v9.7 核心改動：為依賴文字的規則增加 'scope' 屬性，用於預判規則的適用範圍。
        signatureRules: [
            { name: '會員專屬內容', selector: '.badge-style-type-members-only, [aria-label*="會員專屬"], [aria-label*="Members only"]'},
            { name: 'Shorts 區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /^Shorts$/i, scope: 'ytd-rich-section-renderer, ytd-reel-shelf-renderer' },
            { name: '新聞快報區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /新聞快報|Breaking news/i, scope: 'ytd-rich-section-renderer, ytd-rich-shelf-renderer' },
            { name: '為你推薦區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /為你推薦|For you/i, scope: 'ytd-rich-section-renderer, ytd-rich-shelf-renderer' },
            { name: '最新貼文區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /最新( YouTube )?貼文|Latest (community )?posts/i, scope: 'ytd-rich-section-renderer, ytd-rich-shelf-renderer' },
            { name: '音樂合輯/播放清單區塊', selector: 'ytd-rich-shelf-renderer #title, ytd-playlist-renderer #title', textKeyword: /合輯|Mixes|Playlist/i, scope: 'ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-rich-shelf-renderer' },
            { name: '頻道推薦區塊', selector: 'ytd-rich-shelf-renderer #title', textKeyword: /推薦頻道|Channels for you|Similar channels/i, scope: 'ytd-rich-section-renderer, ytd-rich-shelf-renderer' },
            { name: '各類廣告/促銷', selector: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-premium-promo-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, .ytp-ad-text, [aria-label*="廣告"], [aria-label*="Sponsor"]' },
            { name: '頂部橫幅(聲明/資訊)', selector: 'ytd-statement-banner-renderer' },
            { name: '單一 Shorts 影片', selector: 'a#thumbnail[href*="/shorts/"]' }
        ],
    };

    // --- 腳本核心 (Script Core) ---

    const PROCESSED_MARKER_ATTR = 'data-yt-purifier-processed';
    const SCRIPT_INFO = (() => {
        try { return { version: GM_info.script.version, name: GM_info.script.name }; }
        catch (e) { return { version: '9.7', name: 'YouTube Purifier' }; }
    })();

    const logger = {
        log: (message) => CONFIG.DEBUG_MODE && console.log(`%c[${SCRIPT_INFO.name}] ${message}`, 'color: #fd7e14;'),
        info: (message) => console.log(`%c[${SCRIPT_INFO.name}] ${message}`, 'color: #17a2b8; font-weight: bold;'),
        success: (message) => console.log(`%c[${SCRIPT_INFO.name}] ${message}`, 'color: #28a745;'),
    };

    const parseViewCount = (text) => {
        if (!text) return null;
        const textContent = text.toLowerCase();
        const numPart = parseFloat(textContent.replace(/,/g, ''));
        if (isNaN(numPart)) return null;
        const multipliers = { 'k': 1000, 'm': 1000000, '萬': 10000, '万': 10000 };
        for (const [char, multiplier] of Object.entries(multipliers)) {
            if (textContent.includes(char)) return Math.floor(numPart * multiplier);
        }
        return Math.floor(numPart);
    };

    const functionalRules = [];
    if (CONFIG.ENABLE_LOW_VIEW_FILTER) {
        functionalRules.push({
            name: `低觀看數影片 (< ${CONFIG.LOW_VIEW_THRESHOLD})`,
            targetSelector: `ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer`,
            condition: (container) => {
                const visibleBadge = container.querySelector('#channel-name ytd-badge-supported-renderer:not([hidden])');
                if (visibleBadge) return { shouldHide: false, isFinal: true };
                let viewCountText = null;
                for (const span of container.querySelectorAll('#metadata-line .inline-metadata-item')) {
                    const text = span.textContent || '';
                    if (text.includes('觀看') || text.toLowerCase().includes('view')) {
                        viewCountText = text; break;
                    }
                }
                if (!viewCountText) return { shouldHide: false, isFinal: false };
                const views = parseViewCount(viewCountText);
                return views === null ? { shouldHide: false, isFinal: true } : { shouldHide: views < CONFIG.LOW_VIEW_THRESHOLD, isFinal: true };
            }
        });
    }

    const hideAndCollapseElement = (element, ruleName, source) => {
        if (element.getAttribute(PROCESSED_MARKER_ATTR) === 'hidden') return;
        Object.assign(element.style, {
            display: 'block', height: '0', overflow: 'hidden', margin: '0', padding: '0', border: '0'
        });
        element.setAttribute(PROCESSED_MARKER_ATTR, 'hidden');
        logger.log(`已隱藏 (${source}): "${ruleName}" (容器: <${element.tagName.toLowerCase()}>)`);
    };

    const markAsChecked = (element) => {
        if (!element.hasAttribute(PROCESSED_MARKER_ATTR)) {
            element.setAttribute(PROCESSED_MARKER_ATTR, 'checked');
        }
    };

    const processContainers = (containers, source) => {
        if (containers.length === 0) return;

        containerLoop:
        for (const container of containers) {
            let isPotentiallyIncomplete = false;

            // 1. 檢查特徵規則
            for (const rule of CONFIG.signatureRules) {
                // 如果規則有範圍限制，但當前容器不符，則直接跳過此規則
                if (rule.scope && !container.matches(rule.scope)) {
                    continue;
                }

                const signatureEl = container.querySelector(rule.selector);

                if (signatureEl) {
                    if (rule.textKeyword) {
                        const text = signatureEl.textContent?.trim();
                        if (text) {
                            if (rule.textKeyword.test(text)) {
                                hideAndCollapseElement(container, rule.name, source);
                                continue containerLoop;
                            }
                        } else {
                            isPotentiallyIncomplete = true; // 找到元素但沒文字，內容不完整
                        }
                    } else { // 無需文字，找到即隱藏
                        hideAndCollapseElement(container, rule.name, source);
                        continue containerLoop;
                    }
                } else {
                    // **關鍵邏輯**：如果規則有範圍限制 (rule.scope)，
                    // 這意味著 signatureEl *應該* 出現在這個容器裡。
                    // 既然現在找不到，代表容器內容尚未完全載入。
                    if (rule.scope) {
                        isPotentiallyIncomplete = true;
                    }
                }
            }

            // 2. 檢查功能性規則
            for (const rule of functionalRules) {
                if (container.matches(rule.targetSelector)) {
                    const result = rule.condition(container);
                    if (result.shouldHide) {
                        hideAndCollapseElement(container, rule.name, source);
                        continue containerLoop;
                    }
                    if (!result.isFinal) {
                        isPotentiallyIncomplete = true;
                    } else {
                        markAsChecked(container);
                        continue containerLoop;
                    }
                }
            }

            if (!isPotentiallyIncomplete) {
                markAsChecked(container);
            }
        }
    };

    const scanPage = (source = 'scan') => {
        const unprocessedSelector = CONFIG.TOP_LEVEL_CONTAINER_SELECTOR
            .split(',').map(s => `${s.trim()}:not([${PROCESSED_MARKER_ATTR}])`).join(', ');
        const elementsToProcess = document.querySelectorAll(unprocessedSelector);
        if (elementsToProcess.length > 0) {
            processContainers(elementsToProcess, source);
        }
    };

    const observer = new MutationObserver(() => scanPage('observer'));

    const run = () => {
        logger.info(`v${SCRIPT_INFO.version} 初始化完畢，過濾系統已啟動。`);
        if (CONFIG.DEBUG_MODE) logger.info(`除錯模式已開啟。`);

        scanPage('initial');
        observer.observe(document.documentElement, { childList: true, subtree: true });

        if (CONFIG.ENABLE_PERIODIC_SCAN) {
            let patrolCounter = 0;
            const patrolIntervalId = setInterval(() => {
                if (++patrolCounter > CONFIG.MAX_PATROLS) {
                    clearInterval(patrolIntervalId);
                    logger.success(`初期巡邏任務完成，系統進入純即時監控模式。`);
                    return;
                }
                scanPage(`periodic-${patrolCounter}`);
            }, CONFIG.PERIODIC_SCAN_INTERVAL);
            logger.info(`限時巡邏已開啟 (共執行 ${CONFIG.MAX_PATROLS} 次)。`);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
