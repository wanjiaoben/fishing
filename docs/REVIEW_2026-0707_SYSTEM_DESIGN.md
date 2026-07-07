系统设计审查报告
终版 v2.2 · 2026-07-07

审查对象：这条生产流水线能否以近乎相同成本复制出第 2、第 10、第 100 个产品。

一、最终判断

当前系统已经具备内容生产复利能力，但尚未具备完整的产品复制能力。

内容侧已经沉淀出一批可复用资产：FACTORY 五层规则 + selfcheck、constitution / MERGE_GATE 治理、音频 pipeline、SEO 三件套、KDP 规格、敬語° OOTD，以及“每次审核失败 → 新增自动检查”的系统原则。

同时，wan-rules main 当前 CONSTITUTION.md 已进入 v1.8，正文已包含四条：

Platform First
Evidence before Abstraction
Exit Rule
Needs pool 门禁

这说明治理底座已经从“版本链未清”进入“v1.8 已落 main、等待实践检验”的阶段。

但另一半仍然绑死在单产品和 Wan 本人身上：账号体系、权限开通、记账、客服知识、反馈数据、云平台账号级操作。

因此，下一阶段的主战场不是继续扩内容产能，而是把：

订单、权限、客服、数据、账号治理

也变成复利资产。

第 2 个产品可以靠人顶住；第 10 个产品会开始混乱；第 100 个产品如果后台不结构化，必然失控。

二、宪法状态

当前宪法状态：

项	状态
仓库	wan-rules
文件	CONSTITUTION.md
main 版本头	v1.8
正文条款	Platform First / Evidence before Abstraction / Exit Rule / Needs pool 门禁
T0708-02 状态	已闭环，不再是当前卡点

当前不再处理 v1.7 / v1.8 版本链问题。
后续修宪只能基于实践证据，不因设计洁癖单独开 PR。

关于 shared 能力 changelog 的补充：

“≥2 个产品依赖的 shared 能力必须有 changelog”暂记为 v1.9 候选细则。
不单独开 PR，不回补进当前 v1.8。
等真实出现 ≥2 产品依赖 shared 能力后，再随下一次实践驱动修宪合入。

三、Content Factory

Content Factory 的瓶颈仍然只有一个：Wan 的终审。

主指标只盯一个：

终审每小时上线题数

当前约 50，抽检机制落地后目标 200+。该指标进入 Daily Digest。

但主指标必须绑定四个护栏：

返工率
上线后纠错率
用户投诉率
抽检失败率

判断规则：

终审时产上升，但任一护栏恶化，视为“吞质量的假提效”，不得降低抽检比例。

分级抽检规则

抽检机制采用：

pattern 连续 N 批 selfcheck 达标 → 抽检比例下降 10%

但必须满足以下边界：

抽检下限不得低于 10%。
新题型、新产品、新 Prompt 版本必须回到全检。
任一 P0/P1 错误触发全检回滚。
抽检失败后，必须新增 selfcheck 项或修改生成规则。
未完成规则修复前，不得再次降低抽检比例。
四、Admin 终态：HITL，不是工具

Admin 的终态不是“自动化工具”，而是 HITL 流程：

微信截图 / 订单记录 → OCR / 解析 → AI 生成候选操作 → Wan 确认 → 自动执行 → 写入 audit log → 支持 rollback

凡影响以下对象的操作，必须可追溯、可撤销、可去重：

金额
权限
用户状态

Admin v1.1 必须补齐：

audit_log
rollback
idempotency_key
manual_override_reason
幂等键规则

必须区分两类 key：

类型	用途	生成方式
存储键	唯一存储一条订单记录	可以使用 order:{YYYYMMDD}:{timestamp_ms}:{random4}
幂等键	防止同一业务事实重复执行	必须由内容派生

幂等键不得使用每次生成都不同的随机存储键。

正确规则：

同一张截图、同一笔付款、同一业务事实，重复提交时必须产生相同 idempotency_key，从而被拦截。

可选生成方式：

结构化订单：
hash(normalized_email + product + amount + paid_date + channel + source_note)
付款截图：
hash(screenshot_fingerprint) 或 hash(OCR_normalized_text + amount + paid_date)
人工补录：
hash(email + product + amount + paid_date + source_note)

source_note 可来自付款截图编号、微信备注、人工对账备注或其他可追溯来源。

人工覆盖 AI 识别结果时，必须记录原因，进入规则沉淀池。

五、Entitlement：P0 平台底座

Entitlement 不再是普通排队任务，而是 P0 平台底座。

铁律：

订单 ≠ 权限。

付款记录、权益状态、访问事件必须分离。否则退款、赠送、打包、升级、老带新、会员包、限时访问都会混在一起。

归属仓规则

Entitlement 是平台能力，不是单产品能力。

层级	归属
schema 定义	wan-rules shared 层
首版实现	bjt worker
产品侧	只消费配置，不允许 fork schema

任务卡命名必须避免误导。不得写成单一的 bjt entitlement-schema。应拆成：

T0708-03 wan-rules entitlement-schema-definition
T0708-04 bjt entitlement-worker-implementation

两者同期推进，但定义与实现分仓。

MVP schema

MVP 先做两张表。

表	字段
Order	order_id, user_email, product, tier, amount, currency, channel, paid_at, source, source_note, operator, status, idempotency_key
Entitlement	user_email, product, access_type, starts_at, expires_at, granted_by, grant_reason, source_order_id, status

AccessEvent 暂不预建。等埋点需求真实出现后再加。

硬门禁：

任何新收费产品上线前必须接入 entitlement。
progress 上线前必须完成 entitlement + order schema + audit log。

六、Daily Digest 定义

Daily Digest 的目标不是汇报所有信息，而是让 Wan 每天只处理最重要的判断。

固定五块：

昨日内容
新增题数、终审耗时、终审每小时上线题数、抽检失败数。
昨日经营事件
新订单、退款、权限异常、未处理客服。
昨日系统异常
selfcheck failure、MERGE_GATE block、Admin 识别失败、成本异常。
昨日用户洞察
高频问题、新反对意见、可转 FAQ / 内容 / 销售页素材。
今日只需 Wan 判断的事项
approve / reject / defer。

硬规则：

每封 Daily Digest 最多只能有 3 个需要 Wan 判断的事项。
超过 3 个，系统必须先自动分级、合并或延后。
Digest 超过 3 个判断项即违规。

七、product-template：复制清单，不是模板代码

product-template v0 的定位：

复制清单 + {{PRODUCT_XXX}} 占位符 + 反 fork 规则。

它不是 Platform Generator，也不是通用生成框架。

第一版核心文件是 PRODUCT_MANIFEST.yaml。每个产品必须声明：

字段	含义
product_id	产品唯一标识
product_name	产品名
owner	当前负责人；现阶段默认 Wan
status	draft / active / deprecated 等
target_user	目标用户
pricing	定价
access_type	访问类型
entitlement_required	是否接入权益系统
content_factory	内容生产配置
support_channel	客服渠道
analytics_events	埋点事件
ai_cost_budget	AI 成本预算
launch_date	上线日期
sunset_rule	退出规则
setup_time_record	上线耗时记录

其中 setup_time_record 是未来 Copy Cost Dashboard 的证据来源。
现在不立复制成本仪表盘，只记录真实上线耗时。跑完两个真实产品后，再决定是否升级为 dashboard。

Platform Generator 继续不立项。

判断规则：

Generator 提案必须引用 ≥3 个真实产品里的重复字段、重复流程或重复错误。
在此之前，template 只负责暴露重复，不负责消灭重复。

八、Support Intelligence Log

微信客服里的隐性用户洞察，是目前每天产生、每天蒸发的高价值资产。

但第一版不做复杂系统，先做 5 字段手动表：

字段	含义
date	日期
product	产品
raw_issue	用户原始问题
normalized_issue	归一化问题
next_action	后续动作

next_action 只允许以下几类：

update_FAQ
update_content
update_sales_page
update_product
ignore

规则：

跑满 20 次，且 SOP 稳定两周后，再决定是否扩字段或接入 Admin / OCR。

九、账号与权限治理

这部分作为 checklist，不入宪。

执行规则：

所有生产账号必须启用 2FA。
key / token / API key 禁止写入 prompt、文档、截图。
shared repo 与 product repo 权限分层。
云平台高危操作必须走 checklist 或二次确认。
协作者退出、换人、外包结束时必须有 revoke 流程。
FREEZE 区相关变更必须单独说明风险和回滚方式。

关于 shared 能力的 changelog：

≥2 个产品依赖的 shared 能力必须有 changelog。
该细则暂记为 v1.9 候选，不改当前 v1.8，不单独开 PR。
等真实出现 ≥2 产品依赖 shared 能力后，再随下一次实践驱动修宪合入。

十、禁止事项：反模式清单

以下事项禁止出现：

禁止复制 shared 能力后在产品层私改。
禁止 Prompt 不进 repo。
禁止无手动 SOP 样本就自动化。
禁止把付款截图作为唯一订单记录。
禁止开通权限但不写 audit log。
禁止幂等键使用随机存储键。
禁止高频客服问题不进入 FAQ / 内容 / 销售页更新队列。
禁止新产品无 source tracking。
禁止 AI 调用无预算、无计数、无报警。
禁止 Daily Digest 超过 3 个待判断事项。
禁止第 3 个真实产品前做 Platform Generator。
禁止 CC 自行裁决宪法条文冲突。
禁止 FREEZE 区无豁免变更。
禁止把平台 schema 埋进单产品仓。
禁止在 v1.8 已落 main 后继续围绕 v1.7 / v1.8 版本链空转。
十一、执行队列
#	任务	优先级	状态 / 门禁
1	T0708-01 bjt Admin 开通工具	✅	PR #19 已合并；main 干净；v1.1 补 audit log / rollback / 内容派生幂等键
2	T0708-02 wan-rules 宪法 v1.8	✅	CONSTITUTION.md main 版本头为 v1.8；正文含 Platform First / Evidence before Abstraction / Exit Rule / Needs pool 门禁
3	T0708-03 wan-rules entitlement-schema-definition	P0	schema 定义落 shared 层；progress 前硬 deadline
4	T0708-04 bjt entitlement-worker-implementation	P0	bjt worker 首版实现；接 order / audit log / idempotency
5	Daily Digest v0	P1	五块结构；≤3 判断
6	product-template v0	P1	清单化 + MANIFEST；不做 generator
7	Support Intelligence Log	P1	先 5 字段手动表；20 次后扩
8	Prompt eval fixtures	P2	触发式：首次回归事故建立首个 fixture
9	AI cost accounting	P2	敬語°上线前必须接入成本计数

当前卡点已从“wan-rules 版本链”转移为：

entitlement + order schema + audit log 的平台定义与 bjt worker 实现。

十二、终态定义

Wan 每天的工作：

终审内容 + 看一封 Daily Digest + 做 ≤3 个判断。

其余时间用于写书、录内容、见用户、做关键产品判断。

7200 人规模下，日常操作目标：

≤30 分钟 / 天

宪法 v1.8 已落 main，进入实践检验阶段。
entitlement、Daily Digest、product-template 三个项目跑完后，再回检哪条规则常被违反，让实践修宪。

责任分工报告
2026-07-07 版
一、分工原则

系统分三层责任：

角色	职责
Wan	裁决与不可替代判断
AI 顾问 / Claude	策略、审查、任务卡、QA、队列调度
CC	执行、提交、同步、自动检查

核心原则：

Wan 不下场做可交付执行。
AI 顾问不碰生产环境。
CC 不做边界外判断。

任何一方越界，都会把系统重新拉回“只有我会”的手工作坊状态。

二、Wan 的责任

Wan 只负责不可替代的判断。

1. 战略判断

Wan 负责：

产品做不做
产品生死
定价
退款裁量
品牌叙事
用户承诺
FREEZE 区变更批准
宪法条款最终裁决

Wan 不负责：

手工整理任务
追 PR 状态
检查 CC 交付格式
写重复 SOP
手动复制 shared 能力
长期盯后台琐事
2. 内容判断

Wan 负责：

题目终审
教学洞察
用户深访
写书核心内容
高价值内容判断
品牌调性判断

Wan 不负责：

机械质检
格式检查
重复纠错
批量改 prompt
批量同步仓库

这些必须交给 selfcheck、MERGE_GATE、CC 或后续工具。

3. 每日动作

Wan 每天只做三类事：

看 Daily Digest
做 ≤3 个判断
终审内容

Daily Digest 之外的新增事项，不直接插队。
除非是 P0 事故，否则进入队列。

Wan 的目标不是“多处理”，而是：

让系统越来越少需要 Wan 处理。

三、AI 顾问 / Claude 的责任

这里的 “Claude” 指当前系统里的策略 / QA / 调度位，不是生产执行位。

1. 把 Wan 的自然语言意图转成任务卡

AI 顾问负责把 Wan 的想法变成可执行任务卡。

任务卡必须包含：

任务编号
目标仓库
背景
范围
验收标准
禁止事项
FREEZE 区风险
交付要求

任务编号必须带仓库名，例如：

任务	含义
T0708-03 wan-rules entitlement-schema-definition	平台 schema 定义
T0708-04 bjt entitlement-worker-implementation	bjt worker 首版实现

禁止用 T0708-03 bjt entitlement-schema 这类写法，避免 CC 把平台 schema 埋进单产品仓。

2. 审 CC 交付

AI 顾问负责根据以下标准审查 CC：

验收项是否完成
是否违反 CONSTITUTION.md v1.8 四条正文
是否碰 FREEZE 区
是否新增反模式
是否补 selfcheck / MERGE_GATE
是否按现行六列交付
是否存在隐性 fork
是否把平台定义误落入产品仓

六列交付以现行执行规范为准。本文不二次定义列名，避免产生两个版本。

3. 维护执行队列

AI 顾问负责维护：

P0 / P1 / P2 优先级
当前唯一卡点
下一步可执行任务
任务之间的依赖关系
schema 定义与实现的仓库边界

当前队列优先级为：

T0708-03 wan-rules entitlement-schema-definition
T0708-04 bjt entitlement-worker-implementation
Daily Digest v0
product-template v0
Support Intelligence Log
Prompt fixtures
AI cost accounting

T0708-02 wan-rules 已闭环，不再列为当前卡点。

AI 顾问不得为了“看起来完整”主动新增制度。
所有新增制度必须满足 Evidence before Abstraction。

4. 审查与复盘

AI 顾问负责做：

复利资产审查
规模化风险审查
技术债审查
产品复制审查
执行队列审查

但不直接修宪。

当前宪法 v1.8 已落 main，正文包含 Platform First / Evidence before Abstraction / Exit Rule / Needs pool 门禁四条。
AI 顾问只能在实践证据出现后，向 Wan 提出修宪建议。

其中“≥2 个产品依赖的 shared 能力必须有 changelog”暂记为 v1.9 候选细则。
不改当前 v1.8，不单独开 PR。
等真实出现 ≥2 产品依赖 shared 能力后，再随下一次实践驱动修宪合入。

5. AI 顾问不做的事

AI 顾问不做：

不碰生产环境
不替 Wan 做定价 / 退款 / 产品生死判断
不让 CC 越权
不主动催下一件事
不把空洞治理写成制度
不在无真实重复证据时设计 generator
不把平台 schema 写成产品仓任务
不在 v1.8 已落 main 后继续制造 v1.7 / v1.8 版本链问题
四、CC 的责任

CC 是执行位，不是裁决位。

1. 按任务卡执行

CC 只按任务卡范围执行。

必须做到：

边界内完整交付
边界外零动作
不自行扩大任务范围
不顺手重构
不顺手修“看起来也有问题”的地方

如果发现任务卡范围外的问题，只能报告，不得擅自处理。

2. 按现行六列交付

CC 每次交付必须使用现行六列模板。

本文不重定义六列名称。
列名、顺序、口径一律以当前执行规范为准。

缺列、改列名、换口径，均视为交付不完整。

3. FREEZE 区规则

CC 对 FREEZE 区：

零接触
零猜测
零自行裁决

如确需触碰，必须：

单独说明原因
单独说明风险
单独说明回滚方式
等待 Wan 批准
4. 宪法 / 权限类冲突

CC 如果发现以下冲突，必须停手上报：

后续任何宪法 PR 与 CONSTITUTION.md v1.8 四条正文冲突
MERGE_GATE 版本号与 CONSTITUTION.md 版本头不一致
shared 层同步冲突
FREEZE 邻区风险
main 侧已有 entitlement 结构，且与新 schema 语义冲突
权限 / 订单 / 用户状态语义冲突
schema 定义与产品实现边界不清
幂等键与存储键混用

CC 不得自行裁决宪法条文，不得自行决定平台 schema 取舍。

5. 自动检查义务

CC 的最高执行原则：

每次审核失败 → 新增自动检查项。

可新增位置包括：

selfcheck
MERGE_GATE
sync 检查
schema 校验
prompt 检查
audit log 检查
idempotency 检查

如果一次错误只被人工记住，没有变成检查项，视为系统没有吸收这次失败。

6. Repo / Git 规则

CC 必须做到：

所有 Prompt 进 repo
所有脚本进 repo
所有规则走 git
所有变更走 PR
禁止本地私存
禁止口头状态替代提交记录
平台 schema 定义必须进入 wan-rules shared 层
单产品实现不得反向定义平台 schema
五、三方交接界面

标准链路：

流向	交接内容
Wan → AI 顾问	自然语言意图 / 判断 / 裁决
AI 顾问 → CC	任务卡 / 验收标准 / 禁止事项 / 仓库边界
CC → AI 顾问	现行六列交付 / PR / 验证结果 / 风险说明
AI 顾问 → Wan	≤3 个判断项 / 当前唯一卡点 / 是否需要裁决

禁止跳级：

Wan 直接指挥 CC 改 FREEZE 区
CC 直接找 Wan 要任务扩展
AI 顾问绕过 Wan 改宪法
CC 自行解释宪法冲突
Wan 被迫审低层实现细节
CC 把平台 schema 落进产品仓
AI 顾问用自定义六列覆盖现行六列

任何跳级都视为流程违规。

六、当前责任落点

当前不再有 v1.7 / v1.8 版本链卡点。

当前主线转为：

entitlement + order schema + audit log

也就是：

T0708-03 wan-rules entitlement-schema-definition
T0708-04 bjt entitlement-worker-implementation
Wan 当前责任

Wan 当前只需要裁决平台语义问题，不下场做实现。

可能需要 Wan 裁决的事项：

access_type 是否先只支持单品权限，还是预留 bundle / subscription。
grant_reason 是否需要白名单。
source 与 source_note 的填写口径。
退款 / 撤权是否进入 v0，还是 v1.1。
是否存在 FREEZE 区风险，需要批准。

非以上事项，不进 Wan 判断队列。

AI 顾问当前责任

AI 顾问负责把当前主线拆成两张任务卡：

T0708-03 wan-rules entitlement-schema-definition
T0708-04 bjt entitlement-worker-implementation

并确保：

schema 定义落 wan-rules shared 层。
bjt worker 只实现，不反向定义平台 schema。
Order 包含 source_note。
幂等键由内容派生，不使用随机存储键。
audit log / rollback / manual_override_reason 进入 Admin v1.1。
任务卡验收标准对齐 CONSTITUTION.md v1.8 四条正文。
所有交付按现行六列模板。
CC 当前责任

CC 当前执行时必须做到：

先确认 wan-rules main 的 CONSTITUTION.md 版本头为 v1.8。
以 v1.8 四条正文作为治理基线。
不再处理 v1.7 / v1.8 版本链问题。
按任务卡分别处理平台 schema 定义和 bjt worker 实现。
发现 main 侧已有 entitlement 结构或语义冲突时停手上报。
不把平台 schema 埋进 bjt。
不混用存储键和幂等键。
交付时按现行六列模板报告验证结果。
七、责任边界一句话版

Wan：只做不可替代判断。
AI 顾问：把判断变成任务，把交付挡在 Wan 前面。
CC：只按任务卡执行，把失败变成自动检查。

系统能不能复制第 2、第 10、第 100 个产品，关键不在“谁更努力”，而在这三条边界能不能守住。