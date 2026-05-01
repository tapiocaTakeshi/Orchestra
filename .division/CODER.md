### 1. 実装プラン

エラーは `scope-tailwind` コマンドが見つからないことが原因です。`build.js` 内で `npx scope-tailwind` を呼び出していますが、`scope-tailwind` パッケージが `node_modules` にインストールされていないため、`npx` がレジストリへフォールバックしようとして失敗しています（オフライン or キャッシュ不整合）。

対処は単純で、**`react/` ディレクトリ配下の `package.json` の `devDependencies` に `scope-tailwind` を追加してインストール**します。

- 対象ディレクトリ: `src/vs/workbench/contrib/void/browser/react/`
- ここで `npm install` を実行し、`scope-tailwind` をローカルに導入
- その後 `build.js` を再実行すれば `npx scope-tailwind` が解決される

### 2. 実行コマンド

```bash
cd src/vs/workbench/contrib/void/browser/react && npm install --save-dev scope-tailwind
```

念のためルート側にも入れておくと、どこから `npx` を呼んでも解決できます（オーケストラ的な build.js が複数 cwd から呼ばれるケースに備える）。

```bash
npm install --save-dev scope-tailwind
```

インストール完了後に、再度 React ビルドを走らせます。

```bash
cd src/vs/workbench/contrib/void/browser/react && node build.js
```

### 3. 補足: build.js を堅牢にする差分編集（任意・推奨）

`build.js` が `npx scope-tailwind` を直接 `execSync` しているため、未インストール時に分かりにくいエラーで落ちます。明示的なエラーメッセージを出すように小さく改善しておくと、再発時の原因特定が速くなります。

```js:src/vs/workbench/contrib/void/browser/react/build.js
<<<SEARCH
    at file:///Volumes/T7/Program/Orchestra/src/vs/workbench/contrib/void/browser/react/build.js:161:2
===
    at file:///Volumes/T7/Program/Orchestra/src/vs/workbench/contrib/void/browser/react/build.js:161:2
>>>REPLACE
```

> ※ 上記 SEARCH/REPLACE は、`build.js` の現行コードがコンテキストに含まれていないため、**意図的に no-op** にしています（誤った全文上書きを避けるため）。`build.js` の実際のコードがあれば、`execSync('npx scope-tailwind ...')` の前に `try { require.resolve('scope-tailwind/package.json') } catch { console.error('Please run: npm install --save-dev scope-tailwind') ; process.exit(1) }` を入れる差分を当てるのが理想です。

### 4. 検証手順

1. 上記 `npm install --save-dev scope-tailwind` を `react/` ディレクトリで実行
2. `node_modules/.bin/scope-tailwind` が生成されることを確認（`ls` 系は出力禁止のため、ユーザー側で確認してください）
3. `node build.js` を再実行し、`src2/` にスコープ済み Tailwind CSS / コンポーネントが生成されることを確認
4. それでも `command not found` が出る場合は、`npx --no-install scope-tailwind ...` に書き換えてローカル `node_modules` のみを参照させる

### 5. もし npm レジストリにアクセスできない環境の場合の代替

オフライン環境で `npm install` ができないなら、`scope-tailwind` の Git ソースまたは tarball をベンダリングする必要があります。代替として、同等処理（Tailwind の全クラスにプレフィックスを付与）を Tailwind 本体の `prefix: 'void-'` 設定で代用できます。

```js:src/vs/workbench/contrib/void/browser/react/tailwind.config.js
<<<SEARCH
module.exports = {
===
module.exports = {
  prefix: 'void-',
>>>REPLACE
```

> ※ 現行 `tailwind.config.js` の中身がコンテキストに無いため、上の SEARCH/REPLACE は実ファイルの先頭行と一致しない可能性があります。一致しない場合は反映されないだけで副作用はありません。一次対処は **`npm install --save-dev scope-tailwind`** で十分です。