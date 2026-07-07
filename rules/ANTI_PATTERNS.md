# WAN Anti-Patterns

来源: `docs/REVIEW_2026-0707_SYSTEM_DESIGN.md`「十、禁止事项：反模式清单」。

CC 开工前必须阅读本清单。可自动检查的条目进入 MERGE_GATE；其余条目作为人工审查项。

## 禁止事项

1. 禁止复制 shared 能力后在产品层私改。
2. 禁止 Prompt 不进 repo。
3. 禁止无手动 SOP 样本就自动化。
4. 禁止把付款截图作为唯一订单记录。
5. 禁止开通权限但不写 audit log。
6. 禁止幂等键使用随机存储键。
7. 禁止高频客服问题不进入 FAQ / 内容 / 销售页更新队列。
8. 禁止新产品无 source tracking。
9. 禁止 AI 调用无预算、无计数、无报警。
10. 禁止 Daily Digest 超过 3 个待判断事项。
11. 禁止第 3 个真实产品前做 Platform Generator。
12. 禁止 CC 自行裁决宪法条文冲突。
13. 禁止 FREEZE 区无豁免变更。
14. 禁止把平台 schema 埋进单产品仓。
15. 禁止在 v1.8 已落 main 后继续围绕 v1.7 / v1.8 版本链空转。

## MERGE_GATE 自动检查项

- Prompt / 脚本不在 repo 内: PR 中新增或修改的 repo 文档、配置、Prompt、脚本不得引用仓库外的本机路径作为 Prompt 或脚本来源。
- 平台 schema 出现在产品仓: 产品仓不得新增或修改平台 shared schema 专属文件；平台 schema 定义必须归属 wan-rules shared 层。

## 人工审查项

其余禁止事项由 PR 审查时人工核对。发现违反后，优先补 MERGE_GATE / selfcheck；不能自动化时再补流程卡点。
