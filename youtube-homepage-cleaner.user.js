// ==UserScript==
// @name         YouTube 首頁淨化大師 (v8.9 - 崩潰修正版)
// @namespace    http://tampermonkey.net/
// @version      8.9
// @description  修正 v8.8 中因 dataset 命名規則錯誤導致的腳本崩潰問題。改用 setAttribute 進行標記，增強穩定性。
// @author       Benny (v6.2) & Gemini (v8.0) & GPT-4 (v8.1-v8.9 Refinement)
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

    // v8.9 修正: 直接使用合法的 HTML data 屬性名
    const PROCESSED_MARKER = 'data-yt-purifier-processed';

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
            // v8.9 修正: 使用標準的屬性選擇器
            targetSelector: `
                ytd-rich-item-renderer:not([${PROCESSED_MARKER}]), 
                ytd-video-renderer:not([${PROCESSED_MARKER}]), 
                ytd-compact-video-renderer:not([${PROCESSED_MARKER}])
            `,
            condition: (videoCard) => {
                const visibleBadge = videoCard.querySelector('#channel-name ytd-badge-supported-renderer:not([hidden])');
                if (visibleBadge) return false;
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

    const formattedContainerSelector = CONFIG.TOP_LEVEL_CONTAINER_SELECTOR.replace(/\s/g, '');

    const hideElementAndContainer = (element, ruleName, source = 'observer') => {
        const topLevelContainer = element.closest(formattedContainerSelector);
        const elementToHide = topLevelContainer || element;
        
        // v8.9 修正: 使用 hasAttribute 檢查
        if (elementToHide.hasAttribute(PROCESSED_MARKER)) return;
        // v8.9 修正: 使用 setAttribute 標記
        elementToHide.setAttribute(PROCESSED_MARKER, 'hidden');

        elementToHide.style.display = 'none';

        const logSource = source === 'periodic' ? '巡邏' : (source === 'initial' ? '初掃' : '即時');
        console.log(`%c[${SCRIPT_INFO.name}] 已隱藏 (${logSource}): "${ruleName}" (容器: <${elementToHide.tagName.toLowerCase()}>)`, 'color: #fd7e14;');
    };

    const processNode = (node, source = 'observer') => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        // v8.9 修正: 使用標準的屬性選擇器
        const buildSelector = (selector) => `${selector}:not([${PROCESSED_MARKER}])`;

        for (const rule of CONFIG.signatureRules) {
            // 注意：這裡的查詢選擇器邏輯維持不變，因為 :not() 是給 querySelectorAll 使用的
            const querySelector = `${rule.signatureSelector}:not([${PROCESSED_MARKER}])`;
            const signatureElements = node.matches(querySelector) ? [node] : Array.from(node.querySelectorAll(querySelector));
            
            for (const signatureEl of signatureElements) {
                const container = signatureEl.closest(formattedContainerSelector) || signatureEl;
                // 再次檢查，因為 querySelectorAll 無法完全避免已處理的父元素下的新匹配
                if (container.hasAttribute(PROCESSED_MARKER)) continue;

                if (rule.textKeyword && !rule.textKeyword.test(signatureEl.textContent?.trim() || '')) {
                    container.setAttribute(PROCESSED_MARKER, 'checked'); // 標記為已檢查但未隱藏
                    continue;
                }
                hideElementAndContainer(signatureEl, rule.name, source);
            }
        }

        for (const rule of functionalRules) {
            const targetElements = node.matches(rule.targetSelector) ? [node] : Array.from(node.querySelectorAll(rule.targetSelector));
            for (const targetEl of targetElements) {
                // 由於選擇器已經包含了 :not()，這裡的二次檢查是為了保險
                if (targetEl.hasAttribute(PROCESSED_MARKER)) continue;

                if (rule.condition(targetEl)) {
                    hideElementAndContainer(targetEl, rule.name, source);
                } else {
                    targetEl.setAttribute(PROCESSED_MARKER, 'checked');
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
        console.log(`%c[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}] 初始化完畢，智慧巡邏系統已啟動。`, 'color: #17a2b8; font-weight: bold;');
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
