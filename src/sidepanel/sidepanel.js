// ============================================================
// 红探 RedProbe — Side Panel Logic
// ============================================================

(() => {
  'use strict';

  // ---- State ----
  let currentResult = null;
  let currentType = null;

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const settingsPanel = $('#settingsPanel');
  const settingsBtn = $('#settingsBtn');
  const apiKeyInput = $('#apiKeyInput');
  const saveKeyBtn = $('#saveKeyBtn');
  const cancelSettingsBtn = $('#cancelSettingsBtn');
  const keyStatus = $('#keyStatus');

  const actionsSection = $('#actionsSection');
  const loadingSection = $('#loadingSection');
  const errorSection = $('#errorSection');
  const resultsSection = $('#resultsSection');
  const loadingText = $('#loadingText');
  const loadingSub = $('#loadingSub');
  const errorMsg = $('#errorMsg');

  const analyzePostBtn = $('#analyzePostBtn');
  const analyzeSearchBtn = $('#analyzeSearchBtn');
  const retryBtn = $('#retryBtn');

  const summaryCard = $('#summaryCard');
  const painPointsList = $('#painPointsList');
  const themesList = $('#themesList');

  const copyMdBtn = $('#copyMdBtn');
  const downloadCsvBtn = $('#downloadCsvBtn');
  const copyJsonBtn = $('#copyJsonBtn');

  // ---- Section Toggle ----
  function showSection(section) {
    [actionsSection, loadingSection, errorSection, resultsSection].forEach(s => {
      s.style.display = 'none';
    });
    section.style.display = '';
  }

  // ---- Settings ----
  settingsBtn.addEventListener('click', async () => {
    const isVisible = settingsPanel.style.display !== 'none';
    settingsPanel.style.display = isVisible ? 'none' : '';
    if (!isVisible) {
      const result = await chrome.storage.local.get('anthropic_api_key');
      if (result.anthropic_api_key) {
        apiKeyInput.value = result.anthropic_api_key;
      }
    }
  });

  saveKeyBtn.addEventListener('click', async () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      showKeyStatus('请输入 API Key', 'error');
      return;
    }
    await chrome.storage.local.set({ anthropic_api_key: key });
    showKeyStatus('✓ 已保存', 'success');
    setTimeout(() => { settingsPanel.style.display = 'none'; }, 800);
  });

  cancelSettingsBtn.addEventListener('click', () => {
    settingsPanel.style.display = 'none';
  });

  function showKeyStatus(msg, type) {
    keyStatus.textContent = msg;
    keyStatus.className = `key-status ${type}`;
  }

  // ---- Check API Key ----
  async function ensureApiKey() {
    const result = await chrome.storage.local.get('anthropic_api_key');
    if (!result.anthropic_api_key) {
      settingsPanel.style.display = '';
      showKeyStatus('请先设置 API Key 才能使用分析功能', 'error');
      return false;
    }
    return true;
  }

  // ---- Analysis Flow ----
  analyzePostBtn.addEventListener('click', () => startAnalysis('post'));
  analyzeSearchBtn.addEventListener('click', () => startAnalysis('search'));
  retryBtn.addEventListener('click', () => {
    if (currentType) startAnalysis(currentType);
    else showSection(actionsSection);
  });

  async function startAnalysis(type) {
    currentType = type;

    if (!(await ensureApiKey())) return;

    // Show loading
    showSection(loadingSection);
    loadingText.textContent = '正在提取页面内容...';
    loadingSub.textContent = type === 'search'
      ? '自动滚动加载更多结果，请稍候'
      : '自动加载评论中，请稍候';

    try {
      // Step 1: Extract content from page
      const extracted = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'EXTRACT_CONTENT' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error('无法连接到页面，请刷新小红书页面后重试'));
            return;
          }
          if (!response) {
            reject(new Error('提取失败，请确保你在小红书页面上'));
            return;
          }
          resolve(response);
        });
      });

      if (extracted.pageType === 'unknown') {
        throw new Error(extracted.error || '请在小红书帖子或搜索结果页使用');
      }

      // Validate data
      if (type === 'post') {
        if (!extracted.data.title && !extracted.data.body) {
          throw new Error('未能提取到帖子内容。小红书可能更新了页面结构，请反馈给开发者。');
        }
        if (extracted.data.comments.length === 0) {
          throw new Error('未找到评论。请确保评论区已加载，或者这篇帖子暂无评论。');
        }

        loadingText.textContent = `已提取 ${extracted.data.comments.length} 条评论`;
        loadingSub.textContent = 'AI 正在分析痛点...';
      }

      if (type === 'search') {
        if (!extracted.data.posts || extracted.data.posts.length === 0) {
          throw new Error('未找到搜索结果。请确保你在小红书的搜索结果页面。');
        }

        loadingText.textContent = `已提取 ${extracted.data.posts.length} 篇帖子`;
        loadingSub.textContent = 'AI 正在聚合分析痛点全景...';
      }

      // Step 2: Send to AI for analysis (with streaming progress)
      const msgType = type === 'post' ? 'ANALYZE_POST' : 'ANALYZE_SEARCH';
      const streamListener = (message) => {
        if (message.type === 'STREAM_CHUNK') {
          loadingSub.textContent = `AI 生成中... (${message.textLength} 字符)`;
        }
      };
      chrome.runtime.onMessage.addListener(streamListener);

      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: msgType, data: extracted.data }, (response) => {
          chrome.runtime.onMessage.removeListener(streamListener);
          if (chrome.runtime.lastError) {
            reject(new Error('分析请求失败'));
            return;
          }
          resolve(response);
        });
      });

      if (!result.success) {
        if (result.error === 'NO_API_KEY') {
          throw new Error('请先在设置中配置 Anthropic API Key');
        }
        throw new Error(result.error || '分析失败，请重试');
      }

      // Step 3: Render results
      currentResult = result.data;
      renderResults(result.data, result.type);
      showSection(resultsSection);

    } catch (err) {
      showError(err.message);
    }
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    showSection(errorSection);
  }

  // ---- Render Results ----
  function renderResults(data, type) {
    renderSummary(data.summary, type);
    renderPainPoints(data.pain_points || []);

    if (type === 'search' && data.themes) {
      renderThemes(data.themes);
      themesList.style.display = '';
    } else {
      themesList.style.display = 'none';
    }
  }

  function renderSummary(summary, type) {
    const countLabel = type === 'search'
      ? `分析了 ${summary.total_posts_analyzed || '?'} 篇帖子`
      : `分析了 ${summary.total_comments_analyzed || '?'} 条评论`;

    summaryCard.innerHTML = `
      <div class="summary-title fade-in">痛点分析报告</div>
      <div class="summary-emotion fade-in">${escapeHtml(summary.dominant_emotion || '—')}</div>
      <div class="summary-stats fade-in">
        <span>${escapeHtml(countLabel)}</span>
      </div>
      <div class="summary-keywords fade-in">
        ${(summary.top_keywords || []).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
      </div>
      ${summary.opportunity_signals ? `
        <div class="summary-opportunity fade-in">
          <div class="summary-opp-label">💡 机会洞察</div>
          ${escapeHtml(summary.opportunity_signals)}
        </div>
      ` : ''}
    `;
  }

  function renderPainPoints(painPoints) {
    if (painPoints.length === 0) {
      painPointsList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">未发现明确的痛点</p>';
      return;
    }

    // Sort by intensity * frequency (descending)
    painPoints.sort((a, b) => (b.intensity * b.frequency) - (a.intensity * a.frequency));

    painPointsList.innerHTML = painPoints.map((pp, i) => {
      const intensityClass = pp.intensity >= 8 ? 'intensity-high' : pp.intensity >= 5 ? 'intensity-mid' : 'intensity-low';
      const intensityPct = (pp.intensity / 10 * 100);

      return `
        <div class="pain-card slide-in" style="animation-delay: ${i * 0.08}s">
          <div class="pain-header">
            <div class="pain-desc">${escapeHtml(pp.description)}</div>
            <span class="pain-sentiment ${escapeHtml(pp.sentiment)}">${escapeHtml(pp.sentiment)}</span>
          </div>
          <div class="pain-metrics">
            <div class="metric">
              <span class="metric-label">强度</span>
              <div class="intensity-bar">
                <div class="intensity-fill ${intensityClass}" style="width:${intensityPct}%"></div>
              </div>
              <span>${pp.intensity}/10</span>
            </div>
            <div class="metric">
              <span class="metric-label">频率</span>
              <span>${pp.frequency} 次提及</span>
            </div>
          </div>
          ${pp.evidence && pp.evidence.length > 0 ? `
            <button class="evidence-toggle" data-idx="${i}">📎 查看原始评论 (${pp.evidence.length})</button>
            <div class="evidence-list" id="evidence-${i}" style="display:none;">
              ${pp.evidence.map(e => `<div class="evidence-item">"${escapeHtml(e)}"</div>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Evidence toggles
    painPointsList.querySelectorAll('.evidence-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.idx;
        const list = $(`#evidence-${idx}`);
        const isHidden = list.style.display === 'none';
        list.style.display = isHidden ? '' : 'none';
        btn.textContent = isHidden
          ? `📎 收起原始评论`
          : `📎 查看原始评论 (${currentResult.pain_points[idx].evidence.length})`;
      });
    });
  }

  function renderThemes(themes) {
    themesList.innerHTML = `
      <div class="themes-title">📊 话题聚类</div>
      ${themes.map(t => `
        <div class="theme-card fade-in">
          <div class="theme-name">${escapeHtml(t.name)}</div>
          <div class="theme-meta">${parseInt(t.post_count, 10) || 0} 篇帖子涉及</div>
          <div class="theme-desc">${escapeHtml(t.description)}</div>
        </div>
      `).join('')}
    `;
  }

  // ---- Export Functions ----
  copyMdBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const md = generateMarkdown(currentResult, currentType);
    copyToClipboard(md);
    showToast('已复制 Markdown');
  });

  downloadCsvBtn.addEventListener('click', () => {
    if (!currentResult) return;
    const csv = generateCSV(currentResult);
    downloadFile(csv, 'redprobe_pain_points.csv', 'text/csv;charset=utf-8');
    showToast('已下载 CSV');
  });

  copyJsonBtn.addEventListener('click', () => {
    if (!currentResult) return;
    copyToClipboard(JSON.stringify(currentResult, null, 2));
    showToast('已复制 JSON');
  });

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

  function generateCSV(data) {
    const BOM = '\uFEFF';
    let csv = BOM + '痛点描述,强度,频率,情绪,原始评论\n';
    (data.pain_points || []).forEach(pp => {
      const evidence = (pp.evidence || []).join(' | ');
      csv += `"${csvEscape(pp.description)}",${pp.intensity},${pp.frequency},"${csvEscape(pp.sentiment)}","${csvEscape(evidence)}"\n`;
    });
    return csv;
  }

  // ---- Helpers ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function csvEscape(str) {
    return (str || '').replace(/"/g, '""');
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // ---- Init: Check API key on load ----
  (async () => {
    const result = await chrome.storage.local.get('anthropic_api_key');
    if (!result.anthropic_api_key) {
      settingsPanel.style.display = '';
      showKeyStatus('首次使用，请设置你的 Anthropic API Key', 'error');
    }
  })();
})();
