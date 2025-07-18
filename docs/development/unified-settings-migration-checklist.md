# 統一設定モーダル移行互換性チェックリスト

**作成日**: 2025-06-28  
**目的**: 既存FullMainApp.tsxの設定モーダルから統一設定モーダルへの完全移行  

## 📊 機能互換性マトリックス

| 機能カテゴリ | 既存実装 | 新実装必要 | 優先度 | 検証状況 |
|-------------|----------|------------|--------|----------|
| **表示設定** | ✅ 完全実装 | 🔄 移行必要 | 🔴 高 | ⏸️ 未着手 |
| **インポート機能** | ✅ 完全実装 | 🔄 移行必要 | 🔴 高 | ⏸️ 未着手 |
| **部署・グループ設定** | ✅ 完全実装 | 🔄 移行必要 | 🔴 高 | ⏸️ 未着手 |
| **スナップショット管理** | ✅ 完全実装 | 🔄 移行必要 | 🔴 高 | ⏸️ 未着手 |
| **プリセット設定** | ❌ 未実装 | ✅ 新規追加 | 🔴 高 | ✅ 完了 |

## 🔍 詳細移行チェックリスト

### 1. 表示設定機能

#### 1.1 ビューモード設定
- [ ] **viewMode state**: `'normal' | 'compact'` の型互換性
- [ ] **localStorage永続化**: `'callstatus-viewMode'` キーの維持
- [ ] **デフォルト値**: `'normal'` の継承
- [ ] **UI制御**: ラジオボタンによる排他選択
- [ ] **即座反映**: 設定変更時のタイムライングリッド更新

#### 1.2 マスキング機能
- [ ] **maskingEnabled state**: `boolean` 型の維持
- [ ] **localStorage永続化**: `'callstatus-maskingEnabled'` キーの維持
- [ ] **デフォルト値**: `true` の継承
- [ ] **UI制御**: チェックボックスによる切り替え
- [ ] **適用範囲**: 履歴データ表示時の名前マスキング

#### 1.3 色設定表示
- [ ] **displayStatusColors**: 読み取り専用表示の継承
- [ ] **色プレビュー**: 各ステータスの色見本表示

### 2. インポート機能

#### 2.1 CSVアップロード
- [ ] **モーダル遷移**: `setIsCsvUploadModalOpen(true)` の継承
- [ ] **設定モーダル閉じる**: CSVモーダル開放時の動作
- [ ] **権限制御**: 管理者のみアクセス可能

#### 2.2 JSONアップロード  
- [ ] **モーダル遷移**: `setIsJsonUploadModalOpen(true)` の継承
- [ ] **設定モーダル閉じる**: JSONモーダル開放時の動作
- [ ] **権限制御**: 管理者のみアクセス可能

#### 2.3 インポート履歴
- [ ] **モーダル遷移**: `setIsImportHistoryModalOpen(true)` の継承
- [ ] **設定モーダル閉じる**: 履歴モーダル開放時の動作
- [ ] **権限制御**: 管理者のみアクセス可能

### 3. 部署・グループ設定

#### 3.1 データ構造
- [ ] **DepartmentGroupSetting型**: 完全な型互換性
```typescript
interface DepartmentGroupSetting {
  id: number;
  type: 'department' | 'group';
  name: string;
  shortName?: string;
  backgroundColor?: string;
  displayOrder?: number;
}
```

#### 3.2 API連携
- [ ] **GET /api/department-settings**: 読み取り機能
- [ ] **POST /api/department-settings**: 作成・更新機能
- [ ] **POST /api/department-settings/auto-generate**: 自動生成機能
- [ ] **authenticatedFetch**: 認証付きAPI呼び出し

#### 3.3 UI機能
- [ ] **編集可能テーブル**: インライン編集機能
- [ ] **短縮名入力**: テキスト入力フィールド
- [ ] **カラーピッカー**: 背景色選択機能
- [ ] **表示順設定**: 数値入力フィールド
- [ ] **自動生成ボタン**: 既存データからの生成

### 4. スナップショット管理

#### 4.1 データ構造
- [ ] **SnapshotHistory型**: 完全な型互換性
```typescript
interface SnapshotHistory {
  id: number;
  targetDate: string;
  status: 'COMPLETED' | 'FAILED' | 'PENDING';
  recordCount: number;
  batchId: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}
```

#### 4.2 API連携
- [ ] **GET /api/admin/snapshots/history**: 履歴取得
- [ ] **POST /api/admin/snapshots/manual/{date}**: 手動作成
- [ ] **DELETE /api/admin/snapshots/rollback/{batchId}**: ロールバック

#### 4.3 UI機能
- [ ] **履歴テーブル**: 状態アイコン付き一覧表示
- [ ] **日付選択**: 手動スナップショット作成
- [ ] **削除確認**: confirm()による危険操作確認
- [ ] **ローディング状態**: 処理中の表示制御

### 5. 権限制御・認証

#### 5.1 ユーザー権限
- [ ] **canManage判定**: `user?.role === 'ADMIN'` の継承
- [ ] **タブ表示制御**: 権限に応じた機能アクセス制限
- [ ] **機能別権限**: インポート、部署設定、スナップショットの個別制御

#### 5.2 認証機能
- [ ] **authenticatedFetch**: API呼び出し時の認証ヘッダー付与
- [ ] **エラーハンドリング**: 401エラー時の適切な処理

### 6. UI/UX継承

#### 6.1 モーダル動作
- [ ] **Portal使用**: body直下への描画
- [ ] **z-index設定**: `z-50` による最前面表示
- [ ] **背景オーバーレイ**: 半透明背景の維持
- [ ] **スクロール対応**: 長いコンテンツのスクロール

#### 6.2 フィードバック機能
- [ ] **alert()通知**: 成功・エラーメッセージ表示
- [ ] **confirm()確認**: 危険操作時の確認ダイアログ
- [ ] **ローディング表示**: 処理中状態の可視化
- [ ] **エラー表示**: APIエラー時のメッセージ

### 7. データ永続化

#### 7.1 localStorage
- [ ] **viewMode保存**: 設定変更時の自動保存
- [ ] **maskingEnabled保存**: 設定変更時の自動保存
- [ ] **リロード時復元**: 起動時の設定値復元

#### 7.2 API永続化
- [ ] **部署設定**: サーバー側への永続化
- [ ] **スナップショット**: データベースへの保存

### 8. 統合・移行計画

#### 8.1 段階的移行
- [ ] **Phase 2A**: 表示設定タブの完全移行
- [ ] **Phase 2B**: インポート機能タブの移行
- [ ] **Phase 2C**: 部署・グループ設定タブの移行
- [ ] **Phase 2D**: スナップショット管理タブの移行
- [ ] **Phase 2E**: 既存モーダルの削除

#### 8.2 検証項目
- [ ] **機能テスト**: 全機能の動作確認
- [ ] **権限テスト**: 管理者・一般ユーザーでの検証
- [ ] **データ整合性**: 設定値の正確な引き継ぎ
- [ ] **パフォーマンス**: 大量データでの動作確認
- [ ] **ブラウザ互換性**: 複数ブラウザでの動作確認

## ⚠️ 移行時のリスク要因

### 高リスク項目
1. **部署・グループ設定**: 複雑な編集UI + API連携
2. **スナップショット管理**: 危険操作（削除）を含む
3. **権限制御**: セキュリティに関わる機能分離

### 中リスク項目  
1. **localStorage同期**: 設定値の永続化ロジック
2. **モーダル遷移**: 子モーダルとの連携ロジック

### 低リスク項目
1. **表示設定**: 単純な状態管理
2. **プリセット設定**: 新規追加機能

## 🎯 成功基準

### 機能完全性
- [ ] 既存の全機能が新モーダルで利用可能
- [ ] 既存の設定値が正確に引き継がれる
- [ ] 権限制御が適切に機能する

### パフォーマンス
- [ ] モーダル開放時間が既存と同等以下
- [ ] 大量データ処理が既存と同等以上
- [ ] メモリ使用量が適切な範囲内

### ユーザビリティ
- [ ] 既存ユーザーが迷わず操作できる
- [ ] 新機能（プリセット設定）が直感的に使える
- [ ] エラー処理が適切に機能する

---

**このチェックリストに基づいて、段階的かつ確実な移行を実施します。**