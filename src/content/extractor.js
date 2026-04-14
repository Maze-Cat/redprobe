// ============================================================
// 红探 RedProbe — Content Script (小红书 DOM 提取)
// ============================================================

// Guard against double-injection (manifest + scripting.executeScript)
if (window.__REDPROBE_LOADED__) { /* already running */ } else {
window.__REDPROBE_LOADED__ = true;

(() => {
  'use strict';

  // ---- Page Type Detection ----
  function detectPageType() {
    const url = window.location.href;
    if (url.includes('/explore/') || url.includes('/discovery/item/')) {
      return 'post';
    }
    if (url.includes('/search_result')) {
      return 'search';
    }
    // Check if a post modal is open (XHS opens posts as overlays)
    const noteOverlay = document.querySelector('.note-detail-mask, .note-detail-modal, [class*="note-detail"]');
    if (noteOverlay) {
      return 'post';
    }
    return 'unknown';
  }

  // ---- Post Extraction ----
  function extractPostContent() {
    const data = { title: '', body: '', comments: [], commentCount: 0 };

    // Try multiple selectors — XHS changes class names frequently
    const titleSelectors = [
      '#detail-title',
      '.title',
      '[class*="title"]',
      '.note-content .title',
    ];

    const bodySelectors = [
      '#detail-desc .note-text',
      '.note-text',
      '.content',
      '.desc',
      '[class*="note-content"] [class*="desc"]',
      '[class*="note-text"]',
    ];

    for (const sel of titleSelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        data.title = el.textContent.trim();
        break;
      }
    }

    for (const sel of bodySelectors) {
      const el = document.querySelector(sel);
      if (el?.textContent?.trim()) {
        data.body = el.textContent.trim();
        break;
      }
    }

    // If no title found via selectors, try meta tags
    if (!data.title) {
      const metaTitle = document.querySelector('meta[name="og:title"], meta[property="og:title"]');
      if (metaTitle) data.title = metaTitle.content;
    }

    // Extract comments
    data.comments = extractComments();
    data.commentCount = data.comments.length;

    return data;
  }

  function extractComments() {
    const comments = [];
    const seen = new Set();

    // Multiple comment selectors for resilience
    const commentSelectors = [
      '.comment-item .content',
      '.comment-item .text',
      '[class*="comment"] [class*="content"]',
      '[class*="commentItem"] [class*="content"]',
      '.comments-container .content',
      '.note-comment .content',
    ];

    // Also try a broader approach: find all elements in the comments section
    const commentContainers = document.querySelectorAll(
      '.comments-container, .comment-list, [class*="commentList"], [class*="comments-container"]'
    );

    // Method 1: Specific selectors
    for (const sel of commentSelectors) {
      const els = document.querySelectorAll(sel);
      els.forEach(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 1 && !seen.has(text)) {
          seen.add(text);
          comments.push(text);
        }
      });
      if (comments.length > 0) break;
    }

    // Method 2: Traverse comment containers
    if (comments.length === 0 && commentContainers.length > 0) {
      commentContainers.forEach(container => {
        // Look for individual comment items
        const items = container.querySelectorAll('[class*="item"], [class*="comment"]');
        items.forEach(item => {
          const textEl = item.querySelector('[class*="content"], [class*="text"], p, span');
          if (textEl) {
            const text = textEl.textContent?.trim();
            if (text && text.length > 2 && !seen.has(text)) {
              seen.add(text);
              comments.push(text);
            }
          }
        });
      });
    }

    // Method 3: Last resort — look for any comment-like text blocks
    if (comments.length === 0) {
      const allCommentish = document.querySelectorAll('[class*="comment"]');
      allCommentish.forEach(el => {
        if (el.children.length < 5) {
          const text = el.textContent?.trim();
          if (text && text.length > 5 && text.length < 500 && !seen.has(text)) {
            seen.add(text);
            comments.push(text);
          }
        }
      });
    }

    return comments;
  }

  // ---- Search Results Extraction ----
  function extractSearchResults() {
    const posts = [];
    const seen = new Set();

    // Get search keyword from URL or page
    let keyword = '';
    const urlParams = new URLSearchParams(window.location.search);
    keyword = urlParams.get('keyword') || urlParams.get('q') || '';

    if (!keyword) {
      const searchInput = document.querySelector('input[type="search"], input[class*="search"], .search-input input');
      if (searchInput) keyword = searchInput.value;
    }

    // Extract search result cards
    const cardSelectors = [
      '.note-item',
      '[class*="note-item"]',
      '.search-result-item',
      '[class*="noteItem"]',
      'section.note-item',
      '[class*="search"] [class*="card"]',
    ];

    let cards = [];
    for (const sel of cardSelectors) {
      cards = document.querySelectorAll(sel);
      if (cards.length > 0) break;
    }

    // Broader fallback: find elements with cover images and titles
    if (cards.length === 0) {
      cards = document.querySelectorAll('[class*="feeds"] > div, [class*="waterfall"] > div');
    }

    cards.forEach(card => {
      const titleEl = card.querySelector(
        '.title, [class*="title"], a[class*="title"], .desc, [class*="desc"], span'
      );
      const title = titleEl?.textContent?.trim();

      if (!title || seen.has(title)) return;
      seen.add(title);

      // Try to get summary/description
      const descEl = card.querySelector('.desc, [class*="desc"], .summary, p');
      const summary = descEl?.textContent?.trim() || '';

      // Get engagement metrics if available
      const likeEl = card.querySelector('[class*="like"] span, [class*="count"]');
      const likes = likeEl?.textContent?.trim() || '';

      posts.push({ title, summary, likes });
    });

    return { keyword, posts };
  }

  // ---- Engagement Parsing ----
  function parseEngagement(str) {
    if (!str) return 0;
    str = String(str).trim().replace(/\+$/, '');
    if (!str) return 0;
    if (str.endsWith('万')) {
      const num = parseFloat(str.replace('万', ''));
      return isNaN(num) ? 0 : Math.round(num * 10000);
    }
    const num = parseInt(str, 10);
    return isNaN(num) ? 0 : num;
  }

  // ---- Helpers ----
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Fetch a post page and extract text + image URLs from __INITIAL_STATE__ / meta / DOM
  async function fetchPostData(url) {
    const res = await fetch(url, { credentials: 'include' });
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    let body = '';
    let imageUrls = [];

    // Method 1: __INITIAL_STATE__ JSON (most reliable, contains full data)
    for (const script of doc.querySelectorAll('script')) {
      const text = script.textContent;
      if (!text.includes('__INITIAL_STATE__')) continue;
      try {
        // XHS embeds state as: window.__INITIAL_STATE__= {...}
        const match = text.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*\})/);
        if (!match) continue;
        // State can contain HTML entities, try parsing
        const state = JSON.parse(match[1]);
        const noteMap = state?.note?.noteDetailMap || state?.note?.noteData || {};
        const noteKey = Object.keys(noteMap)[0];
        const note = noteMap[noteKey]?.note || noteMap[noteKey];
        if (note) {
          body = note.desc || note.description || '';
          const imgs = note.imageList || note.images || [];
          imageUrls = imgs.map(img => img.urlDefault || img.infoList?.[0]?.url || img.url || '').filter(Boolean);
        }
      } catch { /* parsing failed, try next method */ }
    }

    // Method 2: meta tags
    if (!body) {
      const desc = doc.querySelector('meta[name="description"], meta[property="og:description"]');
      if (desc?.content) body = desc.content;
    }

    // Method 3: DOM elements (SSR content)
    if (!body) {
      for (const sel of ['#detail-desc .note-text', '.note-text', '[class*="note-text"]', '#detail-desc']) {
        const el = doc.querySelector(sel);
        if (el?.textContent?.trim()) { body = el.textContent.trim(); break; }
      }
    }

    // Image fallback: og:image
    if (imageUrls.length === 0) {
      const ogImg = doc.querySelector('meta[property="og:image"]');
      if (ogImg?.content) imageUrls = [ogImg.content];
    }

    return { body, imageUrls };
  }

  // Fetch an image and return base64 data (with size-reduced URL)
  async function fetchImageAsBase64(url) {
    // Request smaller image from XHS CDN
    const smallUrl = url.includes('?') ? url : url + '?imageView2/2/w/400/format/jpg';
    const res = await fetch(smallUrl, { credentials: 'include' });
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // ---- Competitive: fetch full content from top posts ----
  async function extractCompetitivePostContents(topN = 20, minLikes = 300) {
    // Get search keyword
    const urlParams = new URLSearchParams(window.location.search);
    let keyword = urlParams.get('keyword') || urlParams.get('q') || '';
    if (!keyword) {
      const searchInput = document.querySelector('input[type="search"], input[class*="search"], .search-input input');
      if (searchInput) keyword = searchInput.value;
    }

    // Scroll aggressively to load many search results
    await loadMoreSearchCards(15);

    // Collect all cards with URLs
    const cards = [];
    const seen = new Set();
    const selectors = [
      '.note-item', '[class*="note-item"]', 'section.note-item',
      '[class*="noteItem"]', '.search-result-item',
    ];
    let cardEls = [];
    for (const sel of selectors) {
      cardEls = document.querySelectorAll(sel);
      if (cardEls.length > 0) break;
    }
    if (cardEls.length === 0) {
      cardEls = document.querySelectorAll('[class*="feeds"] > div, [class*="waterfall"] > div');
    }

    cardEls.forEach(el => {
      const titleEl = el.querySelector('.title, [class*="title"], a[class*="title"]');
      const title = titleEl?.textContent?.trim();
      if (!title || seen.has(title)) return;
      seen.add(title);

      const likeEl = el.querySelector('[class*="like"] span, [class*="count"]');
      const likes = parseEngagement(likeEl?.textContent);

      const authorEl = el.querySelector('[class*="author"] span, [class*="nickname"]');
      const author = authorEl?.textContent?.trim() || '';

      // Post URL from <a> tag
      const linkEl = el.querySelector('a[href*="/explore/"], a[href*="/search_result/"], a[href*="/note/"], a[href*="/discovery/item/"]');
      const postUrl = linkEl ? linkEl.href : '';

      // Cover image URL
      const imgEl = el.querySelector('img');
      const coverUrl = imgEl?.src || '';

      cards.push({ title, likes, author, postUrl, coverUrl });
    });

    // Filter and sort
    let qualified = cards.filter(c => c.likes >= minLikes).sort((a, b) => b.likes - a.likes);
    if (qualified.length < 5) {
      qualified = cards.sort((a, b) => b.likes - a.likes);
    }
    qualified = qualified.slice(0, topN);

    // Fetch full content for each post via HTTP (no navigation = no bfcache)
    const posts = [];
    for (let i = 0; i < qualified.length; i++) {
      const card = qualified[i];

      // Send progress
      chrome.runtime.sendMessage({
        type: 'EXTRACT_PROGRESS', current: i + 1, total: qualified.length
      }).catch(() => {});

      let body = '';
      let imageUrls = [];
      if (card.postUrl) {
        try {
          const data = await fetchPostData(card.postUrl);
          body = data.body;
          imageUrls = data.imageUrls;
          await sleep(300); // polite delay between fetches
        } catch { /* use card-level data */ }
      }

      // Fetch cover image as base64 (limit to top 8 posts to keep payload small)
      let coverBase64 = '';
      const coverSrc = card.coverUrl || imageUrls[0] || '';
      if (coverSrc && i < 8) {
        try {
          coverBase64 = await fetchImageAsBase64(coverSrc);
        } catch { /* skip image */ }
      }

      posts.push({
        title: card.title,
        body,
        likes: card.likes,
        author: card.author,
        imageCount: imageUrls.length,
        coverBase64,
      });
    }

    return { keyword, posts };
  }

  // ---- Auto-scroll to load more comments ----
  function countCommentElements() {
    const selectors = [
      '.comment-item', '[class*="commentItem"]', '[class*="comment-item"]',
      '[class*="comment"] [class*="content"]'
    ];
    for (const sel of selectors) {
      const count = document.querySelectorAll(sel).length;
      if (count > 0) return count;
    }
    return 0;
  }

  // Find the scrollable container that holds the note + comments.
  // XHS renders notes inside an overlay/modal; the scroll is on that
  // container, not on the comments sub-section itself.
  function findScrollableContainer() {
    const candidates = [
      '.note-detail-mask',
      '.note-detail-modal',
      '[class*="note-detail"]',
      '.comments-container',
      '.comment-list',
      '[class*="comments"]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight) return el;
    }
    // Fall back to the document scroll
    return document.scrollingElement || document.documentElement;
  }

  async function loadMoreComments(maxScrolls = 20) {
    const container = findScrollableContainer();

    let scrollCount = 0;
    let stableRounds = 0;
    let lastCount = countCommentElements();

    while (scrollCount < maxScrolls && stableRounds < 3) {
      // Click "展开更多" / "展开回复" buttons
      document.querySelectorAll(
        '[class*="expand"], [class*="more-reply"], [class*="showMore"], [class*="expandBtn"]'
      ).forEach(btn => {
        if (/展开|更多|查看/.test(btn.textContent)) btn.click();
      });

      // Scroll the note container (carries both content and comments on XHS)
      container.scrollTop = container.scrollHeight;
      // Also nudge window scroll as fallback for full-page layouts
      window.scrollBy(0, 600);

      await new Promise(r => setTimeout(r, 1000));
      scrollCount++;

      const newCount = countCommentElements();
      if (newCount === lastCount) {
        stableRounds++;
      } else {
        stableRounds = 0;
      }
      lastCount = newCount;
    }

    // Scroll back to top
    container.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  // ---- Scroll search results page to load more cards ----
  async function loadMoreSearchCards(maxScrolls = 8) {
    let lastCount = document.querySelectorAll(
      '.note-item, [class*="note-item"], [class*="noteItem"]'
    ).length;
    let stableRounds = 0;

    for (let i = 0; i < maxScrolls && stableRounds < 2; i++) {
      window.scrollBy(0, window.innerHeight);
      await new Promise(r => setTimeout(r, 900));

      const newCount = document.querySelectorAll(
        '.note-item, [class*="note-item"], [class*="noteItem"]'
      ).length;
      stableRounds = newCount === lastCount ? stableRounds + 1 : 0;
      lastCount = newCount;
    }

    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 300));
  }

  // ---- Message Handler ----
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Health-check used by service worker to detect if content script is alive
    if (message.type === 'PING') {
      sendResponse({ pong: true });
      return false;
    }

    if (message.type === 'EXTRACT') {
      const pageType = detectPageType();

      if (pageType === 'post') {
        // Load more comments first, then extract
        loadMoreComments(5).then(() => {
          const data = extractPostContent();
          sendResponse({
            pageType: 'post',
            data,
            url: window.location.href
          });
        });
        return true; // async
      }

      if (pageType === 'search') {
        // Scroll to load more cards before extracting
        loadMoreSearchCards(6).then(() => {
          const data = extractSearchResults();
          sendResponse({
            pageType: 'search',
            data,
            url: window.location.href
          });
        });
        return true; // async
      }

      sendResponse({
        pageType: 'unknown',
        error: '请在小红书帖子页面或搜索结果页使用此插件'
      });
      return false;
    }

    if (message.type === 'EXTRACT_COMPETITIVE') {
      extractCompetitivePostContents(20, 300).then(data => {
        sendResponse({
          pageType: 'search',
          data,
          url: window.location.href
        });
      }).catch(err => {
        sendResponse({
          pageType: 'unknown',
          error: '提取竞品内容失败：' + err.message
        });
      });
      return true; // async
    }
  });

  // Notify that content script is ready
  console.log('🔴 红探 RedProbe content script loaded');
})();
} // end double-injection guard
