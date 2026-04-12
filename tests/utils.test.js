const {
  parseAIResponse,
  escapeHtml,
  csvEscape,
  generateMarkdown,
  generateCSV,
  detectPageType
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
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  test('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('escapes quotes', () => {
    expect(escapeHtml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &#039;world&#039;');
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
