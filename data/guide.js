
// ============================================================
// guide.js — fishing.nice.okinawa
// 沖縄釣りガイドデータ。随時追記可能。
// ============================================================

const GUIDE = {

  // ── 四季カレンダー ──────────────────────────────────────
  seasons: [
    {
      id: "spring",
      name_ja: "春 (3月〜5月)",
      name_zh: "春季 (3月～5月)",
      name_en: "Spring (Mar–May)",
      icon: "🌸",
      highlight_ja: "カンパチ・GT・マグロシーズン開幕",
      highlight_zh: "红甘鲹·GT·金枪鱼季节开幕",
      highlight_en: "Amberjack, GT & Tuna season opens",
      desc_ja: "水温が上昇し、大型回遊魚が活発になる季節。カンパチの泳がせ釣りが最高潮を迎え、GT、キハダマグロも狙えます。遠征釣りにも最適なシーズン。",
      desc_zh: "水温上升，大型洄游鱼类活跃。泳饵钓钓红甘鲹进入高峰期，GT和黄鳍金枪鱼也可期待。远征行程的最佳时机。",
      desc_en: "Rising water temps bring big pelagics to life. Prime season for amberjack on live bait, GT casting, and yellowfin tuna jigging. Excellent for expedition trips.",
      target_ja: ["カンパチ", "GT", "キハダマグロ", "イトヒキフエダイ", "ハタ類"],
      target_zh: ["红甘鲹", "GT", "黄鳍金枪鱼", "丝鳍笛鲷", "石斑鱼"],
      target_en: ["Greater Amberjack", "GT", "Yellowfin Tuna", "Threadfin Emperor", "Grouper"]
    },
    {
      id: "summer",
      name_ja: "夏 (6月〜8月)",
      name_zh: "夏季 (6月～8月)",
      name_en: "Summer (Jun–Aug)",
      icon: "☀️",
      highlight_ja: "パヤオ・カツオ・シイラ好調",
      highlight_zh: "浮鱼礁·鲣鱼·鬼头刀大丰收",
      highlight_en: "FAD Fishing, Skipjack & Mahi-mahi",
      desc_ja: "台風シーズンですが、合間を縫って出漁できれば最高の釣果が期待できます。パヤオ（浮魚礁）ではカツオ、シイラが爆釣。夜釣りでは太刀魚も狙えます。台風による欠航の際は全額返金いたします。",
      desc_zh: "台风季节，但间隙出海往往有惊喜。浮鱼礁（パヤオ）钓鲣鱼和鬼头刀极为火爆。夜钓还可以狙击太刀鱼。台风导致无法出海时全额退款。",
      desc_en: "Typhoon season — but gaps in the weather can produce incredible fishing. FAD (payao) fishing for skipjack and mahi-mahi is exceptional. Night fishing for hairtail also productive. Full refund if typhoon cancels your trip.",
      target_ja: ["カツオ", "シイラ", "パヤオ", "タチウオ（夜）"],
      target_zh: ["鲣鱼", "鬼头刀", "浮鱼礁鱼类", "太刀鱼（夜）"],
      target_en: ["Skipjack Tuna", "Mahi-mahi", "FAD Species", "Hairtail (night)"]
    },
    {
      id: "autumn",
      name_ja: "秋 (9月〜11月)",
      name_zh: "秋季 (9月～11月)",
      name_en: "Autumn (Sep–Nov)",
      icon: "🍂",
      highlight_ja: "タチウオ爆釣シーズン・カンパチ回帰",
      highlight_zh: "太刀鱼爆釣季·红甘鲹回归",
      highlight_en: "Hairtail Season & Amberjack Return",
      desc_ja: "台風が落ち着き、安定して出漁できるようになります。11月はタチウオが爆釣シーズン。指5〜7本の良型が連日釣れます。カンパチ、アオチビキも好調を維持。",
      desc_zh: "台风季结束，出海趋于稳定。11月太刀鱼进入爆釣季，指5～7本幅优质太刀鱼连日高调。红甘鲹和蓝笛鲷也保持高水准。",
      desc_en: "Typhoon season ends and conditions stabilise. November is prime hairtail season — finger-width 5–7 consistently. Amberjack and blue-lined sea bream maintain good form.",
      target_ja: ["タチウオ", "カンパチ", "アオチビキ", "アカジン"],
      target_zh: ["太刀鱼", "红甘鲹", "蓝笛鲷", "赤石斑"],
      target_en: ["Hairtail", "Greater Amberjack", "Blue-lined Sea Bream", "Akajin Grouper"]
    },
    {
      id: "winter",
      name_ja: "冬 (12月〜2月)",
      name_zh: "冬季 (12月～2月)",
      name_en: "Winter (Dec–Feb)",
      icon: "❄️",
      highlight_ja: "大物カンパチ・底物の好シーズン",
      highlight_zh: "大型红甘鲹·底物钓鱼黄金季",
      highlight_en: "Big Amberjack & Bottom Fishing",
      desc_ja: "水温が下がり、大型のカンパチが活発に動きます。21kg、27kgクラスのモンスターカンパチが狙える季節。底物釣りでは大型ハタやアカジンも期待できます。海況が安定しているため遠征にも最適。",
      desc_zh: "水温下降，大型红甘鲹活跃。21kg、27kg级的怪物红甘鲹正当季。底物钓鱼可期待大型石斑与アカジン。海况稳定，是远征行程的好时机。",
      desc_en: "Cooler water brings monster amberjack into play. 20kg+ fish are realistic targets. Bottom fishing produces big grouper and akajin. Stable sea conditions make this ideal for expedition trips.",
      target_ja: ["カンパチ 大物", "クエ", "アカジン", "ハタ類"],
      target_zh: ["大型红甘鲹", "龙胆石斑", "赤石斑", "石斑鱼"],
      target_en: ["Giant Amberjack", "Kue Grouper", "Akajin", "Grouper Species"]
    }
  ],

  // ── 主要魚種 ────────────────────────────────────────────
  species: [
    {
      id: "kanpachi",
      name_ja: "カンパチ（赤甘鯵）",
      name_zh: "红甘鲹",
      name_en: "Greater Amberjack",
      difficulty: 3,
      size_ja: "5〜50kg超",
      size_zh: "5～50kg+",
      size_en: "5–50kg+",
      season_ja: "通年（冬〜春が最大サイズ）",
      season_zh: "全年（冬春最大）",
      season_en: "Year-round (biggest in winter–spring)",
      method_ja: ["泳饵钓", "ジギング"],
      method_zh: ["泳饵钓", "铁板钓"],
      method_en: ["Live Bait", "Jigging"],
      desc_ja: "沖縄を代表する大型青物。強烈な引きと美味な身が人気の理由。沖縄では年間通して狙え、冬から春にかけて大型が期待できます。",
      desc_zh: "冲绳代表性大型青物，强烈的拉力和鲜美的鱼肉广受欢迎。全年可钓，冬春可期大型个体。",
      desc_en: "Okinawa's signature big game fish. Powerful fights and excellent table fare. Targetable year-round, with the biggest specimens in winter and spring."
    },
    {
      id: "gt",
      name_ja: "GT（ロウニンアジ）",
      name_zh: "GT（旅鲹）",
      name_en: "Giant Trevally (GT)",
      difficulty: 5,
      size_ja: "10〜40kg",
      size_zh: "10～40kg",
      size_en: "10–40kg",
      season_ja: "春〜夏",
      season_zh: "春夏",
      season_en: "Spring–Summer",
      method_ja: ["キャスティング", "ポッパー"],
      method_zh: ["Casting", "Popper"],
      method_en: ["Casting", "Popper"],
      desc_ja: "沖縄が世界に誇るビッグゲームターゲット。難易度が高く、経験者向け。キャスティングで最大4名まで同時に楽しめます。強烈なファイトは一度経験すると忘れられません。",
      desc_zh: "冲绳引以为傲的顶级猎物，难度极高，适合有经验的钓手。Casting最多4人同时进行。强烈的搏鱼体验一生难忘。",
      desc_en: "Okinawa's most prized big game target. Highly challenging — experienced anglers only. Up to 4 casters simultaneously. Once you've fought a GT, you'll never forget it."
    },
    {
      id: "tuna",
      name_ja: "キハダマグロ",
      name_zh: "黄鳍金枪鱼",
      name_en: "Yellowfin Tuna",
      difficulty: 4,
      size_ja: "5〜40kg",
      size_zh: "5～40kg",
      size_en: "5–40kg",
      season_ja: "春〜夏",
      season_zh: "春夏",
      season_en: "Spring–Summer",
      method_ja: ["ジギング", "トローリング"],
      method_zh: ["铁板钓", "拖钓"],
      method_en: ["Jigging", "Trolling"],
      desc_ja: "沖縄近海を回遊するキハダマグロ。ジギングやトローリングで狙います。その速さと力強さは青物の中でも最高峰。",
      desc_zh: "在冲绳近海洄游的黄鳍金枪鱼，铁板钓和拖钓均可狙击。速度与力量在青物中堪称巅峰。",
      desc_en: "Yellowfin tuna patrol Okinawa's offshore waters. Jigging and trolling both produce. Speed and power — top tier among pelagics."
    },
    {
      id: "akajin",
      name_ja: "アカジン（ミーバイ）",
      name_zh: "赤石斑（アカジン）",
      name_en: "Red-banded Grouper (Akajin)",
      difficulty: 2,
      size_ja: "1〜10kg",
      size_zh: "1～10kg",
      size_en: "1–10kg",
      season_ja: "通年",
      season_zh: "全年",
      season_en: "Year-round",
      method_ja: ["エサ釣り", "ジギング"],
      method_zh: ["饵钓", "铁板钓"],
      method_en: ["Bait Fishing", "Jigging"],
      desc_ja: "沖縄の高級魚として知られるアカジン。鮮やかな赤色が美しく、その美味さは沖縄随一とも言われます。初心者でも狙いやすい魚種です。",
      desc_zh: "冲绳顶级食用鱼，鲜艳红色极具视觉冲击力，其美味在冲绳无出其右。初学者也容易上钩。",
      desc_en: "One of Okinawa's most prized eating fish. Stunning red colouration and exceptional flavour. Accessible to beginners and experienced anglers alike."
    },
    {
      id: "tachiuo",
      name_ja: "タチウオ",
      name_zh: "太刀鱼",
      name_en: "Largehead Hairtail",
      difficulty: 2,
      size_ja: "指4〜7本幅、最大2m超",
      size_zh: "指4～7本幅，最大超2米",
      size_en: "Finger-width 4–7, up to 2m+",
      season_ja: "秋〜冬（11月がピーク）",
      season_zh: "秋冬（11月为高峰）",
      season_en: "Autumn–Winter (peak November)",
      method_ja: ["テンヤ釣り", "ジギング"],
      method_zh: ["天亚钓法", "铁板钓"],
      method_en: ["Tenya Rig", "Jigging"],
      desc_ja: "秋から冬にかけて爆釣が期待できる人気魚種。テンヤ仕掛けで指5〜7本の良型が連発することも。銀色に輝く姿が美しく、食べても絶品。",
      desc_zh: "秋冬爆釣的人气鱼种，天亚仕掛连续钓获指5～7本幅优质太刀鱼并不少见。银光闪闪的外形，食用极佳。",
      desc_en: "Autumn and winter bring explosive hairtail action. Tenya rigs produce finger-width 5–7 fish in succession. Beautiful silver fish — and excellent eating."
    },
    {
      id: "kue",
      name_ja: "クエ（マハタ）",
      name_zh: "龙胆石斑",
      name_en: "Giant Grouper (Kue)",
      difficulty: 4,
      size_ja: "10〜50kg超",
      size_zh: "10～50kg+",
      size_en: "10–50kg+",
      season_ja: "通年（冬が大型）",
      season_zh: "全年（冬季大型）",
      season_en: "Year-round (biggest in winter)",
      method_ja: ["泳饵钓", "エサ釣り"],
      method_zh: ["泳饵钓", "饵钓"],
      method_en: ["Live Bait", "Bait Fishing"],
      desc_ja: "幻の高級魚と呼ばれるクエ。沖縄では比較的狙いやすく、大物が出ることも。最高の食材としても知られ、その味は格別です。",
      desc_zh: "被称为梦幻高级鱼的龙胆石斑。在冲绳相对容易狙击，偶有大物出现。作为顶级食材，其口味无与伦比。",
      desc_en: "The legendary luxury fish. More targetable in Okinawa than elsewhere, with genuine giants possible. As a table fish, it's in a class of its own."
    }
  ],

  // ── 釣り方ガイド ────────────────────────────────────────
  methods: [
    {
      id: "jigging",
      name_ja: "ジギング",
      name_zh: "铁板钓",
      name_en: "Jigging",
      difficulty: 3,
      icon: "🎣",
      desc_ja: "金属製のルアー（ジグ）を上下に動かして魚を誘う釣り方。カンパチ、アオチビキ、マグロなど多くの魚が対象。体力が必要ですが、ヒットした瞬間の興奮は格別です。",
      desc_zh: "通过上下抖动金属假饵（铁板）来诱鱼的钓法。红甘鲹、蓝笛鲷、金枪鱼等多种鱼类均可钓获。体力消耗大，但中鱼瞬间的兴奋感无与伦比。",
      desc_en: "Vertically working a metal jig through the water column. Targets amberjack, sea bream, tuna and more. Physically demanding — the hook-up hit makes it all worthwhile."
    },
    {
      id: "livebait",
      name_ja: "泳饵钓",
      name_zh: "泳饵钓（活饵钓）",
      name_en: "Live Bait Fishing",
      difficulty: 2,
      icon: "🐟",
      desc_ja: "生きた小魚をエサにして大型魚を狙う釣り方。自然な動きで大型魚を誘えるため、ビッグゲームに非常に有効。カンパチ、GT、クエなどの大型魚が対象。",
      desc_zh: "用活鱼作为诱饵钓大型鱼的方法。活饵的自然游动对大型鱼诱惑极大，是猎取大物最有效的方法之一。红甘鲹、GT、龙胆石斑均为目标鱼。",
      desc_en: "Using live small fish as bait to target large predators. The natural movement is irresistible to big game fish. Prime method for amberjack, GT and grouper."
    },
    {
      id: "casting",
      name_ja: "キャスティング（GT専用）",
      name_zh: "Casting（GT专用）",
      name_en: "Casting (GT Specialist)",
      difficulty: 5,
      icon: "🎯",
      desc_ja: "大型ルアーを遠投してGTを狙う高難度の釣り方。強靭なタックルが必要で、経験者向け。最大4名まで同時にキャスティング可能。初めてGTに挑戦する方は事前にご相談ください。",
      desc_zh: "用大型路亚远投狙击GT的高难度钓法，需要强劲装备，适合有经验的钓手。最多4人同时Casting。初次挑战GT的客人请提前咨询。",
      desc_en: "Long casting with large lures to target GT. Requires heavy-duty tackle — experienced anglers only. Max 4 casters simultaneously. First time with GT? Please discuss with us beforehand."
    },
    {
      id: "trolling",
      name_ja: "トローリング",
      name_zh: "拖钓",
      name_en: "Trolling",
      difficulty: 1,
      icon: "⛵",
      desc_ja: "船を走らせながらルアーや仕掛けを引いて魚を誘う釣り方。初心者でも楽しみやすく、マグロ、シイラ、サワラなどが対象。帰港中に行うことも多い。",
      desc_zh: "行船途中拖拉假饵诱鱼，适合初学者，可钓金枪鱼、鬼头刀、沙梭等，归港途中也常进行。",
      desc_en: "Trailing lures behind a moving boat. Beginner-friendly and versatile. Targets tuna, mahi-mahi and wahoo. Often done on the way back to port."
    },
    {
      id: "bait",
      name_ja: "エサ釣り（底物）",
      name_zh: "饵钓（底物）",
      name_en: "Bottom Bait Fishing",
      difficulty: 1,
      icon: "🪝",
      desc_ja: "海底付近でエサを使って底物魚を狙う釣り方。アカジン、ハタ類などの高級魚が対象。技術よりも忍耐が必要で、初心者にも向いています。",
      desc_zh: "在海底附近用饵钓底栖鱼的方法，以アカジン、石斑鱼等高级鱼类为目标。更需要耐心而非技术，初学者也适合。",
      desc_en: "Bait fishing near the seabed for bottom-dwelling species. Targets akajin and grouper. Patience over skill — great for beginners."
    }
  ]
};

