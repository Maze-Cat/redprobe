# 🔴 红探 RedProbe — 小红书痛点分析 Chrome 插件

一键分析小红书帖子评论，AI 自动提取用户痛点，帮你发现产品机会。

## 安装步骤

### 1. 加载插件到 Chrome

1. 打开 Chrome，地址栏输入 `chrome://extensions/`
2. 打开右上角的 **开发者模式** (Developer Mode)
3. 点击 **加载已解压的扩展程序** (Load unpacked)
4. 选择 `redprobe` 文件夹
5. 插件图标会出现在 Chrome 工具栏

### 2. 配置 API Key

1. 打开任意小红书页面 (https://www.xiaohongshu.com)
2. 点击工具栏上的红探图标，侧边栏会打开
3. 点击 ⚙️ 设置按钮
4. 输入你的 Anthropic API Key（`sk-ant-...`）
5. 点击保存

> API Key 仅存储在你的浏览器本地，不会发送到任何第三方服务器。

## 使用方法

### 单帖分析
1. 在小红书打开一篇帖子
2. 点击工具栏的红探图标打开侧边栏
3. 点击 **「分析当前帖子」**
4. 插件会自动提取帖子正文和所有评论
5. AI 分析后展示痛点报告

### 搜索结果批量分析
1. 在小红书搜索关键词（如"美甲 踩雷"）
2. 在搜索结果页点击红探图标
3. 点击 **「分析搜索结果」**
4. AI 会聚合分析所有可见帖子的标题和摘要

### 导出结果
- **复制 Markdown**：粘贴到 Notion / 文档
- **下载 CSV**：用 Excel 做进一步分析
- **复制 JSON**：给开发者或接入其他工具

## 文件结构

```
redprobe/
├── manifest.json                  # Chrome 扩展配置
├── package.json                   # Node.js 依赖（测试用）
├── icons/                         # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   └── service-worker.js      # 后台脚本：消息路由 + AI API 调用（流式）
│   ├── content/
│   │   ├── extractor.js           # 内容脚本：DOM 提取逻辑
│   │   └── content.css            # 页面注入样式
│   ├── lib/
│   │   └── utils.js               # 共享工具函数（可测试）
│   └── sidepanel/
│       ├── sidepanel.html         # 侧边栏 HTML
│       ├── sidepanel.css          # 侧边栏样式
│       └── sidepanel.js           # 侧边栏交互逻辑
├── tests/
│   └── utils.test.js              # 单元测试
└── README.md
```

## 运行测试

```bash
npm install
npm test
```

## 技术说明

- **Manifest V3**：使用 Chrome 最新的扩展 API
- **Side Panel API**：结果展示在浏览器侧边栏，不遮挡页面
- **Claude API (Streaming)**：直接从插件调用 Anthropic API（方案 A），支持流式响应，实时显示生成进度
- **DOM 提取**：多套选择器兜底，应对小红书前端改版
- **评论加载**：自动滚动和点击"展开更多"来加载评论，智能检测新评论加载完成后自动停止
- **安全**：所有 AI 返回内容经过 HTML 转义，防止 XSS

## 已知限制

- 小红书使用虚拟滚动，超长评论区可能无法提取全部评论
- DOM 选择器可能因小红书改版而失效，需要及时更新
- API Key 存储在 `chrome.storage.local`，直接调用 API 意味着 key 在插件中
- 每次分析的 API 成本约 $0.01-0.05（取决于评论数量）
- 插件图标仅在小红书页面上可用（非小红书页面点击无反应）

## 下一步

- [ ] 测试更多小红书页面类型，完善 DOM 选择器
- [ ] 添加分析历史记录（存储在 local storage）
- [ ] 迁移到后端代理模式（保护 API Key）
- [ ] 提交 Chrome Web Store
- [ ] 添加使用次数限制 / 成本控制
