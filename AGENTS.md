# AGENTS.md

本仓库受 wan-rules 宪法治理。开工前必读本仓库的 CLAUDE.md、RULES.md、FREEZE.md、MERGE_GATE.md、DEPLOY_GATE.md,严格遵守其中全部规则。
与本文件冲突时,以 CLAUDE.md 及 wan-rules/CONSTITUTION.md 为准。

红线速记(详见上述文件):
- 永不直碰 main;改动走分支。
- 禁止本地生产 wrangler deploy;生产部署只走 GitHub Actions + Wan-Verified tag。
- 任何产生费用/发信/联络客户的操作,先停下问 Wan。
- 禁止碰 FREEZE.md 冻结区(除非任务明确列出允许文件)。
- 密钥零明文;生产 KV/D1/R2 只读。
- 交付六栏:改了什么/修改文件/明确未改/自测结果/风险点/回滚方式。
- 拿不准是否触线,默认停下问 Wan。
