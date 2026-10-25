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
FISH-0923-13：夜钓套餐、FAQ、llms.txt 事实段与 JSON-LD Offer 已上线（PR #79，生产 SHA e7b04e4，Pages 部署成功）。
FISH-0923-15：六语套餐价格改版施工完成，已上线：PR #81，生产 SHA 371b6b4aafbf5f07c3556e5e438d31e6a14e4a29，Pages 部署成功；回滚点 e7b04e475ddd31ac61d58648003050a905d176a3。

M1017-01 B内容：新增已验收船只介绍静态页 `/chatanboat/`，待 PR/MERGE_GATE 与 Pages 发布；核心业务零修改。

M1017-02 C包装：船页收紧区块留白，主图去拱门改正方形；其余照片尺寸和内容不变。

M1025-01 A功能：PR #86 新增翻译同行预授权网页，用户本轮已批准且候选已修正翻译订单自动邮件的取消条款一行。独立43/43模拟测试通过，旧两品牌邮件及28张网页与基线一致。B在先保存生产恢复锚后，只发一次PayPal空POST，收到403/1010立即停止；Square未探测，无重试。前后健康与脚本均200且内容不变，无须回滚。未上线、未发信或操作真实订单；仍待公网浏览器、路由验收及具体候选生产发布批准。完整恢复锚与请求结果见records.md。

M1025-01 服务说明追加：按用户中文母版加入英文服务说明及勾选确认，translation新建订单使用独立条款版本；PayPal仅对新品牌补服务端同意校验，Square保留原校验。46/46模拟测试通过、旧品牌28页一致；本轮未重复线上探测、未发信、未部署，独立代码复核已通过；仍待既有发布验收。

M1025-01 简版：按“短一点 放上网ok”缩为三段服务说明+一行勾选，条款版本v2；46项测试及28张旧页对比通过。上线已获本轮明确授权，当前Cloudflare发布后台停在登录页，待安全认证及既有预览验收；尚未上线。
