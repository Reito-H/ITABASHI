# 課長ミッション 帳票テンプレート生成

`/kacho-mission/tenmatsusho`（顛末書）と `/kacho-mission/haneda-riyusho`（羽田定額適用外理由書）で
使う xlsx ひな型を作るスクリプト。出力した base64 を `system/src/assets/*.ts` に貼る。

## 生成手順

```
python3 -m venv v
./v/bin/pip install "xlrd==1.2.0" openpyxl playwright
./v/bin/playwright install chromium   # プレビュー用（任意）

# 顛末書（元 /Users/reito/Downloads/顛末書.xls の書式を xlrd で読んで再現）
./v/bin/python build_tenmatsusho.py
cp tenmatsusho_template.ts ../../system/src/assets/

# 羽田定額適用外理由書（元 PDF のレイアウトを openpyxl で組み直し）
./v/bin/python build_haneda.py
cp haneda_riyusho_template.ts ../../system/src/assets/
```

## プレビュー / 検証（任意）

```
./v/bin/python preview.py tenmatsusho_template.xlsx t.html   # HTML 化
./v/bin/python fill_samples.py                                # 記入済みサンプル生成＋openpyxlで結合数の非破壊を検証
```

## 値の差し込み方式

ブラウザ側 `system/src/html/xlsx_fill_client.ts` の `xfSetText/xfSetNum` が
`<c r="REF" s="...">` の中身だけ inlineStr / 数値 に置換する（s= = スタイル索引は保持）。
書式・結合・列幅・印刷設定は一切触らない。差し込み対象セルは各 build スクリプトの
`FILL_REFS` で「空セルでも必ず `<c>` を出力」させている。

## 差し込みセル対応（route: system/src/routes/admin_kacho_mission.ts）

### 顛末書
- A5=宛先 / P2,S2,U2=提出年月日 / P5=課 T5=班 / P6=氏名 P7=コード
- E13,H13,J13=発生年月日 M13=曜日 P13=午前午後 R13=時 T13=分
- E14=発生場所 / E15=件名 S15=コールサイン
- A20=本文（記） / A32=所見および処置等 / S32=事業所責任者 U32=運行管理者

### 羽田定額適用外理由書
- H3=営業所 / D5=課 N5=班 / W5,AB5,AF5=作成年(下2桁)月日
- I7=社員コード AC7=氏名
- K8,O8,R8=乗車年月日 U8=曜日 / AG8=車両番号
- J9,N9=乗車時分 / J10,N10=降車時分
- AA9=乗車地(既定「羽田空港 T1・T2・T3」/ 選択時は該当を【】) / AA10=降車地
- AG11=乗車人数 / I11=配車区分 I12=国籍 AG12=日本語可否（いずれも該当を【】）
- C16..C19=適用外理由チェック（■） / W18=経由地 / D20..D23=その他 記入行
- AA29=課長 AH29=確認者
