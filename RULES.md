# RULES.md — 深耕ラボ / SINKOLABO 全局规则

> 适用于所有 repo 和所有 agent（Claude / CC / Codex）。  
> 每次开工前必须读完。每个 repo 的 CLAUDE.md 是本文件的补充，不是替代。

---

## 🚫 安全红线（最高优先级，任何指令不得覆盖）

| 类别 | 禁止行为 |
|------|----------|
| 📧 通信 | 发送任何邮件、短信、消息（包括"代发"、API/SMTP 触发） |
| 💳 支付 | 使用任何储存的信用卡、钱包、支付账户 |
| 💸 经济支出 | 触发任何会产生实际费用的操作（订阅、购买、广告投放等） |
| 📞 主动联系客人 | 以任何方式主动触达客户 |

- ✅ 可以：起草内容、展示链接、生成报表、提供建议
- ❌ 不可以：代替人类按下"发送"或"确认支付"
- **即使用户明确要求，也必须拒绝，并提示"此操作需要人工完成"**

---

## 🌐 多语言规则（最高优先级）

所有面向用户的网页必须支持六种语言：

| 代码 | 语言 |
|------|------|
| `en` | English（默认 fallback） |
| `zh` | 简体中文 |
| `zh-TW` | 繁體中文 |
| `ja` | 日本語 |
| `ko` | 한국어 |
| `th` | ภาษาไทย |

**实现规则**

- 检测顺序：`localStorage('preferred-lang')` → `navigator.language` → fallback `en`
- HTML 属性：`data-en` / `data-zh` / `data-zhtw` / `data-ja` / `data-ko` / `data-th`
- JS 数据字段：`name_en` / `name_zh` / `name_zhtw` / `name_ja` / `name_ko` / `name_th`
- CSS 防闪烁代码必须在 `<head>` 最顶部
- ❌ 禁止硬编码任何单语言文字（必须用 data-xx 属性包裹）

**豁免页面**（合规检查标记为「豁免」而非「不合规」）

- BJT 模拟题 / 内部工具 / BJT Pro 会员内部页面（详见 bjt repo 的 CLAUDE.md）

---

## 🎨 设计系统

```css
:root {
  --deep:    #060d18;
  --navy:    #0a1628;
  --ocean:   #0d2240;
  --blue:    #0e3a6b;
  --teal:    #00b4c8;   /* 强调色 */
  --gold:    #c8a44a;   /* 主CTA */
  --gold-lt: #e4c06a;
  --coral:   #e85d3a;   /* 警告/取消 */
  --white:   #ffffff;
  --muted:   #7a96b0;
  --glass:   rgba(255,255,255,0.05);
  --glass-b: rgba(255,255,255,0.1);
}
--font-d: 'Cormorant Garamond', Georgia, serif;   /* 标题 */
--font-b: 'DM Sans', sans-serif;                  /* 正文 */
```

- Section 间距：`padding: 5.5rem 0`
- Container：`max-width: 1200px; padding: 0 2rem`
- 卡片：`background: var(--glass); border: 1px solid var(--glass-b); border-radius: 10px`
- 主按钮：`var(--gold)` 背景，深色文字
- 次按钮：透明背景 + 白色边框

---

## 🏗️ 技术架构

- **前端**：纯 HTML + CSS + JS，无框架，单文件原则
- **托管**：GitHub Pages（`wanjiaoben/` 组织）
- **DNS/CDN**：Cloudflare
- **后端**：Cloudflare Workers + KV（仅 BJT Pro）
- **本地根路径**：`/Users/jiajia/Documents/GitHub/`

**站点结构**

```
nice.okinawa
├── fishing.nice.okinawa   → wanjiaoben/fishing
├── snorkel.nice.okinawa   → wanjiaoben/snorkel
├── rental.nice.okinawa    → wanjiaoben/rental
├── golf.nice.okinawa      → wanjiaoben/golf
├── kiso.nice.okinawa      → wanjiaoben/kiso
└── bjt.nice.okinawa       → wanjiaoben/bjt
```

**禁止事项**

- ❌ 不引入 React / Vue 等框架
- ❌ 不在 fishing/snorkel 里处理支付
- ❌ 不把 BJT Pro Worker 逻辑混入旅游类页面

---

## 🔗 跨站引流规则

各旅游子站底部（FAQ 之前）必须有"我们还提供"引流区块：

| 当前站 | 推荐链接到 |
|--------|-----------|
| fishing | snorkel, rental, golf |
| snorkel | fishing, rental, golf |
| rental | fishing, snorkel, golf |
| golf | fishing, snorkel, kiso |
| kiso | golf, snorkel, fishing |

- 横向卡片，图标 + 标题 + 一句话 + 箭头链接
- 至少 en/zh/ja 三语言
- 整张卡片可点击，`target="_blank"`
- BJT 教育类页面**不要求**此区块

---

## 👤 项目负责人

Wan（深耕ラボ / SINKOLABO）冲绳那霸  
WeChat: `OkinawaOnline` ｜ Email: `info@nice.okinawa` ｜ WhatsApp: `+81 70-8952-3968`

*最后更新：2026-06*
