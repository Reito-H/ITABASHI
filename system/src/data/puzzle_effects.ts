// バジル&ドラゴンズ 必殺技の特殊効果カタログ（100パターン）
// 管理画面のプルダウンとゲーム画面（client JS）の両方がこの定義を使う。
// ゲーム側は ops（効果の部品）を順に実行する。部品の種類は html/puzzle_page.ts の runOps() を参照。
//   dmg        … 自属性で攻撃（mult = 攻撃力の倍率、adv = 相性あり）
//   dmg_all    … 相性無視で攻撃
//   hits       … 連続ヒット（n回 × mult）
//   pct        … 敵の最大HPの pct% ダメージ（ボスは半減）
//   heal       … 最大HPの pct% 回復
//   shield     … n手のあいだ敵の攻撃を無効
//   reflect    … n手のあいだ敵の攻撃を跳ね返す
//   esleep     … 敵が n手眠る（攻撃カウントが止まる）
//   ssleep     … 自分たちが n手眠る（攻撃できない・回復もしない）
//   atkup      … n手のあいだ全ダメージ mult倍
//   elemup     … n手のあいだ 自属性のダメージ mult倍
//   combo      … 次の1手のコンボ数 +n
//   defdown    … n手のあいだ敵の受けるダメージ mult倍
//   poison     … n手のあいだ毎手 敵最大HPの pct%
//   convert    … 盤面の from色 を to色 に（from='random'=ランダム1色, to='self'=自属性, 'heart'）
//   hearts     … ランダムに n個をハートに
//   shuffle    … 盤面を並べ直す
//   clear      … 盤面の色 elem を全部消す（'all'=全消し、'self'=自属性）→消した分で攻撃
//   row / col  … 指定行/列を消す（index=-1 でランダム）
//   gauge      … 味方全員のゲージ +n（自分以外）
//   time       … n手のあいだ なぞり時間 +sec秒
//   cntreset   … 敵の攻撃カウントを最大に戻す
//   cntminus   … 敵の攻撃カウント -n（危険）
//   atkdown    … n手のあいだ敵の攻撃力 mult倍
//   coin / exp … このバトルの報酬に +n%
//   crit       … prob% で mult倍、はずれは mult2倍
//   gamble     … 50%で mult倍、50%でHP半分
//   drain      … 与ダメージの pct% 回復
//   revive     … このバトル中1回、HP0で pct% で復活
//   maxhp      … 最大HP pct% アップ（このバトル中）
//   execute    … 敵HPが pct% 以下なら即撃破
//   skipturn   … 敵のこの手の攻撃をスキップ（カウントを進めない）
export type EffectOp = { op: string; [k: string]: string | number };
export type EffectDef = { id: string; name: string; cat: string; desc: string; ops: EffectOp[] };

const E = (id: string, name: string, cat: string, desc: string, ops: EffectOp[]): EffectDef => ({ id, name, cat, desc, ops });

export const PUZZLE_EFFECTS: EffectDef[] = [
  // ---- 攻撃（属性） ----
  E('atk_s', '一撃', '攻撃', '自属性で攻撃力×5のダメージ', [{ op: 'dmg', mult: 5 }]),
  E('atk_m', '強撃', '攻撃', '自属性で攻撃力×10のダメージ', [{ op: 'dmg', mult: 10 }]),
  E('atk_l', '必殺の一撃', '攻撃', '自属性で攻撃力×16のダメージ', [{ op: 'dmg', mult: 16 }]),
  E('atk_xl', '究極の一撃', '攻撃', '自属性で攻撃力×24のダメージ', [{ op: 'dmg', mult: 24 }]),
  E('atk_all_m', '無属性斬り', '攻撃', '相性に関係なく攻撃力×9のダメージ', [{ op: 'dmg_all', mult: 9 }]),
  E('atk_all_l', '無属性の大技', '攻撃', '相性に関係なく攻撃力×14のダメージ', [{ op: 'dmg_all', mult: 14 }]),
  E('hits3', '三連撃', '攻撃', '攻撃力×4のダメージを3回', [{ op: 'hits', n: 3, mult: 4 }]),
  E('hits5', '五連撃', '攻撃', '攻撃力×3のダメージを5回', [{ op: 'hits', n: 5, mult: 3 }]),
  E('hits8', '乱れ撃ち', '攻撃', '攻撃力×2のダメージを8回', [{ op: 'hits', n: 8, mult: 2 }]),
  E('hits12', '百裂拳', '攻撃', '攻撃力×1.5のダメージを12回', [{ op: 'hits', n: 12, mult: 1.5 }]),
  E('pct10', '削り', '攻撃', '敵の最大HPの10%ダメージ（ボスは半分）', [{ op: 'pct', pct: 10 }]),
  E('pct20', '大削り', '攻撃', '敵の最大HPの20%ダメージ（ボスは半分）', [{ op: 'pct', pct: 20 }]),
  E('pct35', '激震', '攻撃', '敵の最大HPの35%ダメージ（ボスは半分）', [{ op: 'pct', pct: 35 }]),
  E('execute20', '止め', '攻撃', '敵のHPが20%以下なら即撃破。それ以外は攻撃力×6', [{ op: 'execute', pct: 20 }, { op: 'dmg', mult: 6 }]),
  E('execute35', '処刑', '攻撃', '敵のHPが35%以下なら即撃破。それ以外は攻撃力×4', [{ op: 'execute', pct: 35 }, { op: 'dmg', mult: 4 }]),
  E('crit50', '賭けの一撃', '攻撃', '50%で攻撃力×30、はずれは×3', [{ op: 'crit', prob: 50, mult: 30, mult2: 3 }]),
  E('crit25', '大博打', '攻撃', '25%で攻撃力×60、はずれは×2', [{ op: 'crit', prob: 25, mult: 60, mult2: 2 }]),
  E('gamble', '一か八か', '攻撃', '50%で攻撃力×40、50%で自分のHPが半分に', [{ op: 'gamble', mult: 40 }]),
  E('drain', '吸収', '攻撃', '攻撃力×8のダメージを与え、その50%を回復', [{ op: 'dmg', mult: 8, drain: 50 }]),
  E('drain_l', '大吸収', '攻撃', '攻撃力×12のダメージを与え、その80%を回復', [{ op: 'dmg', mult: 12, drain: 80 }]),
  // ---- 回復・守り ----
  E('heal_s', '小回復', '回復', '最大HPの20%回復', [{ op: 'heal', pct: 20 }]),
  E('heal_m', '回復', '回復', '最大HPの35%回復', [{ op: 'heal', pct: 35 }]),
  E('heal_l', '大回復', '回復', '最大HPの60%回復', [{ op: 'heal', pct: 60 }]),
  E('heal_full', '完全回復', '回復', 'HPを全快', [{ op: 'heal', pct: 100 }]),
  E('heal_hearts', '癒やしの雨', '回復', '最大HPの25%回復＋ランダム5個をハートに', [{ op: 'heal', pct: 25 }, { op: 'hearts', n: 5 }]),
  E('shield2', '守り', '守り', '2手のあいだ敵の攻撃を無効', [{ op: 'shield', n: 2 }]),
  E('shield4', '鉄壁', '守り', '4手のあいだ敵の攻撃を無効', [{ op: 'shield', n: 4 }]),
  E('reflect2', '反射', '守り', '2手のあいだ敵の攻撃を跳ね返す', [{ op: 'reflect', n: 2 }]),
  E('reflect4', '鏡の盾', '守り', '4手のあいだ敵の攻撃を跳ね返す', [{ op: 'reflect', n: 4 }]),
  E('revive50', '不死鳥', '守り', 'このバトル中1回、HP0になっても50%で復活', [{ op: 'revive', pct: 50 }]),
  E('revive100', '奇跡', '守り', 'このバトル中1回、HP0になっても全快で復活', [{ op: 'revive', pct: 100 }]),
  E('maxhp20', '気合い', '守り', 'このバトル中、最大HP20%アップ＋その分回復', [{ op: 'maxhp', pct: 20 }]),
  E('maxhp40', '底力', '守り', 'このバトル中、最大HP40%アップ＋その分回復', [{ op: 'maxhp', pct: 40 }]),
  E('atkdown2', '威圧', '守り', '3手のあいだ敵の攻撃力を半分に', [{ op: 'atkdown', n: 3, mult: 0.5 }]),
  E('atkdown5', '金縛り', '守り', '5手のあいだ敵の攻撃力を30%に', [{ op: 'atkdown', n: 5, mult: 0.3 }]),
  // ---- 眠り・時間 ----
  E('esleep2', '子守唄', '眠り', '敵が2手眠る（攻撃カウントが止まる）', [{ op: 'esleep', n: 2 }]),
  E('esleep4', '深い眠り', '眠り', '敵が4手眠る', [{ op: 'esleep', n: 4 }]),
  E('esleep6', '冬眠', '眠り', '敵が6手眠る', [{ op: 'esleep', n: 6 }]),
  E('sleep_both', 'みんなおやすみ', '眠り', '敵が4手眠るが、自分たちも2手眠る（攻撃できない）', [{ op: 'esleep', n: 4 }, { op: 'ssleep', n: 2 }]),
  E('sleep_both_l', '全員熟睡', '眠り', '敵が8手眠るが、自分たちも4手眠る', [{ op: 'esleep', n: 8 }, { op: 'ssleep', n: 4 }]),
  E('cntreset', '仕切り直し', '眠り', '敵の攻撃カウントを最大に戻す', [{ op: 'cntreset' }]),
  E('cntreset_heal', '一息', '眠り', '敵の攻撃カウントを最大に戻し、15%回復', [{ op: 'cntreset' }, { op: 'heal', pct: 15 }]),
  E('time3', '集中', '時間', '3手のあいだ、なぞり時間+3秒', [{ op: 'time', n: 3, sec: 3 }]),
  E('time5', 'ゾーン', '時間', '5手のあいだ、なぞり時間+5秒', [{ op: 'time', n: 5, sec: 5 }]),
  E('time_inf', '時よ止まれ', '時間', '2手のあいだ、なぞり時間+20秒', [{ op: 'time', n: 2, sec: 20 }]),
  // ---- 強化 ----
  E('atkup2', '闘志', '強化', '3手のあいだ全ダメージ1.5倍', [{ op: 'atkup', n: 3, mult: 1.5 }]),
  E('atkup3', '激昂', '強化', '3手のあいだ全ダメージ2倍', [{ op: 'atkup', n: 3, mult: 2 }]),
  E('atkup5', '覚醒', '強化', '5手のあいだ全ダメージ2.5倍', [{ op: 'atkup', n: 5, mult: 2.5 }]),
  E('elemup_fire', '火の加護', '強化', '4手のあいだ火のダメージ3倍', [{ op: 'elemup', elem: 'fire', n: 4, mult: 3 }]),
  E('elemup_water', '水の加護', '強化', '4手のあいだ水のダメージ3倍', [{ op: 'elemup', elem: 'water', n: 4, mult: 3 }]),
  E('elemup_wood', '木の加護', '強化', '4手のあいだ木のダメージ3倍', [{ op: 'elemup', elem: 'wood', n: 4, mult: 3 }]),
  E('elemup_light', '光の加護', '強化', '4手のあいだ光のダメージ3倍', [{ op: 'elemup', elem: 'light', n: 4, mult: 3 }]),
  E('elemup_dark', '闇の加護', '強化', '4手のあいだ闇のダメージ3倍', [{ op: 'elemup', elem: 'dark', n: 4, mult: 3 }]),
  E('elemup_self', '自属性強化', '強化', '4手のあいだ自分の属性のダメージ3倍', [{ op: 'elemup', elem: 'self', n: 4, mult: 3 }]),
  E('combo3', 'コンボ加算', '強化', '次の1手、コンボ数+3', [{ op: 'combo', n: 3 }]),
  E('combo6', '大コンボ加算', '強化', '次の1手、コンボ数+6', [{ op: 'combo', n: 6 }]),
  E('defdown3', '弱点さらし', '強化', '3手のあいだ敵の受けるダメージ1.5倍', [{ op: 'defdown', n: 3, mult: 1.5 }]),
  E('defdown5', '鎧はがし', '強化', '5手のあいだ敵の受けるダメージ2倍', [{ op: 'defdown', n: 5, mult: 2 }]),
  E('poison3', '毒', '強化', '3手のあいだ毎手 敵最大HPの5%ダメージ', [{ op: 'poison', n: 3, pct: 5 }]),
  E('poison6', '猛毒', '強化', '6手のあいだ毎手 敵最大HPの6%ダメージ', [{ op: 'poison', n: 6, pct: 6 }]),
  E('gauge30', '応援', '強化', '味方全員のゲージ+30%', [{ op: 'gauge', n: 30 }]),
  E('gauge60', '大応援', '強化', '味方全員のゲージ+60%', [{ op: 'gauge', n: 60 }]),
  E('gauge100', '総動員', '強化', '味方全員のゲージを満タンに', [{ op: 'gauge', n: 100 }]),
  // ---- 盤面 ----
  E('conv_self', '色変え', '盤面', 'ランダムな1色を自分の属性に変える', [{ op: 'convert', from: 'random', to: 'self' }]),
  E('conv_self2', '二色変え', '盤面', 'ランダムな2色を自分の属性に変える', [{ op: 'convert', from: 'random', to: 'self' }, { op: 'convert', from: 'random', to: 'self' }]),
  E('conv_fire', '火の陣', '盤面', '盤面の半分を火に変える', [{ op: 'convert', from: 'half', to: 'fire' }]),
  E('conv_water', '水の陣', '盤面', '盤面の半分を水に変える', [{ op: 'convert', from: 'half', to: 'water' }]),
  E('conv_wood', '木の陣', '盤面', '盤面の半分を木に変える', [{ op: 'convert', from: 'half', to: 'wood' }]),
  E('conv_light', '光の陣', '盤面', '盤面の半分を光に変える', [{ op: 'convert', from: 'half', to: 'light' }]),
  E('conv_dark', '闇の陣', '盤面', '盤面の半分を闇に変える', [{ op: 'convert', from: 'half', to: 'dark' }]),
  E('conv_heart', 'ハートの陣', '盤面', 'ランダムな1色をハートに変える', [{ op: 'convert', from: 'random', to: 'heart' }]),
  E('conv_noheart', 'ハート消し', '盤面', 'ハートを自分の属性に変える', [{ op: 'convert', from: 'heart', to: 'self' }]),
  E('hearts4', '癒やしの種', '盤面', 'ランダム4個をハートに', [{ op: 'hearts', n: 4 }]),
  E('hearts8', '癒やしの森', '盤面', 'ランダム8個をハートに', [{ op: 'hearts', n: 8 }]),
  E('shuffle', 'シャッフル', '盤面', '盤面を並べ直す', [{ op: 'shuffle' }]),
  E('shuffle_atk', '混ぜて殴る', '盤面', '盤面を並べ直し、攻撃力×6で攻撃', [{ op: 'shuffle' }, { op: 'dmg', mult: 6 }]),
  E('clear_self', '自属性全消し', '盤面', '自分の属性の玉を全部消して攻撃', [{ op: 'clear', elem: 'self' }]),
  E('clear_fire', '火の全消し', '盤面', '火の玉を全部消して攻撃', [{ op: 'clear', elem: 'fire' }]),
  E('clear_water', '水の全消し', '盤面', '水の玉を全部消して攻撃', [{ op: 'clear', elem: 'water' }]),
  E('clear_wood', '木の全消し', '盤面', '木の玉を全部消して攻撃', [{ op: 'clear', elem: 'wood' }]),
  E('clear_light', '光の全消し', '盤面', '光の玉を全部消して攻撃', [{ op: 'clear', elem: 'light' }]),
  E('clear_dark', '闇の全消し', '盤面', '闇の玉を全部消して攻撃', [{ op: 'clear', elem: 'dark' }]),
  E('clear_all', '盤面全消し', '盤面', '盤面の玉を全部消して攻撃（大技）', [{ op: 'clear', elem: 'all' }]),
  E('row_rand', '横一文字', '盤面', 'ランダムな1行を消して攻撃', [{ op: 'row', index: -1 }]),
  E('row_bottom', '地走り', '盤面', '一番下の行を消して攻撃', [{ op: 'row', index: 4 }]),
  E('col_rand', '縦一閃', '盤面', 'ランダムな1列を消して攻撃', [{ op: 'col', index: -1 }]),
  E('cross', '十字斬り', '盤面', 'ランダムな1行と1列を消して攻撃', [{ op: 'row', index: -1 }, { op: 'col', index: -1 }]),
  E('rows2', '二段斬り', '盤面', 'ランダムな2行を消して攻撃', [{ op: 'row', index: -1 }, { op: 'row', index: -1 }]),
  // ---- 報酬・特殊 ----
  E('coin20', '小銭稼ぎ', '報酬', 'このバトルのコイン+20%＋攻撃力×4', [{ op: 'coin', n: 20 }, { op: 'dmg', mult: 4 }]),
  E('coin50', '荒稼ぎ', '報酬', 'このバトルのコイン+50%', [{ op: 'coin', n: 50 }]),
  E('exp30', '勉強熱心', '報酬', 'このバトルの経験値+30%＋攻撃力×4', [{ op: 'exp', n: 30 }, { op: 'dmg', mult: 4 }]),
  E('exp60', '猛勉強', '報酬', 'このバトルの経験値+60%', [{ op: 'exp', n: 60 }]),
  E('rich', '金満', '報酬', 'コイン+30%・経験値+30%', [{ op: 'coin', n: 30 }, { op: 'exp', n: 30 }]),
  E('allin', '全部のせ', '特殊', '攻撃力×8＋20%回復＋敵2手眠り', [{ op: 'dmg', mult: 8 }, { op: 'heal', pct: 20 }, { op: 'esleep', n: 2 }]),
  E('berserk', '捨て身', '特殊', '攻撃力×30のダメージ。ただし自分のHPが30%減る', [{ op: 'selfdmg', pct: 30 }, { op: 'dmg', mult: 30 }]),
  E('counter', 'カウンター', '特殊', '敵の攻撃カウント-1にする代わりに3手のあいだ反射', [{ op: 'cntminus', n: 1 }, { op: 'reflect', n: 3 }]),
  E('fortune', '運試し', '特殊', '次の盤面にハートが多めに出る＋コイン+10%', [{ op: 'hearts', n: 6 }, { op: 'coin', n: 10 }]),
  E('basil', 'バジルの祝福', '特殊', '全快＋4手のあいだ全ダメージ2倍＋ゲージ+50%', [{ op: 'heal', pct: 100 }, { op: 'atkup', n: 4, mult: 2 }, { op: 'gauge', n: 50 }]),
  E('final', '最後の切り札', '特殊', 'HPが低いほど強い（最大で攻撃力×40）', [{ op: 'lowhp', mult: 40 }]),
  E('mirror', '映し身', '特殊', '敵の現在HPの15%ダメージ＋同じ分を回復', [{ op: 'pct', pct: 15, cur: 1, drain: 100 }]),
];

export const EFFECT_MAP: Record<string, EffectDef> = Object.fromEntries(PUZZLE_EFFECTS.map(e => [e.id, e]));
export const EFFECT_CATS = [...new Set(PUZZLE_EFFECTS.map(e => e.cat))];
