# ADR M0716-10: SINKOLABO UI 语言判定唯一入口

- 状态:已决策
- 日期:2026-07-16
- 范围:所有 SINKOLABO 站点的用户界面
- 类型:A功能 / platform

## 背景

M0716 出现英文和繁中客人进站后落入简体中文界面的“中文墙”。根因有两个:

1. 各页面各自硬编码默认语言为 `zh`,浏览器语言没有成为一致的默认判定来源。
2. 持久化键名分裂:`/en/` 写入 `bjt_locale`,buy 页只读取 `bjt_ui_lang`,手动选择的语言因此永远无法被读取。

## 决策

全站只允许一个共享语言 resolver。所有页面通过该 resolver 取得 UI 语言,不得自行实现默认值、持久化优先级或 navigator 映射。

优先级为:

1. `localStorage.bjt_ui_lang`
2. URL 参数 `?lang=` 或 `?ui=`
3. `navigator.languages`

已持久化的客人手动选择永远优先。URL 参数只在客人尚未手动选择时覆盖浏览器默认值。`navigator.languages` 是正常的默认来源,不是特判补丁。

`navigator.languages` 从前到后检查每个标签,对单个标签做大小写不敏感匹配:

- `zh-TW` / `zh-Hant` / `zh-HK` / `zh-MO` 及其后续地区子标签 → `zh-tw`
- `zh` / `zh-CN` / `zh-Hans` / `zh-SG` 及其后续地区子标签 → `zh`
- 其它一切语言 → `en`

如果语言列表前面是非中文、后面才是中文,以第一个语言为客人首选,结果为 `en`;不得跳过首选语言搜索后续中文标签。

## 验收与门禁

各站实现本决策时,CI 必须同时具备:

- 优先级单测:已存储选择压过 URL 与 navigator;URL 压过 navigator;
- 映射表单测:繁中四类、简中四类、其它语言回退 `en`,包含大小写和后续子标签;
- 唯一实现点断言:全站只有共享 resolver 可定义优先级和映射;
- 静态扫描:页面和非 resolver 脚本出现 `navigator.language` / `navigator.languages` 或页面级默认语言即失败;
- 新页回归:新增 i18n 页面必须导入共享 resolver,不得新增第二套默认值。

文档、resolver 代码或人工回报都不能替代上述 CI 门禁;门禁未绿即视为未实现。

## 影响

- 新页接入 i18n 时只接共享 resolver,不再讨论页面级默认语言。
- 旧键名如 `bjt_locale` 不再作为判定来源;如需兼容迁移,迁移只能在共享 resolver 中一次性完成,不得由页面分别兼容。
- 任何新语言或新映射只能修改共享 resolver 及其单测。
