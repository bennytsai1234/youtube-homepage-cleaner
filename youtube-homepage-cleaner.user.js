// ==UserScript==
// @name         YouTube 首頁淨化大師 (v10.10 - 持續監控版)
// @namespace    http://tampermonkey.net/
// @version      10.10
// @description  v10.10: 移除巡邏次數限制，腳本將持續在背景進行週期性掃描，以應對極端延遲載入或複雜的頁面互動，確保過濾的最高可靠性。
// @author       Benny, Gemini, Claude-3 & GPT-4 (v8.1-v10.10)
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
        PERIODIC_SCAN_INTERVAL: 1000, // 考慮到持續運行，稍微增加間隔以降低長期負載
        DEBOUNCE_DELAY: 50,
    };

    // --- 選擇器與腳本資訊 ---
    const PROCESSED_ATTR = 'data-yt-purifier-processed';
    const SELECTORS = {
        TOP_LEVEL_CONTAINERS: ['ytd-rich-item-renderer', 'ytd-rich-section-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-reel-shelf-renderer', 'ytd-ad-slot-renderer', 'ytd-statement-banner-renderer', 'ytd-promoted-sparkles-text-search-renderer'],
        init() { this.ALL = this.TOP_LEVEL_CONTAINERS.join(', '); this.UNPROCESSED = this.TOP_LEVEL_CONTAINERS.map(s => `${s}:not([${PROCESSED_ATTR}])`).join(', '); return this; }
    }.init();
    const SCRIPT_INFO = (() => { try { return { version: GM_info.script.version, name: GM_info.script.name }; } catch (e) { return { version: '10.10', name: 'YouTube Purifier' }; } })();
    const logger = (() => { let h = 0; return { info: (m) => console.log(`%c[${SCRIPT_INFO.name}] ${m}`, 'color:#17a2b8;font-weight:bold;'), success: (m) => console.log(`%c[${SCRIPT_INFO.name}] ${m}`, 'color:#28a745;font-style:italic;'), hide: (s, r, c) => { h++; console.log(`%c[${SCRIPT_INFO.name}] 已隱藏 (${s}): "${r}" (${c.tagName.toLowerCase()})`, 'color:#fd7e14;'); }, getStats: () => ({ hidden: h }) }; })();
    const utils = { debounce: (f, d) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), d); }; }, parseLiveViewers: (t) => { const m = t?.match(/([\d,.]+)\s*(人正在觀看|watching)/); return m?.[1] ? Math.floor(parseFloat(m[1].replace(/,/g, '')) || 0) : null; } };
    const parseViewCount = (() => { const r = /觀看次數：|次|,|views/gi, m = new Map([['萬', 1e4],['万', 1e4],['k', 1e3],['m', 1e6],['b', 1e9]]); return t => { if (!t) return null; const c = t.toLowerCase().replace(r, '').trim(), n = parseFloat(c); if (isNaN(n)) return null; for (const [s, x] of m) if (c.includes(s)) return Math.floor(n * x); return Math.floor(n); }; })();

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
            { name: '播放清單/合輯 (關鍵字)', selector: '#title, .yt-lockup-metadata-view-model-wiz__title, .badge-shape-wiz__text', textKeyword: /合輯|Mixes|Playlist|部影片|videos/i, scope: 'ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-rich-shelf-renderer' },
            { name: '播放清單/合輯 (連結屬性)', selector: 'a.yt-simple-endpoint[href*="&list="], a.yt-lockup-view-model-wiz__title[href*="&list="]', scope: 'ytd-rich-item-renderer, ytd-rich-section-renderer, ytd-rich-shelf-renderer' },
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
    const hideElement = (element, ruleName, source) => { if (element.getAttribute(PROCESSED_ATTR) === 'hidden') return; element.style.setProperty('display', 'none', 'important'); element.setAttribute(PROCESSED_ATTR, 'hidden'); logger.hide(source, ruleName, element); };
    const markAsChecked = (element) => { if (element.hasAttribute(PROCESSED_ATTR)) return; element.setAttribute(PROCESSED_ATTR, 'checked'); };

    // --- 核心容器處理邏輯 ---
    const processContainer = (container, source) => {
        if (container.hasAttribute(PROCESSED_ATTR)) return;
        try {
            for (const rule of RULES.MUST_HIDE) {
                if (rule.scope && !container.matches(rule.scope)) continue;
                const element = container.querySelector(rule.selector);
                if (element && (!rule.textKeyword || rule.textKeyword.test(element.textContent?.trim() ?? ''))) { hideElement(container, rule.name, source); return; }
            }
            if (CONFIG.ALWAYS_FILTER_LOW_VIEWS) {
                for (const rule of RULES.CONDITIONAL_HIDE) {
                    if (rule.scope && !container.matches(rule.scope)) continue;
                    const result = rule.check(container);
                    if (result.h) { hideElement(container, rule.name, source); return; }
                    if (result.f) { markAsChecked(container); return; }
                }
            }
            for (const rule of RULES.MUST_KEEP) {
                if (rule.scope && !container.matches(rule.scope)) continue;
                if (container.querySelector(rule.selector)) { markAsChecked(container); return; }
            }
            if (!CONFIG.ALWAYS_FILTER_LOW_VIEWS) {
                 for (const rule of RULES.CONDITIONAL_HIDE) {
                    if (rule.scope && !container.matches(rule.scope)) continue;
                    const result = rule.check(container);
                    if (result.h) { hideElement(container, rule.name, source); return; }
                    if (result.f) { markAsChecked(container); return; }
                }
            }
        } catch (error) { markAsChecked(container); }
    };
    
    // --- 頁面掃描與監控 ---
    const scanPage = (source = 'scan') => { document.querySelectorAll(SELECTORS.UNPROCESSED).forEach(e => processContainer(e, source)); };
    const observer = new MutationObserver(utils.debounce(mutations => {
        const elements = new Set();
        for (const m of mutations) for (const n of m.addedNodes) if (n.nodeType === 1) {
            if (n.matches?.(SELECTORS.ALL)) elements.add(n);
            n.querySelectorAll?.(SELECTORS.ALL).forEach(c => elements.add(c));
        }
        elements.forEach(e => processContainer(e, 'observer'));
    }, CONFIG.DEBOUNCE_DELAY));

    // --- 主要執行邏輯 (v10.10 持續監控修改) ---
    const run = () => {
        logger.info(`v${SCRIPT_INFO.version} 初始化完畢，過濾系統已啟動。`);
        scanPage('initial');
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // v10.10 修改：移除巡邏次數限制，使其持續運行
        if (CONFIG.ENABLE_PERIODIC_SCAN) {
            setInterval(() => {
                scanPage('periodic-continuous');
            }, CONFIG.PERIODIC_SCAN_INTERVAL);
            
            logger.success('持續性背景掃描已啟動。');
        }
    };
    
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else run();
    window.addEventListener('beforeunload', () => observer.disconnect());
})();
