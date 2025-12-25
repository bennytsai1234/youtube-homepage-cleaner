// ==UserScript==
// @name         YouTube 淨化大師
// @namespace    http://tampermonkey.net/
// @version      1.5.3
// @description  為極致體驗而生的內容過濾器。v1.5.3 修復新分頁開啟問題，強化會員過濾。
// @author       Benny, AI Collaborators & The Final Optimizer
// @match        https://www.youtube.com/*
// @exclude      https://www.youtube.com/embed/*
// @grant        GM_info
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @run-at       document-start
// @license      MIT
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @downloadURL  https://raw.githubusercontent.com/bennytsai1234/youtube-homepage-cleaner/main/youtube-homepage-cleaner.user.js
// @updateURL    https://raw.githubusercontent.com/bennytsai1234/youtube-homepage-cleaner/main/youtube-homepage-cleaner.user.js
// ==/UserScript==

(function () {
    'use strict';

    /**
     * 🏛️ Architecture Overview
     * 1. ConfigManager: Unified state management for settings.
     * 2. Utils: Stateless helper functions (parsing, debouncing).
     * 3. Logger: centralized logging wrapper.
     * 4. StyleManager: Handles CSS injection for high-performance static filtering.
     * 5. AdBlockGuard: Specialized module for anti-adblock popup removal.
     * 6. VideoFilter: The core engine for Dynamic Filtering (View counts, etc).
     * 7. CustomRuleManager: Extensible rule system for easy adding of new text-based filters.
     * 8. UIManager: Handles the Tampermonkey menu interface.
     * 9. App: Application entry point and orchestrator.
     */

    // --- 1. Core: Configuration Management ---
    class ConfigManager {
        constructor() {
            this.defaults = {
                LOW_VIEW_THRESHOLD: 1000,
                ENABLE_LOW_VIEW_FILTER: true,
                DEBUG_MODE: false,
                OPEN_IN_NEW_TAB: true,
                ENABLE_KEYWORD_FILTER: false,
                KEYWORD_BLACKLIST: [],
                ENABLE_CHANNEL_FILTER: false,
                CHANNEL_BLACKLIST: [],
                ENABLE_DURATION_FILTER: false,
                DURATION_MIN: 0,
                DURATION_MAX: 0,
                GRACE_PERIOD_HOURS: 4,
                // These connect to simple toggle switches
                RULE_ENABLES: {
                    ad_block_popup: true, ad_sponsor: true, members_only: true, shorts_item: true,
                    mix_only: true, premium_banner: true, news_block: true, shorts_block: true,
                    posts_block: true, playables_block: true, fundraiser_block: true,
                    shorts_grid_shelf: true, movies_shelf: true,
                    youtube_featured_shelf: true, popular_gaming_shelf: true,
                    more_from_game_shelf: true, trending_playlist: true,
                    inline_survey: true, clarify_box: true, explore_topics: true
                }
            };
            this.state = this._load();
        }

        _load() {
            const get = (k, d) => GM_getValue(k, d);
            const snake = str => str.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);

            const loaded = {};
            for (const key in this.defaults) {
                if (key === 'RULE_ENABLES') {
                    const saved = get('ruleEnables', {});
                    loaded[key] = { ...this.defaults.RULE_ENABLES, ...saved };
                } else {
                    loaded[key] = get(snake(key), this.defaults[key]);
                    if (Array.isArray(this.defaults[key]) && !Array.isArray(loaded[key])) {
                        loaded[key] = [...this.defaults[key]];
                    }
                }
            }
            return loaded;
        }

        get(key) { return this.state[key]; }

        set(key, value) {
            this.state[key] = value;
            const snake = str => str.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
            if (key === 'RULE_ENABLES') GM_setValue('ruleEnables', value);
            else GM_setValue(snake(key), value);
        }

        toggleRule(ruleId) {
            this.state.RULE_ENABLES[ruleId] = !this.state.RULE_ENABLES[ruleId];
            this.set('RULE_ENABLES', this.state.RULE_ENABLES);
        }
    }

    // --- 2. Core: Utilities ---
    const Utils = {
        debounce: (func, delay) => {
            let t;
            return (...args) => { clearTimeout(t); t = setTimeout(() => func(...args), delay); };
        },

        parseNumeric: (text, type = 'any') => {
            if (!text) return null;
            const clean = text.replace(/,/g, '').toLowerCase().trim();
            if (type === 'view' && /(ago|前|hour|minute|day|week|month|year|秒|分|時|天|週|月|年)/.test(clean)) return null;

            const match = clean.match(/([\d.]+)\s*([kmb千萬万億亿])?/i);
            if (!match) return null;

            let num = parseFloat(match[1]);
            const unit = match[2];
            if (unit) {
                const map = { 'k': 1e3, 'm': 1e6, 'b': 1e9, '千': 1e3, '萬': 1e4, '万': 1e4, '億': 1e8, '亿': 1e8 };
                num *= (map[unit] || 1);
            }
            return Math.floor(num);
        },

        parseDuration: (text) => {
            if (!text) return null;
            const parts = text.trim().split(':').map(Number);
            if (parts.some(isNaN)) return null;
            return parts.length === 3
                ? parts[0] * 3600 + parts[1] * 60 + parts[2]
                : (parts.length === 2 ? parts[0] * 60 + parts[1] : null);
        },

        parseTimeAgo: (text) => {
            if (!text) return null;
            const raw = text.toLowerCase();
            if (raw.includes('second') || raw.includes('秒')) return 0;
            const match = raw.match(/(\d+)/);
            if (!match) return null;
            const val = parseInt(match[1], 10);
            if (raw.includes('minute') || raw.includes('分鐘')) return val;
            if (raw.includes('hour') || raw.includes('小時')) return val * 60;
            if (raw.includes('day') || raw.includes('天')) return val * 1440;
            if (raw.includes('week') || raw.includes('週')) return val * 10080;
            if (raw.includes('month') || raw.includes('月')) return val * 43200;
            if (raw.includes('year') || raw.includes('年')) return val * 525600;
            return null;
        },

        // 解析直播觀看數 (支援「正在觀看」「觀眾」等關鍵字)
        parseLiveViewers: (text) => {
            if (!text) return null;
            const liveKeywords = /(正在觀看|觀眾|watching|viewers)/i;
            if (!liveKeywords.test(text)) return null;
            return Utils.parseNumeric(text, 'any');
        },

        // 從 aria-label 提取觀看數資訊
        extractAriaTextForCounts: (container) => {
            const a1 = container.querySelector(':scope a#video-title-link[aria-label]');
            if (a1?.ariaLabel) return a1.ariaLabel;
            const a2 = container.querySelector(':scope a#thumbnail[aria-label]');
            if (a2?.ariaLabel) return a2.ariaLabel;
            return '';
        }
    };

    // --- 3. Core: Logger ---
    const Logger = {
        enabled: false,
        prefix: `[Purifier]`,
        info(msg, ...args) { if (this.enabled) console.log(`%c${this.prefix} ${msg}`, 'color:#3498db;font-weight:bold', ...args); },
        warn(msg, ...args) { if (this.enabled) console.warn(`${this.prefix} ${msg}`, ...args); }
    };

    // --- 4. Module: Custom Rule Manager (Extensibility) ---
    /**
     * Designed to make adding new simple text-based rules easy.
     * Add new entries to the `definitions` array here.
     */
    class CustomRuleManager {
        constructor(config) {
            this.config = config;
            // ★ ADD NEW RULES HERE ★
            // Format: { key: 'config_key_name', rules: [/Regex/i, 'String'], type: 'text' (default) }
            this.definitions = [
                { key: 'news_block', rules: [/新聞快報|Breaking News|ニュース/i] },
                { key: 'posts_block', rules: [/貼文|Posts|投稿|Publicaciones|最新 YouTube 貼文/i] },
                { key: 'playables_block', rules: [/Playables|遊戲角落/i] },
                { key: 'fundraiser_block', rules: [/Fundraiser|募款/i] },
                { key: 'popular_gaming_shelf', rules: [/熱門遊戲直播/i] },
                { key: 'explore_topics', rules: [/探索更多主題|Explore more topics/i] },
                { key: 'movies_shelf', rules: [/為你推薦的特選電影|featured movies/i] },
                { key: 'trending_playlist', rules: [/發燒影片|Trending/i] },
                { key: 'youtube_featured_shelf', rules: [/YouTube 精選/i] },
                { key: 'shorts_block', rules: [/^Shorts$/i] },
                { key: 'shorts_grid_shelf', rules: [/^Shorts$/i] },
                { key: 'more_from_game_shelf', rules: [/^更多此遊戲相關內容$/i] }
            ];
        }

        check(element, textContent) {
            const enables = this.config.get('RULE_ENABLES');
            for (const def of this.definitions) {
                if (enables[def.key]) { // Only check if enabled in config
                    for (const rule of def.rules) {
                        if (rule instanceof RegExp) {
                            if (rule.test(textContent)) return def.key;
                        } else if (textContent.includes(rule)) {
                            return def.key;
                        }
                    }
                }
            }
            return null;
        }
    }

    // --- 5. Module: Style Manager (CSS) ---
    class StyleManager {
        constructor(config) { this.config = config; }

        apply() {
            const rules = [];
            const enables = this.config.get('RULE_ENABLES');

            // 5.1 Global Fixes
            rules.push('body, html { font-family: "YouTube Noto", Roboto, Arial, "PingFang SC", "Microsoft YaHei", sans-serif !important; }');

            // 5.2 Anti-Adblock
            if (enables.ad_block_popup) {
                rules.push(`
                    tp-yt-paper-dialog:has(ytd-enforcement-message-view-model),
                    ytd-enforcement-message-view-model,
                    tp-yt-iron-overlay-backdrop:has(~ tp-yt-paper-dialog ytd-enforcement-message-view-model) { display: none !important; }
                    ytd-app:has(ytd-enforcement-message-view-model), body:has(ytd-enforcement-message-view-model) {
                        overflow: auto !important; position: static !important; pointer-events: auto !important;
                    }
                `);
            }

            // 5.3 Simple Selection (CSS)
            // ★ Add new Selector-based rules here
            const map = {
                ad_sponsor: [
                    'ytd-ad-slot-renderer',
                    'ytd-promoted-sparkles-text-search-renderer',
                    '#masthead-ad',
                    'ytd-rich-item-renderer:has(.ytd-ad-slot-renderer)',
                    'feed-ad-metadata-view-model',
                    'ad-badge-view-model'
                ],
                premium_banner: ['ytd-statement-banner-renderer', 'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)'],
                clarify_box: ['ytd-info-panel-container-renderer'],
                inline_survey: ['ytd-rich-section-renderer:has(ytd-inline-survey-renderer)'],
                playables_block: ['ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-playables])', 'ytd-game-card-renderer']
            };

            for (const [key, selectors] of Object.entries(map)) {
                if (enables[key]) rules.push(`${selectors.join(', ')} { display: none !important; }`);
            }

            // 5.4 Advanced :has() Rules
            // ★ Add new Container rules here
            const VIDEO_CONTAINERS = 'ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, yt-lockup-view-model';
            const hasRules = [
                { key: 'ad_sponsor', selector: '[aria-label*="廣告"], [aria-label*="Sponsor"], [aria-label="贊助商廣告"], ad-badge-view-model, feed-ad-metadata-view-model' },
                { key: 'members_only', selector: '[aria-label*="會員專屬"]' },
                { key: 'shorts_item', selector: 'a[href*="/shorts/"]' },
                { key: 'mix_only', selector: 'a[aria-label*="合輯"], a[aria-label*="Mix"]' }
            ];

            hasRules.forEach(({ key, selector }) => {
                if (enables[key]) {
                    const containers = VIDEO_CONTAINERS.split(',').map(s => s.trim());
                    containers.forEach(c => rules.push(`${c}:has(${selector}) { display: none !important; }`));
                }
            });

            GM_addStyle(rules.join('\n'));
            Logger.info('Static CSS rules injected');
        }
    }

    // --- 6. Module: AdBlock Guard (Enhanced with Whitelist) ---
    class AdBlockGuard {
        constructor() {
            // 多語言關鍵字偵測
            this.keywords = [
                'Ad blockers', '廣告攔截器', '广告拦截器', '広告ブロッカー', '광고 차단기',
                'Video player will be blocked', '影片播放器將被封鎖', '视频播放器将被封锁',
                'Allow YouTube', '允許 YouTube', '允许 YouTube',
                'You have an ad blocker', '您使用了廣告攔截器',
                'YouTube 禁止使用廣告攔截器', "YouTube doesn't allow ad blockers"
            ];
            // 白名單選擇器 - 這些對話框絕不是廣告警告
            this.whitelistSelectors = [
                'ytd-sponsorships-offer-renderer',   // 會員加入視窗
                'ytd-about-channel-renderer',         // 頻道資訊視窗
                'ytd-report-form-modal-renderer',     // 檢舉視窗
                'ytd-multi-page-menu-renderer',       // 通用選單
                'ytd-playlist-add-to-option-renderer' // 加入播放清單視窗
            ];
            this.lastTrigger = 0;
        }

        start() {
            const beat = () => {
                this.checkAndClean();
                setTimeout(() => requestAnimationFrame(beat), 800);
            };
            beat();
        }

        isWhitelisted(dialog) {
            for (const sel of this.whitelistSelectors) {
                if (dialog.querySelector(sel)) {
                    Logger.info(`✅ Whitelist dialog detected: ${sel}`);
                    return true;
                }
            }
            return false;
        }

        isAdBlockPopup(dialog) {
            // ytd-enforcement-message-view-model 是廣告攔截專屬標籤，直接判定
            if (dialog.tagName === 'YTD-ENFORCEMENT-MESSAGE-VIEW-MODEL') {
                return true;
            }
            // 檢查是否包含廣告攔截專屬標籤
            if (dialog.querySelector('ytd-enforcement-message-view-model')) {
                return true;
            }
            // 深度關鍵字檢查
            if (dialog.innerText && this.keywords.some(k => dialog.innerText.includes(k))) {
                return true;
            }
            return false;
        }

        checkAndClean() {
            const dialogs = document.querySelectorAll('tp-yt-paper-dialog, ytd-enforcement-message-view-model');
            let detected = false;

            for (const dialog of dialogs) {
                // ★ 白名單優先檢查 - 避免誤殺會員視窗等
                if (this.isWhitelisted(dialog)) continue;

                if (this.isAdBlockPopup(dialog)) {
                    // 嘗試點擊關閉按鈕
                    const dismissBtn = dialog.querySelector('[aria-label="Close"], #dismiss-button, [aria-label="可能有風險"]');
                    if (dismissBtn) dismissBtn.click();

                    dialog.remove();
                    detected = true;
                    Logger.info(`🚫 Removed AdBlock Popup: ${dialog.tagName}`);
                }
            }

            if (detected) {
                // 移除背景遮罩
                document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach(b => {
                    b.style.display = 'none';
                    b.remove();
                });
                this.unlockScroll();
                this.resumeVideo();
            }
        }

        unlockScroll() {
            const css = (el, props) => {
                if (!el) return;
                for (const [key, val] of Object.entries(props)) {
                    el.style.setProperty(key, val, 'important');
                }
            };

            const allowScrollProps = {
                'overflow-y': 'auto',
                'overflow-x': 'hidden',
                'position': 'static',
                'pointer-events': 'auto',
                'top': 'auto',
                'display': 'block'
            };

            css(document.body, allowScrollProps);
            css(document.documentElement, allowScrollProps);

            const ytdApp = document.querySelector('ytd-app');
            if (ytdApp) {
                css(ytdApp, allowScrollProps);
                ytdApp.removeAttribute('aria-hidden');
            }

            // 移除播放器模糊效果
            const watchPage = document.querySelector('ytd-watch-flexy');
            if (watchPage) {
                watchPage.style.removeProperty('filter');
            }
        }

        resumeVideo() {
            // 只有剛偵測到彈窗時才強制播放，避免過度積極
            if (Date.now() - this.lastTrigger > 3000) {
                this.lastTrigger = Date.now();
                const video = document.querySelector('video');
                if (video && video.paused && !video.ended) {
                    video.play().catch(() => { });
                }
            }
        }
    }

    // --- 7. Module: Video Filter (Lazy Evaluator) ---
    class LazyVideoData {
        constructor(element) {
            this.el = element;
            this._title = null;
            this._channel = null;
            this._viewCount = undefined;
            this._liveViewers = undefined;
            this._timeAgo = undefined;
            this._duration = undefined;
        }

        get title() {
            if (this._title === null) this._title = this.el.querySelector('#video-title, .yt-lockup-metadata-view-model__title')?.textContent?.trim() || '';
            return this._title;
        }
        get channel() {
            if (this._channel === null) this._channel = this.el.querySelector('ytd-channel-name, .ytd-channel-name')?.textContent?.trim() || '';
            return this._channel;
        }
        _parseMetadata() {
            if (this._viewCount !== undefined) return;
            const texts = Array.from(this.el.querySelectorAll('.inline-metadata-item, #metadata-line span'));

            // 嘗試從 aria-label 提取
            const aria = Utils.extractAriaTextForCounts(this.el);
            if (texts.length === 0 && aria) {
                this._viewCount = Utils.parseNumeric(aria, 'view');
                this._liveViewers = Utils.parseLiveViewers(aria);
                this._timeAgo = Utils.parseTimeAgo(aria);
                return;
            }

            this._viewCount = null;
            this._liveViewers = null;
            this._timeAgo = null;

            for (const t of texts) {
                const text = t.textContent;
                // 直播觀看數優先檢查
                if (this._liveViewers === null) this._liveViewers = Utils.parseLiveViewers(text);
                // 一般觀看數
                if (this._viewCount === null && /view|觀看|次/i.test(text)) this._viewCount = Utils.parseNumeric(text, 'view');
                // 時間
                if (this._timeAgo === null && /ago|前/i.test(text)) this._timeAgo = Utils.parseTimeAgo(text);
            }
        }
        get viewCount() { this._parseMetadata(); return this._viewCount; }
        get liveViewers() { this._parseMetadata(); return this._liveViewers; }
        get timeAgo() { this._parseMetadata(); return this._timeAgo; }
        get duration() {
            if (this._duration === undefined) {
                const el = this.el.querySelector('ytd-thumbnail-overlay-time-status-renderer, span.ytd-thumbnail-overlay-time-status-renderer');
                this._duration = el ? Utils.parseDuration(el.textContent) : null;
            }
            return this._duration;
        }
        get isShorts() { return !!this.el.querySelector('a[href*="/shorts/"]'); }
        get isLive() { return this._liveViewers !== null; }
        get isMembers() {
            return this.el.querySelector('.badge-style-type-members-only') ||
                this.el.innerText.includes('會員專屬') ||
                this.el.innerText.includes('Members only');
        }
    }

    class VideoFilter {
        constructor(config) {
            this.config = config;
            // 7.1 Extend here for more complex logic if needed
            this.customRules = new CustomRuleManager(config);
            this.selectors = [
                'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer',
                'ytd-grid-video-renderer', 'yt-lockup-view-model', 'ytd-rich-section-renderer'
            ].join(',');
        }

        processPage() {
            const elements = document.querySelectorAll(this.selectors);
            for (const el of elements) this.processElement(el);
        }

        processElement(element) {
            if (element.dataset.ypChecked) return;
            if (element.offsetParent === null) return;

            // 7.2 Custom Text Rules Check (Extensible)
            const textRule = this.customRules.check(element, element.innerText);
            if (textRule) return this._hide(element, textRule);

            // 7.3 Base Logic
            if (element.tagName.includes('VIDEO') || element.tagName.includes('LOCKUP') || element.tagName.includes('RICH-ITEM')) {
                const item = new LazyVideoData(element);

                // Advanced Filters
                // Advanced Filters
                if (this.config.get('ENABLE_KEYWORD_FILTER') && item.title) {
                    if (this.config.get('KEYWORD_BLACKLIST').some(k => item.title.toLowerCase().includes(k.toLowerCase()))) return this._hide(element, 'keyword_blacklist');
                }
                if (this.config.get('ENABLE_CHANNEL_FILTER') && item.channel) {
                    if (this.config.get('CHANNEL_BLACKLIST').some(k => item.channel.toLowerCase().includes(k.toLowerCase()))) return this._hide(element, 'channel_blacklist');
                }

                // 強化會員過濾 (JS補刀)：若開啟成員過濾且偵測到是會員影片，直接隱藏
                if (this.config.get('RULE_ENABLES').members_only && item.isMembers) {
                    return this._hide(element, 'members_only_js');
                }

                if (this.config.get('ENABLE_LOW_VIEW_FILTER') && !item.isShorts) {
                    const th = this.config.get('LOW_VIEW_THRESHOLD');
                    const grace = this.config.get('GRACE_PERIOD_HOURS') * 60;

                    // 直播觀看數過濾 (不受豁免期限制)
                    if (item.isLive && item.liveViewers !== null && item.liveViewers < th) {
                        return this._hide(element, 'low_viewer_live');
                    }

                    // 一般影片觀看數過濾 (受豁免期限制)
                    if (!item.isLive && item.viewCount !== null && item.timeAgo !== null && item.timeAgo > grace && item.viewCount < th) {
                        return this._hide(element, 'low_view');
                    }
                }

                if (this.config.get('ENABLE_DURATION_FILTER') && !item.isShorts && item.duration !== null) {
                    const min = this.config.get('DURATION_MIN');
                    const max = this.config.get('DURATION_MAX');
                    if ((min > 0 && item.duration < min) || (max > 0 && item.duration > max)) return this._hide(element, 'duration_filter');
                }
            }
            element.dataset.ypChecked = 'true';
        }

        _hide(element, reason) {
            element.style.display = 'none';
            element.dataset.ypHidden = reason;
            Logger.info(`Hidden [${reason}]`, element);
        }

        reset() {
            document.querySelectorAll('[data-yp-hidden]').forEach(el => {
                el.style.display = '';
                delete el.dataset.ypHidden;
                delete el.dataset.ypChecked;
            });
        }
    }

    // --- 8. Module: Interaction Enhancer ---
    class InteractionEnhancer {
        constructor(config) { this.config = config; }
        init() {
            document.addEventListener('click', (e) => {
                if (!this.config.get('OPEN_IN_NEW_TAB')) return;
                if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                if (e.target.closest('button, #menu, ytd-menu-renderer, yt-icon-button')) return;
                const link = e.target.closest('a');
                if (!link || !link.href) return;
                const url = new URL(link.href);
                // 擴充容器支援 (支援側邊欄 ytd-compact-video-renderer, 新版 yt-lockup-view-model, 播放清單)
                const container = e.target.closest('ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model, ytd-playlist-renderer, ytd-compact-playlist-renderer');
                if ((url.pathname.startsWith('/watch') || url.pathname.startsWith('/shorts') || url.pathname.startsWith('/playlist')) && container) {
                    e.preventDefault(); e.stopImmediatePropagation(); window.open(link.href, '_blank');
                }
            }, { capture: true });
        }
    }

    // --- 9. Module: UI Manager ---
    class UIManager {
        constructor(config, onRefresh) { this.config = config; this.onRefresh = onRefresh; }
        showMainMenu() {
            const i = (k) => this.config.get(k) ? '✅' : '❌';
            const choice = prompt(`【 YouTube 淨化大師 v1.5.3 】\n\n1. 📂 設定過濾規則\n2. ${i('ENABLE_LOW_VIEW_FILTER')} 低觀看數過濾 (含直播)\n3. 🔢 設定閾值 (${this.config.get('LOW_VIEW_THRESHOLD')})\n4. 🚫 進階過濾\n5. ${i('OPEN_IN_NEW_TAB')} 強制新分頁\n6. ${i('DEBUG_MODE')} Debug\n7. 🔄 恢復預設\n\n輸入選項:`);
            if (choice) this.handleMenu(choice);
        }
        handleMenu(c) {
            switch (c.trim()) {
                case '1': this.showRuleMenu(); break;
                case '2': this.toggle('ENABLE_LOW_VIEW_FILTER'); break;
                case '3': const v = prompt('閾值:'); if (v) this.update('LOW_VIEW_THRESHOLD', Number(v)); break;
                case '4': this.showAdvancedMenu(); break;
                case '5': this.toggle('OPEN_IN_NEW_TAB'); break;
                case '6': this.toggle('DEBUG_MODE'); break;
                case '7': if (confirm('重設?')) { Object.keys(this.config.defaults).forEach(k => this.config.set(k, this.config.defaults[k])); this.update('', null); } break;
            }
        }
        showRuleMenu() {
            const r = this.config.get('RULE_ENABLES'); const k = Object.keys(r);
            const c = prompt('【 過濾規則 】(0 返回)\n' + k.map((key, i) => `${i + 1}. [${r[key] ? '✅' : '❌'}] ${key}`).join('\n'));
            if (c && c !== '0') { this.config.toggleRule(k[parseInt(c) - 1]); this.onRefresh(); this.showRuleMenu(); } else if (c === '0') this.showMainMenu();
        }
        showAdvancedMenu() {
            const i = (k) => this.config.get(k) ? '✅' : '❌';
            const c = prompt(`1. ${i('ENABLE_KEYWORD_FILTER')} 關鍵字過濾\n2. ✏️ 關鍵字清單\n3. ${i('ENABLE_CHANNEL_FILTER')} 頻道過濾\n4. ✏️ 頻道清單\n5. ${i('ENABLE_DURATION_FILTER')} 長度過濾\n6. ⏱️ 設定長度\n0. 返回`);
            if (c === '1' || c === '3' || c === '5') this.toggle(c === '1' ? 'ENABLE_KEYWORD_FILTER' : c === '3' ? 'ENABLE_CHANNEL_FILTER' : 'ENABLE_DURATION_FILTER', true);
            else if (c === '2') this.manage('KEYWORD_BLACKLIST', '關鍵字');
            else if (c === '4') this.manage('CHANNEL_BLACKLIST', '頻道');
            else if (c === '6') {
                const min = prompt('最短(分):'); const max = prompt('最長(分):');
                if (min) this.config.set('DURATION_MIN', min * 60);
                if (max) this.config.set('DURATION_MAX', max * 60);
                this.onRefresh(); this.showAdvancedMenu();
            } else if (c === '0') this.showMainMenu();
        }
        manage(k, n) {
            const l = this.config.get(k);
            const c = prompt(`[${l.join(', ')}]\n1.新增 2.刪除 3.清空 0.返回`);
            if (c === '1') { const v = prompt('新增:'); if (v) this.config.set(k, [...l, ...v.split(',')]); }
            if (c === '2') { const v = prompt('刪除:'); if (v) this.config.set(k, l.filter(i => i !== v)); }
            if (c === '3') this.config.set(k, []);
            this.onRefresh(); this.showAdvancedMenu();
        }
        toggle(k, adv) { this.config.set(k, !this.config.get(k)); this.onRefresh(); adv ? this.showAdvancedMenu() : this.showMainMenu(); }
        update(k, v) { if (k) this.config.set(k, v); this.onRefresh(); this.showMainMenu(); }
    }

    // --- 10. App Entry ---
    class App {
        constructor() {
            this.config = new ConfigManager();
            this.styleManager = new StyleManager(this.config);
            this.adGuard = new AdBlockGuard();
            this.filter = new VideoFilter(this.config);
            this.enhancer = new InteractionEnhancer(this.config);
            this.ui = new UIManager(this.config, () => this.refresh());
        }

        // **ANTI-ADBLOCK PATCH**: 透過 YouTube 自身的配置對象來阻止偵測
        patchYouTubeConfig() {
            try {
                const config = window.yt?.config_ || window.ytcfg?.data_;
                if (config?.openPopupConfig?.supportedPopups?.adBlockMessageViewModel) {
                    config.openPopupConfig.supportedPopups.adBlockMessageViewModel = false;
                }
                if (config?.EXPERIMENT_FLAGS) {
                    config.EXPERIMENT_FLAGS.ad_blocker_notifications_disabled = true;
                    config.EXPERIMENT_FLAGS.web_enable_adblock_detection_block_playback = false;
                }
            } catch (e) {
                // 忽略錯誤
            }
        }

        init() {
            Logger.enabled = this.config.get('DEBUG_MODE');

            // 先嘗試 patch YouTube 配置
            this.patchYouTubeConfig();

            this.styleManager.apply();
            this.adGuard.start();
            this.enhancer.init();
            GM_registerMenuCommand('⚙️ 淨化大師設定', () => this.ui.showMainMenu());

            const obs = new MutationObserver(Utils.debounce(() => this.filter.processPage(), 100));
            obs.observe(document.body, { childList: true, subtree: true });

            window.addEventListener('yt-navigate-finish', () => {
                this.patchYouTubeConfig(); // 每次導航後重新 patch
                this.filter.processPage();
                this.adGuard.checkAndClean();
            });

            this.filter.processPage();
            Logger.info(`🚀 YouTube 淨化大師 v1.5.3 啟動`);
        }

        refresh() {
            Logger.enabled = this.config.get('DEBUG_MODE');
            this.filter.reset();
            this.styleManager.apply();
            this.filter.processPage();
        }
    }

    // 防止腳本重複初始化
    if (window.ytPurifierInitialized) return;
    window.ytPurifierInitialized = true;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new App().init());
    else new App().init();

})();
