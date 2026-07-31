# RECORDS — fishing

> 此文件由 Claude / CC / Codex 共同维护。每次执行任务后更新对应区块。

---

## 📍 当前状态

- **阶段**：维护中
- **最后更新**：2026-07-31
- **负责人**：Wan

---

## ✅ 已完成

| 日期 | 执行者 | 内容 |
|------|--------|------|
| 2026-06-13 | sg | 在 `index.html`、`robots.txt`、`sitemap.xml` 补充公开页 SEO metadata 与站点地图配置 |
| 2026-06-13 | sg | 在 `index.html` 补充公开页 `hreflang` metadata |
| 2026-06-12 | sg | 接入 shared analytics tracking，统一站点埋点能力 |
| 2026-07-31 | Codex | M0731-15 将 fishing 表单从假成功提示改为真实 POST 到现有 Nice Okinawa inquiry Worker，并加入 Turnstile 与失败提示 |
| 2026-07-27 | Codex | M0727-17 按 snorkel 样板补齐 fishing 的 AI bot robots 显式 Allow 与 OG/Twitter 站内分享图；核查 llms、真人区块与 FAQ 结构化数据 |
| 2026-06-09 | Codex | 新增 `CLAUDE.md`、`RULES.md` 和 `records.md` |
| 2026-06-09 | Codex | 填入 fishing 专属港口和服务信息 |
| 2026-06-09 | Codex | 清理首页中文客群地域标签，改为 `中文圈` / `Chinese-speaking visitors` |
| 2026-06-09 | Codex | 在 `RULES.md` 加入旅行活动保险与协调说明 |
| 2026-06-09 | Codex | 在 `RULES.md` 加入 `records.md` 收工维护规则 |
| 2026-06-09 | Codex | 将旧记录文件更名为 `records.md`，避免与 progress.nice.okinawa 混淆 |

---

## 🔄 进行中

| 任务 | 说明 | 开始日期 |
|------|------|----------|
| 清理 macOS 垃圾文件与忽略规则 | 工作区新增 `.gitignore`，并删除已跟踪的 `.DS_Store` / `img/.DS_Store`；尚未提交，需确认是否连同其他仓库统一清理 | 2026-06-19 |
|  |  |  |

---

## 📋 待办

| 优先级 | 任务 | 备注 |
|--------|------|------|
| 高 | 每次任务结束更新本文件 | 写入已完成、进行中、待办、技术备忘或操作日志 |
| 中 | 检查页面是否展示旅行保险与协调说明 | 规则已写入，页面文案需后续确认 |
| 低 |  |  |

---

## 🗒️ 技术备忘

> 记录这个项目的关键规则，防止 AI 重复犯错。

- 出发港口：Chatan / Kadena / Awase；离岛 Ishigaki / Miyako 请直接咨询。
- 服务类型：初学者体验拼船、半日/全日包船、GT / Tuna / Amberjack / Jigging、多日远征。
- 不在站内处理支付。
- 中文用户不得用中国、台湾、中国香港、香港或对应旗帜区分；使用 `简体中文`、`繁体中文`、`中文圈`。
- 旅行活动页面必须说明现场活动保险、自行购买海外旅行保险、翻译协调边界和联系担当。

---

## 📝 操作日志

| 日期 | 执行者 | 操作 | 结果 |
|------|--------|------|------|
| 2026-07-31 | Codex | M0731-15 在干净临时 worktree 从 `origin/main` 起工；复核 snorkel inquiry Worker/Resend/D1 链路，只改 fishing 前端提交与 records；发现 Worker CORS 尚未允许 `https://fishing.nice.okinawa`，合并前需处理 | ⚠️ |
| 2026-07-27 | Codex | M0727-17 在干净临时 worktree 从 `origin/main` 起工；只改 fishing，补 `robots.txt` 的 GPTBot/ClaudeBot 显式 Allow，新增 `img/og-fishing.jpg` 并在首页补 OG/Twitter 图卡；llms.txt 与真人区块只读核查 | ✅ |
| 2026-06-29 | Codex | 运行 Daily repo records updater，核对 2026-06-28 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-28 | Codex | 运行 Daily repo records updater，核对 2026-06-27 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-27 | Codex | 运行 Daily repo records updater，核对 2026-06-26 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-26 | Codex | 运行 Daily repo records updater，核对 2026-06-25 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-25 | Codex | 运行 Daily repo records updater，核对 2026-06-24 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-24 | Codex | 运行 Daily repo records updater，核对 2026-06-23 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-23 | Codex | 运行 Daily repo records updater，核对 2026-06-22 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-22 | Codex | 运行 Daily repo records updater，核对 2026-06-21 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-21 | Codex | 运行 Daily repo records updater，核对 2026-06-20 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-20 | Codex | 运行 Daily repo records updater，核对 2026-06-19 提交与当前工作区；未发现昨日提交，`.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-19 | Codex | 运行 Daily repo records updater，核对 2026-06-18 提交与当前工作区；未发现昨日提交，补记 `.gitignore` 与已跟踪 `.DS_Store` 清理仍在进行中 | ✅ |
| 2026-06-18 | Codex | 运行 Daily repo records updater，核对 2026-06-17 提交与当前工作区；未发现新的提交或除 `records.md` 外的未提交业务变更 | ✅ |
| 2026-06-17 | Codex | 运行 Daily repo records updater，核对 2026-06-16 提交与当前工作区；未发现新的提交或除 `records.md` 外的未提交业务变更 | ✅ |
| 2026-06-16 | Codex | 运行 Daily repo records updater，核对 2026-06-15 提交与当前工作区；未发现新的提交或除 `records.md` 外的未提交业务变更 | ✅ |
| 2026-06-14 | Codex | 运行 Daily repo records updater，核对 2026-06-13 提交与当前工作区，补记公开页 SEO metadata、`robots.txt` / `sitemap.xml` 与 `hreflang` metadata 完成项；未发现除 `records.md` 外的未提交业务变更 | ✅ |
| 2026-06-13 | Codex | 运行 Daily repo records updater，核对 2026-06-12 提交与当前工作区，补记 shared analytics tracking 完成项，确认无新的未提交业务变更 | ✅ |
| 2026-06-12 | Codex | 运行 Daily repo records updater，核对 2026-06-11 提交与当前工作区，仅发现 `records.md` 日更维护，无新的业务变更 | ✅ |
| 2026-06-09 | Codex | 创建并填充此文件 | ✅ |
| 2026-06-09 | Codex | 推送规则初始化提交 | ✅ |
| 2026-06-09 | Codex | 推送中文标识页面修正 | ✅ |
| 2026-06-09 | Codex | 推送旅行保险协调规则 | ✅ |
| 2026-06-09 | Codex | 记录本次 records.md 维护规则更新 | ✅ |
| 2026-06-09 | Codex | 重命名记录文件并同步更新规则引用 | ✅ |
| 2026-06-09 | Codex | 运行日更记录检查；核对 2026-06-08 提交与工作区，`f004872` 仅涉及 `.DS_Store`，未发现需写入已完成/进行中的有效变更 | ✅ |
| 2026-06-10 | Codex | 运行日更记录检查；核对 2026-06-09 提交与当前工作区，确认昨日规则初始化与命名调整已记录，未发现除 `records.md` 外的未完成工作 | ✅ |
| 2026-06-11 | Codex | 运行 Daily repo records updater，核对 2026-06-10 提交与当前工作区，未发现相关变更 | ✅ |
