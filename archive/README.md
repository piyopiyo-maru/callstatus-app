# アーカイブディレクトリ

このディレクトリには、開発過程で作成された一時ファイル群を整理・保管しています。

## ディレクトリ構造

### `/scripts`
開発中に作成されたユーティリティスクリプト群
- **ルート**: プロジェクト全体で使用されたスクリプト
- **backend**: バックエンド開発用の一時スクリプト

### `/test-data`
テスト・デバッグ用のサンプルデータファイル
- JSONファイル: 契約データ、スタッフデータのサンプル
- CSVファイル: スケジュールインポート用テストデータ

### `/exports`
データベースから抽出されたエクスポートファイル
- 調整レイヤーデータのエクスポート結果
- ログファイル

### `/backup`
重要ファイルのバックアップ
- page.tsx.backupなど

### `/docs`
開発メモやドキュメント

## 注意事項

- これらのファイルは開発過程の記録として保管
- 本番環境では使用しない
- 必要に応じて個別に復元可能
