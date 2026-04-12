// ============================================================
// 红探 RedProbe — Background Service Worker
// ============================================================

// ---- Side panel ----
// Open side panel when the user clicks the extension icon.
// setPanelBehavior lets Chrome handle the click → open directly,
// avoiding async "user gesture" issues with sidePanel.open().
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ============================================================
// Message Router
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_POST') {
    handleAnalyzePost(message.data, sender.tab?.id).then(sendResponse);
    return true; // async
  }

  if (message.type === 'ANALYZE_SEARCH') {
    handleAnalyzeSearch(message.data, sender.tab?.id).then(sendResponse);
    return true;
  }

  if (message.type === 'EXTRACT_CONTENT') {
    // Side panel asks content script to extract
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT' }, sendResponse);
      }
    });
    return true;
  }
});

// ============================================================
// AI Analysis via Claude API
// ============================================================

const SYSTEM_PROMPT = `你是一个专业的用户需求分析师，专注于从小红书帖子和评论中提取用户痛点。

分析以下小红书帖子内容和评论，输出结构化的痛点分析报告。

分析维度：
1. 痛点识别：从评论中提取明确的不满、抱怨、困惑、求助
2. 强度评估(1-10)：根据情绪强烈程度和表达方式判断
3. 频率统计：同一个痛点被多少条不同评论提到
4. 情绪分类：焦虑/愤怒/困惑/失望/无奈
5. 付费意愿信号：是否有评论提到愿意花钱解决、求推荐服务等
6. 机会洞察：基于痛点和付费信号，指出可能的产品/服务机会

注意事项：
- 区分"真实痛点"和"随口吐槽"——前者有具体场景和反复出现
- 合并语义相同但表述不同的痛点
- 保留最有代表性的原始评论作为evidence（最多3条）
- 用中文输出

严格按以下JSON格式输出，不要输出任何其他内容：
{
  "pain_points": [
    {
      "description": "痛点描述",
      "intensity": 8,
      "frequency": 5,
      "evidence": ["原始评论1", "原始评论2"],
      "sentiment": "焦虑"
    }
  ],
  "summary": {
    "dominant_emotion": "主要情绪",
    "top_keywords": ["关键词1", "关键词2", "关键词3"],
    "opportunity_signals": "机会洞察描述",
    "total_comments_analyzed": 0
  }
}`;

const SEARCH_SYSTEM_PROMPT = `你是一个专业的市场调研分析师，专注于从小红书搜索结果中提取用户需求全景。

分析以下多个小红书帖子标题和摘要（来自同一搜索关键词的结果），输出该话题下的痛点全景。

分析维度：
1. 从标题和摘要中提取反复出现的问题、需求、吐槽
2. 识别高频话题（多篇帖子都在讨论的主题）
3. 区分信息需求 vs 情绪宣泄 vs 求推荐
4. 发现可能的产品/服务机会

严格按以下JSON格式输出，不要输出任何其他内容：
{
  "pain_points": [
    {
      "description": "痛点描述",
      "intensity": 8,
      "frequency": 5,
      "evidence": ["帖子标题/摘要片段1", "帖子标题/摘要片段2"],
      "sentiment": "焦虑"
    }
  ],
  "themes": [
    {
      "name": "主题名",
      "post_count": 3,
      "description": "简要描述"
    }
  ],
  "summary": {
    "dominant_emotion": "主要情绪",
    "top_keywords": ["关键词1", "关键词2"],
    "opportunity_signals": "机会洞察",
    "total_posts_analyzed": 0
  }
}`;

async function getApiKey() {
  const result = await chrome.storage.local.get('anthropic_api_key');
  return result.anthropic_api_key || '';
}

function parseAIResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code block
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) return JSON.parse(match[1]);
    throw new Error('AI返回格式错误，请重试');
  }
}

async function callClaudeAPIStreaming(systemPrompt, userContent) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userContent }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          fullText += event.delta.text;
          // Send streaming progress to sidepanel
          chrome.runtime.sendMessage({
            type: 'STREAM_CHUNK',
            textLength: fullText.length
          }).catch(() => {}); // sidepanel may not be listening yet
        }
      } catch {
        // skip unparseable lines
      }
    }
  }

  return parseAIResponse(fullText);
}

async function handleAnalyzePost(data) {
  try {
    const userContent = `帖子标题：${data.title}\n\n帖子正文：${data.body}\n\n评论（共${data.comments.length}条）：\n${data.comments.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
    const result = await callClaudeAPIStreaming(SYSTEM_PROMPT, userContent);
    return { success: true, data: result, type: 'post' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function handleAnalyzeSearch(data) {
  try {
    const userContent = `搜索关键词：${data.keyword || '未知'}\n\n搜索结果（共${data.posts.length}篇）：\n${data.posts.map((p, i) => `${i + 1}. 标题：${p.title}\n   摘要：${p.summary || '无'}`).join('\n\n')}`;
    const result = await callClaudeAPIStreaming(SEARCH_SYSTEM_PROMPT, userContent);
    return { success: true, data: result, type: 'search' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
