// ==UserScript==
// @name         YouTube 首頁淨化大師 (v7.1 全功能啟用版)
// @namespace    http://tampermonkey.net/
// @version      7.1
// @description  基於 v7.0 健壯版，預設啟用所有過濾模組 (Shorts, 為你推薦, 音樂合輯)。提供最全面的首頁淨化體驗，強力抵抗 YouTube 介面改版。
// @author       Benny (v6.2) & Gemini (v7.1 Refactor)
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    // --- 關鍵字與正則表達式 (方便統一管理與擴充) ---
    const KEYWORDS = {
        MEMBERS_ONLY: /頻道會員專屬|Members only|频道会员专属|メンバー限定|멤버 전용|Nur für Mitglieder/i,
        LATEST_POSTS: /最新( YouTube )?貼文|Latest posts/i,
        BREAKING_NEWS: /新聞快報|Breaking news/i,
        PREMIUM_PROMO: /YouTube (Music )?Premium|免費試用|零廣告|無廣告|進階版|ad-free YouTube|Get YouTube Premium/i,
        SHORTS: /^Shorts$/i,
        FOR_YOU: /為你推薦|For you/i,
        MIXES: /個播放清單|Mixes/i
    };

    /**
     * @typedef {Object} RemovalRule
     * @property {string} name - 規則名稱，方便除錯。
     * @property {string[]} selectors - 應被隱藏的元素之 CSS 選擇器。
     * @property {(element: HTMLElement) => boolean} condition - 一個函式，接收一個元素作為參數，返回 true 表示該元素應被隱藏。
     * @property {boolean} [enabled=true] - 是否啟用此規則。
     */

    // --- 設定區 (Config Area) ---
    /** @type {RemovalRule[]} */
    const removalConfigs = [
        {
            name: 'MemberOnlyVideo',
            enabled: true,
            selectors: [
                'ytd-rich-item-renderer', 'ytd-video-renderer',
                'ytd-grid-video-renderer', 'ytd-compact-video-renderer'
            ],
            condition: (element) => {
                // 檢查 aria-label (通常用於輔助功能，資訊準確)
                if (KEYWORDS.MEMBERS_ONLY.test(element.querySelector('[aria-label]')?.ariaLabel || '')) {
                    return true;
                }
                // 檢查影片下方的徽章文字 (後備方案)
                const badge = element.querySelector('ytd-badge-supported-renderer');
                return !!badge && KEYWORDS.MEMBERS_ONLY.test(badge.textContent || '');
            }
        },
        {
            // [v6.2 終極策略] 偵測兵策略，由下而上觸發移除整個區塊。
            // 判斷條件結合了「標題」和「內容」，確保萬無一失。
            name: 'PostSection',
            enabled: true,
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                // 判斷1: 檢查區塊標題 (快速路徑)
                const titleText = element.querySelector('#title, .title, #title-text')?.textContent;
                if (titleText && KEYWORDS.LATEST_POSTS.test(titleText)) {
                    return true;
                }
                // 判斷2: 檢查是否包含任何貼文內容 (可靠的偵測兵)
                return !!element.querySelector('ytd-post-renderer, ytd-backstage-post-renderer');
            }
        },
        {
            name: 'BreakingNewsSection',
            enabled: true,
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title')?.textContent;
                return !!titleText && KEYWORDS.BREAKING_NEWS.test(titleText);
            }
        },
        {
            name: 'Promo',
            enabled: true,
            selectors: [
                'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-shelf-renderer',
                'ytd-ad-slot-renderer', 'ytd-premium-promo-renderer', 'ytd-in-feed-ad-layout-renderer'
            ],
            condition: (element) => {
                // 將多個判斷合併為一個，直接測試整個元素的內文。更簡潔且覆蓋範圍更廣。
                return KEYWORDS.PREMIUM_PROMO.test(element.innerText || '');
            }
        },

        // --- 可選過濾模組 (已全部啟用) ---
        {
            name: 'ShortsSection',
            enabled: true, // 移除整個 Shorts 區塊
            selectors: ['ytd-rich-section-renderer', 'ytd-reel-shelf-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text')?.textContent?.trim();
                return !!titleText && KEYWORDS.SHORTS.test(titleText);
            }
        },
        {
            name: 'ForYouSection',
            enabled: true, // 移除「為你推薦」區塊
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text')?.textContent;
                return !!titleText && KEYWORDS.FOR_YOU.test(titleText);
            }
        },
        {
            name: 'MixesSection',
            enabled: true, // 移除「音樂合輯」區塊
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text')?.textContent;
                return !!titleText && KEYWORDS.MIXES.test(titleText);
            }
        }
    ];

    // --- 核心邏輯 (Core Logic) ---

    const activeConfigs = removalConfigs.filter(c => c.enabled);
    const allSelectors = [...new Set(activeConfigs.flatMap(c => c.selectors))].join(', ');

    /**
     * 處理單一容器元素，根據規則決定是否隱藏它。
     * @param {HTMLElement} element - 待處理的 DOM 元素。
     */
    const processContainer = (element) => {
        if (element.dataset.cleaned === 'true') return;

        for (const config of activeConfigs) {
            if (element.matches(config.selectors.join(', '))) {
                if (config.condition(element)) {
                    element.style.display = 'none';
                    element.dataset.cleaned = 'true';
                    // console.log(`[淨化大師] 已隱藏 "${config.name}":`, element);
                    return; // 一旦匹配並隱藏，就無需再檢查其他規則
                }
            }
        }
    };

    /**
     * 處理 "偵測兵" 元素，找到其父層容器並進行處理。
     * 這是一種由下而上的觸發策略。
     * @param {HTMLElement} triggerElement - 觸發檢查的內部元素 (例如: 一個貼文)。
     * @param {string} containerSelector - 要尋找的父層容器選擇器。
     */
    const processTrigger = (triggerElement, containerSelector) => {
        const container = triggerElement.closest(containerSelector);
        if (container) {
            processContainer(container);
        }
    };

    // --- 選擇器定義 (用於偵測兵策略) ---
    const postRendererSelector = 'ytd-post-renderer, ytd-backstage-post-renderer';

    // --- 執行與監控 (Execution & Monitoring) ---
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;

                // 策略1: 由上而下，檢查新增的節點本身或其子節點是否為目標容器
                if (addedNode.matches(allSelectors)) {
                    processContainer(addedNode);
                }
                addedNode.querySelectorAll(allSelectors).forEach(processContainer);

                // 策略2: 由下而上，檢查是否新增了 "偵測兵" (社群貼文)
                if (addedNode.matches(postRendererSelector)) {
                    processTrigger(addedNode, 'ytd-rich-section-renderer');
                }
                addedNode.querySelectorAll(postRendererSelector).forEach(post =>
                    processTrigger(post, 'ytd-rich-section-renderer')
                );
            }
        }
    });

    const run = () => {
        // 初始掃描，確保頁面加載時已存在的元素能被處理
        document.querySelectorAll(allSelectors).forEach(processContainer);
        console.log(`%cYouTube 首頁淨化大師 (v7.1 全功能啟用版) 已啟動`, 'color: #28a745; font-weight: bold;');

        // 啟動觀察器
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    };

    if (document.body) {
        run();
    } else {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    }

})();
