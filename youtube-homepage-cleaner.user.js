// ==UserScript==
// @name         YouTube 首頁淨化大師 (v9.2 - 零空間佔用穩定版)
// @namespace    http://tampermonkey.net/
// @version      9.2
// @description  終極佈局優化！採用「塌縮式隱藏」策略，將被過濾的元素尺寸歸零，使其在佈局中不佔據任何空間，完美解決殘留空白問題，同時確保與YouTube原生腳本的最高相容性。
// @author       Benny (v6.2) & Gemini (v8.0) & GPT-4 (v8.1-v9.2 Refinement)
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
        ENABLE_LOW_VIEW_FILTER: true,
        LOW_VIEW_THRESHOLD: 1000,
        ENABLE_PERIODIC_SCAN: true,
        PERIODIC_SCAN_INTERVAL: 1500,
        MAX_PATROLS: 10,

        TOP_LEVEL_CONTAINER_SELECTOR: `
            ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-video-renderer,
            ytd-compact-video-renderer, ytd-reel-shelf-renderer, ytd-ad-slot-renderer,
            ytd-statement-banner-renderer
        `,
        signatureRules: [
            { name: '會員專屬內容', signatureSelector: '.badge-style-type-members-only, [aria-label*="會員專屬"], [aria-label*="Members only"]'},
            { name: 'Shorts 區塊', signatureSelector: 'ytd-rich-shelf-renderer #title, ytd-reel-shelf-renderer #title', textKeyword: /^Shorts$/i },
            { name: '新聞快報區塊', signatureSelector: 'ytd-rich-shelf-renderer #title', textKeyword: /新聞快報|Breaking news/i },
            { name: '為你推薦區塊', signatureSelector: 'ytd-rich-shelf-renderer #title', textKeyword: /為你推薦|For you/i },
            { name: '最新貼文區塊', signatureSelector: 'ytd-rich-shelf-renderer #title', textKeyword: /最新( YouTube )?貼文|Latest posts/i },
            { name: '音樂合輯/播放清單區塊', signatureSelector: 'ytd-rich-shelf-renderer #title, ytd-playlist-renderer #title', textKeyword: /合輯|Mixes|Playlist/i },
            { name: '頻道推薦區塊', signatureSelector: 'ytd-rich-shelf-renderer #title', textKeyword: /推薦頻道|Channels for you|Similar channels/i },
            { name: '各類廣告/促銷', signatureSelector: 'ytd-ad-slot-renderer, ytd-promoted-sparkles-text-search-renderer, ytd-premium-promo-renderer, ytd-in-feed-ad-layout-renderer, ytd-display-ad-renderer, .ytp-ad-text, [aria-label*="廣告"], [aria-label*="Sponsor"]' },
            { name: '頂部橫幅(聲明/資訊)', signatureSelector: 'ytd-statement-banner-renderer' },
            { name: '單一 Shorts 影片', signatureSelector: 'a#thumbnail[href*="/shorts/"]' }
        ],
    };

    const PROCESSED_MARKER_ATTR = 'data-yt-purifier-processed';

    const parseViewCount = (text) => {
        if (!text) return null;
        const cleanedText = text.toLowerCase().replace(/觀看次數：|次|,|views/g, '').trim();
        const num = parseFloat(cleanedText);
        if (isNaN(num)) return null;
        if (cleanedText.includes('萬') || cleanedText.includes('万')) return Math.floor(num * 10000);
        if (cleanedText.includes('k')) return Math.floor(num * 1000);
        if (cleanedText.includes('m')) return Math.floor(num * 1000000);
        return Math.floor(num);
    };

    const functionalRules = [];
    if (CONFIG.ENABLE_LOW_VIEW_FILTER) {
        functionalRules.push({
            name: `低觀看數影片 (低於 ${CONFIG.LOW_VIEW_THRESHOLD})`,
            targetSelector: `ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer`,
            condition: (videoCard) => {
                const visibleBadge = videoCard.querySelector('#channel-name ytd-badge-supported-renderer:not([hidden])');
                if (visibleBadge) return { shouldHide: false, isFinal: true };

                const metaSpans = videoCard.querySelectorAll('#metadata-line .inline-metadata-item');
                let viewCountText = null;
                metaSpans.forEach(span => {
                    const text = span.textContent || '';
                    if (text.includes('觀看') || text.toLowerCase().includes('view')) viewCountText = text;
                });

                if (!viewCountText) return { shouldHide: false, isFinal: false };

                const views = parseViewCount(viewCountText);
                if (views === null) return { shouldHide: false, isFinal: true };

                return { shouldHide: views < CONFIG.LOW_VIEW_THRESHOLD, isFinal: true };
            }
        });
    }

    const SCRIPT_INFO = (() => {
        try { return { version: GM_info.script.version, name: GM_info.script.name }; }
        catch (e) { return { version: 'N/A', name: 'YouTube Purifier' }; }
    })();

    const formattedContainerSelector = CONFIG.TOP_LEVEL_CONTAINER_SELECTOR.replace(/\s/g, '');

    // ******** v9.2 核心改動：塌縮式隱藏 ********
    const hideAndCollapseElement = (element, ruleName, source = 'observer') => {
        const topLevelContainer = element.closest(formattedContainerSelector);
        const elementToHide = topLevelContainer || element;

        if (elementToHide.hasAttribute(PROCESSED_MARKER_ATTR)) return;

        // 標記為已隱藏
        elementToHide.setAttribute(PROCESSED_MARKER_ATTR, 'hidden');

        // 塌縮元素，使其不佔用任何空間
        Object.assign(elementToHide.style, {
            display: 'block', // 必須是 block 才能設定以下屬性
            height: '0',
            width: '0',
            margin: '0',
            padding: '0',
            border: '0',
            overflow: 'hidden',
            visibility: 'hidden', // 確保內容完全不可見
        });

        const logSource = source === 'periodic' ? '巡邏' : (source === 'initial' ? '初掃' : '即時');
        console.log(`%c[${SCRIPT_INFO.name}] 已隱藏 (${logSource}): "${ruleName}" (容器: <${elementToHide.tagName.toLowerCase()}>)`, 'color: #fd7e14;');
    };

    const markAsChecked = (element) => {
        if (element && !element.hasAttribute(PROCESSED_MARKER_ATTR)) {
            element.setAttribute(PROCESSED_MARKER_ATTR, 'checked');
        }
    };

    const processNode = (node, source = 'observer') => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const selectorSuffix = `:not([${PROCESSED_MARKER_ATTR}])`;

        for (const rule of CONFIG.signatureRules) {
            const finalSelector = `${rule.signatureSelector}${selectorSuffix}`;
            const signatureElements = node.matches(finalSelector) ? [node] : Array.from(node.querySelectorAll(finalSelector));

            for (const signatureEl of signatureElements) {
                const container = signatureEl.closest(formattedContainerSelector) || signatureEl;
                if (container.hasAttribute(PROCESSED_MARKER_ATTR)) continue;

                if (rule.textKeyword && !rule.textKeyword.test(signatureEl.textContent?.trim() || '')) {
                    continue;
                }
                hideAndCollapseElement(signatureEl, rule.name, source);
            }
        }

        for (const rule of functionalRules) {
            const finalSelector = `${rule.targetSelector}${selectorSuffix}`;
            const targetElements = node.matches(finalSelector) ? [node] : Array.from(node.querySelectorAll(finalSelector));

            for (const targetEl of targetElements) {
                if (targetEl.hasAttribute(PROCESSED_MARKER_ATTR)) continue;

                const result = rule.condition(targetEl);
                if (result.shouldHide) {
                    hideAndCollapseElement(targetEl, rule.name, source);
                } else if (result.isFinal) {
                    markAsChecked(targetEl);
                }
            }
        }
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const addedNode of mutation.addedNodes) processNode(addedNode, 'observer');
            }
        }
    });

    const run = () => {
        console.log(`%c[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}] 初始化完畢，過濾系統已啟動。`, 'color: #17a2b8; font-weight: bold;');

        processNode(document.body, 'initial');
        observer.observe(document.documentElement, { childList: true, subtree: true });

        if (CONFIG.ENABLE_PERIODIC_SCAN) {
            let patrolCounter = 0;
            const patrolIntervalId = setInterval(() => {
                processNode(document.body, 'periodic');
                patrolCounter++;
                if (patrolCounter >= CONFIG.MAX_PATROLS) {
                    clearInterval(patrolIntervalId);
                    console.log(`%c[${SCRIPT_INFO.name}] 初期巡邏任務完成，系統進入純即時監控模式。`, 'color: #28a745; font-style: italic;');
                }
            }, CONFIG.PERIODIC_SCAN_INTERVAL);
            console.log(`%c  - 限時巡邏已開啟 (共執行 ${CONFIG.MAX_PATROLS} 次，覆蓋 ${CONFIG.PERIODIC_SCAN_INTERVAL * CONFIG.MAX_PATROLS / 1000} 秒)。`, 'color: #17a2b8;');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
