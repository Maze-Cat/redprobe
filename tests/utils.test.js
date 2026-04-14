const {
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
} = require('../src/lib/utils');

// ============================================================
// Test Data Fixtures
// ============================================================

const MOCK_POST_RESULT = {
  pain_points: [
    {
      description: '报税流程太复杂，不知道该填哪些表格',
      intensity: 9,
      frequency: 12,
      evidence: ['第一次报税完全不知道从哪开始', '表格太多了看不懂'],
      sentiment: '焦虑'
    },
    {
      description: '找不到靠谱的CPA',
      intensity: 7,
      frequency: 5,
      evidence: ['有推荐的华人CPA吗'],
      sentiment: '困惑'
    }
  ],
  summary: {
    dominant_emotion: '焦虑+困惑',
    top_keywords: ['复杂', '搞不懂', '求推荐'],
    opportunity_signals: '多人提到愿意花钱找专业服务',
    total_comments_analyzed: 87
  }
};

const MOCK_SEARCH_RESULT = {
  pain_points: [
    {
      description: '美甲款式和实际不符',
      intensity: 8,
      frequency: 15,
      evidence: ['做出来完全不一样', '照片和实物差距太大'],
      sentiment: '愤怒'
    }
  ],
  themes: [
    { name: '价格问题', post_count: 5, description: '觉得性价比低' },
    { name: '款式踩雷', post_count: 8, description: '效果和预期不符' }
  ],
  summary: {
    dominant_emotion: '失望',
    top_keywords: ['踩雷', '不推荐'],
    opportunity_signals: '对比评测类内容需求大',
    total_posts_analyzed: 20
  }
};

// ============================================================
// parseAIResponse
// ============================================================

describe('parseAIResponse', () => {
  test('parses plain JSON string', () => {
    const input = JSON.stringify(MOCK_POST_RESULT);
    const result = parseAIResponse(input);
    expect(result.pain_points).toHaveLength(2);
    expect(result.summary.total_comments_analyzed).toBe(87);
  });

  test('parses JSON wrapped in markdown code block', () => {
    const input = '```json\n{"pain_points": [{"description": "test"}], "summary": {}}\n```';
    const result = parseAIResponse(input);
    expect(result.pain_points[0].description).toBe('test');
  });

  test('parses JSON with extra whitespace in code block', () => {
    const input = '```json\n  \n{"pain_points": []}\n  \n```';
    const result = parseAIResponse(input);
    expect(result.pain_points).toEqual([]);
  });

  test('parses JSON with surrounding text (preamble/postamble)', () => {
    const input = 'Here is the result:\n{"pain_points": [], "summary": {}}\nHope this helps!';
    const result = parseAIResponse(input);
    expect(result.pain_points).toEqual([]);
  });

  test('throws on completely invalid input', () => {
    expect(() => parseAIResponse('this is not json at all'))
      .toThrow('AI返回格式错误，请重试');
  });

  test('throws on empty string', () => {
    expect(() => parseAIResponse('')).toThrow();
  });

  test('throws on invalid JSON inside code block', () => {
    expect(() => parseAIResponse('```json\n{broken}\n```')).toThrow();
  });
});

// ============================================================
// escapeHtml
// ============================================================

describe('escapeHtml', () => {
  test('escapes angle brackets', () => {
    // DOM textContent escaping: <, >, & are escaped; quotes are not needed in text nodes
    const result = escapeHtml('<script>alert("xss")</script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&lt;/script&gt;');
    expect(result).not.toContain('<script>');
  });

  test('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes ampersand in mixed content', () => {
    // & is always escaped; quotes in text nodes are rendered as-is by the DOM
    const result = escapeHtml('"hello" & \'world\'');
    expect(result).toContain('&amp;');
    expect(result).not.toContain(' & ');
  });

  test('returns empty string content unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });

  test('leaves safe strings unchanged', () => {
    expect(escapeHtml('普通中文内容')).toBe('普通中文内容');
  });

  test('handles mixed content', () => {
    const input = '痛点：<b>报税</b>很"复杂"';
    const result = escapeHtml(input);
    expect(result).not.toContain('<b>');
    expect(result).toContain('&lt;b&gt;');
  });
});

// ============================================================
// csvEscape
// ============================================================

describe('csvEscape', () => {
  test('doubles internal quotes', () => {
    expect(csvEscape('say "hi"')).toBe('say ""hi""');
  });

  test('returns empty string for null', () => {
    expect(csvEscape(null)).toBe('');
  });

  test('returns empty string for undefined', () => {
    expect(csvEscape(undefined)).toBe('');
  });

  test('leaves normal text unchanged', () => {
    expect(csvEscape('hello world')).toBe('hello world');
  });

  test('handles Chinese text with quotes', () => {
    expect(csvEscape('用户说"太难了"')).toBe('用户说""太难了""');
  });

  test('handles multiple quotes', () => {
    expect(csvEscape('a"b"c"d')).toBe('a""b""c""d');
  });
});

// ============================================================
// generateMarkdown
// ============================================================

describe('generateMarkdown', () => {
  test('generates post report with correct structure', () => {
    const md = generateMarkdown(MOCK_POST_RESULT, 'post');
    expect(md).toContain('# 红探痛点分析报告');
    expect(md).toContain('## 概览');
    expect(md).toContain('## 痛点列表');
    expect(md).toContain('分析评论数：87');
    expect(md).toContain('焦虑+困惑');
  });

  test('includes all pain points', () => {
    const md = generateMarkdown(MOCK_POST_RESULT, 'post');
    expect(md).toContain('### 1. 报税流程太复杂');
    expect(md).toContain('### 2. 找不到靠谱的CPA');
  });

  test('includes intensity, frequency, sentiment', () => {
    const md = generateMarkdown(MOCK_POST_RESULT, 'post');
    expect(md).toContain('强度：9/10');
    expect(md).toContain('频率：12');
    expect(md).toContain('情绪：焦虑');
  });

  test('includes evidence quotes', () => {
    const md = generateMarkdown(MOCK_POST_RESULT, 'post');
    expect(md).toContain('原始评论');
    expect(md).toContain('第一次报税完全不知道从哪开始');
  });

  test('includes keywords', () => {
    const md = generateMarkdown(MOCK_POST_RESULT, 'post');
    expect(md).toContain('复杂、搞不懂、求推荐');
  });

  test('includes opportunity signals', () => {
    const md = generateMarkdown(MOCK_POST_RESULT, 'post');
    expect(md).toContain('多人提到愿意花钱找专业服务');
  });

  test('generates search report with themes', () => {
    const md = generateMarkdown(MOCK_SEARCH_RESULT, 'search');
    expect(md).toContain('分析帖子数：20');
    expect(md).toContain('## 话题聚类');
    expect(md).toContain('**价格问题**（5 篇）');
    expect(md).toContain('**款式踩雷**（8 篇）');
  });

  test('handles empty pain_points', () => {
    const data = { pain_points: [], summary: {} };
    const md = generateMarkdown(data, 'post');
    expect(md).toContain('# 红探痛点分析报告');
    expect(md).toContain('## 痛点列表');
  });

  test('handles missing summary fields gracefully', () => {
    const data = { pain_points: [], summary: {} };
    const md = generateMarkdown(data, 'post');
    expect(md).toContain('主要情绪：—');
    expect(md).toContain('机会洞察：—');
  });
});

// ============================================================
// generateCSV
// ============================================================

describe('generateCSV', () => {
  test('starts with UTF-8 BOM', () => {
    const csv = generateCSV(MOCK_POST_RESULT);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  test('has correct header row', () => {
    const csv = generateCSV(MOCK_POST_RESULT);
    const header = csv.split('\n')[0].replace('\uFEFF', '');
    expect(header).toBe('痛点描述,强度,频率,情绪,原始评论');
  });

  test('has correct number of data rows', () => {
    const csv = generateCSV(MOCK_POST_RESULT);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(3); // header + 2 pain points
  });

  test('includes pain point data', () => {
    const csv = generateCSV(MOCK_POST_RESULT);
    expect(csv).toContain('报税流程太复杂');
    expect(csv).toContain('9,12');
    expect(csv).toContain('焦虑');
  });

  test('joins evidence with pipe separator', () => {
    const csv = generateCSV(MOCK_POST_RESULT);
    expect(csv).toContain('第一次报税完全不知道从哪开始 | 表格太多了看不懂');
  });

  test('handles empty pain_points', () => {
    const csv = generateCSV({ pain_points: [] });
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1); // header only
  });

  test('escapes quotes in CSV fields', () => {
    const data = {
      pain_points: [{
        description: '用户说"太贵了"',
        intensity: 5,
        frequency: 3,
        evidence: ['太贵了"真的"'],
        sentiment: '愤怒'
      }]
    };
    const csv = generateCSV(data);
    expect(csv).toContain('用户说""太贵了""');
    expect(csv).toContain('太贵了""真的""');
  });
});

// ============================================================
// detectPageType
// ============================================================

describe('detectPageType', () => {
  test('detects post from /explore/ URL', () => {
    expect(detectPageType('https://www.xiaohongshu.com/explore/abc123', false)).toBe('post');
  });

  test('detects post from /discovery/item/ URL', () => {
    expect(detectPageType('https://www.xiaohongshu.com/discovery/item/abc', false)).toBe('post');
  });

  test('detects search from /search_result URL', () => {
    expect(detectPageType('https://www.xiaohongshu.com/search_result?keyword=test', false)).toBe('search');
  });

  test('detects post when note overlay is present', () => {
    expect(detectPageType('https://www.xiaohongshu.com/', true)).toBe('post');
  });

  test('returns unknown for unrecognized URL without overlay', () => {
    expect(detectPageType('https://www.xiaohongshu.com/', false)).toBe('unknown');
  });

  test('returns unknown for non-XHS URL', () => {
    expect(detectPageType('https://www.google.com/', false)).toBe('unknown');
  });

  test('post URL takes precedence over overlay check', () => {
    expect(detectPageType('https://www.xiaohongshu.com/explore/abc', true)).toBe('post');
  });

  test('search URL takes precedence over overlay check', () => {
    expect(detectPageType('https://www.xiaohongshu.com/search_result?q=test', true)).toBe('search');
  });
});

// ============================================================
// isXHSTab
// ============================================================

describe('isXHSTab', () => {
  test('returns true for xiaohongshu.com URLs', () => {
    expect(isXHSTab('https://www.xiaohongshu.com/explore/abc')).toBe(true);
    expect(isXHSTab('https://www.xiaohongshu.com/')).toBe(true);
    expect(isXHSTab('https://www.xiaohongshu.com/search_result?keyword=test')).toBe(true);
  });

  test('returns false for non-XHS URLs', () => {
    expect(isXHSTab('https://www.google.com')).toBe(false);
    expect(isXHSTab('https://github.com')).toBe(false);
    expect(isXHSTab('chrome://extensions/')).toBe(false);
  });

  test('returns false for null or undefined', () => {
    expect(isXHSTab(null)).toBe(false);
    expect(isXHSTab(undefined)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isXHSTab('')).toBe(false);
  });
});

// ============================================================
// shouldEnablePanel
// ============================================================

describe('shouldEnablePanel', () => {
  test('returns true for XHS URLs (should enable panel)', () => {
    expect(shouldEnablePanel('https://www.xiaohongshu.com/explore/abc')).toBe(true);
    expect(shouldEnablePanel('https://www.xiaohongshu.com/search_result?q=test')).toBe(true);
    expect(shouldEnablePanel('https://www.xiaohongshu.com/')).toBe(true);
  });

  test('returns false for non-XHS URLs (should disable panel)', () => {
    expect(shouldEnablePanel('https://www.google.com')).toBe(false);
    expect(shouldEnablePanel('https://github.com/foo')).toBe(false);
    expect(shouldEnablePanel('https://example.com')).toBe(false);
  });

  test('returns null for empty/null/undefined URL (skip — do not change state)', () => {
    expect(shouldEnablePanel(null)).toBeNull();
    expect(shouldEnablePanel(undefined)).toBeNull();
    expect(shouldEnablePanel('')).toBeNull();
  });

  test('returns null for chrome:// URLs (skip — internal browser pages)', () => {
    expect(shouldEnablePanel('chrome://extensions/')).toBeNull();
    expect(shouldEnablePanel('chrome://settings')).toBeNull();
    expect(shouldEnablePanel('chrome://newtab')).toBeNull();
  });

  test('returns null for chrome-extension:// URLs (skip)', () => {
    expect(shouldEnablePanel('chrome-extension://abc123/popup.html')).toBeNull();
  });
});

// ============================================================
// countCommentElements — uses jsdom via jest
// ============================================================

describe('countCommentElements', () => {
  function makeDOM(html) {
    // jest runs with jsdom, so we can use document.createElement
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
  }

  test('counts elements matching .comment-item', () => {
    const root = makeDOM(`
      <div class="comment-item">first</div>
      <div class="comment-item">second</div>
      <div class="comment-item">third</div>
    `);
    expect(countCommentElements(root)).toBe(3);
  });

  test('counts elements matching [class*="commentItem"]', () => {
    const root = makeDOM(`
      <div class="xhs-commentItem-wrap">one</div>
      <div class="xhs-commentItem-wrap">two</div>
    `);
    expect(countCommentElements(root)).toBe(2);
  });

  test('returns 0 when no comment elements present', () => {
    const root = makeDOM('<div class="post-body">no comments here</div>');
    expect(countCommentElements(root)).toBe(0);
  });

  test('returns count from first matching selector only', () => {
    // .comment-item (3) and [class*="comment"] [class*="content"] both match —
    // should return 3 from the first selector hit
    const root = makeDOM(`
      <div class="comment-item"><span class="content">a</span></div>
      <div class="comment-item"><span class="content">b</span></div>
      <div class="comment-item"><span class="content">c</span></div>
    `);
    expect(countCommentElements(root)).toBe(3);
  });
});

// ============================================================
// findScrollableContainer — uses jsdom
// ============================================================

describe('findScrollableContainer', () => {
  function makeScrollableDOM(selector, scrollHeight, clientHeight) {
    const root = document.createElement('div');
    root.innerHTML = `<div class="${selector.replace(/[.\[\]*"]/g, '')}">inner</div>`;
    // jsdom doesn't compute real scroll dimensions, so we mock them
    const el = root.firstElementChild;
    Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
    return root;
  }

  test('returns .note-detail-mask when it is scrollable', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="note-detail-mask">content</div>';
    const el = root.querySelector('.note-detail-mask');
    Object.defineProperty(el, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
    expect(findScrollableContainer(root)).toBe(el);
  });

  test('returns .comments-container when note-detail not present', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div class="comments-container">comments</div>';
    const el = root.querySelector('.comments-container');
    Object.defineProperty(el, 'scrollHeight', { value: 1500, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
    expect(findScrollableContainer(root)).toBe(el);
  });

  test('skips non-scrollable candidates (scrollHeight <= clientHeight)', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="note-detail-mask">short</div>
      <div class="comments-container">tall</div>
    `;
    const mask = root.querySelector('.note-detail-mask');
    const comments = root.querySelector('.comments-container');
    // mask is NOT scrollable
    Object.defineProperty(mask, 'scrollHeight', { value: 300, configurable: true });
    Object.defineProperty(mask, 'clientHeight', { value: 300, configurable: true });
    // comments IS scrollable
    Object.defineProperty(comments, 'scrollHeight', { value: 1500, configurable: true });
    Object.defineProperty(comments, 'clientHeight', { value: 400, configurable: true });
    expect(findScrollableContainer(root)).toBe(comments);
  });

  test('falls back to document root when root is null', () => {
    // In browser/jsdom, null falls back to global document — returns documentElement
    const result = findScrollableContainer(null);
    expect(result).not.toBeNull();
  });
});

// ============================================================
// parseEngagementCount
// ============================================================

describe('parseEngagementCount', () => {
  test('parses plain numbers', () => {
    expect(parseEngagementCount('3456')).toBe(3456);
    expect(parseEngagementCount('0')).toBe(0);
    expect(parseEngagementCount('12')).toBe(12);
  });

  test('parses 万 (10k) suffix', () => {
    expect(parseEngagementCount('1.2万')).toBe(12000);
    expect(parseEngagementCount('10万')).toBe(100000);
    expect(parseEngagementCount('0.5万')).toBe(5000);
  });

  test('handles + suffix', () => {
    expect(parseEngagementCount('999+')).toBe(999);
    expect(parseEngagementCount('10万+')).toBe(100000);
  });

  test('returns 0 for empty/null/undefined', () => {
    expect(parseEngagementCount('')).toBe(0);
    expect(parseEngagementCount(null)).toBe(0);
    expect(parseEngagementCount(undefined)).toBe(0);
  });

  test('returns 0 for non-numeric strings', () => {
    expect(parseEngagementCount('abc')).toBe(0);
    expect(parseEngagementCount('  ')).toBe(0);
  });
});

// ============================================================
// sortByEngagement
// ============================================================

describe('sortByEngagement', () => {
  test('sorts by total engagement descending', () => {
    const posts = [
      { title: 'low', likes: 10, saves: 5, comments: 2 },
      { title: 'high', likes: 1000, saves: 500, comments: 200 },
      { title: 'mid', likes: 100, saves: 50, comments: 20 },
    ];
    const sorted = sortByEngagement(posts);
    expect(sorted[0].title).toBe('high');
    expect(sorted[1].title).toBe('mid');
    expect(sorted[2].title).toBe('low');
  });

  test('handles missing metrics (treats as 0)', () => {
    const posts = [
      { title: 'a', likes: 100 },
      { title: 'b', likes: 50, saves: 200, comments: 100 },
    ];
    const sorted = sortByEngagement(posts);
    expect(sorted[0].title).toBe('b');
    expect(sorted[1].title).toBe('a');
  });

  test('does not mutate original array', () => {
    const posts = [
      { title: 'b', likes: 1 },
      { title: 'a', likes: 100 },
    ];
    const original = [...posts];
    sortByEngagement(posts);
    expect(posts[0].title).toBe(original[0].title);
  });

  test('returns empty array for empty input', () => {
    expect(sortByEngagement([])).toEqual([]);
  });
});

// ============================================================
// generateCompetitiveMarkdown
// ============================================================

describe('generateCompetitiveMarkdown', () => {
  const MOCK_COMPETITIVE = {
    post: {
      title: '最全美甲避坑指南',
      body: '姐妹们，今天来分享一下我的美甲经验...',
      tags: ['美甲', '避坑', '指南'],
      cover_suggestion: '用对比图展示好坏效果'
    },
    analysis: '热帖普遍采用清单型结构和避坑角度',
    sources_count: 20
  };

  test('includes report header', () => {
    const md = generateCompetitiveMarkdown(MOCK_COMPETITIVE);
    expect(md).toContain('# 红探 AI 生成帖子');
  });

  test('includes sources count', () => {
    const md = generateCompetitiveMarkdown(MOCK_COMPETITIVE);
    expect(md).toContain('20');
  });

  test('includes generated title and body', () => {
    const md = generateCompetitiveMarkdown(MOCK_COMPETITIVE);
    expect(md).toContain('最全美甲避坑指南');
    expect(md).toContain('姐妹们，今天来分享一下');
  });

  test('includes tags as hashtags', () => {
    const md = generateCompetitiveMarkdown(MOCK_COMPETITIVE);
    expect(md).toContain('#美甲');
    expect(md).toContain('#避坑');
  });

  test('includes cover suggestion and analysis', () => {
    const md = generateCompetitiveMarkdown(MOCK_COMPETITIVE);
    expect(md).toContain('对比图');
    expect(md).toContain('清单型结构');
  });

  test('handles empty post data', () => {
    const data = { post: {}, sources_count: 0 };
    const md = generateCompetitiveMarkdown(data);
    expect(md).toContain('# 红探 AI 生成帖子');
  });
});
