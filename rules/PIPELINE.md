# PIPELINE.md v1.2 — CATALINA JAPAN 内容与产品流水线（上位规则）

本文件是所有 repo 的 `RULES.md` 上位规则。若本文件与某个 repo 的 `RULES.md` 冲突，以本文件为准。

---

## 0. 总原则

Wan 只做三件事：

1. 定选题。
2. 产内容：词句、照片、短文、书稿、商品素材。
3. 隐身验收。

除以上三件事外，其余工作默认由流水线完成，包括 CC、Codex、脚本、自动构建、自动发布、自动分发。

三条铁律：

1. **核心稳定优先**  
   锦上添花不得触及核心链路，宁可不做，不可误伤。
2. **支付全自助**  
   客人从落地页到开通必须零人工介入，支付问题不找 Wan 兜底。
3. **信息前置**  
   页面写清楚，杜绝重复提问；微信、LINE、WhatsApp 定位为深度咨询与二次成交入口，不是客服兜底。

---

## 1. 资产清单

### 1.1 流量摊：宣传 / 询盘型，7 站

| 站点 | 业务 | 备注 |
|---|---|---|
| `nice.okinawa` | 主站 / 品牌 | NICE_SEO 作战手册 v2.0 |
| `translation.nice.okinawa` | 商业翻译 | 询盘型 |
| `rental.nice.okinawa` | 租车 | 询盘型 |
| `activity.nice.okinawa` | 活动预约 | 6 语 |
| `fishing.nice.okinawa` | 海钓 | 询盘型 |
| `snorkel.nice.okinawa` | 浮潜 | 询盘型 |
| `japanusedcars.nice.okinawa` | 二手车出口 + 本地 | ⚠️ 当前为 GitHub Pages；本次 `PIPELINE.md` 落地不做迁移。Cloudflare Pages 迁移留在第 10 节待办，另开独立任务。 |

### 1.2 学习摊：收入型，3 产品

| 产品 | 定位 | 支付现状 |
|---|---|---|
| `bjt.nice.okinawa` | 商务日语 BJT，含 PATTO / 敬語° / app | PayPal 日元，已通 |
| `kiso.nice.okinawa` | 0 基础日语 | 未收过钱，待接 PayPal |
| `progress.nice.okinawa` | 多语听说 + 盖房子世界观 | 订阅未上线，待接 PayPal |

### 1.3 出版摊

KDP 系列：

- BJT 台本已出。
- 《穿上西装》中文稿、英文稿完成，待排版。
- 润唇膏项目在管线。

KDP 规格锁定：

- 尺寸：5" × 8"。
- 色彩：CMYK FOGRA39。
- 图片：300 DPI。
- Gutter：≥ 0.375"。
- 缩放：约 89%。

---

## 2. 内容流水线：一源多端

### 2.1 学习线

Wan 产出 `master JSON`，内容包括词、句、三语文本。

流水线处理：

1. CC 跑管线。
2. ElevenLabs 生成三语音频：
   - JP：Kenzo。
   - CN：Amy 或 Sage，按 deck 规则。
   - EN：Luna。
   - 动用付费 API 前必须获得 Wan 明确同意。
3. 音频上传 R2，例如 `progress-audio` 等对应 bucket。
4. 页面构建 + 预览。
5. Wan 隐身验收。
6. `merge`。
7. `tag`。

同一份 `master JSON` 自动衍生：

- KDP 书稿，按锁定规格排版，润唇膏模式脚本化。
- SNS 单词卡素材。
- Eagle 入库。
- coco 自动分发。

### 2.2 旅游线

Wan 产出照片 + 一段短文。一个景点、一个项目、一个车源，均视为一个内容单元。

流水线处理：

1. CC 套多语页面模板。
2. 自动生成 `hreflang`。
3. 自动生成 JSON-LD。
4. 页面构建 + 预览。
5. Wan 隐身验收。
6. 上线。

同一内容单元自动衍生：

- Google Business Profile post。
- SNS 帖子，走 coco。
- 页面统一挂询盘组件，见第 6 节。

### 2.3 出版线

学习线 `master JSON` 与旅游线内容单元持续累积。达到成书体量时，自动汇编为 KDP 书稿。

旅游攻略书与学习书共用同一套 KDP 排版脚本，只更换内容源。

封面暂不由 Claude 设计，待图像能力升级后再进入自动化范围。

---

## 3. 核心链路保护：铁律 1 落地

### 3.1 核心链路定义

以下内容视为核心链路：

- 支付 / 会员墙 / entitlement：PayPal IPN 或 webhook、`member_state`、Pro guard。
- 音频 API 鉴权：premium 门禁。
- `/api/questions` 内容门禁。
- `/api/play/verify`：Google 工单期间冻结，禁止任何 SA / 项目变更。

### 3.2 核心链路改动规则

核心链路任何改动必须完整经过以下流程：

```text
cctest 冒烟测试通过
→ Cloudflare / GitHub 预览
→ Wan 隐身验收
→ merge
→ tag
```

缺一不可。

### 3.3 PR 边界

- 非核心改动，例如宣传页、文案、样式、FAQ，走常规 `MERGE_GATE`。
- 核心与非核心改动禁止混在同一个 PR。
- 本文件落地类任务只允许新增或修改文档，不得修改业务代码。

---

## 4. 支付全自助：铁律 2 落地

统一方案：PayPal。已有账户继续使用，不新增支付渠道。

### 4.1 kiso

- 接 PayPal。
- 以日元结算。
- 页面可显示人民币参考价。
- 付款成功后，webhook 自动开通 `kiso Pro entitlement`。

### 4.2 progress

- 上线订阅。
- Standard：¥510 / 月。
- Premium：¥980 / 月。
- PayPal Subscriptions → webhook → entitlement 自动写入、续期、失效。

### 4.3 bjt

- 现有支付链路不动。
- 只做必要维护，不主动重构。

### 4.4 支付失败 / 异常

页面内置自动引导文案，至少覆盖：

- 换卡。
- 重试。
- 常见失败原因。
- 购买后如何开始。

不得把支付失败默认引导到私聊。

微信人工转账通道废止，不再作为任何产品的收款方式。

---

## 5. 信息前置 FAQ 标准：铁律 3 落地

### 5.1 收费学习产品 FAQ

每个收费产品落地页必须有 FAQ 区块，至少覆盖：

- 价格与包含内容。
- 有效期与续费。
- 设备与浏览器支持。
- 购买后如何开始。
- 退款政策。
- 常见支付失败原因。

FAQ 必须使用 `FAQPage` JSON-LD 标记，兼顾 SEO 与 GEO。

### 5.2 旅游站 FAQ

旅游站 FAQ 至少覆盖：

- 价格。
- 集合地点与时间。
- 天气取消政策。
- 语言支持。
- 如何预约。

### 5.3 FAQ 来源

FAQ 初始内容来源于 Wan 提供的微信、LINE、WhatsApp 高频问题清单。CC 负责提炼成文并多语化。

---

## 6. 询盘收口

7 个流量站统一询盘表单组件。

### 6.1 表单链路

```text
用户提交表单
→ Worker 接收
→ 推送 Wan
→ LINE + 邮箱双通道通知
```

### 6.2 表单字段

统一字段：

- 日期。
- 人数。
- 项目。
- 联系方式。
- 备注。

### 6.3 咨询入口定位

表单旁保留微信、WhatsApp、LINE 入口，但定位为深度咨询与二次成交，不作为客服兜底。

### 6.4 北极星指标

询盘计入 NICE_SEO 北极星指标。

目标：30 询盘 / 月。

---

## 7. SNS 分发：coco

统一分发链路：

```text
Eagle 导出
→ C:\coco\to-post\
→ R2：coco-sns-media
→ Facebook / Instagram 自动发布
```

学习线单词卡与旅游线照片共用此通道。

Mac → Windows 迁移完成前，Mac 侧任务保持运行。

---

## 8. 验收与发布：规则统一，执行隔离

所有 repo 遵守同一套发布规则，但必须按 repo 隔离执行。

每个 repo 独立执行：

```text
独立分支：docs/pipeline-v1
→ 独立 PR
→ 本 repo 的 Cloudflare / GitHub 预览
→ 本 repo 的 MERGE_GATE 或当前等效检查
→ Wan 隐身验收
→ merge main
→ tag, if that repo requires tag
```

规则：

- 禁止直接改 `main`。
- 每个 repo 独立分支、独立 PR、独立预览、独立 `MERGE_GATE` 或当前等效检查。
- 禁止跨 repo 合并提交。
- 禁止把多个 repo 的变更打包成一个提交、一个 PR 或一次 merge。
- 文档落地任务的分支名统一为 `docs/pipeline-v1`，但分支必须在各 repo 内分别创建。
- `japanusedcars` 本次仍按既有 GitHub Pages 链路处理文档预览，不做 Cloudflare Pages 迁移；迁移完成后，再纳入自身 repo 的 `MERGE_GATE`。

---

## 9. Wan 周节奏：目标状态

Wan 每周只投入以下内容：

- 学习线：1 批新词 / 句，即 `master JSON`。
- 旅游线：1–2 个内容单元，即照片 + 短文。
- 验收：集中一次处理所有待验收预览。

其余时间用于：

- 选题。
- 书稿。
- 商品优化。
- 新内容资产准备。

---

## 10. 待办缺口：按优先级

本节优先级只约束管线建设任务，不冻结正在进行的产品功能开发。

`progress` 的 `feat/venue-building-loop` 照常并行推进，不因本节优先级而暂停；但不得混入本次 `docs/pipeline-v1` 文档 PR。

### P0：先把收口和现金流跑起来

1. 询盘组件开发 + 7 站部署。  
   类型：非核心。目标：快。
2. `kiso` PayPal 接入。  
   类型：核心链路。
3. `progress` 订阅上线。  
   类型：核心链路。

### P1：降低重复沟通与发布摩擦

4. FAQ 区块全产品部署。  
   依赖：Wan 提供微信、LINE、WhatsApp 高频问题清单。
5. `japanusedcars` 迁移 Cloudflare Pages + 纳入 `MERGE_GATE`。  
   本迁移不属于本次 `PIPELINE.md` 落地 PR，必须另开独立分支和独立 PR。

### P2：放大内容复利

6. KDP 排版脚本化。  
   首个自动化案例：《穿上西装》中文版。
7. SNS 单词卡自动衍生脚本。

---

## 11. 本文件落地任务约束

将本文件落地到 repo 时，本次任务只允许做文档变更。

### 11.1 分支与 PR

每个 repo 单独执行：

```text
repo checkout
→ branch: docs/pipeline-v1.2-scale-plan
→ docs-only diff
→ independent PR
→ repo-local MERGE_GATE
→ Wan hidden review
→ merge
→ tag, if that repo requires tag
```

硬性约束：

- 每个 repo 独立分支。
- 每个 repo 独立 PR。
- 每个 repo 走自己的 `MERGE_GATE`。
- 禁止跨 repo 合并提交。
- 禁止把多个 repo 的变更塞进一个 PR。

### 11.2 允许变更

只允许变更：

- 新增或更新 `rules/PIPELINE.md`。
- 新增或更新 repo 根目录的 `RULES.md`。

其中：

- 已有 `RULES.md` 的 repo：只在头部增加上位规则指向行，除非已有内容与本文件直接冲突。
- `japanusedcars` 若无 `RULES.md`：本次创建最小版 `RULES.md`，只包含上位规则指向行与部署铁律。
- 本次不做 `japanusedcars` 的 Cloudflare Pages 迁移；迁移继续留在第 10 节待办缺口。

### 11.3 禁止变更

禁止变更：

- 业务代码。
- 支付代码。
- Worker 代码。
- API 代码。
- 构建配置。
- 环境变量。
- Cloudflare、GitHub、Google、PayPal 项目设置。
- Cloudflare Pages / GitHub Pages 部署方式。
- DNS。
- `progress` 的 `feat/venue-building-loop` 分支内容。

各 repo `RULES.md` 头部统一增加：

```md
> 上位规则：先遵守 `rules/PIPELINE.md v1.2 — CATALINA JAPAN 内容与产品流水线`；如与本文件冲突，以 `PIPELINE.md` 为准。
```

`japanusedcars` 若需要创建最小版 `RULES.md`，使用以下内容：

```md
> 上位规则：先遵守 `rules/PIPELINE.md v1.2 — CATALINA JAPAN 内容与产品流水线`；如与本文件冲突，以 `PIPELINE.md` 为准。

# RULES.md — japanusedcars.nice.okinawa

## 部署铁律

- 本 repo 当前仍按既有 GitHub Pages 链路部署。
- 禁止直接改 `main`。
- 所有变更必须走独立分支、独立 PR、预览、Wan 隐身验收、merge。
- 本次 `docs/pipeline-v1.2-scale-plan` 只允许文档变更：`rules/PIPELINE.md` 与 `RULES.md`。
- 本次不做 Cloudflare Pages 迁移。
- 本次不改构建配置、DNS、Cloudflare / GitHub Pages 项目设置。
- Cloudflare Pages 迁移留在 `rules/PIPELINE.md` 第 10 节待办缺口，另开独立分支和独立 PR。
```

### 11.4 Definition of Done

本任务完成标准：

1. `rules/PIPELINE.md` 已存在，标题为 `PIPELINE.md v1.2 — CATALINA JAPAN 内容与产品流水线（上位规则）`。
2. 每个 repo 的 `RULES.md` 头部已增加上位规则提示行。
3. `japanusedcars` 若原本没有 `RULES.md`，已创建最小版 `RULES.md`，且未做 Cloudflare Pages 迁移。
4. 每个 repo 都使用独立 `docs/pipeline-v1.2-scale-plan` 分支与独立 PR。
5. 每个 repo 的 `git diff --name-only` 只出现：
   - `rules/PIPELINE.md`
   - `RULES.md`
6. 没有任何代码文件、配置文件、环境变量、Cloudflare / GitHub / Google / PayPal 项目设置被改动。
7. `progress` 的 `feat/venue-building-loop` 没有被本次文档 PR 阻塞或污染。
8. 已生成各 repo 独立预览路径，交给 Wan 隐身验收。

---

## 12. 韧性标准（v1.1，批次实施）

本节规定产品稳定性底线。已进入实施批次的项目必须走独立分支、预览、cctest 冒烟、Wan 隐身验收后再合并。

### 12.1 支付容错

- webhook 失败必须落库或落持久化队列，并能重试。
- 每日对账 PayPal API 与本地订单 / entitlement 状态。
- 支付成功页必须提供订单号自助核验开通入口。

### 12.2 备份

- 使用 D1 的产品每日自动导出到 R2 备份桶。
- R2 音频桶定期同步到独立备份前缀或备份桶。
- 备份保留 30 天滚动，且必须有可还原验证。

### 12.3 监控

- cron 探针覆盖 OTP、支付回调健康、题库接口、音频接口。
- 异常推送 Wan LINE。

### 12.4 询盘存底

- 表单必须先写 D1，再推送 LINE / Email / WhatsApp。
- 推送失败必须可查、可补推、可标记处理。

### 12.5 账号安全

- Wan 本人保存 2FA 恢复码离线副本。
- Wan 本人确认域名和关键服务自动续费。
- 仓库只记录检查清单，不提交任何密钥、恢复码、付款信息。

### 12.6 合规页面

- 三个学习产品共用“特定商取引法に基づく表記”和隐私政策模板。
- 页面必须从购买路径和页脚可达。

---

## 13. 规模化预案（v1.2）

本节是规模化前的规则与预案。除 13.4 立即约束所有新开发外，其余项目按后续批次排期实施；任何实施都必须继续遵守独立分支、预览、cctest 冒烟、Wan 隐身验收流程。

### 13.1 邮件送达

- 所有发送域必须配置 SPF、DKIM、DMARC。
- OTP 邮件送达必须纳入监控探针；第二批实施监控时一并落地。
- OTP 发送失败、延迟过高、退信率异常时，应触发 Wan LINE 告警。
- 邮件服务配置、DNS 记录、退信日志排查步骤必须写入 `RUNBOOK.md`。

### 13.2 OTP 防刷

- OTP 发送接口必须具备 rate limit，至少覆盖 email、IP、全局三个维度。
- 对公开入口增加 Cloudflare Turnstile；验证码校验失败不得发送 OTP。
- rate limit 与 Turnstile 必须先在 preview 验证，再进入生产。
- 禁止为了转化率关闭防刷；需要放宽限制时必须记录原因、时间范围和恢复计划。

### 13.3 自助账户页

- 三个学习产品最终都应提供自助账户页，显示订单查询、当前有效期、购买记录、領収書下载。
- 領収書必须直接按适格請求書格式实现，至少包含：
  - 発行者名称、所在地、联系方式。
  - 登録番号：`T` + 13 位数字。
  - 交易日期、订单号、商品 / 服务名称。
  - 税率区分。
  - 税抜金额、消費税额、税込金额。
  - 购买者可识别信息。
- 登録番号由 Wan 提供后写入配置；在未提供前，不得伪造或硬编码虚假登録番号。
- 領収書生成必须可重复下载，同一订单重复生成内容必须一致。

### 13.4 D1 数据规则（立即生效）

本条立即约束所有新开发和所有新表设计。

- FSRS 只持久化每卡当前状态，不在 D1 中无界保存逐次 review 历史。
- 历史 review log 如需保留，必须按月归档到 R2 后，从 D1 清除或压缩为聚合数据。
- 任何新表设计禁止无界增长；设计时必须写明：
  - 主键和唯一键。
  - 查询索引。
  - 增长来源。
  - 保留期限。
  - 归档 / 清理策略。
- 事件表、日志表、探针表、邮件表、支付回调表默认必须有 retention 或 archive 方案。
- 未写清增长上限和清理策略的新 D1 表，不得进入实现。

### 13.5 `RUNBOOK.md`

每个核心产品必须补 `RUNBOOK.md`，目标是 CC 按文档在 30 分钟内恢复核心链路。

`RUNBOOK.md` 至少覆盖以下故障类型：

- Worker 挂：如何确认版本、回滚、重新部署、验证核心端点。
- D1 坏：如何定位最新备份、还原到临时库、比对表和行数、恢复服务。
- R2 不可达：如何确认 bucket、对象前缀、公开访问 / Worker 访问路径、切换备份对象。
- 支付回调失败：如何查订单、查 webhook 事件、重放或人工核验、修复 entitlement。
- OTP 不达：如何查邮件服务、DNS 记录、退信、rate limit、Turnstile、备用登录处理。

`RUNBOOK.md` 不得包含密钥、恢复码、API token、付款信息；需要外部平台操作的步骤只写操作清单和负责人。
