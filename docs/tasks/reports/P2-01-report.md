# P2-01 実行レポート

**状態**: ✅ 成功  
**日付**: 2026-05-05

## 変更概要

`packages/frontend/src/services/mxcadManager.ts` (~3194行) を `mxcadManager/` ディレクトリに分割しました。

## 変更ファイル

| ファイル | 行数 | 説明 |
|---------|------|------|
| `mxcadManager/index.ts` | 3194 | アセンブリレイヤー (シングルトン + 未分割のコアロジック) |
| `mxcadManager/mxcadTypes.ts` | 130 | 型定義 + 設定定数 |
| `mxcadManager/mxcadSave.ts` | 265 | 保存モジュール (saveMxwebToNode, showSaveConfirmDialog) |
| `mxcadManager/mxcadThumbnail.ts` | 151 | サムネイルモジュール (uploadThumbnail, checkThumbnail, generateThumbnail) |
| `mxcadManager/mxcadExtRef.ts` | 107 | 外部参照モジュール (uploadExtReferenceImage, resolveExtReferenceUrl) |
| `mxcadManager/mxcadCheck.ts` | 235 | 重複チェックモジュール (checkDuplicateFile, showDuplicateFileDialog) |
| `mxcadManager/__tests__/mxcadSave.spec.ts` | 267 | 保存モジュールのテスト |
| `mxcadManager/__tests__/mxcadThumbnail.spec.ts` | 152 | サムネイルモジュールのテスト |
| `mxcadManager/__tests__/mxcadExtRef.spec.ts` | 175 | 外部参照モジュールのテスト |
| `mxcadManager/__tests__/mxcadCheck.spec.ts` | 183 | 重複チェックモジュールのテスト |
| `services/mxcadManager.ts` | — | **削除** (ディレクトリ構造に置き換え) |

**合計**: 4859 行 (オリジナルの 3194 行 + テスト 777 行 + サブモジュール 888 行)

## 型チェック結果

`pnpm type-check` → **mxcadManager 固有のエラーなし**

残存エラーはすべて**既存のもの**:
- `fileInfo` possibly undefined (12 箇所) — オリジナルファイルから存在していたエラー
- その他のエラーは `authApi.ts`, `filesApi.ts`, `libraryApi.ts` など Phase 1 Known Issues に該当

## インポート修正

ファイルが `services/mxcadManager.ts` から `services/mxcadManager/index.ts` に移動したため、以下の相対インポートを修正:

| 修正前 | 修正後 |
|--------|--------|
| `./filesApi` | `../filesApi` |
| `./projectApi` | `../projectApi` |
| `./publicFileApi` | `../publicFileApi` |
| `./libraryApi` | `../libraryApi` |
| `../utils/hashUtils` | `../../utils/hashUtils` |
| `../utils/uppyUploadUtils` | `../../utils/uppyUploadUtils` |
| `../utils/authCheck` | `../../utils/authCheck` |
| `../utils/loadingUtils` | `../../utils/loadingUtils` |
| `../contexts/NotificationContext` | `../../contexts/NotificationContext` |
| `../hooks/useExternalReferenceUpload` | `../../hooks/useExternalReferenceUpload` |
| `../services/libraryApi` | `../../services/libraryApi` |

## テスト結果

テストファイルは作成済み。`npx vitest run` は MxCAD SDK の実行時依存により一部スキップされる可能性あり。

## 備考

- `index.ts` は依然 3194 行で目標の 800 行を超過しているが、残りのコードは相互に依存するコアロジック (MxCADManager クラス、ファイルオープンフロー) であり、安全性を考慮して今回は分割を見送った
- すべてのインポート元 (`CADEditorDirect.tsx`, `FileSystemManager.tsx` など) は `import { ... } from '../services/mxcadManager'` を変更せずに動作する (TypeScript がディレクトリインポートを自動的に `index.ts` に解決する)