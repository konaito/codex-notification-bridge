# Codex Notification Bridge

別Electronアプリから、Codexの作業中セッションを一覧取得し、入力内容に合いそうなタスクへチャットを挿入するアプリ。

## 起動

```bash
npm install
npm start
```

起動すると、Codex app-serverの`thread/list`から未アーカイブのセッションを取得し、送信可能な一覧として表示する。入力が空のときは最近更新された候補を表示し、入力すると候補を即時に絞り込む。入力が止まるとCodexがメッセージの意味を判定し、結果を候補の並び順へ反映する。送信先は候補行を選択し、右端の「↵ 挿入」または`⌘/Ctrl + Enter`で確定する。

候補予測は、まず[src/ranking.js](src/ranking.js)のローカルスコアリングで即時表示し、入力が止まると[src/codex-predict.js](src/codex-predict.js)から`codex exec --ephemeral`を呼び出して意味分類する。デフォルトはベンチマークで選んだ`gpt-5.6-terra` + `low`で、`CODEX_PREDICT_MODEL`と`CODEX_PREDICT_EFFORT`で上書きできる。予測前に[src/codex-server.js](src/codex-server.js)がCodex app-serverの`thread/turns/list`で各候補の直近4ターンを取得し、[src/thread-context.js](src/thread-context.js)が直近のユーザー発言・AI応答・実行中コマンド・変更ファイル・ターン状態へ圧縮する。内部推論は渡さず、会話文脈が取得できなかった候補は`available:false`としてCodexに明示する。Codexには全候補のID・プロジェクト・タスク名・メッセージプレビュー・この現在地に加え、`thread/list`の`updatedAt`を「人間・AIを問わない最後のやり取り」として渡す。Codexは会話文脈を含む内容の意味スコアを返し、[src/orchestration.js](src/orchestration.js)が意味60%、最後のやり取りの新しさ25%、タスク状態15%で最終順位を合成する。UIには`Codex推定（会話文脈込み）`と表示し、Codexを起動できない場合や35秒以内に完了しない場合はローカルスコアリングへフォールバックする。履歴取得は30秒キャッシュし、入力のたびにapp-serverへ同じ問い合わせを繰り返さない。

別プロセスのapp-serverから一覧を取得するため、実行中の親タスクの状態は自動取得できない場合がある。その場合でも、`CODEX_TARGET_THREAD`で指定した親タスクは「作業中」として表示し、その他の`notLoaded`セッションは「保存済み」と表示する。

起動時に特定の送信先を初期選択したい場合は、環境変数で指定できる。

```bash
CODEX_TARGET_THREAD=<現在のタスクUUID> \
CODEX_TARGET_NAME="<現在のタスク名>" \
npm start
```

送信先を指定しない場合も、画面の「送信先セッション」から選択できる。入力中は文字一致で即時に絞り込み、入力が止まるとCodexの意味判定とオーケストレーションで並び替える。判定済みの状態で入力を変更した場合は、再判定中も前回のCodex順を表示し、新しい判定が完了した時点で置き換える。更新ボタンから作業中セッションを再取得できる。
入力内容はpreloadのIPC APIを通じてメインプロセスへ渡し、次のコマンドを実行する。

```text
codex queue --thread <thread> --message <message>
```

空の入力は画面とメインプロセスの両方で拒否する。送信が成功すると画面に挿入先を表示し、Codexがエラーを返すとエラー内容を表示する。送信本文は対象タスクのチャットにユーザーメッセージとして追加される。

`codex` がシェルのPATHにない環境では、実行ファイルを指定して起動できる。

```bash
CODEX_BIN=/path/to/codex npm start
```

構文チェックと単体テストは次で実行する。

```bash
npm run check
npm test
```

検索モデルの実測比較は次で実行する。固定した5ケースと同じ会話文脈を使い、Top-1/Top-3正解率、構造化JSON成功率、p50レイテンシを比較する。

```bash
npm run benchmark
```

## 現在のスコープ

- 通知受信（Webhook / macOS通知 / ローカルHTTP）は未実装
- 候補分類はCodexの意味分類と、最後のやり取り・タスク状態のオーケストレーション重みを使用し、起動失敗・タイムアウト時はタスク名・プロジェクト名・プレビューのローカル一致へフォールバック
- 送信後の履歴保存・重複排除は未実装
