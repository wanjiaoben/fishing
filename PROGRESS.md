T0705-08 design tokens synced to RULES.md; no existing page styles changed.
T0705-04 merged T0705-04/07/08 wan-rules PRs; main is on WAN constitution v1.2 and design tokens, pending tag v2026.07.05-wan-rules-v1.2.
T0705-04 tag v2026.07.05-wan-rules-v1.2 pushed; main check_wan_constitution.sh PASS.
T0705-13 wan-rules v1.3 synced to CLAUDE.md.
T0705-15 rules slimmed: archived audit items to docs/archive, rewrote BJT entitlement/language/payment/security/architecture notes where applicable.

T0706-04 WAN 宪法 v1.4 已同步到 CLAUDE.md，MERGE_GATE 宪法版本校验保持启用；bjt 新题 mode 门禁在 bjt repo 落地。

T0706-24 WAN 宪法 v1.5 已同步到 CLAUDE.md；新增域名/API入口切换三同步与手动权益 entitlement_log 留痕红线。

T0707-14 WAN 宪法 v1.6 已同步到 CLAUDE.md，FREEZE.md 冻结区同步到仓库根目录；新增冻结区、任务三分类、CC 交付六栏规则。
M0731-18 fishing 真提交验收补强：固定 `site=fishing` 与 `sourceSite=fishing.nice.okinawa`，并以自动测试保证仅后端成功后显示已收到。
FISH-0821-HOTFIX-04 生产 Square 卡表单真实 Chromium 复验可渲染；补前端 stage 错误上报、`?debug=1` 明文诊断与 Square 字体 CSP 白名单，待 PR/Wan-Verified 发布。
FISH-0821-HOTFIX-04 追加：补生产两域 `/api/square/*` 路由；Square 提交失败显示 HTTP 状态码+服务端 message，并上报 `authorize-submit`。
