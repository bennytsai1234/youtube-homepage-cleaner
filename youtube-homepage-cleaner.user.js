// ==UserScript==
// @name         YouTube 首頁淨化大師 (v7.2 全功能啟用版 - 會員影片強化)
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  基於 v7.1，強化會員影片過濾邏輯，預設啟用所有過濾模組。提供最全面的首頁淨化體驗，強力抵抗 YouTube 介面改版。
// @author       Benny (v6.2) & Gemini (v7.1 Refactor, v7.2 Enhance)
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
        MEMBERS_ONLY: /頻道會員專屬|Members only|频道会员专属|メンバー限定|멤버 전용|Nur für Mitglieder|會員專屬|Member-only|회원용 동영상|メンバー限定コンテンツ/i, // 增加了幾個常見變體
        LATEST_POSTS: /最新( YouTube )?貼文|Latest posts/i,
        BREAKING_NEWS: /新聞快報|Breaking news/i,
        PREMIUM_PROMO: /YouTube (Music )?Premium|免費試用|零廣告|無廣告|進階版|ad-free YouTube|Get YouTube Premium/i,
        SHORTS: /^Shorts$/i,
        FOR_YOU: /為你推薦|For you/i,
        MIXES: /合輯|Mixes/i // 根據上次建議修改
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
                'ytd-grid-video-renderer', 'ytd-compact-video-renderer',
                'ytd-playlist-panel-video-renderer' // 播放列表中的影片項
            ],
            condition: (element) => {
                // 策略 1: 檢查元素本身或其子元素中所有 aria-label
                const ariaLabelElements = [element, ...element.querySelectorAll('[aria-label]')];
                for (const el of ariaLabelElements) {
                    if (el.ariaLabel && KEYWORDS.MEMBERS_ONLY.test(el.ariaLabel)) {
                        // console.log(`[淨化大師] MemberOnlyVideo by aria-label: "${el.ariaLabel}" on`, el);
                        return true;
                    }
                }

                // 策略 2: 檢查特定的徽章元素 (ytd-badge-supported-renderer)
                // 這些徽章通常包含一個圖標和/或文本
                const badges = element.querySelectorAll('ytd-badge-supported-renderer');
                for (const badge of badges) {
                    // 徽章本身可能帶有 aria-label
                    if (badge.ariaLabel && KEYWORDS.MEMBERS_ONLY.test(badge.ariaLabel)) {
                        // console.log(`[淨化大師] MemberOnlyVideo by badge aria-label: "${badge.ariaLabel}" on`, badge);
                        return true;
                    }
                    // 檢查徽章內的文本 (通常在特定子元素中)
                    // #text or .ytd-badge-supported-renderer for text content in badge
                    const badgeTextContent = badge.querySelector('#text, .badge-text, span'); // 嘗試多種可能的內部文本選擇器
                    if (badgeTextContent && badgeTextContent.textContent && KEYWORDS.MEMBERS_ONLY.test(badgeTextContent.textContent.trim())) {
                        // console.log(`[淨化大師] MemberOnlyVideo by badge text: "${badgeTextContent.textContent.trim()}" on`, badgeTextContent);
                        return true;
                    }
                    // 有些徽章可能直接將文本作為textContent，但不包含在子元素 (較少見)
                    if (KEYWORDS.MEMBERS_ONLY.test(badge.textContent?.trim() || '')) {
                        // console.log(`[淨化大師] MemberOnlyVideo by direct badge text: "${badge.textContent?.trim()}" on`, badge);
                        return true;
                    }
                }

                // 策略 3: 檢查影片縮圖上的覆蓋層文字
                // 例如 "ytd-thumbnail-overlay-time-status-renderer" 或其他覆蓋層
                const overlayTexts = element.querySelectorAll(
                    'ytd-thumbnail-overlay-time-status-renderer span, ' + // 舊版時間狀態也可能被用來顯示文字
                    '.ytd-thumbnail-overlay-bottom-panel-renderer #text, ' + // 底部面板文字
                    '#video-title-overlay' // 標題覆蓋層
                );
                for (const overlayTextElement of overlayTexts) {
                    if (overlayTextElement.textContent && KEYWORDS.MEMBERS_ONLY.test(overlayTextElement.textContent.trim())) {
                        // console.log(`[淨化大師] MemberOnlyVideo by overlay text: "${overlayTextElement.textContent.trim()}" on`, overlayTextElement);
                        return true;
                    }
                }

                // 策略 4: 檢查是否有特定的 "Members only" 相關的 class name (較少見，但以防萬一)
                // 這需要觀察實際的 class name，此處為假設
                // const memberClasses = ['member-video', 'members-only-content'];
                // if (memberClasses.some(cls => element.classList.contains(cls))) {
                //     return true;
                // }

                return false;
            }
        },
        {
            name: 'PostSection',
            enabled: true,
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text')?.textContent;
                if (titleText && KEYWORDS.LATEST_POSTS.test(titleText)) {
                    return true;
                }
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
                'ytd-ad-slot-renderer', 'ytd-premium-promo-renderer', 'ytd-in-feed-ad-layout-renderer',
                'ytm-companion-ad-renderer' // 行動版廣告？ (以防萬一)
            ],
            condition: (element) => {
                return KEYWORDS.PREMIUM_PROMO.test(element.innerText || element.textContent || ''); // textContent 效率稍高
            }
        },
        {
            name: 'ShortsSection',
            enabled: true,
            selectors: ['ytd-rich-section-renderer', 'ytd-reel-shelf-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text, .ytd-reel-shelf-renderer #title')?.textContent?.trim();
                return !!titleText && KEYWORDS.SHORTS.test(titleText);
            }
        },
        {
            name: 'ForYouSection',
            enabled: true,
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text')?.textContent;
                return !!titleText && KEYWORDS.FOR_YOU.test(titleText);
            }
        },
        {
            name: 'MixesSection',
            enabled: true,
            selectors: ['ytd-rich-section-renderer', 'ytd-shelf-renderer[is-playlist-shelf=""]'], // 有些合輯是 shelf-renderer
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text, #shelf-title')?.textContent;
                return !!titleText && KEYWORDS.MIXES.test(titleText);
            }
        }
    ];

    // --- 核心邏輯 (Core Logic) ---

    const activeConfigs = removalConfigs.filter(c => c.enabled);
    const allSelectors = [...new Set(activeConfigs.flatMap(c => c.selectors))].join(', ');

    const processContainer = (element) => {
        if (element.dataset.cleaned === 'true') return;

        for (const config of activeConfigs) {
            // 檢查節點是否匹配當前規則的選擇器
            let matchesSelector = false;
            for (const selector of config.selectors) {
                if (element.matches(selector)) {
                    matchesSelector = true;
                    break;
                }
            }

            if (matchesSelector) {
                if (config.condition(element)) {
                    element.style.display = 'none';
                    element.dataset.cleaned = 'true';
                    // console.log(`[淨化大師 v${GM_info.script.version}] 已隱藏 "${config.name}":`, element.id || element.tagName);
                    return;
                }
            }
        }
    };

    const processTrigger = (triggerElement, containerSelector) => {
        const container = triggerElement.closest(containerSelector);
        if (container) {
            processContainer(container);
        }
    };

    const postRendererSelector = 'ytd-post-renderer, ytd-backstage-post-renderer';

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const addedNode of mutation.addedNodes) {
                if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;

                const elementNode = addedNode; // 類型斷言，因為已檢查 nodeType

                if (allSelectors && elementNode.matches(allSelectors)) {
                    processContainer(elementNode);
                }
                if (allSelectors) {
                    elementNode.querySelectorAll(allSelectors).forEach(processContainer);
                }

                if (elementNode.matches(postRendererSelector)) {
                    processTrigger(elementNode, 'ytd-rich-section-renderer');
                }
                elementNode.querySelectorAll(postRendererSelector).forEach(post =>
                    processTrigger(post, 'ytd-rich-section-renderer')
                );
            }
        }
    });

    const run = () => {
        if (allSelectors) { // 只有在有活動選擇器時才執行初始掃描
            document.querySelectorAll(allSelectors).forEach(processContainer);
        }
        // 使用 GM_info (如果可用) 來獲取腳本版本，否則使用硬編碼
        const scriptVersion = (typeof GM_info !== 'undefined' && GM_info.script) ? GM_info.script.version : '7.2';
        console.log(`%cYouTube 首頁淨化大師 (v${scriptVersion}) 已啟動`, 'color: #28a745; font-weight: bold;');

        observer.observe(document.documentElement || document.body, { // 觀察 documentElement 更早
            childList: true,
            subtree: true
        });
    };

    if (document.body) {
        run();
    } else {
        // 使用 @run-at document-start 時，DOMContentLoaded 可能太晚
        // 可以考慮更早的 MutationObserver 設置或 requestAnimationFrame 循環檢查 body
        const earlyRun = () => {
            if (document.body) {
                run();
            } else {
                requestAnimationFrame(earlyRun);
            }
        };
        requestAnimationFrame(earlyRun);
    }

})();
