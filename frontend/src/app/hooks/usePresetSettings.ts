// プリセット設定管理のカスタムフック

import { useState, useEffect, useCallback, useMemo } from 'react';
import { UnifiedPreset, PresetCategory, PresetFilter, UserPresetSettings } from '../components/types/PresetTypes';
import { 
  DEFAULT_UNIFIED_PRESETS, 
  PRESET_CATEGORIES, 
  DEFAULT_PRESET_SETTINGS,
  getPresetsByCategory,
  getActivePresets,
  getPresetById,
  getCategoryInfo
} from '../components/constants/PresetSchedules';
import { useAuth } from '../components/AuthProvider';
import { getApiBaseUrlSync } from '../../lib/api-config';
import { useGlobalPresetSettings } from './useGlobalPresetSettings';

// デバッグログ制御（統一）
const isDebugEnabled = () => typeof window !== 'undefined' && 
  process.env.NODE_ENV === 'development' && 
  window.localStorage?.getItem('app-debug') === 'true';

// API連携設定（段階的移行用）
const API_INTEGRATION_CONFIG = {
  enabled: false, // API連携を無効にして手動保存モードに変更
  fallbackToLocalStorage: true, // API失敗時にLocalStorageにフォールバック
  saveInterval: 5000 // 自動保存間隔（ミリ秒）
};

// グローバル設定統合設定
const GLOBAL_INTEGRATION_CONFIG = {
  enabled: true, // グローバル設定との統合を有効化
  mergeWithLocal: true, // ローカル設定とマージ
  preferGlobal: true // 競合時はグローバル設定を優先
};

// API連携用の型定義（バックエンドAPIとの互換性を保つ）
interface ApiPresetDto {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: 'general' | 'time-off' | 'special' | 'night-duty';
  schedules: Array<{
    status: string;
    startTime: number;
    endTime: number;
    memo?: string;
    sortOrder?: number;
  }>;
  representativeScheduleIndex?: number;  // 代表色として使用するスケジュールのインデックス
  isActive: boolean;
  customizable: boolean;
  isDefault: boolean;
}

interface ApiUserPresetSettingsDto {
  staffId: number;
  presets: ApiPresetDto[];
  pagePresetSettings: {
    monthlyPlanner: {
      enabledPresetIds: string[];
      defaultPresetId?: string;
      presetDisplayOrder?: string[];
    };
    personalPage: {
      enabledPresetIds: string[];
      defaultPresetId?: string;
      presetDisplayOrder?: string[];
    };
  };
  lastModified: string;
}

// API連携ヘルパー関数
class PresetSettingsApiClient {
  private apiUrl: string;
  private staffId: number | null = null;

  constructor() {
    this.apiUrl = getApiBaseUrlSync();
  }

  setStaffId(staffId: number | null) {
    this.staffId = staffId;
  }

  // UnifiedPresetをApiPresetDtoに変換
  private convertToApiDto(preset: UnifiedPreset): ApiPresetDto {
    return {
      id: preset.id,
      name: preset.name,
      displayName: preset.displayName,
      description: preset.description,
      category: preset.category,
      schedules: preset.schedules.map((schedule, index) => ({
        status: schedule.status,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        memo: schedule.memo,
        sortOrder: index
      })),
      representativeScheduleIndex: preset.representativeScheduleIndex,
      isActive: preset.isActive,
      customizable: preset.customizable,
      isDefault: preset.isDefault
    };
  }

  // ApiPresetDtoをUnifiedPresetに変換
  private convertFromApiDto(apiPreset: ApiPresetDto): UnifiedPreset {
    return {
      id: apiPreset.id,
      name: apiPreset.name,
      displayName: apiPreset.displayName,
      description: apiPreset.description,
      category: apiPreset.category,
      schedules: apiPreset.schedules.map(schedule => ({
        status: schedule.status,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        memo: schedule.memo
      })),
      representativeScheduleIndex: apiPreset.representativeScheduleIndex,
      isActive: apiPreset.isActive,
      customizable: apiPreset.customizable,
      isDefault: apiPreset.isDefault,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  // プリセット設定取得
  async getUserPresetSettings(): Promise<UserPresetSettings | null> {
    if (!this.staffId) {
      console.warn('[PresetAPI] staffId not available, falling back to LocalStorage');
      return null;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/preset-settings/staff/${this.staffId}`);
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const apiData: ApiUserPresetSettingsDto = await response.json();
      
      // APIレスポンスをフロントエンド形式に変換
      const userSettings: UserPresetSettings = {
        presets: apiData.presets.map(preset => this.convertFromApiDto(preset)),
        categories: PRESET_CATEGORIES,
        pagePresetSettings: apiData.pagePresetSettings,
        lastModified: apiData.lastModified
      };

      if (isDebugEnabled()) {
        console.log('[PresetAPI] プリセット設定を取得:', userSettings);
      }

      return userSettings;
    } catch (error) {
      console.error('[PresetAPI] プリセット設定取得エラー:', error);
      return null;
    }
  }

  // ページ別プリセット設定更新
  async updatePagePresetSettings(pageSettings: UserPresetSettings['pagePresetSettings']): Promise<boolean> {
    if (!this.staffId) {
      console.warn('[PresetAPI] staffId not available');
      return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/preset-settings/staff/${this.staffId}/page-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pageSettings)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      if (isDebugEnabled()) {
        console.log('[PresetAPI] ページ別プリセット設定を更新:', pageSettings);
      }

      return true;
    } catch (error) {
      console.error('[PresetAPI] ページ別プリセット設定更新エラー:', error);
      return false;
    }
  }

  // プリセット作成
  async createPreset(preset: UnifiedPreset): Promise<boolean> {
    if (!this.staffId) {
      console.warn('[PresetAPI] staffId not available');
      return false;
    }

    try {
      const apiDto = this.convertToApiDto(preset);
      const createDto = {
        presetId: apiDto.id,
        name: apiDto.name,
        displayName: apiDto.displayName,
        description: apiDto.description,
        category: apiDto.category,
        schedules: apiDto.schedules,
        representativeScheduleIndex: apiDto.representativeScheduleIndex,
        isActive: apiDto.isActive,
        customizable: apiDto.customizable,
        isDefault: apiDto.isDefault
      };

      const response = await fetch(`${this.apiUrl}/api/preset-settings/staff/${this.staffId}/presets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createDto)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      if (isDebugEnabled()) {
        console.log('[PresetAPI] プリセットを作成:', preset.id);
      }

      return true;
    } catch (error) {
      console.error('[PresetAPI] プリセット作成エラー:', error);
      return false;
    }
  }

  // プリセット更新
  async updatePreset(preset: UnifiedPreset): Promise<boolean> {
    if (!this.staffId) {
      console.warn('[PresetAPI] staffId not available');
      return false;
    }

    try {
      const apiDto = this.convertToApiDto(preset);
      const updateDto = {
        name: apiDto.name,
        displayName: apiDto.displayName,
        description: apiDto.description,
        category: apiDto.category,
        schedules: apiDto.schedules,
        representativeScheduleIndex: apiDto.representativeScheduleIndex,
        isActive: apiDto.isActive,
        customizable: apiDto.customizable,
        isDefault: apiDto.isDefault
      };

      const response = await fetch(`${this.apiUrl}/api/preset-settings/staff/${this.staffId}/presets/${preset.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateDto)
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      if (isDebugEnabled()) {
        console.log('[PresetAPI] プリセットを更新:', preset.id);
      }

      return true;
    } catch (error) {
      console.error('[PresetAPI] プリセット更新エラー:', error);
      return false;
    }
  }

  // プリセット削除
  async deletePreset(presetId: string): Promise<boolean> {
    if (!this.staffId) {
      console.warn('[PresetAPI] staffId not available');
      return false;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/preset-settings/staff/${this.staffId}/presets/${presetId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      if (isDebugEnabled()) {
        console.log('[PresetAPI] プリセットを削除:', presetId);
      }

      return true;
    } catch (error) {
      console.error('[PresetAPI] プリセット削除エラー:', error);
      return false;
    }
  }
}

interface UsePresetSettingsReturn {
  // プリセット一覧
  presets: UnifiedPreset[];
  categories: PresetCategory[];
  
  // フィルタリング・検索
  filteredPresets: UnifiedPreset[];
  setFilter: (filter: PresetFilter) => void;
  filter: PresetFilter;
  
  // プリセット操作
  addPreset: (preset: Omit<UnifiedPreset, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updatePreset: (id: string, updates: Partial<UnifiedPreset>) => void;
  deletePreset: (id: string) => void;
  togglePreset: (id: string) => void;
  
  // プリセット取得
  getPreset: (id: string) => UnifiedPreset | undefined;
  getPresetsByCategory: (categoryId: string) => UnifiedPreset[];
  
  // ページ別プリセット設定
  getPresetsForPage: (page: 'monthlyPlanner' | 'personalPage') => UnifiedPreset[];
  updatePagePresetSettings: (page: 'monthlyPlanner' | 'personalPage', enabledIds: string[], defaultId?: string) => void;
  getPagePresetSettings: (page: 'monthlyPlanner' | 'personalPage') => { enabledPresetIds: string[]; defaultPresetId: string };
  updatePresetDisplayOrder: (page: 'monthlyPlanner' | 'personalPage', newOrder: string[]) => void;
  
  // 設定管理
  saveSettings: () => void;
  loadSettings: () => void;
  resetToDefaults: () => void;
  discardChanges: () => void;
  
  // 状態管理
  isLoading: boolean;
  isDirty: boolean;
  
  // グローバル設定統合（新機能）
  globalSettings: {
    isAvailable: boolean;
    isLoading: boolean;
    version: string;
    lastSyncTime: string;
  };
  refreshGlobalSettings: () => void;
  isUsingGlobalSettings: boolean;
}

export const usePresetSettings = (): UsePresetSettingsReturn => {
  const [presets, setPresets] = useState<UnifiedPreset[]>(DEFAULT_UNIFIED_PRESETS);
  const [categories] = useState<PresetCategory[]>(PRESET_CATEGORIES);
  const [filter, setFilter] = useState<PresetFilter>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  
  // API連携の初期化
  const { user } = useAuth();
  const [apiClient] = useState(() => new PresetSettingsApiClient());
  
  // グローバル設定統合（新機能）
  const globalPresetHook = useGlobalPresetSettings();
  const [isUsingGlobalSettings, setIsUsingGlobalSettings] = useState(GLOBAL_INTEGRATION_CONFIG.enabled);
  
  // API連携を固定ID（999）で初期化（シンプル権限管理）
  useEffect(() => {
    // 設定を開けるなら全部設定できる、開けないなら全部使えない
    // 細かい権限設定は後で実装予定
    const ADMIN_STAFF_ID = 999;
    apiClient.setStaffId(ADMIN_STAFF_ID);
    if (isDebugEnabled()) {
      console.log('[PresetSettings] API連携を固定IDで初期化:', ADMIN_STAFF_ID);
    }
  }, [apiClient]);
  
  // ページ別プリセット設定（デフォルト値を明示的に設定）
  const [pagePresetSettings, setPagePresetSettings] = useState({
    monthlyPlanner: {
      enabledPresetIds: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.enabledPresetIds,
      defaultPresetId: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.defaultPresetId || 'standard-work',
      presetDisplayOrder: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.enabledPresetIds
    },
    personalPage: {
      enabledPresetIds: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.enabledPresetIds,
      defaultPresetId: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.defaultPresetId || 'standard-work',
      presetDisplayOrder: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.enabledPresetIds
    }
  });

  // 元の設定を保存（変更破棄用）
  const [originalSettings, setOriginalSettings] = useState({
    presets: DEFAULT_UNIFIED_PRESETS,
    pagePresetSettings: {
      monthlyPlanner: {
        enabledPresetIds: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.enabledPresetIds,
        defaultPresetId: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.defaultPresetId || 'standard-work',
        presetDisplayOrder: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.enabledPresetIds
      },
      personalPage: {
        enabledPresetIds: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.enabledPresetIds,
        defaultPresetId: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.defaultPresetId || 'standard-work',
        presetDisplayOrder: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.enabledPresetIds
      }
    }
  });

  // グローバル設定とローカル設定のマージ機能
  // マージ済みフラグを追加してループを防止
  const [isGlobalMerged, setIsGlobalMerged] = useState(false);
  const [lastGlobalVersion, setLastGlobalVersion] = useState<string>('');

  // グローバル設定とローカル設定のマージ機能（依存関係なし）
  const mergeGlobalAndLocalSettings = (currentPresets: UnifiedPreset[], currentPageSettings: any, globalSettings: any, currentVersion: string) => {
    if (!GLOBAL_INTEGRATION_CONFIG.enabled || !globalSettings) {
      return { presets: currentPresets, pageSettings: currentPageSettings, merged: false };
    }

    try {
      // バージョンが同じで既にマージ済みの場合はスキップ
      if (isGlobalMerged && lastGlobalVersion === currentVersion) {
        return { presets: currentPresets, pageSettings: currentPageSettings, merged: false };
      }
      
      if (isDebugEnabled()) {
        console.log('[PresetSettings] グローバル設定との統合を開始:', {
          globalPresets: globalSettings.presets.length,
          localPresets: currentPresets.length,
          mergeStrategy: GLOBAL_INTEGRATION_CONFIG.preferGlobal ? 'グローバル優先' : 'ローカル優先',
          version: currentVersion
        });
      }

      // プリセットのマージ
      let mergedPresets: UnifiedPreset[];
      if (GLOBAL_INTEGRATION_CONFIG.mergeWithLocal) {
        // グローバル設定をベースに、ローカル固有のプリセットを追加
        const globalPresetIds = globalSettings.presets.map((p: any) => p.id);
        const localOnlyPresets = currentPresets.filter(p => !globalPresetIds.includes(p.id) && !p.isDefault);
        
        mergedPresets = [
          ...globalSettings.presets,
          ...localOnlyPresets
        ];
      } else {
        // グローバル設定のみ使用
        mergedPresets = globalSettings.presets;
      }

      // ページ別設定のマージ（安全性チェック付き）
      let mergedPageSettings = currentPageSettings;
      if (GLOBAL_INTEGRATION_CONFIG.preferGlobal && globalSettings.pagePresetSettings) {
        // グローバル設定が有効でかつ正しい構造を持つ場合のみマージ
        const globalPageSettings = globalSettings.pagePresetSettings;
        if (globalPageSettings.monthlyPlanner && globalPageSettings.personalPage) {
          mergedPageSettings = {
            monthlyPlanner: {
              enabledPresetIds: globalPageSettings.monthlyPlanner.enabledPresetIds || currentPageSettings.monthlyPlanner.enabledPresetIds,
              defaultPresetId: globalPageSettings.monthlyPlanner.defaultPresetId || currentPageSettings.monthlyPlanner.defaultPresetId,
              presetDisplayOrder: globalPageSettings.monthlyPlanner.presetDisplayOrder || currentPageSettings.monthlyPlanner.enabledPresetIds
            },
            personalPage: {
              enabledPresetIds: globalPageSettings.personalPage.enabledPresetIds || currentPageSettings.personalPage.enabledPresetIds,
              defaultPresetId: globalPageSettings.personalPage.defaultPresetId || currentPageSettings.personalPage.defaultPresetId,
              presetDisplayOrder: globalPageSettings.personalPage.presetDisplayOrder || currentPageSettings.personalPage.enabledPresetIds
            }
          };
        }
      }

      if (isDebugEnabled()) {
        console.log('[PresetSettings] グローバル設定との統合完了:', {
          totalPresets: mergedPresets.length,
          globalPresets: globalSettings.presets.length,
          localOnlyPresets: mergedPresets.length - globalSettings.presets.length
        });
      }

      return { presets: mergedPresets, pageSettings: mergedPageSettings, merged: true };

    } catch (error) {
      console.error('[PresetSettings] グローバル設定統合エラー:', error);
      return { presets: currentPresets, pageSettings: currentPageSettings, merged: false };
    }
  };

  // フィルタリング済みプリセット
  const filteredPresets = useMemo(() => {
    let filtered = presets;

    if (filter.category) {
      filtered = filtered.filter(preset => preset.category === filter.category);
    }

    if (typeof filter.isActive === 'boolean') {
      filtered = filtered.filter(preset => preset.isActive === filter.isActive);
    }

    if (typeof filter.customizable === 'boolean') {
      filtered = filtered.filter(preset => preset.customizable === filter.customizable);
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      filtered = filtered.filter(preset => 
        preset.displayName.toLowerCase().includes(query) ||
        preset.description?.toLowerCase().includes(query) ||
        preset.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [presets, filter]);

  // プリセット追加（API連携対応）
  const addPreset = useCallback(async (presetData: Omit<UnifiedPreset, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newPreset: UnifiedPreset = {
      ...presetData,
      id: `custom-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDefault: false
    };

    // ローカル状態を更新（既存機能の完全な互換性を保持）
    setPresets(prev => [...prev, newPreset]);
    setIsDirty(true);
    
    // API連携が有効な場合、APIにも送信
    if (API_INTEGRATION_CONFIG.enabled) {
      try {
        const apiCreateSuccessful = await apiClient.createPreset(newPreset);
        if (apiCreateSuccessful && isDebugEnabled()) {
          console.log('[PresetSettings] APIにプリセットを作成しました:', newPreset.id);
        }
      } catch (apiError) {
        console.warn('[PresetSettings] API プリセット作成失敗（ローカル状態は更新済み）:', apiError);
      }
    }
  }, [apiClient]);

  // プリセット更新（API連携対応）
  const updatePreset = useCallback(async (id: string, updates: Partial<UnifiedPreset>) => {
    // ローカル状態を更新（既存機能の完全な互換性を保持）
    const updatedPreset = { updatedAt: new Date().toISOString(), ...updates };
    let fullUpdatedPreset: UnifiedPreset | null = null;
    
    setPresets(prev => prev.map(preset => {
      if (preset.id === id) {
        fullUpdatedPreset = { ...preset, ...updatedPreset };
        return fullUpdatedPreset;
      }
      return preset;
    }));
    setIsDirty(true);
    
    // API連携が有効な場合、APIにも送信
    if (API_INTEGRATION_CONFIG.enabled && user?.staffId && fullUpdatedPreset) {
      try {
        const apiUpdateSuccessful = await apiClient.updatePreset(fullUpdatedPreset);
        if (apiUpdateSuccessful && isDebugEnabled()) {
          console.log('[PresetSettings] APIのプリセットを更新しました:', id);
        }
      } catch (apiError) {
        console.warn('[PresetSettings] API プリセット更新失敗（ローカル状態は更新済み）:', apiError);
      }
    }
  }, [apiClient]);

  // プリセット削除（API連携対応）
  const deletePreset = useCallback(async (id: string) => {
    const preset = presets.find(p => p.id === id);
    if (preset?.isDefault) {
      console.warn('[PresetSettings] デフォルトプリセットは削除できません');
      return;
    }

    // ローカル状態を更新（既存機能の完全な互換性を保持）
    setPresets(prev => prev.filter(preset => preset.id !== id));
    setIsDirty(true);
    
    // API連携が有効な場合、APIからも削除
    if (API_INTEGRATION_CONFIG.enabled) {
      try {
        const apiDeleteSuccessful = await apiClient.deletePreset(id);
        if (apiDeleteSuccessful && isDebugEnabled()) {
          console.log('[PresetSettings] APIからプリセットを削除しました:', id);
        }
      } catch (apiError) {
        console.warn('[PresetSettings] API プリセット削除失敗（ローカル状態は更新済み）:', apiError);
      }
    }
  }, [presets, apiClient, user?.staffId]);

  // プリセット有効/無効切替
  const togglePreset = useCallback((id: string) => {
    updatePreset(id, { isActive: !presets.find(p => p.id === id)?.isActive });
  }, [presets, updatePreset]);

  // プリセット取得
  const getPreset = useCallback((id: string) => {
    return presets.find(preset => preset.id === id);
  }, [presets]);

  // カテゴリ別プリセット取得
  const getPresetsByCategoryCallback = useCallback((categoryId: string) => {
    return presets.filter(preset => preset.category === categoryId && preset.isActive);
  }, [presets]);

  // ページ別プリセット取得（表示順序対応）
  const getPresetsForPage = useCallback((page: 'monthlyPlanner' | 'personalPage') => {
    const settings = pagePresetSettings[page];
    const enabledIds = settings.enabledPresetIds;
    const displayOrder = settings.presetDisplayOrder || enabledIds;
    
    // 有効なプリセットを取得
    const enabledPresets = presets.filter(preset => 
      preset.isActive && enabledIds.includes(preset.id)
    );
    
    // 表示順序に従ってソート
    const orderedPresets = displayOrder
      .map((id: string) => enabledPresets.find(p => p.id === id))
      .filter(Boolean) as typeof enabledPresets;
    
    // 順序にないが有効なプリセットがあれば最後に追加
    const remainingPresets = enabledPresets.filter(
      preset => !displayOrder.includes(preset.id)
    );
    
    return [...orderedPresets, ...remainingPresets];
  }, [presets, pagePresetSettings]);

  // ページ別プリセット設定更新（手動保存モード対応）
  const updatePagePresetSettings = useCallback(async (
    page: 'monthlyPlanner' | 'personalPage', 
    enabledIds: string[], 
    defaultId?: string
  ) => {
    // ローカル状態のみ更新（手動保存モード）
    const newPageSettings = {
      enabledPresetIds: enabledIds,
      defaultPresetId: defaultId || enabledIds[0] || 'standard-work'
    };
    
    let updatedPagePresetSettings: typeof pagePresetSettings = {
      ...pagePresetSettings,
      [page]: newPageSettings
    };
    
    setPagePresetSettings(updatedPagePresetSettings);
    setIsDirty(true);
    
    // API連携が有効な場合のみ、APIにも送信
    if (API_INTEGRATION_CONFIG.enabled) {
      try {
        // 更新された全体のページ別設定をAPIに送信
        const apiUpdateSuccessful = await apiClient.updatePagePresetSettings(updatedPagePresetSettings);
        if (apiUpdateSuccessful && isDebugEnabled()) {
          console.log('[PresetSettings] APIのページ別プリセット設定を更新しました:', page);
        }
      } catch (apiError) {
        console.warn('[PresetSettings] API ページ別プリセット設定更新失敗（ローカル状態は更新済み）:', apiError);
      }
    }
    // 手動保存モードではここでLocalStorageに保存しない
  }, [apiClient, pagePresetSettings]);

  // プリセット表示順序更新（手動保存モード対応）
  const updatePresetDisplayOrder = useCallback(async (
    page: 'monthlyPlanner' | 'personalPage',
    newOrder: string[]
  ) => {
    const currentSettings = pagePresetSettings[page];
    const updatedSettings = {
      ...currentSettings,
      presetDisplayOrder: newOrder
    };
    
    // ローカル状態のみ更新（手動保存モード）
    const updatedPagePresetSettings = {
      ...pagePresetSettings,
      [page]: updatedSettings
    };
    
    setPagePresetSettings(updatedPagePresetSettings);
    setIsDirty(true);
    
    // API連携が有効な場合のみ、APIにも送信
    if (API_INTEGRATION_CONFIG.enabled) {
      try {
        const apiUpdateSuccessful = await apiClient.updatePagePresetSettings(updatedPagePresetSettings);
        if (apiUpdateSuccessful && isDebugEnabled()) {
          console.log('[PresetSettings] プリセット表示順序を更新しました:', page, newOrder);
        }
      } catch (apiError) {
        console.warn('[PresetSettings] プリセット表示順序更新失敗（ローカル状態は更新済み）:', apiError);
      }
    }
    // 手動保存モードではここでLocalStorageに保存しない
  }, [apiClient, pagePresetSettings]);

  // ページ別プリセット設定取得
  const getPagePresetSettings = useCallback((page: 'monthlyPlanner' | 'personalPage') => {
    return pagePresetSettings[page];
  }, [pagePresetSettings]);

  // 設定保存（楽観的ロック対応）
  const saveSettings = useCallback(async () => {
    if (isDebugEnabled()) {
      console.log('[PresetSettings] 保存開始:', {
        globalEnabled: GLOBAL_INTEGRATION_CONFIG.enabled,
        globalVersion: globalPresetHook.globalSettings?.version,
        presetsCount: presets.length
      });
    }
    setIsLoading(true);
    try {
      const settings: UserPresetSettings = {
        presets,
        categories,
        pagePresetSettings,
        lastModified: new Date().toISOString()
      };

      let apiSaveSuccessful = false;
      
      // グローバルプリセット設定に保存を試行（楽観的ロック）
      if (GLOBAL_INTEGRATION_CONFIG.enabled) {
        const currentVersion = globalPresetHook.globalSettings?.version;
        if (isDebugEnabled()) {
          console.log('[PresetSettings] グローバル保存開始、バージョン:', currentVersion);
        }
        try {
          const apiUrl = getApiBaseUrlSync();
          const response = await fetch(`${apiUrl}/api/admin/global-preset-settings`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              presets: presets,
              categories: categories,
              pagePresetSettings: pagePresetSettings,
              expectedVersion: currentVersion
            })
          });
          
          if (response.status === 409) {
            // 競合検出
            const conflictData = await response.json();
            console.warn('[PresetSettings] 設定競合を検出:', conflictData);
            
            // グローバル設定を強制リフレッシュして最新データを取得
            await globalPresetHook.refreshSettings();
            
            throw new Error('CONFLICT_DETECTED');
          }
          
          if (response.ok) {
            apiSaveSuccessful = true;
            if (isDebugEnabled()) {
              console.log('[PresetSettings] グローバルプリセット設定を保存しました');
            }
            // グローバル設定を強制リフレッシュ
            await globalPresetHook.refreshSettings();
          } else {
            console.error('[PresetSettings] 保存失敗:', response.status, await response.text());
          }
        } catch (apiError) {
          if (apiError instanceof Error && apiError.message === 'CONFLICT_DETECTED') {
            throw apiError;
          }
          console.error('[PresetSettings] グローバルプリセット設定保存失敗:', apiError);
        }
      }
      
      // 従来のAPI連携（フォールバック）
      if (!apiSaveSuccessful && API_INTEGRATION_CONFIG.enabled) {
        try {
          // ページ別プリセット設定をAPIに保存
          const pageSettingsSaved = await apiClient.updatePagePresetSettings(pagePresetSettings);
          if (pageSettingsSaved) {
            apiSaveSuccessful = true;
            if (isDebugEnabled()) {
              console.log('[PresetSettings] APIにページ別プリセット設定を保存しました');
            }
          }
        } catch (apiError) {
          console.warn('[PresetSettings] API保存失敗、LocalStorageにフォールバック:', apiError);
        }
      }
      
      // LocalStorageに保存（手動保存時のみ実行）
      if (!API_INTEGRATION_CONFIG.enabled || (API_INTEGRATION_CONFIG.fallbackToLocalStorage && !apiSaveSuccessful)) {
        localStorage.setItem('userPresetSettings', JSON.stringify(settings));
        if (isDebugEnabled()) {
          console.log('[PresetSettings] LocalStorageにプリセット設定を保存しました');
        }
      }
      
      setIsDirty(false);
      
      // 保存成功時に元の設定も更新
      setOriginalSettings({
        presets,
        pagePresetSettings
      });
      
      if (isDebugEnabled()) {
        if (apiSaveSuccessful) {
          console.log('[PresetSettings] プリセット設定をAPIに保存しました');
        } else {
          console.log('[PresetSettings] プリセット設定をLocalStorageに保存しました');
        }
      }
      
    } catch (error: any) {
      if (error.message === 'CONFLICT_DETECTED') {
        // 競合エラーの場合、UIに通知（ここではコンソールログのみ）
        console.warn('[PresetSettings] 競合により保存失敗 - 他のユーザーが設定を変更しました');
        // TODO: 実際のUIでは通知バナーやモーダルで表示
        alert('他のユーザーが設定を変更しました。最新の設定を確認してから再度保存してください。');
      } else {
        console.error('[PresetSettings] プリセット設定の保存に失敗しました:', error);
      }
    } finally {
      setIsLoading(false);
    }
  }, [presets, categories, pagePresetSettings, apiClient, globalPresetHook]);

  // 設定読み込み（API連携対応）
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      let settingsLoaded = false;
      
      // API連携が有効な場合、APIから読み込みを試行
      if (API_INTEGRATION_CONFIG.enabled) {
        try {
          const apiSettings = await apiClient.getUserPresetSettings();
          if (apiSettings) {
            setPresets(apiSettings.presets);
            
            // ページ別プリセット設定も読み込み
            if (apiSettings.pagePresetSettings) {
              // defaultPresetIdが未定義の場合はデフォルト値を設定
              const pageSettings = {
                monthlyPlanner: {
                  enabledPresetIds: apiSettings.pagePresetSettings.monthlyPlanner.enabledPresetIds,
                  defaultPresetId: apiSettings.pagePresetSettings.monthlyPlanner.defaultPresetId || 'standard-work',
                  presetDisplayOrder: apiSettings.pagePresetSettings.monthlyPlanner.presetDisplayOrder || apiSettings.pagePresetSettings.monthlyPlanner.enabledPresetIds
                },
                personalPage: {
                  enabledPresetIds: apiSettings.pagePresetSettings.personalPage.enabledPresetIds,
                  defaultPresetId: apiSettings.pagePresetSettings.personalPage.defaultPresetId || 'standard-work',
                  presetDisplayOrder: apiSettings.pagePresetSettings.personalPage.presetDisplayOrder || apiSettings.pagePresetSettings.personalPage.enabledPresetIds
                }
              };
              setPagePresetSettings(pageSettings);
              // 元の設定も更新
              setOriginalSettings({
                presets: apiSettings.presets,
                pagePresetSettings: pageSettings
              });
            }
            
            setIsDirty(false);
            settingsLoaded = true;
            if (isDebugEnabled()) {
              console.log('[PresetSettings] APIからプリセット設定を読み込みました');
            }
          }
        } catch (apiError) {
          console.warn('[PresetSettings] API読み込み失敗、LocalStorageにフォールバック:', apiError);
        }
      }
      
      // API読み込みが失敗またはAPI連携が無効な場合、LocalStorageから読み込み
      if (!settingsLoaded && API_INTEGRATION_CONFIG.fallbackToLocalStorage) {
        const saved = localStorage.getItem('userPresetSettings');
        if (saved) {
          const settings: UserPresetSettings = JSON.parse(saved);
          setPresets(settings.presets);
          
          // ページ別プリセット設定も読み込み
          if (settings.pagePresetSettings) {
            // defaultPresetIdが未定義の場合はデフォルト値を設定
            const pageSettings = {
              monthlyPlanner: {
                enabledPresetIds: settings.pagePresetSettings.monthlyPlanner.enabledPresetIds,
                defaultPresetId: settings.pagePresetSettings.monthlyPlanner.defaultPresetId || 'standard-work',
                presetDisplayOrder: settings.pagePresetSettings.monthlyPlanner.presetDisplayOrder || settings.pagePresetSettings.monthlyPlanner.enabledPresetIds
              },
              personalPage: {
                enabledPresetIds: settings.pagePresetSettings.personalPage.enabledPresetIds,
                defaultPresetId: settings.pagePresetSettings.personalPage.defaultPresetId || 'standard-work',
                presetDisplayOrder: settings.pagePresetSettings.personalPage.presetDisplayOrder || settings.pagePresetSettings.personalPage.enabledPresetIds
              }
            };
            setPagePresetSettings(pageSettings);
            // 元の設定も更新
            setOriginalSettings({
              presets: settings.presets,
              pagePresetSettings: pageSettings
            });
          }
          
          setIsDirty(false);
          settingsLoaded = true;
          if (isDebugEnabled()) {
            console.log('[PresetSettings] LocalStorageからプリセット設定を読み込みました');
          }
        }
      }
      
      // どちらからも読み込めなかった場合はデフォルト設定を使用
      if (!settingsLoaded) {
        if (isDebugEnabled()) {
          console.log('[PresetSettings] デフォルト設定を使用します');
        }
      }
      
    } catch (error) {
      console.error('[PresetSettings] プリセット設定の読み込みに失敗しました:', error);
    } finally {
      setIsLoading(false);
    }
  }, [apiClient]);

  // デフォルトに戻す
  const resetToDefaults = useCallback(() => {
    setPresets(DEFAULT_UNIFIED_PRESETS);
    setPagePresetSettings({
      monthlyPlanner: {
        enabledPresetIds: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.enabledPresetIds,
        defaultPresetId: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.defaultPresetId || 'standard-work',
        presetDisplayOrder: DEFAULT_PRESET_SETTINGS.pagePresetSettings.monthlyPlanner.enabledPresetIds
      },
      personalPage: {
        enabledPresetIds: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.enabledPresetIds,
        defaultPresetId: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.defaultPresetId || 'standard-work',
        presetDisplayOrder: DEFAULT_PRESET_SETTINGS.pagePresetSettings.personalPage.enabledPresetIds
      }
    });
    setIsDirty(true);
    if (isDebugEnabled()) {
      console.log('プリセット設定をデフォルトに戻しました');
    }
  }, []);

  // 変更を破棄して元の設定に戻す
  const discardChanges = useCallback(() => {
    setPresets(originalSettings.presets);
    setPagePresetSettings(originalSettings.pagePresetSettings);
    setIsDirty(false);
    if (isDebugEnabled()) {
      console.log('プリセット設定の変更を破棄しました');
    }
  }, [originalSettings]);

  // グローバル設定の変更を監視してマージ実行（ループ防止版）
  useEffect(() => {
    if (GLOBAL_INTEGRATION_CONFIG.enabled && globalPresetHook.globalSettings && globalPresetHook.isInitialized) {
      const globalVersion = globalPresetHook.globalSettings.version;
      
      // バージョンベースの重複実行防止
      if (isGlobalMerged && lastGlobalVersion === globalVersion) {
        return;
      }

      const mergeResult = mergeGlobalAndLocalSettings(presets, pagePresetSettings, globalPresetHook.globalSettings, globalVersion);
      
      if (mergeResult.merged) {
        setPresets(mergeResult.presets);
        setPagePresetSettings(mergeResult.pageSettings);
        setIsGlobalMerged(true);
        setLastGlobalVersion(globalVersion);
      }
    }
  }, [globalPresetHook.globalSettings?.version, globalPresetHook.isInitialized]);

  // 初期化時に設定読み込み
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    presets,
    categories,
    filteredPresets,
    setFilter,
    filter,
    addPreset,
    updatePreset,
    deletePreset,
    togglePreset,
    getPreset,
    getPresetsByCategory: getPresetsByCategoryCallback,
    getPresetsForPage,
    updatePagePresetSettings,
    getPagePresetSettings,
    updatePresetDisplayOrder,
    saveSettings,
    loadSettings,
    resetToDefaults,
    discardChanges,
    isLoading,
    isDirty,
    
    // グローバル設定統合（新機能）
    globalSettings: {
      isAvailable: !!globalPresetHook.globalSettings,
      isLoading: globalPresetHook.isLoading,
      version: globalPresetHook.globalSettings?.version || '',
      lastSyncTime: globalPresetHook.lastSyncTime,
      isOutdated: globalPresetHook.isOutdated()
    } as any,
    refreshGlobalSettings: globalPresetHook.refreshSettings,
    isUsingGlobalSettings
  };
};