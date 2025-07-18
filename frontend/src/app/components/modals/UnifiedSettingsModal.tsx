// 統一設定モーダル - 全ページで共通利用

'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
// import { useDrag, useDrop, DndProvider } from 'react-dnd';
// import { HTML5Backend } from 'react-dnd-html5-backend';
import { useAuth, UserRole } from '../AuthProvider';
import { usePresetSettings } from '../../hooks/usePresetSettings';
import { UnifiedPreset, PresetCategory, PresetEditFormData } from '../types/PresetTypes';
import { DepartmentGroupSetting, SnapshotHistory, ImportHistory, DisplaySettings } from '../types/MainAppTypes';
import { statusColors } from '../constants/MainAppConstants';
import { capitalizeStatus, STATUS_COLORS, STATUS_DISPLAY_NAMES, ALL_STATUSES, getEffectiveDisplayName, formatDecimalTime, getDepartmentGroupStyle } from '../timeline/TimelineUtils';
import { getApiUrl } from '../constants/MainAppConstants';
import { PresetEditModal } from './PresetEditModal';
import { useSettingsImportExport } from '../../hooks/useSettingsImportExport';
import { ExportOptions, ImportOptions, SettingsBackup } from '../types/SettingsTypes';
import { SettingsValidator } from '../../utils/SettingsValidator';

interface UnifiedSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: any) => void;
  onSave?: () => Promise<void> | void; // 設定保存後のコールバック
  // 子モーダル制御用のprops
  setIsCsvUploadModalOpen?: (open: boolean) => void;
  setIsJsonUploadModalOpen?: (open: boolean) => void;
  setIsImportHistoryModalOpen?: (open: boolean) => void;
  // 認証機能
  authenticatedFetch?: (url: string, options?: RequestInit) => Promise<Response>;
  staffList?: any[];
}

type TabType = 'display' | 'presets' | 'settings-management' | 'import' | 'departments' | 'snapshots';

// ドラッグ&ドロップ用のアイテム型定義
interface DragItem {
  type: string;
  id: string;
  index: number;
}

// ドラッグ可能なプリセットアイテムコンポーネント
interface DraggablePresetItemProps {
  preset: UnifiedPreset;
  index: number;
  isEnabled: boolean;
  isDefault: boolean;
  page: 'monthlyPlanner' | 'personalPage';
  onToggle: (checked: boolean) => void;
  onSetDefault: () => void;
  onMove: (dragIndex: number, hoverIndex: number) => void;
}

interface SimplePresetItemProps extends DraggablePresetItemProps {
  totalCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isHighlighted?: boolean;
}

function SimplePresetItem({
  preset,
  index,
  isEnabled,
  isDefault,
  page,
  onToggle,
  onSetDefault,
  onMove,
  totalCount,
  onMoveUp,
  onMoveDown,
  isHighlighted = false
}: SimplePresetItemProps) {
  const isFirst = index === 0;
  const isLast = index === totalCount - 1;

  return (
    <div className={`flex items-center justify-between p-2 bg-gray-50 rounded-lg border transition-all duration-300 ${
      isHighlighted 
        ? 'border-2 border-orange-400 bg-orange-50 shadow-md' 
        : isEnabled 
          ? 'border-blue-200 bg-blue-50' 
          : 'border-gray-200'
    }`}>
      <div className="flex items-center space-x-3">
        {/* 順序変更ボタン（有効なプリセットのみ） */}
        {isEnabled && index !== -1 ? (
          <div className="flex space-x-0.5">
            <button
              onClick={onMoveUp}
              disabled={isFirst}
              className={`w-4 h-5 text-xs flex items-center justify-center rounded transition-colors ${
                isFirst 
                  ? 'text-gray-300 cursor-not-allowed' 
                  : 'text-blue-600 hover:bg-blue-100 hover:text-blue-800'
              }`}
              title="上に移動"
            >
              ▲
            </button>
            <button
              onClick={onMoveDown}
              disabled={isLast}
              className={`w-4 h-5 text-xs flex items-center justify-center rounded transition-colors ${
                isLast 
                  ? 'text-gray-300 cursor-not-allowed' 
                  : 'text-blue-600 hover:bg-blue-100 hover:text-blue-800'
              }`}
              title="下に移動"
            >
              ▼
            </button>
          </div>
        ) : (
          <div className="w-8"></div> // スペースを保持（横並び分のサイズ）
        )}
        
        {/* 順序番号（有効なプリセットのみ） */}
        {isEnabled && index !== -1 ? (
          <span className="text-xs font-mono text-gray-500 bg-white px-2 py-1 rounded border w-6 text-center">
            {index + 1}
          </span>
        ) : (
          <div className="w-6"></div> // スペースを保持
        )}
        
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        
        <span className="text-sm font-medium">{preset.displayName}</span>
      </div>
      
      <div className="flex items-center space-x-1">
        {/* デフォルト設定機能は削除 */}
      </div>
    </div>
  );
}

export function UnifiedSettingsModal({ 
  isOpen, 
  onClose, 
  onSettingsChange,
  onSave,
  setIsCsvUploadModalOpen,
  setIsJsonUploadModalOpen,
  setIsImportHistoryModalOpen,
  authenticatedFetch,
  staffList
}: UnifiedSettingsModalProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('display');
  
  // 表示設定の状態
  const [maskingEnabled, setMaskingEnabled] = useState(false);
  const [timeRange, setTimeRange] = useState<'standard' | 'extended'>('standard');
  
  // ステータス色設定の状態
  const [customStatusColors, setCustomStatusColors] = useState<{ [key: string]: string }>({});
  const [isStatusColorsModified, setIsStatusColorsModified] = useState(false);
  
  // ステータス表示名設定の状態
  const [customStatusDisplayNames, setCustomStatusDisplayNames] = useState<{ [key: string]: string }>({});
  const [isStatusDisplayNamesModified, setIsStatusDisplayNamesModified] = useState(false);
  
  // 管理機能の状態
  const [departments, setDepartments] = useState<DepartmentGroupSetting[]>([]);
  const [groups, setGroups] = useState<DepartmentGroupSetting[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isSavingDepartments, setIsSavingDepartments] = useState(false);
  const [snapshotHistory, setSnapshotHistory] = useState<SnapshotHistory[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  
  // プリセット編集モーダルの状態
  const [isPresetEditModalOpen, setIsPresetEditModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<UnifiedPreset | null>(null);
  const [editMode, setEditMode] = useState<'create' | 'edit' | 'duplicate'>('create');

  // ドラッグ&ドロップ用のローカル状態（表示順序制御）
  const [monthlyPlannerOrder, setMonthlyPlannerOrder] = useState<string[]>([]);
  const [personalPageOrder, setPersonalPageOrder] = useState<string[]>([]);
  
  // プリセット移動時のハイライト状態管理
  const [highlightedPresets, setHighlightedPresets] = useState<Set<string>>(new Set());
  
  // ハイライトを一時的に表示する関数
  const highlightPreset = useCallback((presetId: string) => {
    setHighlightedPresets(prev => new Set([...Array.from(prev), presetId]));
    // 1.5秒後にハイライトを解除
    setTimeout(() => {
      setHighlightedPresets(prev => {
        const newSet = new Set(prev);
        newSet.delete(presetId);
        return newSet;
      });
    }, 1500);
  }, []);
  
  const {
    presets,
    categories,
    filteredPresets,
    setFilter,
    filter,
    addPreset,
    updatePreset,
    deletePreset,
    togglePreset,
    getPresetsForPage,
    updatePagePresetSettings,
    getPagePresetSettings,
    updatePresetDisplayOrder,
    saveSettings,
    resetToDefaults,
    discardChanges,
    isLoading,
    isDirty,
    // グローバル設定統合（新機能）
    globalSettings,
    refreshGlobalSettings,
    isUsingGlobalSettings
  } = usePresetSettings();

  // 設定インポート・エクスポート機能
  const {
    exportSettings,
    importSettings,
    validateImportFile,
    createBackup,
    loadBackup,
    deleteBackup,
    getBackupList,
    isExporting,
    isImporting,
    lastImportResult,
    lastValidationResult
  } = useSettingsImportExport();

  // 設定管理タブの状態
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeDisplay: true,
    includePresets: true,
    includeManagement: true,
    includeMetadata: true
  });
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    includeDisplay: true,
    includePresets: true,
    includeManagement: true,
    overwriteExisting: true,
    mergePresets: false
  });
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [backupName, setBackupName] = useState('');
  const [backupList, setBackupList] = useState<SettingsBackup[]>([]);

  // 管理者権限チェック
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SYSTEM_ADMIN';
  const canManage = isAdmin;

  // 表示順序の初期化（モーダル開始時のみ）
  useEffect(() => {
    if (!isOpen) return; // モーダルが開いていない時は何もしない
    
    const monthlySettings = getPagePresetSettings('monthlyPlanner');
    const personalSettings = getPagePresetSettings('personalPage');
    
    // 安全性チェック：設定が未定義の場合はデフォルト値を使用
    if (!monthlySettings) {
      console.warn('[UnifiedSettingsModal] 月次計画設定が未初期化');
      setMonthlyPlannerOrder([]);
      return;
    }
    
    if (!personalSettings) {
      console.warn('[UnifiedSettingsModal] 個人ページ設定が未初期化');
      setPersonalPageOrder([]);
      return;
    }
    
    // 現在の表示順序を取得、なければ有効なプリセットIDをそのまま使用
    const monthlyOrder = (monthlySettings as any)?.presetDisplayOrder || monthlySettings?.enabledPresetIds || [];
    const personalOrder = (personalSettings as any)?.presetDisplayOrder || personalSettings?.enabledPresetIds || [];
    
    // モーダルを開いた時に一度だけ初期化
    setMonthlyPlannerOrder(monthlyOrder);
    setPersonalPageOrder(personalOrder);
  }, [isOpen, getPagePresetSettings]); // 依存関係を追加

  // ドラッグ&ドロップ用の移動ハンドラー
  const handleMovePreset = useCallback((
    page: 'monthlyPlanner' | 'personalPage',
    dragIndex: number,
    hoverIndex: number
  ) => {
    const setOrder = page === 'monthlyPlanner' ? setMonthlyPlannerOrder : setPersonalPageOrder;
    const currentOrder = page === 'monthlyPlanner' ? monthlyPlannerOrder : personalPageOrder;
    
    const newOrder = [...currentOrder];
    const draggedItem = newOrder[dragIndex];
    
    if (!draggedItem) {
      return;
    }
    
    // 配列から要素を削除して新しい位置に挿入
    newOrder.splice(dragIndex, 1);
    newOrder.splice(hoverIndex, 0, draggedItem);
    
    // ローカル状態を即座に更新
    setOrder(newOrder);
    
    // 順序変更を保存
    updatePresetDisplayOrder(page, newOrder);
  }, [monthlyPlannerOrder, personalPageOrder, updatePresetDisplayOrder]);

  // タブリスト（指定順序での並び）
  const tabs = useMemo(() => [
    { id: 'display' as TabType, name: '表示設定', icon: '🎨' },
    { id: 'presets' as TabType, name: 'プリセット設定', icon: '⚡' },
    ...(canManage ? [
      { id: 'departments' as TabType, name: '部署・グループ設定', icon: '🏢' },
    ] : []),
    ...(canManage ? [
      { id: 'import' as TabType, name: 'インポート', icon: '📥' },
      { id: 'snapshots' as TabType, name: '過去表示設定', icon: '📜' },
    ] : []),
    { id: 'settings-management' as TabType, name: '設定管理', icon: '💾' }
  ], [canManage]);

  // 部署・グループ設定の変更検知用：初期データを保存
  const [originalDepartmentSettings, setOriginalDepartmentSettings] = useState<{ departments: any[], groups: any[] }>({ departments: [], groups: [] });

  // 部署・グループ設定の変更検知
  const isDepartmentSettingsDirty = useMemo(() => {
    if (originalDepartmentSettings.departments.length === 0 && originalDepartmentSettings.groups.length === 0) {
      return false; // 初期データが読み込まれていない場合は変更なしとみなす
    }
    
    // 部署設定の比較
    const departmentsChanged = departments.length !== originalDepartmentSettings.departments.length ||
      departments.some((dept, index) => {
        const original = originalDepartmentSettings.departments[index];
        return !original || 
          dept.backgroundColor !== original.backgroundColor ||
          dept.displayOrder !== original.displayOrder ||
          dept.shortName !== original.shortName;
      });
    
    // グループ設定の比較
    const groupsChanged = groups.length !== originalDepartmentSettings.groups.length ||
      groups.some((group, index) => {
        const original = originalDepartmentSettings.groups[index];
        return !original ||
          group.backgroundColor !== original.backgroundColor ||
          group.displayOrder !== original.displayOrder ||
          group.shortName !== original.shortName;
      });
    
    return departmentsChanged || groupsChanged;
  }, [departments, groups, originalDepartmentSettings]);

  // 部署・グループ設定保存
  const handleSaveDepartments = useCallback(async (silent = false) => {
    if (!canManage || !authenticatedFetch) return;
    
    setIsSavingDepartments(true);
    try {
      const currentApiUrl = getApiUrl();
      const allSettings = [...departments, ...groups];
      const response = await authenticatedFetch(`${currentApiUrl}/api/department-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allSettings.map(item => ({
          type: item.type,
          name: item.name,
          shortName: item.shortName,
          backgroundColor: item.backgroundColor,
          displayOrder: item.displayOrder || 0
        })))
      });
      
      if (response.ok) {
        if (!silent) {
          alert('設定を保存しました');
        }
        // 保存後に初期データを更新
        setOriginalDepartmentSettings({ departments: [...departments], groups: [...groups] });
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      if (!silent) {
        alert('保存に失敗しました');
      }
      throw error; // エラーを再スローして呼び出し元で処理
    } finally {
      setIsSavingDepartments(false);
    }
  }, [canManage, authenticatedFetch, departments, groups]);

  // 設定保存とモーダルクローズ
  const handleSaveAndClose = useCallback(async () => {
    console.log('[Debug] 保存して閉じる実行中...', {
      customStatusColors,
      customStatusDisplayNames,
      isDirty,
      isDepartmentSettingsDirty
    });
    
    try {
      // プリセット設定の保存
      if (isDirty) {
        await saveSettings();
      }
      
      // 部署・グループ設定の保存
      if (isDepartmentSettingsDirty && canManage) {
        console.log('[Debug] 部署・グループ設定を保存中...');
        await handleSaveDepartments(true); // silent=true でアラート表示を抑制
      }
    } catch (error) {
      console.error('設定保存エラー:', error);
      alert('設定の保存中にエラーが発生しました');
      return; // エラーが発生した場合はモーダルを閉じない
    }
    
    // 親コンポーネントに設定変更を通知（ページリロードの代わり）
    if (onSettingsChange) {
      onSettingsChange({
        displaySettings: {
          maskingEnabled,
          timeRange,
          customStatusColors,
          customStatusDisplayNames
        },
        presets: filteredPresets,
        departmentGroups: departments,
        // ステータス設定も個別に渡す（互換性のため）
        statusColors: customStatusColors,
        statusDisplayNames: customStatusDisplayNames
      });
    }
    
    // 設定保存後のコールバック実行（データ再読込など）
    if (onSave) {
      try {
        await onSave();
      } catch (error) {
        console.error('設定保存後のコールバック実行エラー:', error);
      }
    }
    
    onClose();
  }, [isDirty, saveSettings, canManage, onSettingsChange, maskingEnabled, timeRange, filteredPresets, departments, onSave, onClose]);

  // サーバーから設定を読み込み
  useEffect(() => {
    const loadGlobalDisplaySettings = async () => {
      try {
        const currentApiUrl = getApiUrl();
        const fetchFunction = authenticatedFetch || fetch;
        const response = await fetchFunction(`${currentApiUrl}/api/admin/global-display-settings`);
        
        if (response.ok) {
          const settings = await response.json();
          setMaskingEnabled(settings.maskingEnabled || false);
          setTimeRange(settings.timeRange || 'standard');
          setCustomStatusColors(settings.customStatusColors || {});
          setCustomStatusDisplayNames(settings.customStatusDisplayNames || {});
          setIsStatusColorsModified(Object.keys(settings.customStatusColors || {}).length > 0);
          setIsStatusDisplayNamesModified(Object.keys(settings.customStatusDisplayNames || {}).length > 0);
        } else {
          loadLocalStorageSettings();
        }
      } catch (error) {
        console.error('グローバル表示設定取得エラー、ローカル設定を使用:', error);
        loadLocalStorageSettings();
      }
    };

    const loadLocalStorageSettings = () => {
      const savedMaskingEnabled = localStorage.getItem('callstatus-maskingEnabled') === 'true';
      const savedTimeRange = localStorage.getItem('callstatus-timeRange') as 'standard' | 'extended' || 'standard';
      const savedStatusColors = localStorage.getItem('callstatus-statusColors');
      const savedStatusDisplayNames = localStorage.getItem('callstatus-statusDisplayNames');
      
      setMaskingEnabled(savedMaskingEnabled);
      setTimeRange(savedTimeRange);
      
      if (savedStatusColors) {
        try {
          const parsed = JSON.parse(savedStatusColors);
          setCustomStatusColors(parsed);
          setIsStatusColorsModified(Object.keys(parsed).length > 0);
        } catch (error) {
          console.error('Failed to parse saved status colors:', error);
          setCustomStatusColors({});
        }
      }
      
      if (savedStatusDisplayNames) {
        try {
          const parsed = JSON.parse(savedStatusDisplayNames);
          setCustomStatusDisplayNames(parsed);
          setIsStatusDisplayNamesModified(Object.keys(parsed).length > 0);
        } catch (error) {
          console.error('Failed to parse saved status display names:', error);
          setCustomStatusDisplayNames({});
        }
      }
    };

    loadGlobalDisplaySettings();
  }, [authenticatedFetch]);

  // サーバーに設定を保存する共通関数
  const saveSettingsToServer = useCallback(async (updates: Partial<{
    maskingEnabled: boolean;
    timeRange: string;
    customStatusColors: Record<string, string>;
    customStatusDisplayNames: Record<string, string>;
  }>) => {
    try {
      const currentApiUrl = getApiUrl();
      const fetchFunction = authenticatedFetch || fetch;
      const response = await fetchFunction(`${currentApiUrl}/api/admin/global-display-settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('グローバル表示設定更新エラー:', error);
      return false;
    }
  }, [authenticatedFetch]);

  // 設定変更時にサーバーに保存
  const handleMaskingToggle = useCallback(async () => {
    const newMaskingEnabled = !maskingEnabled;
    setMaskingEnabled(newMaskingEnabled);
    
    // サーバーに保存、失敗時はローカルストレージにフォールバック
    const success = await saveSettingsToServer({ maskingEnabled: newMaskingEnabled });
    if (!success) {
      localStorage.setItem('callstatus-maskingEnabled', newMaskingEnabled.toString());
    }
  }, [maskingEnabled, saveSettingsToServer]);

  // ステータス色変更ハンドラー
  const handleStatusColorChange = useCallback(async (status: string, color: string) => {
    console.log('[Debug] ステータス色変更:', { status, color, customStatusColors });
    const newColors = { ...customStatusColors, [status]: color };
    setCustomStatusColors(newColors);
    setIsStatusColorsModified(true);
    console.log('[Debug] isStatusColorsModified を true に設定しました');
    
    // サーバーに保存、失敗時はローカルストレージにフォールバック
    const success = await saveSettingsToServer({ customStatusColors: newColors });
    if (!success) {
      localStorage.setItem('callstatus-statusColors', JSON.stringify(newColors));
    }
    
    // 親コンポーネントに色変更を通知
    if (onSettingsChange) {
      onSettingsChange({
        statusColors: newColors
      });
    }
  }, [customStatusColors, onSettingsChange, saveSettingsToServer]);

  // ステータス色をデフォルトに戻す
  const handleResetStatusColors = useCallback(async () => {
    console.log('[Debug] ステータス色をリセット中...');
    setCustomStatusColors({});
    setIsStatusColorsModified(false);
    
    // サーバーに保存
    const success = await saveSettingsToServer({ customStatusColors: {} });
    
    // 成功・失敗に関わらず、ローカルストレージもクリア
    localStorage.removeItem('callstatus-statusColors');
    
    console.log('[Debug] ステータス色リセット完了:', { success });
    
    if (onSettingsChange) {
      onSettingsChange({
        statusColors: {}
      });
    }
  }, [onSettingsChange, saveSettingsToServer]);

  // 現在有効な色を取得する関数
  const getEffectiveStatusColor = useCallback((status: string) => {
    return customStatusColors[status] || STATUS_COLORS[status] || '#9ca3af';
  }, [customStatusColors]);

  // ステータス表示名変更ハンドラー
  const handleStatusDisplayNameChange = useCallback(async (status: string, displayName: string) => {
    const trimmedDisplayName = displayName.trim();
    
    // 空文字の場合は設定を削除（デフォルトに戻る）
    if (trimmedDisplayName === '') {
      const newDisplayNames = { ...customStatusDisplayNames };
      delete newDisplayNames[status];
      
      setCustomStatusDisplayNames(newDisplayNames);
      setIsStatusDisplayNamesModified(Object.keys(newDisplayNames).length > 0);
      
      // サーバーに保存、失敗時はローカルストレージにフォールバック
      const success = await saveSettingsToServer({ customStatusDisplayNames: newDisplayNames });
      if (!success) {
        if (Object.keys(newDisplayNames).length === 0) {
          localStorage.removeItem('callstatus-statusDisplayNames');
        } else {
          localStorage.setItem('callstatus-statusDisplayNames', JSON.stringify(newDisplayNames));
        }
      }
      
      // 親コンポーネントに表示名変更を通知
      if (onSettingsChange) {
        onSettingsChange({
          statusDisplayNames: newDisplayNames
        });
      }
      return;
    }
    
    // 文字数制限チェック（20文字）
    if (trimmedDisplayName.length > 20) {
      return;
    }
    
    // 重複チェック（他のステータスと同じ表示名は許可しない）
    const existingDisplayNames = Object.values(customStatusDisplayNames).filter(name => name && name !== customStatusDisplayNames[status]);
    const defaultDisplayNames = Object.values(STATUS_DISPLAY_NAMES).filter(name => name !== STATUS_DISPLAY_NAMES[status]);
    const allExistingNames = [...existingDisplayNames, ...defaultDisplayNames];
    
    if (allExistingNames.includes(trimmedDisplayName)) {
      return; // 重複する場合は更新しない
    }
    
    const newDisplayNames = { ...customStatusDisplayNames, [status]: trimmedDisplayName };
    setCustomStatusDisplayNames(newDisplayNames);
    setIsStatusDisplayNamesModified(true);
    
    // サーバーに保存、失敗時はローカルストレージにフォールバック
    const success = await saveSettingsToServer({ customStatusDisplayNames: newDisplayNames });
    if (!success) {
      localStorage.setItem('callstatus-statusDisplayNames', JSON.stringify(newDisplayNames));
    }
    
    // 親コンポーネントに表示名変更を通知
    if (onSettingsChange) {
      onSettingsChange({
        statusDisplayNames: newDisplayNames
      });
    }
  }, [customStatusDisplayNames, onSettingsChange, saveSettingsToServer]);

  // ステータス表示名をデフォルトに戻す
  const handleResetStatusDisplayNames = useCallback(async () => {
    console.log('[Debug] ステータス表示名をリセット中...');
    setCustomStatusDisplayNames({});
    setIsStatusDisplayNamesModified(false);
    
    // サーバーに保存
    const success = await saveSettingsToServer({ customStatusDisplayNames: {} });
    
    // 成功・失敗に関わらず、ローカルストレージもクリア
    localStorage.removeItem('callstatus-statusDisplayNames');
    
    console.log('[Debug] ステータス表示名リセット完了:', { success });
    
    if (onSettingsChange) {
      onSettingsChange({
        statusDisplayNames: {}
      });
    }
  }, [onSettingsChange, saveSettingsToServer]);

  // 現在有効な表示名を取得する関数
  const getEffectiveStatusDisplayName = useCallback((status: string) => {
    return customStatusDisplayNames[status] || STATUS_DISPLAY_NAMES[status] || status.charAt(0).toUpperCase() + status.slice(1);
  }, [customStatusDisplayNames]);

  // プリセット有効/無効切替
  const handleTogglePreset = useCallback((presetId: string) => {
    togglePreset(presetId);
  }, [togglePreset]);

  // プリセット編集モーダルの操作
  const handleCreatePreset = useCallback(() => {
    setEditingPreset(null);
    setEditMode('create');
    setIsPresetEditModalOpen(true);
  }, []);

  const handleEditPreset = useCallback((preset: UnifiedPreset) => {
    setEditingPreset(preset);
    setEditMode('edit');
    setIsPresetEditModalOpen(true);
  }, []);

  const handleDuplicatePreset = useCallback((preset: UnifiedPreset) => {
    setEditingPreset(preset);
    setEditMode('duplicate');
    setIsPresetEditModalOpen(true);
  }, []);

  const handleDeletePreset = useCallback((presetId: string) => {
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    if (preset.isDefault) {
      alert('デフォルトプリセットは削除できません');
      return;
    }

    if (confirm(`プリセット「${preset.displayName}」を削除しますか？`)) {
      deletePreset(presetId);
    }
  }, [presets, deletePreset]);

  const handleSavePreset = useCallback((presetData: PresetEditFormData) => {
    if (editMode === 'create' || editMode === 'duplicate') {
      addPreset({
        ...presetData,
        name: presetData.name || `custom-${Date.now()}`,
        isDefault: false // 新規作成・複製時は常にカスタムプリセット
      });
    } else if (editMode === 'edit' && editingPreset) {
      updatePreset(editingPreset.id, presetData);
    }
    setIsPresetEditModalOpen(false);
    setEditingPreset(null);
  }, [editMode, editingPreset, addPreset, updatePreset]);

  const handleClosePresetEditModal = useCallback(() => {
    setIsPresetEditModalOpen(false);
    setEditingPreset(null);
  }, []);

  // スナップショット履歴取得
  const fetchSnapshotHistory = useCallback(async () => {
    if (!canManage || !authenticatedFetch) return;
    
    setIsLoadingSnapshots(true);
    setSnapshotError(null);
    
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${currentApiUrl}/api/admin/snapshots/history`);
      
      if (!response.ok) {
        throw new Error(`スナップショット履歴取得に失敗: ${response.status}`);
      }
      
      const data = await response.json();
      setSnapshotHistory(data);
    } catch (error) {
      console.error('スナップショット履歴取得エラー:', error);
      setSnapshotError(error instanceof Error ? error.message : 'エラーが発生しました');
    } finally {
      setIsLoadingSnapshots(false);
    }
  }, [canManage, authenticatedFetch]);

  // 手動スナップショット作成
  const createManualSnapshot = async (targetDate: string) => {
    if (!canManage || !authenticatedFetch) return;
    
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${currentApiUrl}/api/admin/snapshots/manual/${targetDate}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`手動スナップショット作成に失敗: ${response.status}`);
      }
      
      const result = await response.json();
      alert(`手動スナップショット作成完了\n対象日: ${targetDate}\n件数: ${result.recordCount}件`);
      
      // 履歴を再取得
      await fetchSnapshotHistory();
    } catch (error) {
      console.error('手動スナップショット作成エラー:', error);
      alert('手動スナップショット作成に失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // スナップショットロールバック
  const rollbackSnapshot = async (batchId: string, targetDate: string) => {
    if (!canManage || !authenticatedFetch) return;
    
    if (!confirm(`${targetDate}のスナップショットデータを削除します。\nこの操作は取り消せません。実行しますか？`)) {
      return;
    }
    
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${currentApiUrl}/api/admin/snapshots/rollback/${batchId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error(`スナップショット削除に失敗: ${response.status}`);
      }
      
      const result = await response.json();
      alert(`スナップショット削除完了\n削除件数: ${result.deletedCount}件`);
      
      // 履歴を再取得
      await fetchSnapshotHistory();
    } catch (error) {
      console.error('スナップショット削除エラー:', error);
      alert('スナップショット削除に失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 部署・グループ設定取得
  const fetchDepartmentSettings = useCallback(async () => {
    if (!canManage || !authenticatedFetch) return;
    
    setIsLoadingDepartments(true);
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${currentApiUrl}/api/department-settings`);
      if (response.ok) {
        const data = await response.json();
        const fetchedDepartments = data.departments || [];
        const fetchedGroups = data.groups || [];
        
        setDepartments(fetchedDepartments);
        setGroups(fetchedGroups);
        
        // 初期データとして保存（変更検知用）
        setOriginalDepartmentSettings({ 
          departments: [...fetchedDepartments], 
          groups: [...fetchedGroups] 
        });
      }
    } catch (error) {
      console.error('Failed to fetch department settings:', error);
    } finally {
      setIsLoadingDepartments(false);
    }
  }, [canManage, authenticatedFetch]);

  // 部署・グループの自動取得
  const handleAutoGenerateDepartments = useCallback(async () => {
    if (!canManage || !authenticatedFetch) return;
    
    setIsLoadingDepartments(true);
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${currentApiUrl}/api/department-settings/auto-generate`);
      if (response.ok) {
        const result = await response.json();
        alert(`${result.generated}個の新しい設定が生成されました`);
        await fetchDepartmentSettings();
      }
    } catch (error) {
      console.error('Failed to auto-generate settings:', error);
      alert('部署・グループの取得に失敗しました');
    } finally {
      setIsLoadingDepartments(false);
    }
  }, [canManage, authenticatedFetch, fetchDepartmentSettings]);


  // 部署設定の更新関数
  const updateDepartmentShortName = useCallback((id: number, shortName: string) => {
    setDepartments(prev => prev.map(d => d.id === id ? { ...d, shortName } : d));
  }, []);

  const updateDepartmentBackgroundColor = useCallback((id: number, backgroundColor: string) => {
    setDepartments(prev => prev.map(d => d.id === id ? { ...d, backgroundColor } : d));
  }, []);

  const updateDepartmentDisplayOrder = useCallback((id: number, displayOrder: number) => {
    setDepartments(prev => prev.map(d => d.id === id ? { ...d, displayOrder } : d));
  }, []);

  // グループ設定の更新関数
  const updateGroupShortName = useCallback((id: number, shortName: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, shortName } : g));
  }, []);

  const updateGroupBackgroundColor = useCallback((id: number, backgroundColor: string) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, backgroundColor } : g));
  }, []);

  const updateGroupDisplayOrder = useCallback((id: number, displayOrder: number) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, displayOrder } : g));
  }, []);

  // ソート関数
  const sortDepartmentsByOrder = useCallback((departments: DepartmentGroupSetting[]) => {
    return departments.sort((a, b) => {
      const orderA = a.displayOrder || 0;
      const orderB = b.displayOrder || 0;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      
      return a.name.localeCompare(b.name);
    });
  }, []);

  const sortGroupsByDepartment = useCallback((groups: DepartmentGroupSetting[]) => {
    return groups.sort((a, b) => {
      const staffA = staffList?.find(staff => staff.group === a.name);
      const staffB = staffList?.find(staff => staff.group === b.name);
      
      const deptA = staffA?.department || '';
      const deptB = staffB?.department || '';
      
      const deptSettingA = departments.find(d => d.name === deptA);
      const deptSettingB = departments.find(d => d.name === deptB);
      
      const deptOrderA = deptSettingA?.displayOrder || 0;
      const deptOrderB = deptSettingB?.displayOrder || 0;
      
      if (deptOrderA !== deptOrderB) {
        return deptOrderA - deptOrderB;
      }
      
      if (deptA !== deptB) {
        return deptA.localeCompare(deptB);
      }
      
      const groupOrderA = a.displayOrder || 0;
      const groupOrderB = b.displayOrder || 0;
      
      if (groupOrderA !== groupOrderB) {
        return groupOrderA - groupOrderB;
      }
      
      return a.name.localeCompare(b.name);
    });
  }, [staffList, departments]);

  // 部署・グループ設定タブが開かれた時にデータを取得
  useEffect(() => {
    if (activeTab === 'departments' && canManage) {
      fetchDepartmentSettings();
    }
  }, [activeTab, canManage, fetchDepartmentSettings]);

  // スナップショットタブが開かれた時に履歴を取得
  useEffect(() => {
    if (activeTab === 'snapshots' && canManage) {
      fetchSnapshotHistory();
    }
  }, [activeTab, canManage, fetchSnapshotHistory]);

  // 設定管理タブが開かれた時にバックアップリストを更新
  useEffect(() => {
    if (activeTab === 'settings-management') {
      setBackupList(getBackupList());
      // エクスポート・インポートオプションをデフォルトに設定
    }
  }, [activeTab, getBackupList, isAdmin]);

  // 設定管理タブ用のイベントハンドラー
  const handleExport = useCallback(async () => {
    try {
      await exportSettings(exportOptions, authenticatedFetch);
    } catch (error) {
      console.error('エクスポートエラー:', error);
      alert(`エクスポートに失敗しました: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [exportSettings, exportOptions, authenticatedFetch]);

  const handleImport = useCallback(async () => {
    if (!selectedImportFile) {
      alert('インポートファイルを選択してください');
      return;
    }

    try {
      const result = await importSettings(selectedImportFile, importOptions, authenticatedFetch);
      if (result.success) {
        alert('設定のインポートが完了しました');
        setSelectedImportFile(null);
        
        // インポート成功後に部署・グループ設定を更新
        if (importOptions.includeManagement && canManage) {
          await fetchDepartmentSettings();
        }
        
        // 設定が変更されたので画面をリロード
        window.location.reload();
      } else {
        alert(`インポートに失敗しました: ${result.message}`);
      }
    } catch (error) {
      console.error('インポートエラー:', error);
      alert(`インポートに失敗しました: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [selectedImportFile, importSettings, importOptions, authenticatedFetch, canManage, fetchDepartmentSettings]);

  const handleCreateBackup = useCallback(async () => {
    if (!backupName.trim()) {
      alert('バックアップ名を入力してください');
      return;
    }

    try {
      await createBackup(backupName.trim(), false, authenticatedFetch);
      setBackupName('');
      setBackupList(getBackupList());
      alert('バックアップを作成しました');
    } catch (error) {
      console.error('バックアップ作成エラー:', error);
      alert(`バックアップの作成に失敗しました: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [backupName, createBackup, getBackupList, authenticatedFetch]);

  const handleLoadBackup = useCallback(async (backupId: string) => {
    if (!confirm('バックアップを読み込みますか？現在の設定は上書きされます。')) {
      return;
    }

    try {
      const result = await loadBackup(backupId);
      if (result.success) {
        alert('バックアップを読み込みました');
        // 設定が変更されたので画面をリロード
        window.location.reload();
      } else {
        alert(`バックアップの読み込みに失敗しました: ${result.message}`);
      }
    } catch (error) {
      console.error('バックアップ読み込みエラー:', error);
      alert(`バックアップの読み込みに失敗しました: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }, [loadBackup]);

  const handleDeleteBackup = useCallback((backupId: string) => {
    if (!confirm('バックアップを削除しますか？')) {
      return;
    }

    deleteBackup(backupId);
    setBackupList(getBackupList());
  }, [deleteBackup, getBackupList]);

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImportFile(file);
      // ファイル選択時に自動バリデーション
      await validateImportFile(file);
    }
  }, [validateImportFile]);

  // モーダルの外側クリックでクローズ
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      if (isDirty) {
        discardChanges();
      }
      onClose();
    }
  }, [isDirty, discardChanges, onClose]);

  // ESCキーでクローズ
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isDirty) {
          discardChanges();
        }
        onClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isDirty, discardChanges, onClose]);

  // モーダルが開かれていない場合は何も表示しない
  if (!isOpen) return null;

  const modalContent = (
    // <DndProvider backend={HTML5Backend}>
    <div>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={handleBackdropClick}>
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* ヘッダー */}
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">設定</h2>
          <button
            onClick={() => {
              if (isDirty) {
                discardChanges();
              }
              onClose();
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* タブナビゲーション */}
        <div className="flex border-b">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.name}
            </button>
          ))}
        </div>

        {/* タブコンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 表示設定タブ */}
          {activeTab === 'display' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">表示設定</h3>
                

                {/* マスキング設定 */}
                <div className="mb-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={maskingEnabled}
                      onChange={handleMaskingToggle}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      個人情報マスキングを有効にする
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    スタッフ名や個人的な情報を「***」で表示します
                  </p>
                </div>

                {/* ステータス設定 */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-medium text-gray-900">🎨 ステータス設定</h4>
                    <div className="flex space-x-2">
                      {(isStatusColorsModified || isStatusDisplayNamesModified) && (
                        <span className="text-xs text-orange-600 self-center">変更済み</span>
                      )}
                      <button
                        onClick={handleResetStatusDisplayNames}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                        disabled={!isStatusDisplayNamesModified}
                      >
                        表示名リセット
                      </button>
                      <button
                        onClick={() => {
                          console.log('[Debug] 色リセットボタンがクリックされました', { isStatusColorsModified, customStatusColors });
                          handleResetStatusColors();
                        }}
                        className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                        disabled={!isStatusColorsModified}
                      >
                        色リセット
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    各ステータスの表示色と表示名をカスタマイズできます。変更はすぐに反映されます。
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {ALL_STATUSES.map((status) => (
                      <div key={status} className="flex items-center space-x-2 py-2 px-3 bg-gray-50 rounded border border-gray-200">
                        {/* デフォルト色 */}
                        <div 
                          className="w-4 h-4 rounded border border-gray-300 flex-shrink-0" 
                          style={{ backgroundColor: STATUS_COLORS[status] || '#6b7280' }}
                          title="デフォルト色"
                        ></div>
                        
                        {/* 現在色（色変更パレット） */}
                        <input
                          type="color"
                          value={getEffectiveStatusColor(status)}
                          onChange={(e) => handleStatusColorChange(status, e.target.value)}
                          className="w-4 h-4 border border-gray-300 rounded cursor-pointer flex-shrink-0"
                          title={`${getEffectiveStatusDisplayName(status)}の色を変更`}
                        />
                        
                        {/* 色リセットアイコン */}
                        <div className="w-5 flex justify-center flex-shrink-0">
                          {customStatusColors[status] && (
                            <button
                              onClick={async () => {
                                console.log('[Debug] 個別色リセットボタンがクリックされました:', status);
                                const newColors = { ...customStatusColors };
                                delete newColors[status];
                                setCustomStatusColors(newColors);
                                setIsStatusColorsModified(Object.keys(newColors).length > 0);
                                
                                // サーバーに保存
                                const success = await saveSettingsToServer({ customStatusColors: newColors });
                                
                                // ローカルストレージにも保存（フォールバック）
                                if (Object.keys(newColors).length > 0) {
                                  localStorage.setItem('callstatus-statusColors', JSON.stringify(newColors));
                                } else {
                                  localStorage.removeItem('callstatus-statusColors');
                                }
                                
                                console.log('[Debug] 個別色リセット完了:', { status, success, newColors });
                                
                                // 親コンポーネントに変更を通知
                                if (onSettingsChange) {
                                  onSettingsChange({
                                    statusColors: newColors
                                  });
                                }
                              }}
                              className="text-xs text-gray-400 hover:text-red-600 transition-colors w-4 h-4 flex items-center justify-center"
                              title="色をデフォルトに戻す"
                            >
                              ↻
                            </button>
                          )}
                        </div>
                        
                        {/* 要素名 */}
                        <span className="text-xs font-medium text-gray-700 w-16 flex-shrink-0">{status}</span>
                        
                        {/* 表示フォーム */}
                        <input
                          type="text"
                          value={customStatusDisplayNames[status] || ''}
                          onChange={(e) => handleStatusDisplayNameChange(status, e.target.value)}
                          className="w-[150px] text-xs text-gray-900 border border-gray-200 outline-none bg-white hover:bg-gray-50 focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
                          placeholder={STATUS_DISPLAY_NAMES[status] || status.charAt(0).toUpperCase() + status.slice(1)}
                          maxLength={20}
                          title="カスタム表示名（空にするとデフォルトに戻ります）"
                        />
                        
                        {/* 表示名リセットアイコン */}
                        <div className="w-5 flex justify-center flex-shrink-0">
                          {customStatusDisplayNames[status] && (
                            <button
                              onClick={async () => {
                                console.log('[Debug] 個別表示名リセットボタンがクリックされました:', status);
                                const newDisplayNames = { ...customStatusDisplayNames };
                                delete newDisplayNames[status];
                                setCustomStatusDisplayNames(newDisplayNames);
                                setIsStatusDisplayNamesModified(Object.keys(newDisplayNames).length > 0);
                                
                                // サーバーに保存
                                const success = await saveSettingsToServer({ customStatusDisplayNames: newDisplayNames });
                                
                                // ローカルストレージにも保存（フォールバック）
                                if (Object.keys(newDisplayNames).length > 0) {
                                  localStorage.setItem('callstatus-statusDisplayNames', JSON.stringify(newDisplayNames));
                                } else {
                                  localStorage.removeItem('callstatus-statusDisplayNames');
                                }
                                
                                console.log('[Debug] 個別表示名リセット完了:', { status, success, newDisplayNames });
                                
                                // 親コンポーネントに変更を通知
                                if (onSettingsChange) {
                                  onSettingsChange({
                                    statusDisplayNames: newDisplayNames
                                  });
                                }
                              }}
                              className="text-xs text-gray-400 hover:text-red-600 transition-colors w-4 h-4 flex items-center justify-center"
                              title="表示名をデフォルトに戻す"
                            >
                              ↻
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                    💡 <strong>ヒント:</strong> 表示名は20文字まで。空にするとデフォルト表示に戻ります。色と表示名の変更は即座に保存され、全ページに反映されます。
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* プリセット設定タブ */}
          {activeTab === 'presets' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">プリセット設定</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={handleCreatePreset}
                    className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                  >
                    + 新規作成
                  </button>
                  <button
                    onClick={resetToDefaults}
                    className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    disabled={isLoading}
                  >
                    デフォルトに戻す
                  </button>
                  <button
                    onClick={saveSettings}
                    className={`px-3 py-1 text-sm rounded transition-colors ${
                      isDirty 
                        ? 'bg-blue-500 text-white hover:bg-blue-600' 
                        : 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    }`}
                    disabled={!isDirty || isLoading}
                  >
                    {isLoading ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>


              {/* カテゴリ別プリセット表示 */}
              {categories.map((category) => {
                const categoryPresets = filteredPresets.filter(p => p.category === category.id);
                if (categoryPresets.length === 0) return null;

                return (
                  <div key={category.id} className="border rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center">
                      <span className="mr-2">{category.icon}</span>
                      {category.displayName}
                      <span className="ml-2 text-xs text-gray-500">({categoryPresets.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categoryPresets.map((preset) => (
                        <div
                          key={preset.id}
                          className={`border rounded p-3 ${
                            preset.isActive ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h5 className="font-medium text-sm text-gray-900">{preset.displayName}</h5>
                                {preset.isDefault && (
                                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                    デフォルト
                                  </span>
                                )}
                              </div>
                              {preset.description && (
                                <p className="text-xs text-gray-600 mt-1">{preset.description}</p>
                              )}
                              <div className="text-xs text-gray-500 mt-2">
                                {preset.schedules.map((schedule, idx) => (
                                  <span key={idx} className="inline-block mr-2">
                                    {formatDecimalTime(schedule.startTime)}-{formatDecimalTime(schedule.endTime)} ({schedule.status})
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 ml-2">
                              {/* 操作ボタン */}
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => handleEditPreset(preset)}
                                  className="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded hover:bg-blue-50"
                                  title="編集"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDuplicatePreset(preset)}
                                  className="text-gray-600 hover:text-gray-800 text-xs px-2 py-1 rounded hover:bg-gray-50"
                                  title="複製"
                                >
                                  📋
                                </button>
                                {!preset.isDefault && (
                                  <button
                                    onClick={() => handleDeletePreset(preset.id)}
                                    className="text-red-600 hover:text-red-800 text-xs px-2 py-1 rounded hover:bg-red-50"
                                    title="削除"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                              {/* 有効/無効チェックボックス */}
                              <label className="flex items-center">
                                <input
                                  type="checkbox"
                                  checked={preset.isActive}
                                  onChange={() => handleTogglePreset(preset.id)}
                                  className="text-blue-600 rounded"
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* ページ別プリセット適用設定 */}
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">📱 ページ別プリセット適用設定</h4>
                <p className="text-sm text-gray-600 mb-3">
                  各ページで利用できるプリセットを個別に設定できます
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 月次計画設定 */}
                  <div className="bg-white p-3 rounded border">
                    <h5 className="font-medium text-gray-800 mb-2 flex items-center">
                      📅 月次計画
                      <span className="ml-2 text-xs text-gray-500">
                        ({getPresetsForPage('monthlyPlanner').length}個有効)
                      </span>
                    </h5>
                    <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                      <div className="mb-1 p-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                        💡 チェックで選択、▲▼ボタンで表示順序を変更できます
                      </div>
                      {(() => {
                        const currentSettings = getPagePresetSettings('monthlyPlanner');
                        const enabledPresets = presets.filter(p => p.isActive && currentSettings.enabledPresetIds.includes(p.id));
                        
                        // 表示順序に従ってソート
                        const sortedPresets = enabledPresets.sort((a, b) => {
                          const indexA = monthlyPlannerOrder.indexOf(a.id);
                          const indexB = monthlyPlannerOrder.indexOf(b.id);
                          if (indexA === -1 && indexB === -1) return 0;
                          if (indexA === -1) return 1;
                          if (indexB === -1) return -1;
                          return indexA - indexB;
                        });
                        
                        return [
                          // 有効なプリセット（順序付き）
                          ...sortedPresets.map((preset, actualIndex) => {
                            const isDefault = currentSettings.defaultPresetId === preset.id;
                            
                            return (
                              <SimplePresetItem
                                key={preset.id}
                                preset={preset}
                                index={actualIndex}
                                isEnabled={true}
                                isDefault={isDefault}
                                page="monthlyPlanner"
                                totalCount={sortedPresets.length}
                                isHighlighted={highlightedPresets.has(preset.id)}
                                onToggle={(checked) => {
                                  const newEnabledIds = checked
                                    ? [...currentSettings.enabledPresetIds, preset.id]
                                    : currentSettings.enabledPresetIds.filter(id => id !== preset.id);
                                  
                                  if (!checked) {
                                    setMonthlyPlannerOrder(monthlyPlannerOrder.filter(id => id !== preset.id));
                                  }
                                  
                                  updatePagePresetSettings(
                                    'monthlyPlanner', 
                                    newEnabledIds,
                                    newEnabledIds.includes(currentSettings.defaultPresetId || '') 
                                      ? currentSettings.defaultPresetId 
                                      : newEnabledIds[0]
                                  );
                                }}
                                onSetDefault={() => {
                                  updatePagePresetSettings(
                                    'monthlyPlanner',
                                    currentSettings.enabledPresetIds,
                                    preset.id
                                  );
                                }}
                                onMove={(dragIndex, hoverIndex) => 
                                  handleMovePreset('monthlyPlanner', dragIndex, hoverIndex)
                                }
                                onMoveUp={() => {
                                  if (actualIndex > 0) {
                                    const newOrder = [...monthlyPlannerOrder];
                                    const currentId = preset.id;
                                    const currentIdx = newOrder.indexOf(currentId);
                                    if (currentIdx > 0) {
                                      // 現在の要素と一つ前の要素を入れ替え
                                      [newOrder[currentIdx], newOrder[currentIdx - 1]] = [newOrder[currentIdx - 1], newOrder[currentIdx]];
                                      setMonthlyPlannerOrder(newOrder);
                                      updatePresetDisplayOrder('monthlyPlanner', newOrder);
                                      // 移動したプリセットをハイライト
                                      highlightPreset(preset.id);
                                    }
                                  }
                                }}
                                onMoveDown={() => {
                                  if (actualIndex < sortedPresets.length - 1) {
                                    const newOrder = [...monthlyPlannerOrder];
                                    const currentId = preset.id;
                                    const currentIdx = newOrder.indexOf(currentId);
                                    if (currentIdx < newOrder.length - 1) {
                                      // 現在の要素と一つ後の要素を入れ替え
                                      [newOrder[currentIdx], newOrder[currentIdx + 1]] = [newOrder[currentIdx + 1], newOrder[currentIdx]];
                                      setMonthlyPlannerOrder(newOrder);
                                      updatePresetDisplayOrder('monthlyPlanner', newOrder);
                                      // 移動したプリセットをハイライト
                                      highlightPreset(preset.id);
                                    }
                                  }
                                }}
                              />
                            );
                          }),
                          // 無効なプリセット
                          ...presets.filter(p => p.isActive && !currentSettings.enabledPresetIds.includes(p.id)).map((preset) => {
                            return (
                              <SimplePresetItem
                                key={preset.id}
                                preset={preset}
                                index={-1}
                                isEnabled={false}
                                isDefault={false}
                                page="monthlyPlanner"
                                totalCount={0}
                                onToggle={(checked) => {
                                  if (checked) {
                                    const newEnabledIds = [...currentSettings.enabledPresetIds, preset.id];
                                    setMonthlyPlannerOrder([...monthlyPlannerOrder, preset.id]);
                                    updatePagePresetSettings(
                                      'monthlyPlanner', 
                                      newEnabledIds,
                                      currentSettings.defaultPresetId || newEnabledIds[0]
                                    );
                                  }
                                }}
                                onSetDefault={() => {}}
                                onMove={() => {}}
                                onMoveUp={() => {}}
                                onMoveDown={() => {}}
                              />
                            );
                          })
                        ];
                      })()}
                    </div>
                  </div>

                  {/* 個人ページ設定 */}
                  <div className="bg-white p-3 rounded border">
                    <h5 className="font-medium text-gray-800 mb-2 flex items-center">
                      👤 個人ページ
                      <span className="ml-2 text-xs text-gray-500">
                        ({getPresetsForPage('personalPage').length}個有効)
                      </span>
                    </h5>
                    <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                      <div className="mb-1 p-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                        💡 チェックで選択、▲▼ボタンで表示順序を変更できます
                      </div>
                      {(() => {
                        const currentSettings = getPagePresetSettings('personalPage');
                        const enabledPresets = presets.filter(p => p.isActive && currentSettings.enabledPresetIds.includes(p.id));
                        
                        // 表示順序に従ってソート
                        const sortedPresets = enabledPresets.sort((a, b) => {
                          const indexA = personalPageOrder.indexOf(a.id);
                          const indexB = personalPageOrder.indexOf(b.id);
                          if (indexA === -1 && indexB === -1) return 0;
                          if (indexA === -1) return 1;
                          if (indexB === -1) return -1;
                          return indexA - indexB;
                        });
                        
                        return [
                          // 有効なプリセット（順序付き）
                          ...sortedPresets.map((preset, actualIndex) => {
                            const isDefault = currentSettings.defaultPresetId === preset.id;
                            
                            return (
                              <SimplePresetItem
                                key={preset.id}
                                preset={preset}
                                index={actualIndex}
                                isEnabled={true}
                                isDefault={isDefault}
                                page="personalPage"
                                totalCount={sortedPresets.length}
                                isHighlighted={highlightedPresets.has(preset.id)}
                                onToggle={(checked) => {
                                  const newEnabledIds = checked
                                    ? [...currentSettings.enabledPresetIds, preset.id]
                                    : currentSettings.enabledPresetIds.filter(id => id !== preset.id);
                                  
                                  if (!checked) {
                                    setPersonalPageOrder(personalPageOrder.filter(id => id !== preset.id));
                                  }
                                  
                                  updatePagePresetSettings(
                                    'personalPage', 
                                    newEnabledIds,
                                    newEnabledIds.includes(currentSettings.defaultPresetId || '') 
                                      ? currentSettings.defaultPresetId 
                                      : newEnabledIds[0]
                                  );
                                }}
                                onSetDefault={() => {
                                  updatePagePresetSettings(
                                    'personalPage',
                                    currentSettings.enabledPresetIds,
                                    preset.id
                                  );
                                }}
                                onMove={(dragIndex, hoverIndex) => 
                                  handleMovePreset('personalPage', dragIndex, hoverIndex)
                                }
                                onMoveUp={() => {
                                  if (actualIndex > 0) {
                                    const newOrder = [...personalPageOrder];
                                    const currentId = preset.id;
                                    const currentIdx = newOrder.indexOf(currentId);
                                    if (currentIdx > 0) {
                                      // 現在の要素と一つ前の要素を入れ替え
                                      [newOrder[currentIdx], newOrder[currentIdx - 1]] = [newOrder[currentIdx - 1], newOrder[currentIdx]];
                                      setPersonalPageOrder(newOrder);
                                      updatePresetDisplayOrder('personalPage', newOrder);
                                      // 移動したプリセットをハイライト
                                      highlightPreset(preset.id);
                                    }
                                  }
                                }}
                                onMoveDown={() => {
                                  if (actualIndex < sortedPresets.length - 1) {
                                    const newOrder = [...personalPageOrder];
                                    const currentId = preset.id;
                                    const currentIdx = newOrder.indexOf(currentId);
                                    if (currentIdx < newOrder.length - 1) {
                                      // 現在の要素と一つ後の要素を入れ替え
                                      [newOrder[currentIdx], newOrder[currentIdx + 1]] = [newOrder[currentIdx + 1], newOrder[currentIdx]];
                                      setPersonalPageOrder(newOrder);
                                      updatePresetDisplayOrder('personalPage', newOrder);
                                      // 移動したプリセットをハイライト
                                      highlightPreset(preset.id);
                                    }
                                  }
                                }}
                              />
                            );
                          }),
                          // 無効なプリセット
                          ...presets.filter(p => p.isActive && !currentSettings.enabledPresetIds.includes(p.id)).map((preset) => {
                            return (
                              <SimplePresetItem
                                key={preset.id}
                                preset={preset}
                                index={-1}
                                isEnabled={false}
                                isDefault={false}
                                page="personalPage"
                                totalCount={0}
                                onToggle={(checked) => {
                                  if (checked) {
                                    const newEnabledIds = [...currentSettings.enabledPresetIds, preset.id];
                                    setPersonalPageOrder([...personalPageOrder, preset.id]);
                                    updatePagePresetSettings(
                                      'personalPage', 
                                      newEnabledIds,
                                      currentSettings.defaultPresetId || newEnabledIds[0]
                                    );
                                  }
                                }}
                                onSetDefault={() => {}}
                                onMove={() => {}}
                                onMoveUp={() => {}}
                                onMoveDown={() => {}}
                              />
                            );
                          })
                        ];
                      })()}
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm text-blue-700">
                    💡 <strong>設定のポイント:</strong>
                  </p>
                  <ul className="text-xs text-blue-600 mt-1 ml-4 list-disc">
                    <li>月次計画: 管理者向けの勤務パターン（標準勤務、休暇系）</li>
                    <li>個人ページ: 個人利用向けのパターン（在宅、会議、研修含む）</li>
                    <li>各ページで異なるプリセットを有効化できます</li>
                    <li>▲▼ボタンで表示順序を変更できます</li>
                    <li>デフォルトプリセットは新規作成時に自動選択されます</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 設定管理タブ */}
          {activeTab === 'settings-management' && (
            <div className="space-y-6">
              {/* 組織共通設定状態（設定管理タブに移動） */}
              {globalSettings.isAvailable && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-blue-700">
                        📋 組織共通プリセット設定
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        最終同期: {globalSettings.lastSyncTime}
                      </p>
                    </div>
                    <button
                      onClick={refreshGlobalSettings}
                      disabled={globalSettings.isLoading}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      {globalSettings.isLoading ? '同期中...' : '🔄 再同期'}
                    </button>
                  </div>
                </div>
              )}
              
              {!globalSettings.isAvailable && (
                <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-sm text-orange-700">
                    ⚠️ 組織設定に接続できません。ローカル設定で動作中
                  </p>
                </div>
              )}

              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">💾 設定管理</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setExportOptions({
                          includeDisplay: true,
                          includePresets: true,
                          includeManagement: isAdmin,
                          includeMetadata: true
                        });
                        handleExport();
                      }}
                      className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                      disabled={isExporting}
                    >
                      🚀 全設定エクスポート
                    </button>
                    <button
                      onClick={() => {
                        const name = `自動バックアップ_${new Date().toLocaleDateString().replace(/\//g, '-')}`;
                        createBackup(name, true, authenticatedFetch);
                      }}
                      className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                    >
                      ⚡ クイックバックアップ
                    </button>
                  </div>
                </div>
                
                {/* エクスポート機能 */}
                <div className="border rounded-lg p-4 mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">設定のエクスポート</h4>
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={exportOptions.includeDisplay}
                          onChange={(e) => setExportOptions(prev => ({ ...prev, includeDisplay: e.target.checked }))}
                          className="mr-2"
                        />
                        表示設定
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={exportOptions.includePresets}
                          onChange={(e) => setExportOptions(prev => ({ ...prev, includePresets: e.target.checked }))}
                          className="mr-2"
                        />
                        プリセット設定
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={exportOptions.includeManagement}
                          onChange={(e) => setExportOptions(prev => ({ ...prev, includeManagement: e.target.checked }))}
                          className="mr-2"
                        />
                        部署・グループ設定
                      </label>
                    </div>
                    <button
                      onClick={handleExport}
                      disabled={isExporting || (!exportOptions.includeDisplay && !exportOptions.includePresets && !exportOptions.includeManagement)}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {isExporting ? 'エクスポート中...' : '📤 設定をエクスポート'}
                    </button>
                  </div>
                </div>

                {/* インポート機能 */}
                <div className="border rounded-lg p-4 mb-6">
                  <h4 className="font-medium text-gray-900 mb-3">設定のインポート</h4>
                  <div className="space-y-3">
                    <div>
                      <input
                        type="file"
                        accept=".json"
                        onChange={handleFileSelect}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {selectedImportFile && (
                        <div className="text-sm text-gray-600 mt-1">
                          <p>選択されたファイル: {selectedImportFile.name}</p>
                          <p>ファイルサイズ: {SettingsValidator.formatFileSize(selectedImportFile.size)}</p>
                          {lastValidationResult?.parsedSettings && (
                            <div className="mt-1">
                              {(() => {
                                const stats = SettingsValidator.getSettingsStatistics(lastValidationResult.parsedSettings);
                                return (
                                  <p className="text-xs">
                                    プリセット: {stats.presetsCount}件, 
                                    部署: {stats.departmentsCount}件, 
                                    グループ: {stats.groupsCount}件, 
                                    カスタム色: {stats.customColorsCount}件, 
                                    カスタム表示名: {stats.customDisplayNamesCount}件
                                  </p>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {lastValidationResult && (
                      <div className={`p-3 rounded ${lastValidationResult.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        {lastValidationResult.isValid ? (
                          <p className="text-sm text-green-700">✅ ファイルは有効です</p>
                        ) : (
                          <div>
                            <p className="text-sm text-red-700 font-medium">❌ エラーが見つかりました:</p>
                            <ul className="text-sm text-red-600 mt-1 ml-4 list-disc">
                              {lastValidationResult.errors.map((error, index) => (
                                <li key={index}>{error}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {lastValidationResult.warnings.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm text-yellow-700 font-medium">⚠️ 警告:</p>
                            <ul className="text-sm text-yellow-600 mt-1 ml-4 list-disc">
                              {lastValidationResult.warnings.map((warning, index) => (
                                <li key={index}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={importOptions.includeDisplay}
                          onChange={(e) => setImportOptions(prev => ({ ...prev, includeDisplay: e.target.checked }))}
                          className="mr-2"
                        />
                        表示設定
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={importOptions.includePresets}
                          onChange={(e) => setImportOptions(prev => ({ ...prev, includePresets: e.target.checked }))}
                          className="mr-2"
                        />
                        プリセット設定
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={importOptions.includeManagement}
                          onChange={(e) => setImportOptions(prev => ({ ...prev, includeManagement: e.target.checked }))}
                          className="mr-2"
                        />
                        部署・グループ設定
                      </label>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={importOptions.mergePresets}
                          onChange={(e) => setImportOptions(prev => ({ ...prev, mergePresets: e.target.checked }))}
                          className="mr-2"
                        />
                        プリセットをマージ（チェックなしで完全置換）
                      </label>
                    </div>

                    <button
                      onClick={handleImport}
                      disabled={isImporting || !selectedImportFile || !lastValidationResult?.isValid}
                      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      {isImporting ? 'インポート中...' : '📥 設定をインポート'}
                    </button>
                  </div>
                </div>

                {/* バックアップ機能 */}
                <div className="border rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3">設定バックアップ</h4>
                  
                  {/* バックアップ作成 */}
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={backupName}
                      onChange={(e) => setBackupName(e.target.value)}
                      placeholder="バックアップ名を入力"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleCreateBackup}
                      disabled={!backupName.trim()}
                      className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      💾 バックアップ作成
                    </button>
                  </div>

                  {/* バックアップリスト */}
                  <div className="space-y-2">
                    <h5 className="text-sm font-medium text-gray-700">保存されたバックアップ</h5>
                    {backupList.length === 0 ? (
                      <p className="text-sm text-gray-500">バックアップがありません</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto">
                        {backupList.map((backup) => (
                          <div key={backup.id} className="flex items-center justify-between p-2 border rounded bg-gray-50">
                            <div className="flex-1">
                              <p className="text-sm font-medium">{backup.name}</p>
                              <p className="text-xs text-gray-500">
                                {new Date(backup.createdAt).toLocaleDateString()} {new Date(backup.createdAt).toLocaleTimeString()}
                                {backup.isAutoBackup && ' (自動)'}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleLoadBackup(backup.id)}
                                className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                              >
                                読み込み
                              </button>
                              <button
                                onClick={() => handleDeleteBackup(backup.id)}
                                className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* インポート結果表示 */}
                {lastImportResult && (
                  <div className={`border rounded-lg p-4 ${lastImportResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <h4 className="font-medium text-gray-900 mb-2">
                      {lastImportResult.success ? '✅ インポート完了' : '❌ インポート失敗'}
                    </h4>
                    <p className="text-sm text-gray-700 mb-2">{lastImportResult.message}</p>
                    {lastImportResult.details && (
                      <div className="text-sm text-gray-600">
                        <p>表示設定: {lastImportResult.details.displaySettingsImported ? '✅' : '❌'}</p>
                        <p>プリセット: {lastImportResult.details.presetsImported}件インポート</p>
                        <p>管理設定: {lastImportResult.details.managementSettingsImported ? '✅' : '❌'}</p>
                        {lastImportResult.details.errors.length > 0 && (
                          <div className="mt-2">
                            <p className="font-medium">エラー:</p>
                            <ul className="ml-4 list-disc">
                              {lastImportResult.details.errors.map((error, index) => (
                                <li key={index}>{error}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* インポート機能タブ（管理者のみ） */}
          {activeTab === 'import' && canManage && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">📋 データインポート</h3>
                
                {/* 社員情報インポート */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-green-900">👥 社員情報インポート</h4>
                      <p className="text-sm text-green-700 mt-1">
                        JSONファイルから社員マスタを一括インポート
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        if (setIsJsonUploadModalOpen) {
                          setIsJsonUploadModalOpen(true);
                          onClose();
                        }
                      }} 
                      className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800"
                    >
                      インポート実行
                    </button>
                  </div>
                </div>

                {/* スケジュールインポート */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-blue-900">📅 スケジュールインポート</h4>
                      <p className="text-sm text-blue-700 mt-1">
                        CSVファイルから月次スケジュールを一括インポート
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        if (setIsCsvUploadModalOpen) {
                          setIsCsvUploadModalOpen(true);
                          onClose();
                        }
                      }} 
                      className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800"
                    >
                      インポート実行
                    </button>
                  </div>
                </div>

                {/* スケジュールインポート履歴 */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">📊 スケジュールインポート履歴</h4>
                      <p className="text-sm text-gray-700 mt-1">
                        過去のスケジュールインポート実績とロールバック操作
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        if (setIsImportHistoryModalOpen) {
                          setIsImportHistoryModalOpen(true);
                          onClose();
                        }
                      }} 
                      className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800"
                    >
                      履歴確認
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 部署・グループ設定タブ（管理者のみ） */}
          {activeTab === 'departments' && canManage && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">🏢 部署・グループ設定</h3>
                <div className="space-x-2">
                  <button
                    onClick={handleAutoGenerateDepartments}
                    disabled={isLoadingDepartments}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    🔄 部署・グループの取得
                  </button>
                  <button
                    onClick={() => handleSaveDepartments()}
                    disabled={isSavingDepartments}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    💾 保存
                  </button>
                </div>
              </div>

              {isLoadingDepartments ? (
                <div className="text-center py-8">読み込み中...</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 部署設定 */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">部署設定 ({departments.length})</h4>
                    <div className="border border-gray-200 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">部署名</th>
                            <th className="px-3 py-2 text-left">短縮名</th>
                            <th className="px-3 py-2 text-left">背景色</th>
                            <th className="px-3 py-2 text-left">表示順</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortDepartmentsByOrder([...departments]).map((dept) => (
                            <tr key={dept.id} className="border-t border-gray-200">
                              <td className="px-3 py-2 text-xs">{dept.name}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={dept.shortName || ''}
                                  onChange={(e) => updateDepartmentShortName(dept.id, e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                  maxLength={8}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="color"
                                  value={dept.backgroundColor || '#ffffff'}
                                  onChange={(e) => updateDepartmentBackgroundColor(dept.id, e.target.value)}
                                  className="w-8 h-6 border border-gray-300 rounded"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  value={dept.displayOrder || 0}
                                  onChange={(e) => updateDepartmentDisplayOrder(dept.id, parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
                                  min="0"
                                  step="10"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* グループ設定 */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">グループ設定 ({groups.length})</h4>
                    <div className="border border-gray-200 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">グループ名</th>
                            <th className="px-3 py-2 text-left">短縮名</th>
                            <th className="px-3 py-2 text-left">背景色</th>
                            <th className="px-3 py-2 text-left">表示順</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortGroupsByDepartment([...groups]).map((group) => (
                            <tr key={group.id} className="border-t border-gray-200">
                              <td className="px-3 py-2 text-xs" style={getDepartmentGroupStyle(departments.find(d => d.name === (staffList?.find(staff => staff.group === group.name)?.department))?.backgroundColor || '#f9fafb')}>
                                {group.name}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                <input
                                  type="text"
                                  value={group.shortName || ''}
                                  onChange={(e) => updateGroupShortName(group.id, e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                  maxLength={8}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="color"
                                  value={group.backgroundColor || '#ffffff'}
                                  onChange={(e) => updateGroupBackgroundColor(group.id, e.target.value)}
                                  className="w-8 h-6 border border-gray-300 rounded"
                                />
                              </td>
                              <td className="px-3 py-2 text-xs">
                                <input
                                  type="number"
                                  value={group.displayOrder || 0}
                                  onChange={(e) => updateGroupDisplayOrder(group.id, parseInt(e.target.value) || 0)}
                                  className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
                                  min="0"
                                  step="10"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* スナップショット管理タブ（管理者のみ） */}
          {activeTab === 'snapshots' && canManage && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">📜 過去表示設定・スナップショット管理</h3>
                <button 
                  onClick={fetchSnapshotHistory}
                  disabled={isLoadingSnapshots}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  {isLoadingSnapshots ? '更新中...' : '🔄 履歴更新'}
                </button>
              </div>
              
              {/* スナップショット管理説明 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-900 mb-2">📋 スナップショット機能について</h4>
                <div className="text-sm text-blue-700 space-y-1">
                  <p>• 毎日深夜0:05に前日分のスナップショットが自動作成されます</p>
                  <p>• 過去データ閲覧時は、スナップショット作成済みの日付のみ表示可能です</p>
                  <p>• 手動でスナップショットを作成することも可能です</p>
                  <p>• 不要なスナップショットデータは削除できます（復旧不可）</p>
                </div>
              </div>

              {/* 手動スナップショット作成 */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-3">🔧 手動スナップショット作成</h4>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    指定した日付のスナップショットを手動で作成できます。既存のスナップショットがある場合は上書きされます。
                  </p>
                  <div className="flex gap-2">
                    <input 
                      type="date" 
                      id="manualSnapshotDate"
                      className="border border-gray-300 rounded px-3 py-2 text-sm"
                      max={new Date().toISOString().split('T')[0]}
                    />
                    <button 
                      onClick={() => {
                        const dateInput = document.getElementById('manualSnapshotDate') as HTMLInputElement;
                        if (dateInput.value) {
                          createManualSnapshot(dateInput.value);
                        } else {
                          alert('日付を選択してください');
                        }
                      }}
                      className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                    >
                      📸 スナップショット作成
                    </button>
                  </div>
                </div>
              </div>

              {/* エラー表示 */}
              {snapshotError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <span className="text-red-600">❌</span>
                    </div>
                    <div className="ml-3">
                      <h4 className="text-sm font-medium text-red-800">エラーが発生しました</h4>
                      <p className="mt-1 text-sm text-red-700">{snapshotError}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* スナップショット履歴一覧 */}
              <div className="border border-gray-200 rounded-lg">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                  <h4 className="font-medium text-gray-900">📊 スナップショット実行履歴（過去30日）</h4>
                </div>
                
                <div className="overflow-x-auto">
                  {isLoadingSnapshots ? (
                    <div className="p-8 text-center text-gray-500">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-2"></div>
                      スナップショット履歴を読み込み中...
                    </div>
                  ) : snapshotHistory.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      📝 スナップショット履歴がありません
                    </div>
                  ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">対象日</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ステータス</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">件数</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">作成日時</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">完了日時</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {snapshotHistory.map((snapshot) => (
                          <tr key={snapshot.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {snapshot.targetDate}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                snapshot.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                                snapshot.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {snapshot.status === 'COMPLETED' ? '✅ 完了' :
                                 snapshot.status === 'FAILED' ? '❌ 失敗' : '⏳ 処理中'}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                              {snapshot.recordCount.toLocaleString()}件
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                              {new Date(snapshot.startedAt).toLocaleString('ja-JP')}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                              {snapshot.completedAt ? new Date(snapshot.completedAt).toLocaleString('ja-JP') : '-'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                              {snapshot.status === 'COMPLETED' && (
                                <button
                                  onClick={() => rollbackSnapshot(snapshot.batchId, snapshot.targetDate)}
                                  className="text-red-600 hover:text-red-900 text-sm font-medium"
                                >
                                  🗑️ 削除
                                </button>
                              )}
                              {snapshot.status === 'FAILED' && snapshot.errorMessage && (
                                <span className="text-red-600 text-xs" title={snapshot.errorMessage}>
                                  ⚠️ エラー詳細
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex justify-between items-center p-6 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            {(isDirty || isDepartmentSettingsDirty) && (
              <span className="text-orange-600">
                ⚠️ 未保存の変更があります
                {isDirty && isDepartmentSettingsDirty && ' (プリセット・部署設定)'}
                {isDirty && !isDepartmentSettingsDirty && ' (プリセット設定)'}
                {!isDirty && isDepartmentSettingsDirty && ' (部署・グループ設定)'}
              </span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => {
                if (isDirty) {
                  discardChanges();
                }
                onClose();
              }}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              onClick={handleSaveAndClose}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                (isDirty || isDepartmentSettingsDirty) 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
              disabled={isLoading || isSavingDepartments}
            >
              {(isLoading || isSavingDepartments) ? '保存中...' : '💾 保存して閉じる'}
            </button>
          </div>
        </div>
        
        {/* プリセット編集モーダル */}
        <PresetEditModal
          isOpen={isPresetEditModalOpen}
          onClose={handleClosePresetEditModal}
          onSave={handleSavePreset}
          preset={editingPreset}
          mode={editMode}
        />
        </div>
      </div>
    </div>
    // </DndProvider>
  );

  // ポータルを使用してモーダルをbody直下に描画
  return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null;
}