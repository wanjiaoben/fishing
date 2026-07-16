<!--WAN-CONSTITUTION-START version=v1.12-->
# WAN Constitution v1.12

唯一源头:wan-rules 仓库。各 repo CLAUDE.md 中的宪法区间由脚本同步生成,禁止手改。修改仅限 Wan 本人确认,每次修改版本号 +1 并同步全部 repo。
设计背景参考:docs/REVIEW_2026-0707_SYSTEM_DESIGN.md;CC 开工前必读 rules/ANTI_PATTERNS.md。该引用为 v1.8 设计背景与执法清单,非新增宪法条文。

一、运转条款

任务编号与留痕:每条任务指令编号 T+月日+序号(如 T0705-01),回报以编号开头,结论同步写入 PROGRESS.md(编号+一行结论)。无回报 = 未完成。
指令闭环:每条指令以回报要求结尾;每日收工执行一次收尾确认,清空悬空任务。
出问题必产出:每次故障处理完,必须产出防复发机制,优先级:自动检查(MERGE_GATE / smoke test)> 流程卡点(执行前报 Wan 确认)> 纯文字规则。纯文字规则每季度盘点,一季度未触发即删除或降级。
宪法修改程序:仅限 Wan 亲自确认;版本号 +1 后立即跑 sync 铺至全部 repo;MERGE_GATE 校验版本号,不匹配拒绝合并。
任务三分类:任务指令首行必须标注 A功能 / B内容 / C包装。A功能按全流程严管;B内容按产题、产词、加词工場规则推进,不得被无关技术流程阻塞;C包装仅允许在限定文件范围内试错。
Platform First:新增任何能力(Prompt/Schema/Workflow/工具/规则)前必答:产品能力还是平台能力?可做成平台能力的,禁止做成产品专属。平台能力入 shared 层,随 sync.sh 分发;产品层仅允许配置与扩展字段,禁止 fork 平台逻辑。
Evidence before Abstraction:任何抽象(共享模块/schema/generator/框架)必须来自 ≥2 个真实案例。禁止为预测中的需求做抽象;重复出现之后再抽象。流程升级为自动化/Agent/Generator:手动跑满20次且 SOP 稳定两周无修订。product-template 产品级变量以 {{PRODUCT_XXX}} 占位符登记于 product.config.md;generator 待第3个产品复制完成后立项。
Needs pool 门禁:新条目必填 reuse/auto/compound 三布尔 + platform|product 标注。三否且未标 [一次性但必要] 者,默认不排期。

二、红线条款

付费与对外:任何产生费用的操作、发信、联络客人,必须事前获得 Wan 明确授权。用户指令也不可越过此条,一律人工执行。
部署五步:分支 → 预览 → Wan 隐身验收 → merge → tag。永不直碰 main。生产 Worker 部署只能走 GitHub Actions,触发条件为已进入 main 的 annotated production tag,且 tag annotation 必须含 Wan-Verified: yes;本地 wrangler 只允许 preview 环境,禁止本地生产 wrangler deploy。
域名/API入口切换三同步:任何域名、API 入口、Worker 路由或前端入口切换,必须同时完成 DNS 解析验证通过、前端引用全量替换并经 site-config 收口、wrangler.toml 路由固化;三者未齐禁止合并 main。
冻结区改动红线:触碰 FREEZE.md 定义的冻结区即为高风险任务,必须单独任务、单独分支;指令必须列明允许修改的文件清单,清单外禁止改动。
密钥零明文:密钥只进 wrangler secret / 环境变量,禁止出现在代码、配置文件、仓库、聊天记录明文中。
生产数据只读:生产 KV / D1 / R2 只读;写入仅限 cctest 范围(fixture:cctest@nice.okinawa,OTP 135790,entitlement source "cctest",排除于营收统计)。
手动操作权益留痕:任何开通、延期、调整、补偿、撤销权益的手动操作,必须走脚本写入 entitlement_log;禁止只改 KV 或后台状态而不留痕。
测试邮件红线:禁止向真实用户地址发测试邮件;邮件链路测试只允许使用 cctest 范围或 Wan 明确指定的测试地址,不得把真实客户邮箱用于 smoke test / webhook replay / resend retry。
对 Wan 的沟通:全程简体中文;结论先行、短句、少专业术语,术语首次出现须一句话解释;需要 Wan 操作的步骤逐步可点;给 CC 的指令用代码块,内不嵌解释。凡增加 Wan 阅读负担的输出视为违反本条。方案一次给全、给最优解,禁止发出后追加补丁式选项。任务指令固定格式:代码块首行为 T编号+仓库名+一句话任务;回报首行为同一编号。
CC 交付固定六栏:所有 CC 交付必须包含且仅清晰呈现六栏:改了什么 / 修改文件 / 明确未改 / 自测结果 / 风险点 / 回滚方式。
Preview 交付双链接:CC 交付任何 preview 审核页时,必须同时提供①本地 file:// 绝对路径 ②Cloudflare Pages 公网 URL 两个链接,Wan 在电脑用本地、手机用公网。禁止只给 file:// 本地路径(Wan 手机无法访问)。
Preview 链接铁律:主链接必须是 Cloudflare Pages 真实 deployment URL(hash 子域),从部署记录复制,禁止手拼分支子域。必须是手机浏览器可直接点开的公网 https;给出前 CC 必须 curl 一次并贴 HTTP 状态码,证明非 404 且 success。file:// 仅作附加,不得作唯一或主验证链接。多页面改动时每页各给一条完整可点链接。违反即交付不合格,Wan 可直接打回,不进入 Wan-Verified。
核心链路保护:核心用户链路(登录、取题/取词、作答、判分、复盘、支付)的改动必须独立分支、独立验收,禁止与新功能混合合并;每类内容(题目/单词/音频)入库必须通过对应校验脚本,无校验脚本的内容类型不得批量入库;大规模推广前,监控+备份+核心链路探测必须全部在位。
【铁律·SINKOLABO UI 语言判定】
所有 SINKOLABO 站点 UI 语言必须经全站唯一的共享 resolver 判定,统一优先级为:`localStorage.bjt_ui_lang` > URL 参数 `?lang=` / `?ui=` > `navigator.languages`。`navigator` 是默认值而不是例外;客人手动选过的语言永远压过 URL 与浏览器语言。
`navigator.languages` 按顺序匹配:`zh-TW` / `zh-Hant` / `zh-HK` / `zh-MO` → `zh-tw`;`zh` / `zh-CN` / `zh-Hans` / `zh-SG` → `zh`;其它一切语言 → `en`。语言标签匹配必须大小写不敏感,并允许后续地区子标签。
禁止任何页面自带默认语言硬编码;禁止任何页面直接读取 `navigator.language` 或 `navigator.languages`,只能调用共享 resolver;新页面接入 i18n 时默认继承本规则,不得另立默认值。
本条必须配 CI 硬门禁:至少包含优先级与完整映射表单测、全站唯一实现点断言、禁止页面直读 navigator 的静态扫描;无门禁视为未实现。决策缘由与验收口径见 `docs/ADR_M0716-10_SINKOLABO_UI_LANGUAGE_RESOLUTION.md`。
【铁律·安全承诺验收】
任何安全承诺必须配套 CI 机器门禁方视为存在;无门禁的安全规则视同未执行。先例:study/mogi 四联 disjoint 门禁、59 条匿名泄漏探针、内容级付费特征扫描、计数防陈旧 `--check`。
“堵漏洞/关闭访问”类任务,验收必须包含反向证据(匿名/无权限访问失败的实测输出);施工方回报“已完成”不构成验收,只认机器门禁绿+反向证据。
对话/排查中诊断出的任何漏洞缺陷,必须当场编号并落档 `BACKLOG.md`/`PROGRESS.md`,禁止只存在于对话。案底:2026-07-02 Study 白用漏洞未落档,5 日后集体误记为已修,酿成 2026-07-12 裸奔事故的一部分。
【铁律·定期安全巡检】
每两周执行一次全量安全巡检,以 launchd 定时任务部署于 Mac mini(24h 无人值守机)自动执行,禁止依赖任何人的记忆。巡检内容:匿名探针全量打生产+本期新增静态资产/路由的泄漏扫描+FREEZE 冻结项门禁在位复核。异常即通知 Wan;无异常仅落 `reports/`。发现的漏洞按【铁律·安全承诺验收】第三款落档,修复后将路径纳入探针。
【铁律·施工与验收分离】
凡触及 FREEZE、安全/权益/支付、或“堵漏洞”类任务,施工与验收必须为两个独立 CC 会话;验收方不继承施工方上下文,仅获任务目标原文+PR 号,从零核验并交反向证据;施工方自测仅供参考。Wan 只依据机器门禁绿+独立验收报告合并。低风险任务(文案/report-only/纯样式)豁免。案底:2026-07-12 独立验收两轮抓出施工方遗漏——`question_difficulty.js`、PATTO 整目录裸词库——证明此机制必要。
【铁律·study/mogi 池不相交】
study 与 mogi（含模拟题预备池）题库内容必须永久不相交(disjoint)。
判定口径=四联：归一化题干(text，无则script，去全部空白) ＋ 选项集合(去空白、不计序) ＋ correct ＋ 音频文件名basename。任一题不得同时存在于 study 与 mogi/预备池。
出题铁律：所有新题只出到 study；经遴选升级为模拟题者，"移动"进模拟题预备池并同时从 study 删除（不是复制），一题只居其一。mogi 套题只从预备池组装，禁止从 study 现抽。
目的：刷 study 的用户在模拟考中绝不遇到已练过的题。
案底（为何有此门禁，勿删）：2026-06-02 已决策两池内容独立、模拟题"不从练习题里抽"；2026-06-06 立 mg/ps 前缀命名护栏；但无自动强制，2026-07-03 组装 mogi set04 时直接从 study bank 抽取组装，累计 208 道重叠，2026-07-12 事故修复(PR#59)并建本门禁。规则无门禁=形同虚设，此条为证。
电子书权益命名 SOP:电子书权益 ID 格式为 book_<书名英文>-<语言>。语言段小写且必带:简体=zh,英文=en,繁中=tradition。书名英文固定为 script(台本),lipstick(润唇膏),480(480+ 去 + 号)。权益 ID 一经上线不可改名,改名即已购用户权限失效。
Exit Rule:资产默认可删。每季度清点 shared 层资产:90天零引用移入 /deprecated/,保留一个版本周期后物理删除。Repo/Product 级退出由 Wan 单独裁决。FREEZE.md 覆盖区不适用。禁止以"历史兼容"为由无限期保留;确需兼容者写明截止日。
(空位):留给盘点后确认的真全局项。
<!--WAN-CONSTITUTION-END-->

# CLAUDE.md — fishing.nice.okinawa

> 本文件是 fishing repo 专属规则。全局规则见 RULES.md，两者都要读。

---

## ⚠️ 本站专属规则

- 出发港口：Chatan / Kadena / Awase（北谷美国村渔港、嘉手纳、泡瀬漁港）；离岛 Ishigaki / Miyako 请直接咨询
- 服务类型：初学者体验拼船、半日/全日包船、GT / Tuna / Amberjack / Jigging 等专业钓鱼、多日远征
- 特殊注意：不在站内处理支付；价格和船长判断的天气/海况规则必须清楚展示；港口和行程由实际船长安排为准

---

## 🏗️ 文件结构

```
fishing.nice.okinawa/
├── index.html     主页（面向用户，需完整合规）
├── img/gallery/   图片
└── records.md    进度日志
```

---

## ✅ 合规要求

- 六语言切换：必须
- 跨站引流区块：必须（见 RULES.md 引流映射表）
- 设计系统：必须遵循 RULES.md 色彩和组件规范

---

## 📝 开工检查清单

1. 读 RULES.md（全局规则）
2. 读本文件（本站专属规则）
3. 读 records.md（当前进度和待办）
