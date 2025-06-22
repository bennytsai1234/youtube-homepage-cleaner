// ==UserScript==
// @name         YouTube 首頁淨化大師 (v7.6 - 終極時機修正版)
// @namespace    http://tampermonkey.net/
// @version      7.6
// @description  採用更穩健的策略，直接監聽會員徽章的出現來進行過濾，徹底解決動態渲染的時機問題。
// @author       Benny (v6.2) & Gemini (v7.6 Refactor)
// @match        https://www.youtube.com/*
// @grant        GM_info
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// ==/UserScript==

(function () {
    'use strict';

    // --- 設定區 ---

    // 會員影片的獨特標記 (CSS 選擇器)
    const MEMBER_BADGE_SELECTOR = '.badge-style-type-members-only, [aria-label*="會員專屬"], [aria-label*="Members only"]';

    // 需要隱藏的影片卡片容器標籤列表
    const VIDEO_ITEM_SELECTORS = [
        'ytd-rich-item-renderer',
        'ytd-grid-video-renderer',
        'ytd-video-renderer',
        'ytd-compact-video-renderer',
        'ytd-playlist-panel-video-renderer',
        'ytd-item-section-renderer',
        'ytd-feed-entry-renderer'
    ].join(','); // 組合成單一選擇器字串，方便 .closest() 使用

    const KEYWORDS = {
        LATEST_POSTS: /最新( YouTube )?貼文|Latest posts/i,
        BREAKING_NEWS: /新聞快報|Breaking news/i,
        PREMIUM_PROMO: /YouTube (Music )?Premium|免費試用|零廣告|無廣告|進階版|ad-free YouTube|Get YouTube Premium/i,
        SHORTS: /^Shorts$/i,
        FOR_YOU: /為你推薦|For you/i,
        MIXES: /合輯|Mixes/i
    };

    /** @type {Map<string, {selectors: string[], condition: (el: HTMLElement) => boolean}>} */
    const otherRules = new Map([
        ['PostSection', {
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text, yt-formatted-string.ytd-rich-shelf-renderer#title')?.textContent?.trim();
                if (titleText && KEYWORDS.LATEST_POSTS.test(titleText)) return true;
                return !!element.querySelector('ytd-post-renderer, ytd-backstage-post-renderer');
            }
        }],
        ['BreakingNewsSection', {
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, yt-formatted-string.ytd-rich-shelf-renderer#title')?.textContent?.trim();
                return !!titleText && KEYWORDS.BREAKING_NEWS.test(titleText);
            }
        }],
        ['Promo', {
            selectors: [
                'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-shelf-renderer',
                'ytd-ad-slot-renderer', 'ytd-promoted-sparkles-text-search-renderer',
                'ytd-premium-promo-renderer', 'ytd-in-feed-ad-layout-renderer',
                'ytm-companion-ad-renderer', 'ytd-action-companion-ad-renderer',
                'ytd-display-ad-renderer', 'ytm-promoted-sparkles-text-search-renderer'
            ],
            condition: (element) => {
                if (element.querySelector(MEMBER_BADGE_SELECTOR)) return false; // 如果是會員影片，讓會員規則處理
                const adBadge = element.querySelector('ytd-ad-badge-renderer, .ytp-ad-text, .ytp-ad-button, [class*="ad-badge"], [aria-label*="廣告"], [aria-label*="Sponsor"]');
                if (adBadge) return true;
                return KEYWORDS.PREMIUM_PROMO.test(element.textContent || '');
            }
        }],
        ['ShortsSection', {
            selectors: ['ytd-rich-section-renderer', 'ytd-reel-shelf-renderer'],
            condition: (element) => {
                const titleElement = element.querySelector('#title a, yt-formatted-string#title.ytd-reel-shelf-renderer, h2.ytd-rich-shelf-renderer > yt-formatted-string#title, yt-formatted-string[slot="title"], #title');
                return !!titleElement?.textContent?.trim().match(KEYWORDS.SHORTS);
            }
        }],
        ['ForYouSection', {
            selectors: ['ytd-rich-section-renderer'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text, yt-formatted-string.ytd-rich-shelf-renderer#title')?.textContent?.trim();
                return !!titleText && KEYWORDS.FOR_YOU.test(titleText);
            }
        }],
        ['MixesSection', {
            selectors: ['ytd-rich-section-renderer', 'ytd-shelf-renderer[class*="grid-playlist"]', 'ytd-compact-playlist-renderer', 'ytd-playlist-renderer[is-mixed-playlist]'],
            condition: (element) => {
                const titleText = element.querySelector('#title, .title, #title-text, #shelf-title, #playlist-title, .playlist-title')?.textContent?.trim();
                return !!titleText && KEYWORDS.MIXES.test(titleText);
            }
        }]
    ]);

    const allOtherSelectors = [...new Set([...otherRules.values()].flatMap(r => r.selectors))].join(',');

    // --- 核心邏輯 ---
    const getScriptInfo = () => {
        try {
            return { version: GM_info.script.version || 'N/A', name: GM_info.script.name || 'YouTube Purifier' };
        } catch (e) {
            return { version: 'N/A (GM_info missing)', name: 'YouTube Purifier (standalone)' };
        }
    };
    const SCRIPT_INFO = getScriptInfo();
    const processedElements = new WeakSet();

    // === v7.6 核心函數：處理會員影片 ===
    const handleMemberVideos = (node) => {
        // 如果傳入的節點本身就是徽章，或包含徽章
        const badges = node.matches(MEMBER_BADGE_SELECTOR) ? [node] : node.querySelectorAll(MEMBER_BADGE_SELECTOR);
        badges.forEach(badge => {
            const videoItem = badge.closest(VIDEO_ITEM_SELECTORS);
            if (videoItem && !processedElements.has(videoItem)) {
                videoItem.style.display = 'none';
                processedElements.add(videoItem);
                const videoTitle = videoItem.querySelector('#video-title')?.textContent?.trim() || '未知影片';
                console.log(`[淨化大師 v${SCRIPT_INFO.version}] 隱藏會員影片: "${videoTitle}"`);
            }
        });
    };

    // 處理其他淨化規則
    const handleOtherRules = (node) => {
        const elements = node.matches(allOtherSelectors) ? [node] : node.querySelectorAll(allOtherSelectors);
        elements.forEach(element => {
            if (processedElements.has(element)) return;

            for (const [name, rule] of otherRules.entries()) {
                if (rule.selectors.some(selector => element.matches(selector))) {
                    if (rule.condition(element)) {
                        element.style.display = 'none';
                        processedElements.add(element);
                        console.log(`[淨化大師 v${SCRIPT_INFO.version}] 隱藏 "${name}":`, element.id || element.tagName);
                        break; // 處理完畢，跳出內層循環
                    }
                }
            }
        });
    };


    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const addedNode of mutation.addedNodes) {
                    if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;

                    // === v7.6 核心改動：優先處理會員影片 ===
                    // 這種方法直接捕捉徽章的出現，更為可靠
                    handleMemberVideos(addedNode);

                    // 接著處理其他規則
                    if (allOtherSelectors) {
                        handleOtherRules(addedNode);
                    }
                }
            }
        }
    });

    const run = () => {
        console.log(`%c[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}] 初始化，掃描現有元素...`, 'color: #28a745;');

        // 初始掃描
        handleMemberVideos(document.body);
        if (allOtherSelectors) {
            handleOtherRules(document.body);
        }

        console.log(`%c[${SCRIPT_INFO.name} v${SCRIPT_INFO.version}] 初始掃描完成，開始監控頁面變化。`, 'color: #28a745; font-weight: bold;');
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();
