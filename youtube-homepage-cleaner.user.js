// ==UserScript==
// @name         YouTube 首頁淨化大師 (v8.7 - 精準豁免版)
// @namespace    http://tampermonkey.net/
// @version      8.7
// @description  根據使用者提供的HTML，優化「低觀看數過濾」的豁免邏輯。現在會透過偵測頻道旁的「可見徽章」(如認證標記)來精準地豁免已訂閱或重要頻道，可靠性大幅提升。
// @author       Benny (v6.2) & Gemini (v8.0) & GPT-4 (v8.1-v8.7 Refinement)
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

    // --- 核心邏輯 (Core Logic) ---

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
            targetSelector: 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer',
            condition: (videoCard) => {
                // ******** v8.7 判斷邏輯升級 ********
                // 步驟 1: 檢查頻道名稱旁是否有任何「可見的徽章」(如認證勾勾)。
                // 如果有，就代表是重要頻道，不進行過濾。
                const visibleBadge = videoCard.querySelector('#channel-name ytd-badge-supported-renderer:not([hidden])');
                if (visibleBadge) {
                    return false; // 發現可見徽章，豁免此影片
                }
                // **********************************

                const metaSpans = videoCard.querySelectorAll('#metadata-line .inline-metadata-item');
                let viewCountText = null;
                metaSpans.forEach(span => {
                    const text = span.textContent || '';
                    if (text.includes('觀看') || text.toLowerCase().includes('view')) viewCountText = text;
                });
                if (!viewCountText) return false;
                const views = parseViewCount(viewCountText);
                if (views === null) return false;
                return views < CONFIG.LOW_VIEW_THRESHOLD;
            }
        });
    }

    const SCRIPT_INFO = (() => {
        try { return { version: GM_info.script.version, name: GM_info.script.name }; }
        catch (e) { return { version: 'N/A', name: 'YouTube Purifier' }; }
    })();

    const processedElements = new WeakSet();
    const formattedContainerSelector = CONFIG.TOP_LEVEL_CONTAINER_SELECTOR.replace(/\s/g, '');

    const hideElementAndContainer = (element, ruleName, source = 'observer') => {
        if (!element || processedElements.has(element)) return;
        const topLevelContainer = element.closest(formattedContainerSelector);
        const elementToHide = topLevelContainer || element;
        if (processedElements.has(elementToHide)) return;

        elementToHide.style.display = 'none';
        processedElements.add(elementToHide);
        processedElements.add(element);

        const logSource = source === 'periodic' ? '巡邏' : (source === 'initial' ? '初掃' : '即時');
        console.log(`%c[${SCRIPT_INFO.name}] 已隱藏 (${logSource}): "${ruleName}" (容器: <${elementToHide.tagName.toLowerCase()}>)`, 'color: #fd7e14;');
    };

    const processNode = (node, source = 'observer') => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        for (const rule of CONFIG.signatureRules) {
            const signatureElements = node.matches(rule.signatureSelector) ? [node] : Array.from(node.querySelectorAll(rule.signatureSelector));
            if (signatureElements.length > 0) {
                 for (const signatureEl of signatureElements) {
                    if (rule.textKeyword && !rule.textKeyword.test(signatureEl.textContent?.trim() || '')) continue;
                    hideElementAndContainer(signatureEl, rule.name, source);
                }
            }
        }

        for (const rule of functionalRules) {
            const targetElements = node.matches(rule.targetSelector) ? [node] : Array.from(node.querySelectorAll(rule.targetSelector));
            for (const targetEl of targetElements) {
                if (processedElements.has(targetEl)) continue; // 已處理過則跳過，提升效率
                if (rule.condition(targetEl)) {
                    hideElementAndContainer(targetEl, rule.name, source);
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
