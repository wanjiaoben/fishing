# RECORDS — fishing

> 此文件由 Claude / CC / Codex 共同维护。每次执行任务后更新对应区块。

---

## 📍 当前状态

- **阶段**：维护中
- **最后更新**：2026-08-21
- **负责人**：Wan

---

## ✅ 已完成

| 日期 | 执行者 | 内容 |
|------|--------|------|
| 2026-08-21 | Codex | FISH-0821-01 新建 Chatan 全日 Amberjack trip report、列表页、两档无 EXIF WebP 图片；同步首页/套餐页入口、sitemap 与 llms.txt；待 PR 验收 |
| 2026-08-21 | Codex | FISH-0820-10 在首页与英文套餐页价格表下新增 Included / Not included / Free on request 三段内容及 FAQPage 对应问答；Fishing licence 因待 Wan 确认未写入 |
| 2026-08-21 | Codex | FISH-0820-08 全站价格改为五档 all-inclusive 套餐，首页与英文套餐页同步 FAQ/Offer JSON-LD、llms.txt 与协调口径；待 PR 合并后记录生产 merge SHA |
| 2026-08-20 | Codex | FISH-0820-05 合并 PayPal Authorization Sandbox 基线 #31（merge `b0a61a66696ff26f748ae0ae21e0db74c2769083`）；创建独立生产 D1 `fishing-paypal-auth`（`b86a0510-35dd-43f4-9bda-f1f9e5e7e6d2`）、生产配置、任意 JPY 授权单后台入口与 tag/Wan-Verified 发布门禁；未注入 Live secret、未发 PayPal 请求、未部署生产 |
| 2026-08-08 | Codex | M0808-14 将 fishing 既有价格、港口、季节鱼种、取消政策等事实写入 `llms.txt`，补 Service/Offer JSON-LD 价格结构化，并轻量优化图片属性与体验图体积 |
| 2026-08-05 | Codex | M0805-13 rev2 下线 fishing 首页询盘表单，原位置改为 Email / WhatsApp 明文直连块，并接入第一方 contact_click 渠道统计 |
| 2026-08-05 | Codex | M0805-03 确认 fishing 无 GA 残留，保留唯一第一方 `analytics.nice.okinawa` beacon，并将表单成功事件接入第一方信标 |
| 2026-07-31 | Codex | M0731-18 为 fishing 真提交补 `site=fishing` / `sourceSite=fishing.nice.okinawa` 自动校验，并与三站 Worker 精确 CORS 门禁对齐 |
| 2026-08-01 | Codex | M0731-15 移除 fishing 的 GA 代码，保留唯一第一方 `analytics.nice.okinawa` beacon，并补回归测试 |
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
- M0805-06 生产发车回滚锚：合并前 `origin/main` 为 `b28d112754b3904d4c6929e4a3ab837795741a66`，#24 原始施工提交为 `5bba9bc288ec47fbb13db0b04f3e75c5a868bb85`。如需回滚，revert #24 squash merge commit，并复验 `https://fishing.nice.okinawa/`。
- M0805-15 生产发车回滚锚：合并前 `origin/main` 为 `d2d58362f25e90a6798c028eaf73dba7fe5a45d3`，#25 原始施工提交为 `9fb75a476c2f34e19a6ea6cc05d6a4ae6c55e966`。如需回滚，revert #25 squash merge commit，并复验 `https://fishing.nice.okinawa/`。
- M0808-17 生产发车回滚锚：合并前 `origin/main` 为 `fc8a79b97354eee99db5f733a23a9965e127d98a`，#26 发车校验提交为 `2afb1e4ba47be8e0faacb59170724093719897d1`。如需回滚，revert #26 squash merge commit，并复验 `https://fishing.nice.okinawa/`。
- M0808-26 生产发车回滚锚：合并前 `origin/main` 为 `4de81e333470d51f42e03e08744ffad5689bacc6`，#27 squash merge commit 为 `00f889a38713a9aa9e11ed0de9643f6c39fa1c7a`。如需回滚，revert #27 squash merge commit，并复验 `https://fishing.nice.okinawa/` 与 `https://fishing.nice.okinawa/fishing-seasons/`。

---

## 📝 操作日志

| 日期 | 执行者 | 操作 | 结果 |
|------|--------|------|------|
| 2026-08-20 | Codex | FISH-0820-05：合并 #31；新建生产 D1 并应用五表 migration；补生产 wrangler 配置、任意订单 API/客户专属授权页、后台新建单 UI、生产 tag 发布 workflow；未注入 Live secrets、未部署 | ✅ 前置施工完成，待 FISH-0820-06 |
| 2026-08-20 | Codex | FISH-0820-02 新增 isolated PayPal Authorization Sandbox Worker/D1 施工稿：AUTHORIZE 订单、客户授权页、后台 void/capture、webhook 验签、audit log 与 Sandbox runbook；未上生产 | ⚠️ |
| 2026-08-19 | Codex | FISH-0819-01 新增 `/en/guides/okinawa-fishing-packages/` 英文引流内容页：Chatan 私人船钓 4h 与 Kadena Kayak/SUP+Fishing 两套餐，CTA 导 WhatsApp/email 询盘，并收录 sitemap/llms | ✅ |
| 2026-08-17 | Codex | FISH-0817-01 强化英文首页 AI 询盘路径：前置真实出发港、2/3 人包船示例与 WhatsApp CTA；新增 `/en/guides/where-to-stay-fishing/` 住宿区域指南并收录 sitemap/llms | ✅ |
| 2026-08-08 | Codex | M0808-26 经 Wan 授权将 #27 转 Ready 并 squash merge，上线 `/fishing-seasons/`；GitHub Pages 部署 `31249259089` success，生产十项点验 PASS | ✅ |
| 2026-08-08 | Codex | M0808-19 从内容稿新建 `/fishing-seasons/` 英文季节页；追加 sitemap/llms 索引、首页 guide 末尾入口，并补 LocalBusiness telephone/image/priceRange 结构化字段 | ✅ |
| 2026-08-08 | Codex | M0808-17 发车前追加 schema.org 官方校验与 Google Rich Results Test；修正 #26 中 Service/Offer JSON-LD 关系到零 error 后发车 | ✅ |
| 2026-08-08 | Codex | M0808-14 从 `origin/main` 干净临时 worktree 起工；不改页面可见文案、plan、FAQ、robots、表单或 GA；仅结构化暴露既有事实并压缩 `img/exp-fishing-2.jpg` | ✅ |
| 2026-08-05 | Codex | M0805-13 rev2 从 `origin/main` 干净临时 worktree 起工；移除首页询盘表单、Turnstile 与 inquiry endpoint 前端引用；未改 inquiry Worker、D1 与其他站 | ✅ |
| 2026-08-05 | Codex | M0805-03 在 `origin/main` 干净临时 worktree 起工；保留现有真实提交链路与失败提示，只在提交成功后通过第一方 analytics endpoint 上报 `contact_click` / `form`；补成功/失败路径回归测试 | ✅ |
| 2026-08-01 | Codex | M0731-15 从 `origin/main` 干净临时 worktree 起工；移除 GA 初始化与表单成功后的 GA 事件副作用，保留 M0731 真提交 endpoint/payload/失败处理；确认第一方 beacon 唯一 | ✅ |
| 2026-07-31 | Codex | M0731-18 承接 M0731-15 真提交分支，新增静态回归测试；共享 Worker 已在独立分支补 fishing 精确 origin 与来源落库测试 | ✅ |
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
