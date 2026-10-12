/**
 * 食材カテゴリ(固定リスト)。ID・表示名・表示順をここ 1 か所で定義する。
 * 在庫数量とは無関係なメタデータで、イベントソーシングには影響しない。
 */

export const CATEGORIES = [
  { id: "vegetable", label: "野菜・きのこ", order: 1 },
  { id: "fruit", label: "果物", order: 2 },
  { id: "meat_fish", label: "肉・魚", order: 3 },
  { id: "egg_dairy", label: "卵・乳製品", order: 4 },
  { id: "soy_processed", label: "豆腐・加工品", order: 5 },
  { id: "staple", label: "主食・乾物・麺", order: 6 },
  { id: "seasoning", label: "調味料", order: 7 },
  { id: "drink", label: "飲み物", order: 8 },
  { id: "other", label: "その他", order: 9 },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_IDS: readonly CategoryId[] = CATEGORIES.map((c) => c.id);

/** 未設定・未知のカテゴリをまとめる表示用グループ。保存はされない(category は null)。 */
export const UNCATEGORIZED = "uncategorized";
export const UNCATEGORIZED_LABEL = "未分類";
export type GroupKey = CategoryId | typeof UNCATEGORIZED;
/** 表示順の全グループキー(未分類は最後)。 */
export const GROUP_KEYS: readonly GroupKey[] = [...CATEGORY_IDS, UNCATEGORIZED];

export function isCategoryId(x: unknown): x is CategoryId {
  return (
    typeof x === "string" && (CATEGORY_IDS as readonly string[]).includes(x)
  );
}

/** 既知の ID ならそのまま、それ以外(未設定・未知・非文字列)は null。 */
export function normalizeCategory(x: unknown): CategoryId | null {
  return isCategoryId(x) ? x : null;
}

export function categoryLabel(x: unknown): string {
  const id = normalizeCategory(x);
  return id
    ? (CATEGORIES.find((c) => c.id === id)?.label ?? UNCATEGORIZED_LABEL)
    : UNCATEGORIZED_LABEL;
}

interface GuessRule {
  category: CategoryId;
  /** 名前に含まれていれば一致。 */
  includes?: readonly string[];
  /** 名前の末尾が一致(「油」「塩」など、他の語に含まれやすいもの)。 */
  suffix?: readonly string[];
  /** 名前が完全一致(「いか」など短くて誤爆しやすいもの)。 */
  exact?: readonly string[];
}

/**
 * 簡易キーワード辞書。上から順に最初に当たったものを採用するので、
 * 「牛乳(牛を含む)」「鶏がらスープの素(鶏を含む)」「油揚げ(油を含む)」のような
 * 紛らわしい語は、より具体的なカテゴリを先に置いている。
 */
const GUESS_RULES: readonly GuessRule[] = [
  {
    category: "drink",
    includes: [
      "ジュース",
      "コーヒー",
      "珈琲",
      "ミネラルウォーター",
      "豆乳",
      "ビール",
      "ワイン",
      "サイダー",
      "コーラ",
      "カフェオレ",
      "スポーツドリンク",
      "炭酸",
      "お茶",
    ],
    suffix: ["茶", "水"],
  },
  {
    category: "egg_dairy",
    includes: [
      "牛乳",
      "卵",
      "たまご",
      "玉子",
      "チーズ",
      "ヨーグルト",
      "バター",
      "生クリーム",
      "マーガリン",
      "ミルク",
    ],
  },
  {
    category: "seasoning",
    includes: [
      "醤油",
      "しょうゆ",
      "味噌",
      "みそ",
      "みりん",
      "料理酒",
      "ケチャップ",
      "マヨネーズ",
      "ソース",
      "だし",
      "出汁",
      "ドレッシング",
      "コンソメ",
      "スープの素",
      "めんつゆ",
      "ポン酢",
      "砂糖",
      "こしょう",
      "胡椒",
      "カレールウ",
      "カレールー",
      "オイル",
      "ジャム",
      "はちみつ",
      "蜂蜜",
      "スパイス",
      "わさび",
      "からし",
      "マスタード",
      "豆板醤",
      "甜麺醤",
    ],
    suffix: ["塩", "酢", "油"],
    exact: ["酒"],
  },
  {
    category: "soy_processed",
    includes: [
      "豆腐",
      "油揚げ",
      "厚揚げ",
      "納豆",
      "こんにゃく",
      "かまぼこ",
      "ちくわ",
      "はんぺん",
      "さつま揚げ",
      "キムチ",
      "漬物",
      "漬け物",
      "缶",
      "ツナ",
    ],
  },
  {
    category: "meat_fish",
    includes: [
      "豚",
      "牛",
      "鶏",
      "ひき肉",
      "挽き肉",
      "肉",
      "ささみ",
      "鮭",
      "さけ",
      "サーモン",
      "さば",
      "鯖",
      "まぐろ",
      "マグロ",
      "えび",
      "エビ",
      "海老",
      "イカ",
      "烏賊",
      "タコ",
      "ベーコン",
      "ハム",
      "ソーセージ",
      "ウインナー",
      "魚",
      "あじ",
      "鯵",
      "ぶり",
      "鰤",
      "鱈",
      "タラ",
      "たらこ",
      "しらす",
      "あさり",
      "ホタテ",
      "貝",
    ],
    exact: ["いか", "たこ"],
  },
  {
    category: "fruit",
    includes: [
      "りんご",
      "リンゴ",
      "林檎",
      "みかん",
      "ミカン",
      "バナナ",
      "いちご",
      "イチゴ",
      "苺",
      "ぶどう",
      "ブドウ",
      "葡萄",
      "レモン",
      "オレンジ",
      "キウイ",
      "桃",
      "梨",
      "柿",
      "すいか",
      "スイカ",
      "メロン",
      "パイナップル",
      "マンゴー",
      "ブルーベリー",
      "アボカド",
      "グレープフルーツ",
      "さくらんぼ",
      "ライム",
      "ゆず",
      "柚子",
    ],
  },
  {
    category: "vegetable",
    includes: [
      "菜",
      "草",
      "ねぎ",
      "ネギ",
      "葱",
      "大根",
      "だいこん",
      "人参",
      "にんじん",
      "ニンジン",
      "キャベツ",
      "レタス",
      "トマト",
      "きゅうり",
      "キュウリ",
      "胡瓜",
      "なす",
      "ナス",
      "茄子",
      "ピーマン",
      "パプリカ",
      "じゃがいも",
      "ジャガイモ",
      "さつまいも",
      "サツマイモ",
      "さといも",
      "里芋",
      "もやし",
      "ブロッコリー",
      "カリフラワー",
      "かぼちゃ",
      "カボチャ",
      "南瓜",
      "ごぼう",
      "れんこん",
      "蓮根",
      "しいたけ",
      "椎茸",
      "えのき",
      "しめじ",
      "まいたけ",
      "エリンギ",
      "きのこ",
      "キノコ",
      "にんにく",
      "ニンニク",
      "生姜",
      "しょうが",
      "ショウガ",
      "セロリ",
      "アスパラ",
      "オクラ",
      "とうもろこし",
      "ズッキーニ",
      "みょうが",
      "大葉",
      "パセリ",
      "豆苗",
      "枝豆",
      "かいわれ",
      "ゴーヤ",
      "かぶ",
      "カブ",
      "玉ねぎ",
      "たまねぎ",
      "タマネギ",
    ],
  },
  {
    category: "staple",
    includes: [
      "米",
      "ごはん",
      "ご飯",
      "パスタ",
      "スパゲッティ",
      "うどん",
      "そうめん",
      "そば",
      "ラーメン",
      "麺",
      "春雨",
      "小麦粉",
      "片栗粉",
      "パン粉",
      "ホットケーキ",
      "シリアル",
      "オートミール",
      "餅",
      "もち",
      "乾燥",
      "昆布",
      "わかめ",
      "ひじき",
      "のり",
      "海苔",
      "かつお節",
      "削り節",
      "切り干し",
      "高野豆腐",
    ],
    suffix: ["パン"],
  },
];

/** 全角/半角のゆれを揃え、前後の空白を除く。 */
function normalizeName(name: string): string {
  return name.normalize("NFKC").trim();
}

/** 名前からカテゴリを推定する。辞書に当たらなければ null(未選択)。 */
export function guessCategory(name: string): CategoryId | null {
  const n = normalizeName(name);
  if (!n) return null;
  for (const rule of GUESS_RULES) {
    if (
      rule.includes?.some((k) => n.includes(k)) ||
      rule.suffix?.some((k) => n.endsWith(k)) ||
      rule.exact?.includes(n)
    ) {
      return rule.category;
    }
  }
  return null;
}

export interface CategoryGroup<T> {
  key: GroupKey;
  label: string;
  items: T[];
  count: number;
  /** isAttention が true の件数。 */
  attentionCount: number;
}

/**
 * カテゴリ表示順にグルーピングする(未分類は最後、空グループは出さない)。
 * グループ内の順序は入力順を保つ。未設定・未知のカテゴリは未分類。
 */
export function groupFoodsByCategory<T>(
  items: readonly T[],
  getCategory: (item: T) => string | null | undefined,
  isAttention: (item: T) => boolean = () => false,
): CategoryGroup<T>[] {
  const buckets = new Map<GroupKey, T[]>();
  for (const item of items) {
    const key: GroupKey = normalizeCategory(getCategory(item)) ?? UNCATEGORIZED;
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  }
  const groups: CategoryGroup<T>[] = [];
  for (const key of GROUP_KEYS) {
    const list = buckets.get(key);
    if (!list || list.length === 0) continue;
    groups.push({
      key,
      label: key === UNCATEGORIZED ? UNCATEGORIZED_LABEL : categoryLabel(key),
      items: list,
      count: list.length,
      attentionCount: list.filter(isAttention).length,
    });
  }
  return groups;
}
