// ============================================================
// 红探 RedProbe — Shared utility functions
// ============================================================

/**
 * Parse AI response text into JSON.
 * Handles both raw JSON and JSON wrapped in markdown code blocks.
 */
function parseAIResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) return JSON.parse(match[1]);
    throw new Error('AI返回格式错误，请重试');
  }
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

// Export for testing (no-op in browser context)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseAIResponse,
    escapeHtml,
    csvEscape,
    generateMarkdown,
    generateCSV,
    detectPageType
  };
}
