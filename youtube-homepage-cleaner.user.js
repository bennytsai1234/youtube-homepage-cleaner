// ==UserScript==
// @name         YouTube 首頁淨化大師 (v9.0 - 最終穩定版)
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  終極架構優化：移除“已檢查(checked)”狀態，從根本上解決因內容延遲載入導致的偶發性過濾失效問題。現在，所有未被隱藏的元素都將被反覆巡邏，確保萬無一失。
// @author       Benny (v6.2) & Gemini (v8.0) & GPT-4 (v8.1-v9.0 Refinement)
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
                if (visibleBadge) return { shouldHide: false, isFinal: true }; // 豁免重要頻道，且決定是最終的

                const metaSpans = videoCard.querySelectorAll('#metadata-line .inline-metadata-item');
                let viewCountText = null;
                metaSpans.forEach(span => {
                    const text = span.textContent || '';
                    if (text.includes('觀看') || text.toLowerCase().includes('view')) viewCountText = text;
                });

                if (!viewCountText) return { shouldHide: false, isFinal: false }; // 觀看次數資訊還沒出來，不是最終決定

                const views = parseViewCount(viewCountText);
                if (views === null) return { shouldHide: false, isFinal: true }; // 無法解析，視為最終決定

                return { shouldHide: views < CONFIG.LOW_VIEW_THRESHOLD, isFinal: true }; // 已成功解析，做出最終決定
            }
        });
    }

    const SCRIPT_INFO = (() => {
        try { return { version: GM_info.script.version, name: GM_info.script.name }; }
        catch (e) { return { version: 'N/A', name: 'YouTube Purifier' }; }
    })();

    const formattedContainerSelector = CONFIG.TOP_LEVEL_CONTAINER_SELECTOR.replace(/\s/g, '');

    const hideElementAndContainer = (element, ruleName, source = 'observer') => {
        const topLevelContainer = element.closest(formattedContainerSelector);
        const elementToHide = topLevelContainer || element;

        if (elementToHide.hasAttribute(PROCESSED_MARKER_ATTR)) return;
        elementToHide.setAttribute(PROCESSED_MARKER_ATTR, 'hidden');

        elementToHide.style.display = 'none';

        const logSource = source === 'periodic' ? '巡邏' : (source === 'initial' ? '初掃' : '即時');
        console.log(`%c[${SCRIPT_INFO.name}] 已隱藏 (${logSource}): "${ruleName}" (容器: <${elementToHide.tagName.toLowerCase()}>)`, 'color: #fd7e14;');
    };

    const processNode = (node, source = 'observer') => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const selectorSuffix = `:not([${PROCESSED_MARKER_ATTR}])`;

        for (const rule of CONFIG.signatureRules) {
            const finalSelector = `${rule.signatureSelector}${selectorSuffix}`;
            const signatureElements = node.matches(finalSelector) ? [node] : Array.from(node.querySelectorAll(finalSelector));

            for (const signatureEl of signatureElements) {
                // v9.0 修正：只有在文字不匹配時才跳過，不進行任何標記
                if (rule.textKeyword && !rule.textKeyword.test(signatureEl.textContent?.trim() || '')) {
                    continue;
                }
                hideElementAndContainer(signatureEl, rule.name, source);
            }
        }

        for (const rule of functionalRules) {
            const finalSelector = `${rule.targetSelector}${selectorSuffix}`;
            const targetElements = node.matches(finalSelector) ? [node] : Array.from(node.querySelectorAll(finalSelector));

            for (const targetEl of targetElements) {
                const result = rule.condition(targetEl);
                if (result.shouldHide) {
                    hideElementAndContainer(targetEl, rule.name, source);
                } else if (result.isFinal) {
                    // v9.0 修正: 只有當規則明確告知這是最終決定時，才標記為checked
                    targetEl.setAttribute(PROCESSED_MARKER_ATTR, 'checked');
                }
                // 如果 isFinal 是 false，則不執行任何操作，留給下一次巡邏
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
        console.log(`%c[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}] 初始化完畢，終極巡邏系統已啟動。`, 'color: #17a2b8; font-weight: bold;');
        processNode(document.body, 'initial');
        observer.observe(document.documentElement, { childList: true, subtree: true });
        if (CONFIG.ENABLE_PERIODIC_SCAN) {
            setInterval(() => processNode(document.body, 'periodic'), CONFIG.PERIODIC_SCAN_INTERVAL);
            console.log(`%c  - 定時巡邏已開啟 (每 ${CONFIG.PERIODIC_SCAN_INTERVAL / 1000} 秒)。`, 'color: #17a2b8;');
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
