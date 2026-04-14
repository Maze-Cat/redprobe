// ============================================================
// 红探 RedProbe — Shared utility functions
// ============================================================

/**
 * Parse AI response text into JSON.
 * Handles both raw JSON and JSON wrapped in markdown code blocks.
 */
function parseAIResponse(text) {
  // Method 1: Direct parse
  try { return JSON.parse(text); } catch {}

  // Method 2: Extract from ```json ... ``` or ``` ... ``` code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]); } catch {}
  }

  // Method 3: Find the outermost { ... } in the response
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch {}
  }

  throw new Error('AI返回格式错误，请重试');
}

/**
 * Escape special characters for HTML output.
 * Works in both browser (uses DOM) and Node.js (manual replace).
 */
function escapeHtml(str) {
  if (typeof document !== 'undefined') {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escape a string for use inside a CSV quoted field.
 */
function csvEscape(str) {
  return (str || '').replace(/"/g, '""');
}

/**
 * Generate a Markdown report from analysis data.
 */
function generateMarkdown(data, type) {
  let md = `# 红探痛点分析报告\n\n`;
  md += `## 概览\n`;
  md += `- 主要情绪：${data.summary?.dominant_emotion || '—'}\n`;

  if (type === 'search') {
    md += `- 分析帖子数：${data.summary?.total_posts_analyzed || '?'}\n`;
  } else {
    md += `- 分析评论数：${data.summary?.total_comments_analyzed || '?'}\n`;
  }

  md += `- 关键词：${(data.summary?.top_keywords || []).join('、')}\n`;
  md += `- 机会洞察：${data.summary?.opportunity_signals || '—'}\n\n`;

  md += `## 痛点列表\n\n`;
  (data.pain_points || []).forEach((pp, i) => {
    md += `### ${i + 1}. ${pp.description}\n`;
    md += `- 强度：${pp.intensity}/10 | 频率：${pp.frequency} | 情绪：${pp.sentiment}\n`;
    if (pp.evidence?.length) {
      md += `- 原始评论：\n`;
      pp.evidence.forEach(e => { md += `  - "${e}"\n`; });
    }
    md += `\n`;
  });

  if (data.themes) {
    md += `## 话题聚类\n\n`;
    data.themes.forEach(t => {
      md += `- **${t.name}**（${t.post_count} 篇）：${t.description}\n`;
    });
  }

  return md;
}

/**
 * Generate a CSV string from analysis data.
 */
function generateCSV(data) {
  const BOM = '\uFEFF';
  let csv = BOM + '痛点描述,强度,频率,情绪,原始评论\n';
  (data.pain_points || []).forEach(pp => {
    const evidence = (pp.evidence || []).join(' | ');
    csv += `"${csvEscape(pp.description)}",${pp.intensity},${pp.frequency},"${csvEscape(pp.sentiment)}","${csvEscape(evidence)}"\n`;
  });
  return csv;
}

/**
 * Detect page type from URL and overlay presence.
 */
function detectPageType(url, hasNoteOverlay) {
  if (url.includes('/explore/') || url.includes('/discovery/item/')) {
    return 'post';
  }
  if (url.includes('/search_result')) {
    return 'search';
  }
  if (hasNoteOverlay) {
    return 'post';
  }
  return 'unknown';
}

/**
 * Whether a URL belongs to Xiaohongshu.
 */
function isXHSTab(url) {
  return !!url?.includes('xiaohongshu.com');
}

/**
 * Decide whether the side panel should be enabled for a given tab URL.
 * Returns: true (enable), false (disable), or null (skip — don't change state).
 *
 * We skip internal browser URLs and unknown/empty URLs to avoid
 * accidentally disabling the panel on tabs we can't inspect.
 */
function shouldEnablePanel(url) {
  if (!url) return null;
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return null;
  return isXHSTab(url);
}

/**
 * Count comment elements currently in the DOM.
 * Returns the first non-zero count across known selectors.
 */
function countCommentElements(root) {
  root = root || (typeof document !== 'undefined' ? document : null);
  if (!root) return 0;
  const selectors = [
    '.comment-item',
    '[class*="commentItem"]',
    '[class*="comment-item"]',
    '[class*="comment"] [class*="content"]',
  ];
  for (const sel of selectors) {
    const count = root.querySelectorAll(sel).length;
    if (count > 0) return count;
  }
  return 0;
}

/**
 * Find the scrollable container that holds the note + comments.
 * Returns the first element whose scrollHeight exceeds clientHeight,
 * falling back to document.scrollingElement.
 */
function findScrollableContainer(root) {
  root = root || (typeof document !== 'undefined' ? document : null);
  if (!root) return null;
  const candidates = [
    '.note-detail-mask',
    '.note-detail-modal',
    '[class*="note-detail"]',
    '.comments-container',
    '.comment-list',
    '[class*="comments"]',
  ];
  for (const sel of candidates) {
    const el = root.querySelector(sel);
    if (el && el.scrollHeight > el.clientHeight) return el;
  }
  return root.scrollingElement || root.documentElement || null;
}

/**
 * Parse XHS engagement count strings like "1.2万", "3456", "999+" into integers.
 */
function parseEngagementCount(str) {
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

/**
 * Sort posts by total engagement (likes + saves + comments) descending.
 * Does not mutate the original array.
 */
function sortByEngagement(posts) {
  return [...posts].sort((a, b) => {
    const totalA = (a.likes || 0) + (a.saves || 0) + (a.comments || 0);
    const totalB = (b.likes || 0) + (b.saves || 0) + (b.comments || 0);
    return totalB - totalA;
  });
}

/**
 * Generate a Markdown report from competitive/fusion post data.
 */
function generateCompetitiveMarkdown(data) {
  const post = data.post || {};

  let md = `# 红探 AI 生成帖子\n\n`;
  md += `> 基于 ${data.sources_count || '?'} 篇300赞热帖融合创作\n\n`;

  md += `## 标题\n${post.title || '—'}\n\n`;
  md += `## 正文\n${post.body || '—'}\n\n`;

  if (post.tags && post.tags.length) {
    md += `## 话题标签\n${post.tags.map(t => `#${t}`).join(' ')}\n\n`;
  }
  if (post.cover_suggestion) {
    md += `## 封面建议\n${post.cover_suggestion}\n\n`;
  }
  if (data.analysis) {
    md += `## 创作思路\n${data.analysis}\n`;
  }

  return md;
}

// Export for testing (no-op in browser context)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseAIResponse,
    escapeHtml,
    csvEscape,
    generateMarkdown,
    generateCSV,
    detectPageType,
    isXHSTab,
    shouldEnablePanel,
    countCommentElements,
    findScrollableContainer,
    parseEngagementCount,
    sortByEngagement,
    generateCompetitiveMarkdown,
  };
}
