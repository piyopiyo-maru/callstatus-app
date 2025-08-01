'use client';

import { useState, useEffect, useMemo, useCallback, Fragment, useRef, forwardRef } from 'react';

// デバッグログ制御（デフォルトOFF）
const isDebugEnabled = () => typeof window !== 'undefined' && 
  process.env.NODE_ENV === 'development' && 
  window.localStorage?.getItem('app-debug') === 'true';
import { useAuth, UserRole } from './AuthProvider';
import { useGlobalDisplaySettings } from '../hooks/useGlobalDisplaySettings';
import { initializeCacheFromLocalStorage } from '../utils/globalDisplaySettingsCache';
import { createPortal } from 'react-dom';
import { io, Socket } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
// ★★★ カレンダーライブラリをインポート ★★★
import DatePicker, { registerLocale } from 'react-datepicker';
import { ja } from 'date-fns/locale/ja';
import { format } from 'date-fns';
import "react-datepicker/dist/react-datepicker.css";
// ★★★ タイムライン共通ユーティリティをインポート ★★★
import { 
  timeToPositionPercent, 
  positionPercentToTime, 
  capitalizeStatus,
  getEffectiveStatusColor,
  getEffectiveDisplayName,
  getDepartmentGroupStyle,
  LIGHT_ANIMATIONS,
  BRAND_COLORS,
  BUTTON_STYLES,
  FEEDBACK_COLORS
} from './timeline/TimelineUtils';
// ★★★ 分離されたモジュールのインポート ★★★
import { 
  Holiday, Staff, GeneralResponsibilityData, ReceptionResponsibilityData, 
  ResponsibilityData, ScheduleFromDB, Schedule, DragInfo, 
  ImportHistory, SnapshotHistory 
} from './types/MainAppTypes';
import { 
  statusColors, departmentColors, teamColors, 
  getApiUrl 
} from './constants/MainAppConstants';
import { AVAILABLE_STATUSES, ALL_STATUSES } from './timeline/TimelineUtils';
import { 
  fetchHolidays, getHoliday, getDateColor, 
  formatDateWithHoliday, checkSupportedCharacters, 
  timeStringToHours 
} from './utils/MainAppUtils';
import { useMainAppDate } from '../../utils/datePersistence';
import { ConfirmationModal } from './modals/ConfirmationModal';
import { ScheduleModal } from './modals/ScheduleModal';
import { AssignmentModal } from './modals/AssignmentModal';
import { JsonUploadModal } from './modals/JsonUploadModal';
import { CsvUploadModal } from './modals/CsvUploadModal';
import { UnifiedSettingsModal } from './modals/UnifiedSettingsModal';
import { RealSystemMonitoringModal } from './modals/RealSystemMonitoringModal';
// 統一担当設定コンポーネントとフック（バッジ・判定のみ）
import { ResponsibilityBadges, isReceptionStaff } from './responsibility';
// 出社状況ページ専用モーダル（業務要件に最適化）
import { ResponsibilityModal } from './modals/ResponsibilityModal';
import { useResponsibilityData } from '../hooks/useResponsibilityData';
import { hasResponsibilityData } from '../utils/responsibilityUtils';
import type { 
  ResponsibilityData as UnifiedResponsibilityData
} from '../types/responsibility';

// ★★★ カレンダーの表示言語を日本語に設定 ★★★
registerLocale('ja', ja);


// Global type extension (still needed in this file)
declare global {
  interface Window {
    APP_CONFIG?: {
      API_HOST: string;
    };
  }
}

// Moved constants to MainAppConstants.ts

// fetchHolidays moved to MainAppUtils.ts

// isWeekend moved to MainAppUtils.ts

// getHoliday moved to MainAppUtils.ts

// getDateColor moved to MainAppUtils.ts

// formatDateWithHoliday moved to MainAppUtils.ts

// CharacterCheckResult type moved to MainAppTypes.ts

// checkSupportedCharacters moved to MainAppUtils.ts
/*
  // JIS第1-2水準漢字 + ひらがな + カタカナ + 英数字 + 基本記号 + 反復記号「々」+ 全角英数字の範囲
  const supportedCharsRegex = /^[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\u0020-\u007e\uff01-\uff9f\u3000\u301c\u2010-\u2015\u2018-\u201f\u2026\u2030\u203b\u2212\u2500-\u257f\u3005]*$/;
  
  const errors: CharacterCheckResult['errors'] = [];
  
  data.forEach((item, index) => {
    // 名前をチェック
    if (!supportedCharsRegex.test(item.name)) {
      const invalidChars = Array.from(item.name).filter(char => !supportedCharsRegex.test(char));
      errors.push({
        field: 'name',
        value: item.name,
        invalidChars: Array.from(new Set(invalidChars)),
        position: index + 1
      });
    }
    
    // 部署をチェック
    if (!supportedCharsRegex.test(item.dept)) {
      const invalidChars = Array.from(item.dept).filter(char => !supportedCharsRegex.test(char));
      errors.push({
        field: 'dept',
        value: item.dept,
        invalidChars: Array.from(new Set(invalidChars)),
        position: index + 1
      });
    }
    
    // チーム/グループをチェック
    if (!supportedCharsRegex.test(item.team)) {
      const invalidChars = Array.from(item.team).filter(char => !supportedCharsRegex.test(char));
      errors.push({
        field: 'team',
        value: item.team,
        invalidChars: Array.from(new Set(invalidChars)),
        position: index + 1
      });
    }
  });
  
*/

// タイムライン関数は TimelineUtils から使用
// timeToPositionPercent, positionPercentToTime は共通化済み

// timeStringToHours and hoursToTimeString moved to MainAppUtils.ts

// generateTimeOptions は TimelineUtils から使用

// ScheduleModal moved to ./modals/ScheduleModal.tsx
/* 
    isOpen: boolean; 
    onClose: () => void; 
    staffList: Staff[]; 
    onSave: (data: any) => void;
    scheduleToEdit: Schedule | null;
    initialData?: Partial<Schedule>;
}) => {
  const isEditMode = !!scheduleToEdit;
  const [staffId, setStaffId] = useState('');
  const [status, setStatus] = useState('Online');
  const [startTime, setStartTime] = useState('8');
  const [endTime, setEndTime] = useState('8.25');
  const [memo, setMemo] = useState('');
  const timeOptions = useMemo(() => generateTimeOptions(8, 21), []);
  const [isClient, setIsClient] = useState(false);
  
  // 一般ユーザーの場合は自分のスタッフ情報のみに制限（一時的に無効化）
  const filteredStaffList = useMemo(() => {
    return staffList;
  }, [staffList]);
  
  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => {
    const data = scheduleToEdit || initialData;
    if (isOpen && data) {
        setStaffId(data.staffId?.toString() || '');
        setStatus(data.status || 'Online');
        setStartTime(data.start?.toString() || '8');
        setEndTime(data.end?.toString() || '8.25');
        setMemo(data.memo || '');
    } else if (!isOpen) {
        setStaffId(''); setStatus('Online'); setStartTime('8'); setEndTime('8.25'); setMemo('');
    }
  }, [scheduleToEdit, initialData, isOpen]);

  // 開始時刻変更時に終了時刻を自動調整（新規作成時のみ、ドラッグ作成は除く）
  useEffect(() => {
    if (!isEditMode && !initialData?.isDragCreated && startTime && parseFloat(startTime) > 0) {
      const start = parseFloat(startTime);
      let newEndTime = start + 1; // 1時間後
      
      // 21時を超える場合は21時に調整
      if (newEndTime > 21) {
        newEndTime = 21;
      }
      
      setEndTime(newEndTime.toString());
    }
  }, [startTime, isEditMode, initialData?.isDragCreated]);

  if (!isOpen || !isClient) return null;

  const handleSave = () => {
    // console.log('=== ScheduleModal handleSave ===', { staffId, startTime, endTime, status, memo });
    if (!staffId || parseFloat(startTime) >= parseFloat(endTime)) { 
      console.error("入力内容が正しくありません。"); 
      alert("入力内容が正しくありません。スタッフを選択し、開始時刻が終了時刻より前になるように設定してください。");
      return; 
    }
    const scheduleData = { 
      staffId: parseInt(staffId), 
      status, 
      start: parseFloat(startTime), 
      end: parseFloat(endTime),
      memo: (status === 'meeting' || status === 'training') ? memo : undefined
    };
    // console.log('Schedule data prepared:', scheduleData);
    onSave(isEditMode ? { ...scheduleData, id: scheduleToEdit.id } : scheduleData);
    onClose();
  };
  
  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[9998] flex justify-center items-center">
      <div className="bg-white rounded-lg p-6 shadow-xl w-full max-w-md">
        <h3 className="text-lg font-medium leading-6 text-gray-900">{isEditMode ? '予定を編集' : '予定を追加'}</h3>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="staff" className="block text-sm font-medium text-gray-700">スタッフ</label>
            <select id="staff" value={staffId} onChange={e => setStaffId(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" disabled={isEditMode}>
              <option value="" disabled>選択してください</option>
              {staffList.map(staff => <option key={staff.id} value={staff.id}>{staff.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700">ステータス</label>
            <select id="status" value={status} onChange={e => setStatus(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">
              {availableStatuses.map(s => <option key={s} value={s}>{capitalizeStatus(s)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="start" className="block text-sm font-medium text-gray-700">開始</label>
              <select id="start" value={startTime} onChange={e => setStartTime(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">{timeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
            </div>
            <div>
              <label htmlFor="end" className="block text-sm font-medium text-gray-700">終了</label>
              <select id="end" value={endTime} onChange={e => setEndTime(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm">{timeOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
            </div>
          </div>
          {(status === 'meeting' || status === 'training') && (
            <div>
              <label htmlFor="memo" className="block text-sm font-medium text-gray-700">
                メモ ({status === 'meeting' ? '会議' : '研修'}内容)
              </label>
              <textarea
                id="memo"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                rows={3}
                placeholder={status === 'meeting' ? '会議の内容を入力...' : '研修の内容を入力...'}
              />
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end space-x-2">
          <button type="button" onClick={onClose} className={`px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 ${LIGHT_ANIMATIONS.button}`}>キャンセル</button>
          <button type="button" onClick={handleSave} className={`px-4 py-2 text-sm font-medium text-white bg-indigo-600 border-transparent rounded-md hover:bg-indigo-700 ${LIGHT_ANIMATIONS.button}`}>保存</button>
        </div>
      </div>
*/

// ConfirmationModal moved to ./modals/ConfirmationModal.tsx

// AssignmentModal moved to ./modals/AssignmentModal.tsx
/*
  isOpen: boolean;
  onClose: () => void;
  staff: Staff | null;
  staffList: Staff[];
  onSave: (data: {
    staffId: number;
    startDate: string;
    endDate: string;
    department: string;
    group: string;
  }) => void;
  onDelete?: (staffId: number) => void;
}) => {
  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [department, setDepartment] = useState('');
  const [group, setGroup] = useState('');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // 既存の支援設定がある場合は初期値として設定
  useEffect(() => {
    if (isOpen && staff) {
      if (staff.supportInfo) {
        setStartDate(new Date(staff.supportInfo.startDate));
        setEndDate(new Date(staff.supportInfo.endDate));
        setDepartment(staff.currentDept || '');
        setGroup(staff.currentGroup || '');
      } else {
        // 新規の場合は今日から開始
        const today = new Date();
        setStartDate(today);
        setEndDate(today);
        setDepartment('');
        setGroup('');
      }
    } else if (!isOpen) {
      setStartDate(null);
      setEndDate(null);
      setDepartment('');
      setGroup('');
    }
  }, [isOpen, staff]);

  // 利用可能な部署とグループを取得（「受付」を含むものは除外）
  const availableDepartments = useMemo(() => {
    return Array.from(new Set(staffList.map(s => s.department)))
      .filter(dept => !dept.includes('受付'));
  }, [staffList]);

  const availableGroups = useMemo(() => {
    if (!department) return [];
    return Array.from(new Set(staffList.filter(s => s.department === department).map(s => s.group)))
      .filter(group => !group.includes('受付'));
  }, [staffList, department]);

  // 部署が変更されたらグループをリセット
  useEffect(() => {
    if (department && !availableGroups.includes(group)) {
      setGroup('');
    }
  }, [department, availableGroups, group]);

  if (!isOpen || !isClient || !staff) return null;

  const handleSave = () => {
    if (!startDate || !endDate || !department || !group) {
      alert('すべての項目を入力してください。');
      return;
    }

    if (startDate > endDate) {
      alert('開始日は終了日より前の日付を選択してください。');
      return;
    }

    // JST基準で正しい日付文字列を生成
    const startYear = startDate.getFullYear();
    const startMonth = String(startDate.getMonth() + 1).padStart(2, '0');
    const startDay = String(startDate.getDate()).padStart(2, '0');
    const startDateStr = `${startYear}-${startMonth}-${startDay}`;
    
    const endYear = endDate.getFullYear();
    const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
    const endDay = String(endDate.getDate()).padStart(2, '0');
    const endDateStr = `${endYear}-${endMonth}-${endDay}`;

    onSave({
      staffId: staff.id,
      startDate: startDateStr,
      endDate: endDateStr,
      department,
      group,
    });
    onClose();
  };

  const handleDelete = () => {
    if (!staff || !onDelete) return;
    
    if (confirm(`${staff.name}の支援設定を削除しますか？`)) {
      onDelete(staff.id);
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[9998] flex justify-center items-center">
      <div className="bg-white rounded-lg p-6 shadow-xl w-full max-w-md">
        <h3 className="text-lg font-medium leading-6 text-gray-900">
          {staff.supportInfo ? '支援設定を編集' : '支援を設定'} - {staff.name}
        </h3>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">開始日</label>
              <DatePicker
                selected={startDate}
                onChange={(date: Date | null) => setStartDate(date)}
                locale="ja"
                dateFormat="yyyy年M月d日(E)"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholderText="開始日を選択"
                popperClassName="!z-[10000]"
                popperPlacement="bottom-start"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">終了日</label>
              <DatePicker
                selected={endDate}
                onChange={(date: Date | null) => setEndDate(date)}
                locale="ja"
                dateFormat="yyyy年M月d日(E)"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                placeholderText="終了日を選択"
                popperClassName="!z-[10000]"
                popperPlacement="bottom-start"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">支援先部署</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              <option value="">選択してください</option>
              {availableDepartments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">支援先グループ</label>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              disabled={!department}
            >
              <option value="">選択してください</option>
              {availableGroups.map(grp => (
                <option key={grp} value={grp}>{grp}</option>
              ))}
            </select>
          </div>
          {staff.supportInfo && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                現在の支援先: {staff.currentDept} / {staff.currentGroup}
              </p>
            </div>
          )}
        </div>
/*
        <div className="mt-6 flex justify-between items-center">
          // 削除ボタン（左側、既存の支援設定がある場合のみ表示）
          <div>
            {staff.isSupporting && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className={`px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 ${LIGHT_ANIMATIONS.button}`}
              >
                支援設定を削除
              </button>
            )}
          </div>
          
          // キャンセル・保存ボタン（右側）
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 ${LIGHT_ANIMATIONS.button}`}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              className={`px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 ${LIGHT_ANIMATIONS.button}`}
            >
              保存
            </button>
          </div>
        </div>
      </div>
// ... (remaining AssignmentModal code commented out)
*/

// ResponsibilityModal moved to ./modals/ResponsibilityModal.tsx

// JsonUploadModal moved to ./modals/JsonUploadModal.tsx

// CsvUploadModal moved to ./modals/CsvUploadModal.tsx

// --- インポート履歴モーダルコンポーネント ---
const ImportHistoryModal = ({ isOpen, onClose, onRollback, authenticatedFetch }: {
  isOpen: boolean;
  onClose: () => void;
  onRollback: (batchId: string) => void;
  authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>;
}) => {
  const [importHistory, setImportHistory] = useState<ImportHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!isOpen) return;
    
    setLoading(true);
    setError(null);
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${currentApiUrl}/csv-import/history`);
      if (!response.ok) {
        throw new Error('履歴の取得に失敗しました');
      }
      const data = await response.json();
      setImportHistory(data);
    } catch (error) {
      console.error('インポート履歴の取得に失敗しました:', error);
      setError(error instanceof Error ? error.message : '履歴の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleRollback = async (batchId: string, recordCount: number) => {
    const confirmed = window.confirm(
      `バッチID: ${batchId}\n` +
      `対象レコード: ${recordCount}件\n\n` +
      'このインポートをロールバック（取り消し）しますか？\n' +
      '※ この操作は元に戻せません'
    );
    
    if (!confirmed) return;
    
    try {
      onRollback(batchId);
      await fetchHistory(); // 履歴を再読み込み
    } catch (error) {
      console.error('ロールバック後の履歴更新に失敗:', error);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-800">CSVインポート履歴</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {loading && (
            <div className="text-center py-8">
              <div className="text-gray-600">履歴を読み込み中...</div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <div className="text-red-800 font-medium">エラー</div>
              <div className="text-red-700 text-sm mt-1">{error}</div>
            </div>
          )}
          
          {!loading && !error && importHistory.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              インポート履歴がありません
            </div>
          )}
          
          {!loading && !error && importHistory.length > 0 && (
            <div className="space-y-4">
              {importHistory.map((history) => (
                <div key={history.batchId} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="font-medium text-gray-800 mb-1">
                        バッチID: {history.batchId}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        インポート日時: {new Date(history.importedAt).toLocaleString('ja-JP')}
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">投入レコード数:</span>
                          <span className="ml-2 text-blue-600 font-medium">{history.recordCount}件</span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">対象スタッフ数:</span>
                          <span className="ml-2 text-green-600 font-medium">{history.staffCount}名</span>
                        </div>
                      </div>
                      <div className="text-sm mt-2">
                        <span className="font-medium text-gray-700">対象日付範囲:</span>
                        <span className="ml-2">{history.dateRange}</span>
                      </div>
                      <div className="text-sm mt-2">
                        <span className="font-medium text-gray-700">対象スタッフ:</span>
                        <span className="ml-2 text-gray-600">
                          {history.staffList ? history.staffList.slice(0, 5).join(', ') : '情報なし'}
                          {history.staffList && history.staffList.length > 5 && ` 他${history.staffList.length - 5}名`}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4">
                      {history.canRollback ? (
                        <button
                          onClick={() => handleRollback(history.batchId, history.recordCount)}
                          className={`px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium ${LIGHT_ANIMATIONS.button}`}
                        >
                          ロールバック
                        </button>
                      ) : (
                        <div className="px-4 py-2 bg-gray-300 text-gray-500 rounded-md text-sm font-medium cursor-not-allowed">
                          期限切れ
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-600">
              ※ ロールバックは投入から24時間以内のみ可能です
            </div>
            <button
              onClick={onClose}
              className={`px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 text-sm font-medium ${LIGHT_ANIMATIONS.button}`}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};


// --- チャートコンポーネント ---
const StatusChart = ({ data, staffList, selectedDepartment, selectedGroup, showChart, onToggleChart }: { 
  data: any[], 
  staffList: Staff[], 
  selectedDepartment: string, 
  selectedGroup: string,
  showChart: boolean,
  onToggleChart: () => void
}) => {
  // 左列のコンテンツを取得してガントチャートと同じ構造を作る
  const groupedStaff = useMemo(() => {
    const filteredStaff = staffList.filter(staff => {
      const departmentMatch = selectedDepartment === 'all' || staff.department === selectedDepartment;
      const groupMatch = selectedGroup === 'all' || staff.group === selectedGroup;
      return departmentMatch && groupMatch;
    });

    return filteredStaff.reduce((acc, staff) => {
      const { department, group } = staff;
      if (!acc[department]) { acc[department] = {}; }
      if (!acc[department][group]) { acc[department][group] = []; }
      acc[department][group].push(staff);
      return acc;
    }, {} as Record<string, Record<string, Staff[]>>);
  }, [staffList, selectedDepartment, selectedGroup]);

  return (
    <div className="bg-white shadow-sm rounded-xl border border-gray-100">
      {/* トグルボタンエリア */}
      <div className="px-4 py-1 border-b border-gray-200 bg-gray-50 rounded-t-xl">
        <button
          onClick={onToggleChart}
          className="flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900 transition-colors py-0.5"
        >
          <span className="text-sm">📊</span>
          <span className="font-bold">Line Chart</span>
          <span className="text-xs text-gray-500">
            {showChart ? '（表示中）' : '（非表示）'}
          </span>
          <span className="ml-1 transform transition-transform duration-200 text-xs" style={{ transform: showChart ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
        </button>
      </div>
      
      {/* グラフエリア（条件付き表示） */}
      {showChart && (
        <div className="flex">
          {/* 左列 - 凡例エリア（2列構成） */}
          <div className="w-48 border-r border-gray-200 bg-gray-50">
            <div className="px-2 py-1 flex gap-x-4">
              {/* 1列目 */}
              <div className="flex flex-col gap-y-1">
                {['online', 'remote', 'night duty', 'break'].map(status => (
                  <div key={status} className="flex items-center text-xs">
                    <div 
                      className="w-2 h-2 rounded mr-1 flex-shrink-0" 
                      style={{ backgroundColor: getEffectiveStatusColor(status) }}
                    ></div>
                    <span className="truncate" style={{ opacity: status === 'online' ? 1 : 0.7 }}>
                      {capitalizeStatus(status)}
                    </span>
                  </div>
                ))}
              </div>
              {/* 2列目 */}
              <div className="flex flex-col gap-y-1">
                {['off', 'unplanned', 'meeting', 'training', 'trip'].map(status => (
                  <div key={status} className="flex items-center text-xs">
                    <div 
                      className="w-2 h-2 rounded mr-1 flex-shrink-0" 
                      style={{ backgroundColor: getEffectiveStatusColor(status) }}
                    ></div>
                    <span className="truncate" style={{ opacity: status === 'online' ? 1 : 0.7 }}>
                      {capitalizeStatus(status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* 右列 - チャート表示エリア */}
          <div className="flex-1 p-1" style={{ height: '120px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 2, right: 10, left: 5, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 11 }} 
                  interval={11}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={25} />
                <Tooltip 
                  wrapperStyle={{ zIndex: 100 }}
                  formatter={(value, name) => [value, capitalizeStatus(String(name))]}
                  labelFormatter={(label) => `時刻: ${label}`}
                />
                {/* Legendを非表示にする */}
                {/* 凡例と同じ順序で描画 */}
                {['online', 'remote', 'night duty', 'break', 'off', 'unplanned', 'meeting', 'training', 'trip'].map(status => (
                  <Line 
                    key={status} 
                    type="monotone" 
                    dataKey={status} 
                    stroke={statusColors[status] || '#8884d8'} 
                    strokeWidth={2} 
                    connectNulls 
                    dot={false}
                    strokeOpacity={status === 'online' ? 1 : 0.3}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
};



// --- メインのコンポーネント (Home) ---
export default function FullMainApp() {
  const { user, logout, token } = useAuth();

  // 認証対応API呼び出しヘルパー
  const authenticatedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      ...options.headers as Record<string, string>,
    };

    // FormDataを使用する場合はContent-Typeを設定しない（ブラウザが自動設定）
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // 401エラーの場合はログアウト
    if (response.status === 401) {
      logout();
      throw new Error('認証が必要です');
    }

    return response;
  }, [token, logout]);

  // グローバル表示設定の取得
  const { settings: globalDisplaySettings, isLoading: isSettingsLoading, refreshSettings } = useGlobalDisplaySettings(authenticatedFetch);
  
  // 統一担当設定管理フック
  const { 
    saveResponsibility,
    loadSingleDateResponsibilities,
    getResponsibilityForDate
  } = useResponsibilityData(authenticatedFetch);
  
  // 設定変更後の強制再レンダリング用
  const [settingsUpdateTrigger, setSettingsUpdateTrigger] = useState(0);

  // 初期化時にキャッシュを確実に更新
  useEffect(() => {
    if (typeof window !== 'undefined') {
      initializeCacheFromLocalStorage();
    }
  }, []);

  // 権限チェックヘルパー
  const hasPermission = useCallback((requiredRole: UserRole | UserRole[], targetStaffId?: number) => {
    if (!user) return false;
    
    // ADMIN は常にアクセス可能
    if (user.role === 'ADMIN') return true;
    
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    
    // STAFF の場合、自分のスタッフIDと一致する場合のみ編集可能
    if (user.role === 'STAFF' && targetStaffId !== undefined) {
      return targetStaffId === user.staffId;
    }
    
    return roles.includes(user.role);
  }, [user]);

  // UI表示制御ヘルパー
  const canEdit = useCallback((targetStaffId?: number) => {
    return hasPermission(['STAFF', 'ADMIN', 'SYSTEM_ADMIN'], targetStaffId);
  }, [hasPermission]);

  const canManage = useCallback(() => {
    return hasPermission('ADMIN') || hasPermission('SYSTEM_ADMIN');
  }, [hasPermission]);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [deletingScheduleId, setDeletingScheduleId] = useState<number | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedSettingFilter, setSelectedSettingFilter] = useState('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [displayDate, setDisplayDate] = useMainAppDate();
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);
  const [draggedSchedule, setDraggedSchedule] = useState<Partial<Schedule> | null>(null);
  const [dragOffset, setDragOffset] = useState<number>(0); // ゴーストエレメント位置調整用オフセット
  const [isJsonUploadModalOpen, setIsJsonUploadModalOpen] = useState(false);
  const [isCsvUploadModalOpen, setIsCsvUploadModalOpen] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [selectedStaffForAssignment, setSelectedStaffForAssignment] = useState<Staff | null>(null);
  const [isResponsibilityModalOpen, setIsResponsibilityModalOpen] = useState(false);
  const [selectedStaffForResponsibility, setSelectedStaffForResponsibility] = useState<Staff | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<{ schedule: Schedule; layer: string } | null>(null);
  const [isImportHistoryModalOpen, setIsImportHistoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSystemMonitoringModalOpen, setIsSystemMonitoringModalOpen] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  
  // === Phase 2a: 視覚的フィードバック状態管理 ===
  // スケジュールID → フィードバック種別のマッピング
  const [feedbackStates, setFeedbackStates] = useState<Map<number | string, 'added' | 'updated' | 'deleted' | 'error'>>(new Map());
  
  // フィードバック管理用のタイマーref（自動クリア用）
  const feedbackTimersRef = useRef<Map<number | string, NodeJS.Timeout>>(new Map());

  // === Phase 2b: 楽観的更新（低リスク）通知システム ===
  // 操作進行状況の通知管理
  const [operationNotifications, setOperationNotifications] = useState<Array<{
    id: string;
    type: 'processing' | 'success' | 'error';
    message: string;
    timestamp: Date;
    autoRemove?: boolean;
  }>>([]);
  
  // 通知自動削除用タイマー
  const notificationTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // === Phase 2a: 視覚的フィードバック管理関数 ===
  
  // フィードバックを設定し、自動的にクリアする
  const setScheduleFeedback = useCallback((scheduleId: number | string, feedbackType: 'added' | 'updated' | 'deleted' | 'error', duration: number = 2500) => {
    // 既存のタイマーをクリア
    const existingTimer = feedbackTimersRef.current.get(scheduleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // フィードバック状態を設定
    setFeedbackStates(prev => {
      const newMap = new Map(prev);
      newMap.set(scheduleId, feedbackType);
      return newMap;
    });
    
    // 自動クリア用タイマーを設定
    const timer = setTimeout(() => {
      setFeedbackStates(prev => {
        const newMap = new Map(prev);
        newMap.delete(scheduleId);
        return newMap;
      });
      feedbackTimersRef.current.delete(scheduleId);
    }, duration);
    
    feedbackTimersRef.current.set(scheduleId, timer);
    
    if (isDebugEnabled()) console.log(`✨ フィードバック設定: ID ${scheduleId} → ${feedbackType} (${duration}ms)`);
  }, []);
  
  // フィードバックを即座にクリア
  const clearScheduleFeedback = useCallback((scheduleId: number | string) => {
    const existingTimer = feedbackTimersRef.current.get(scheduleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      feedbackTimersRef.current.delete(scheduleId);
    }
    
    setFeedbackStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(scheduleId);
      return newMap;
    });
  }, []);
  
  // スケジュールのフィードバック状態を取得
  const getScheduleFeedback = useCallback((scheduleId: number | string) => {
    return feedbackStates.get(scheduleId);
  }, [feedbackStates]);
  
  // フィードバック用CSSクラスを生成
  const getFeedbackClasses = useCallback((scheduleId: number | string) => {
    const feedbackType = feedbackStates.get(scheduleId);
    if (!feedbackType) return '';
    
    const colors = FEEDBACK_COLORS[feedbackType];
    return `${colors.background} ${colors.border} ${colors.shadow} ${LIGHT_ANIMATIONS.feedbackPulse}`;
  }, [feedbackStates]);

  // === Phase 2b: 通知管理関数 ===
  
  // 通知を追加
  const addNotification = useCallback((type: 'processing' | 'success' | 'error', message: string, autoRemove: boolean = true) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const notification = {
      id,
      type,
      message,
      timestamp: new Date(),
      autoRemove
    };
    
    setOperationNotifications(prev => [...prev, notification]);
    
    // 自動削除設定
    if (autoRemove) {
      const duration = type === 'processing' ? 0 : (type === 'success' ? 3000 : 5000); // 処理中は手動削除、成功3秒、エラー5秒
      if (duration > 0) {
        const timer = setTimeout(() => {
          removeNotification(id);
        }, duration);
        notificationTimersRef.current.set(id, timer);
      }
    }
    
    if (isDebugEnabled()) console.log(`📢 通知追加: ${type} - ${message}`);
    return id;
  }, []);
  
  // 通知を削除
  const removeNotification = useCallback((id: string) => {
    setOperationNotifications(prev => prev.filter(n => n.id !== id));
    
    const timer = notificationTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      notificationTimersRef.current.delete(id);
    }
  }, []);
  
  // 通知を更新（処理中→成功/失敗）
  const updateNotification = useCallback((id: string, type: 'success' | 'error', message: string) => {
    setOperationNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, type, message, timestamp: new Date() } : n)
    );
    
    // 自動削除タイマー設定
    const duration = type === 'success' ? 3000 : 5000;
    const timer = setTimeout(() => {
      removeNotification(id);
    }, duration);
    notificationTimersRef.current.set(id, timer);
    
    if (isDebugEnabled()) console.log(`📝 通知更新: ${id} → ${type} - ${message}`);
  }, [removeNotification]);
  
  // スクロール位置保存用（縦スクロール対応）
  const [savedScrollPosition, setSavedScrollPosition] = useState({ x: 0, y: 0 });
  
  const [isImporting, setIsImporting] = useState(false);
  const [departmentSettings, setDepartmentSettings] = useState<{
    departments: Array<{id: number, name: string, shortName?: string, backgroundColor?: string, displayOrder?: number}>,
    groups: Array<{id: number, name: string, shortName?: string, backgroundColor?: string, displayOrder?: number}>
  }>({ departments: [], groups: [] });
  const [showLineChart, setShowLineChart] = useState(() => {
    // localStorageから初期値を読み込み
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('showLineChart');
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

  // パフォーマンス最適化：部署グループマップ構築
  const groupToStaffMap = useMemo(() => {
    const perfStart = performance.now();
    const map = new Map<string, Staff>();
    staffList.forEach(staff => {
      if (!map.has(staff.group)) {
        map.set(staff.group, staff);
      }
    });
    const perfEnd = performance.now();
    if (perfEnd - perfStart > 100) {
      console.warn('グループマップ構築時間:', perfEnd - perfStart, 'ms');
    }
    return map;
  }, [staffList]);

  const departmentMap = useMemo(() => {
    const perfStart = performance.now();
    const map = new Map<string, any>();
    departmentSettings.departments.forEach(dept => map.set(dept.name, dept));
    const perfEnd = performance.now();
    if (perfEnd - perfStart > 50) {
      console.warn('部署マップ構築時間:', perfEnd - perfStart, 'ms');
    }
    return map;
  }, [departmentSettings.departments]);

  // 動的部署色設定（月次計画と同じロジック）
  const dynamicDepartmentColors = useMemo(() => {
    const colors: { [key: string]: string } = {};
    departmentSettings.departments.forEach(dept => {
      if (dept.backgroundColor) {
        colors[dept.name] = dept.backgroundColor;
      }
    });
    // 動的部署色設定を生成 (ログ削除でパフォーマンス改善)
    return colors;
  }, [departmentSettings.departments]);

  // 動的グループ色設定（月次計画と同じロジック）
  const dynamicTeamColors = useMemo(() => {
    const colors: { [key: string]: string } = {};
    departmentSettings.groups.forEach(group => {
      if (group.backgroundColor) {
        colors[group.name] = group.backgroundColor;
      }
    });
    // 動的グループ色設定を生成 (ログ削除でパフォーマンス改善)
    return colors;
  }, [departmentSettings.groups]);

  // パフォーマンス最適化：部署別グループソート（設定モーダルの表示順に対応）
  const sortGroupsByDepartment = useCallback((groups: string[]) => {
    const perfStart = performance.now();
    
    // O(1)でのグループ→部署情報取得 + グループ自体の表示順も考慮
    const result = groups.sort((a, b) => {
      const staffA = groupToStaffMap.get(a);
      const staffB = groupToStaffMap.get(b);
      
      if (!staffA || !staffB) return 0;
      
      const deptA = departmentMap.get(staffA.department);
      const deptB = departmentMap.get(staffB.department);
      
      const deptOrderA = deptA?.displayOrder ?? 999;
      const deptOrderB = deptB?.displayOrder ?? 999;
      
      // 1. 部署の表示順で比較
      if (deptOrderA !== deptOrderB) {
        return deptOrderA - deptOrderB;
      }
      
      // 2. 同じ部署内では、グループの表示順で比較
      const groupSettingA = departmentSettings.groups.find(g => g.name === a);
      const groupSettingB = departmentSettings.groups.find(g => g.name === b);
      
      const groupOrderA = groupSettingA?.displayOrder ?? 999;
      const groupOrderB = groupSettingB?.displayOrder ?? 999;
      
      if (groupOrderA !== groupOrderB) {
        return groupOrderA - groupOrderB;
      }
      
      // 3. 表示順が同じ場合は名前順
      return a.localeCompare(b, 'ja', { numeric: true });
    });
    
    const perfEnd = performance.now();
    if (perfEnd - perfStart > 200) {
      console.warn('グループソート処理時間:', perfEnd - perfStart, 'ms', '対象:', groups.length, '件');
    }
    
    return result;
  }, [groupToStaffMap, departmentMap, departmentSettings.groups]);

  // viewMode設定（ユーザー優先: ローカル > グローバル）
  const [localViewMode, setLocalViewMode] = useState<'normal' | 'compact' | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('callstatus-user-viewMode');
      return saved as 'normal' | 'compact' | null;
    }
    return null;
  });

  // 実際に使用されるviewMode（ローカル設定優先、なければグローバル設定）
  const viewMode = localViewMode || globalDisplaySettings.viewMode;

  // 履歴データ関連のstate
  const [isHistoricalMode, setIsHistoricalMode] = useState(false);
  const [historicalInfo, setHistoricalInfo] = useState<{
    snapshotDate?: string;
    recordCount?: number;
    message?: string;
  }>({});

  // グローバル設定からmaskingEnabledを取得（こちらは管理者のみ変更可能）
  const maskingEnabled = globalDisplaySettings.maskingEnabled;

  // viewMode切り替え（ユーザーが右上のトグルで操作）
  const toggleViewMode = () => {
    const newMode = viewMode === 'normal' ? 'compact' : 'normal';
    setLocalViewMode(newMode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('callstatus-user-viewMode', newMode);
    }
  };

  // リアルタイム更新設定（ユーザー優先: ローカル > グローバル）
  const [localRealTimeUpdate, setLocalRealTimeUpdate] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('callstatus-user-realTimeUpdate');
      return saved !== null ? saved === 'true' : null;
    }
    return null;
  });

  // 実際に使用されるリアルタイム更新設定（ローカル設定優先、なければグローバル設定）
  const realTimeUpdateEnabled = localRealTimeUpdate !== null ? localRealTimeUpdate : globalDisplaySettings.realTimeUpdateEnabled;

  // リアルタイム更新切り替え（ユーザーが右上のトグルで操作）
  const toggleRealTimeUpdate = () => {
    const newEnabled = !realTimeUpdateEnabled;
    setLocalRealTimeUpdate(newEnabled);
    if (typeof window !== 'undefined') {
      localStorage.setItem('callstatus-user-realTimeUpdate', newEnabled.toString());
    }
  };
  
  // スクロール同期用のref
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  
  // リアルタイム更新時のスクロール位置保持用
  const scrollPositionBeforeUpdate = useRef<{x: number, y: number}>({x: 0, y: 0});
  
  // 🛡️ 安全な並行実装システム（Phase 2b完了）
  const [enableOptimizedUpdates, setEnableOptimizedUpdates] = useState(true);
  const [optimizationMetrics, setOptimizationMetrics] = useState<{
    successCount: number;
    errorCount: number;
    fallbackCount: number;
    averageUpdateTime: number;
    partialUpdateCount?: number;
    lastPartialUpdateTime?: string;
  }>({ successCount: 0, errorCount: 0, fallbackCount: 0, averageUpdateTime: 0 });
  
  // 並行実装用の一時的なスケジュール状態（テスト用）
  const optimizedScheduleUpdateLegacyRef = useRef<{
    pending: boolean;
    lastUpdate: Date | null;
    errorLog: string[];
    fallbackCount: number;
  }>({ pending: false, lastUpdate: null, errorLog: [], fallbackCount: 0 });

  // 📝 Phase 1: 楽観的更新管理システム（パフォーマンス最適化版）
  const OptimisticUpdateManager = {
    // 楽観的更新を追跡（一時ID → 元データ）
    pendingUpdates: new Map<string, {
      originalData: Schedule | null;
      operation: 'create' | 'update' | 'delete';
      timestamp: number;
      changeType: 'low' | 'medium' | 'high';
      retryCount: number;
      batchGroup?: string;
    }>(),
    
    // バッチ処理キュー
    batchQueue: new Map<string, {
      operations: Array<{
        tempId: string;
        operation: 'create' | 'update' | 'delete';
        scheduleData: Schedule;
      }>;
      timestamp: number;
      processed: boolean;
    }>(),
    
    // 一時ID生成
    generateTempId: () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    
    // 楽観的更新の追跡開始（競合解決対応）
    trackOptimisticUpdate: (tempId: string, originalData: Schedule | null, operation: 'create' | 'update' | 'delete', changeType: 'low' | 'medium' | 'high', batchGroup?: string) => {
      // 競合チェック：同じスケジュールの更新が進行中かチェック
      const existingConflict = Array.from(OptimisticUpdateManager.pendingUpdates.values()).find(
        pending => pending.originalData?.id === originalData?.id && pending.operation === 'update'
      );
      
      if (existingConflict && operation === 'update') {
        if (isDebugEnabled()) {
          console.warn('⚠️ 競合検出: 同じスケジュールの更新が進行中:', {
            existingId: existingConflict.originalData?.id,
            newTempId: tempId,
            conflictResolution: 'latest_wins'
          });
        }
        // 最新の更新を優先（Last Writer Wins）
        const existingTempIds = Array.from(OptimisticUpdateManager.pendingUpdates.keys()).filter(
          id => OptimisticUpdateManager.pendingUpdates.get(id)?.originalData?.id === originalData?.id
        );
        existingTempIds.forEach(id => OptimisticUpdateManager.pendingUpdates.delete(id));
      }
      
      OptimisticUpdateManager.pendingUpdates.set(tempId, {
        originalData,
        operation,
        timestamp: Date.now(),
        changeType,
        retryCount: 0,
        batchGroup
      });
      
      if (isDebugEnabled()) {
        console.log('🔄 楽観的更新追跡開始:', {
          tempId,
          operation,
          changeType,
          originalData: originalData?.id,
          batchGroup,
          conflictResolved: !!existingConflict
        });
      }
    },
    
    // 成功時：楽観的更新を確認
    confirmUpdate: (tempId: string, serverData: Schedule) => {
      const pending = OptimisticUpdateManager.pendingUpdates.get(tempId);
      if (pending) {
        OptimisticUpdateManager.pendingUpdates.delete(tempId);
        
        if (isDebugEnabled()) {
          console.log('✅ 楽観的更新成功:', {
            tempId,
            serverData: serverData.id,
            operation: pending.operation,
            duration: Date.now() - pending.timestamp
          });
        }
      }
    },
    
    // 失敗時：楽観的更新をロールバック
    rollbackUpdate: (tempId: string) => {
      const pending = OptimisticUpdateManager.pendingUpdates.get(tempId);
      if (pending) {
        if (isDebugEnabled()) {
          console.log('🔙 楽観的更新ロールバック:', {
            tempId,
            operation: pending.operation,
            duration: Date.now() - pending.timestamp
          });
        }
        
        // 実際のロールバック処理
        const optimizedScheduleUpdate = optimizedScheduleUpdateRef.current;
        if (optimizedScheduleUpdate) {
          if (pending.operation === 'create') {
            // 新規作成の場合：一時要素を削除
            optimizedScheduleUpdate.delete(tempId);
          } else if (pending.operation === 'update' && pending.originalData) {
            // 更新の場合：元のデータに復元
            // サーバーデータとして変換（型安全な変換）
            const rollbackData: ScheduleFromDB = {
              id: typeof pending.originalData.id === 'string' ? 
                  parseInt(pending.originalData.id.replace(/[^0-9]/g, '')) || Date.now() : 
                  Number(pending.originalData.id),
              staffId: pending.originalData.staffId,
              status: pending.originalData.status,
              start: String(pending.originalData.start),
              end: String(pending.originalData.end),
              memo: pending.originalData.memo,
              layer: pending.originalData.layer === 'historical' ? 'adjustment' : 
                     (pending.originalData.layer || 'adjustment')
            };
            optimizedScheduleUpdate.update(rollbackData);
          }
        }
        
        OptimisticUpdateManager.pendingUpdates.delete(tempId);
      }
    },
    
    // 全ての楽観的更新をクリア
    clearAllPending: () => {
      OptimisticUpdateManager.pendingUpdates.clear();
      OptimisticUpdateManager.batchQueue.clear();
      if (isDebugEnabled()) {
        console.log('🧹 全ての楽観的更新をクリア');
      }
    },
    
    // リトライ機能
    retryFailedUpdate: async (tempId: string, originalPayload: any, isUpdate: boolean) => {
      const pending = OptimisticUpdateManager.pendingUpdates.get(tempId);
      if (!pending) return false;
      
      const maxRetries = 3;
      if (pending.retryCount >= maxRetries) {
        if (isDebugEnabled()) {
          console.error('🔄 リトライ上限に達しました:', {
            tempId,
            retryCount: pending.retryCount,
            maxRetries
          });
        }
        // 最終的にロールバック
        OptimisticUpdateManager.rollbackUpdate(tempId);
        return false;
      }
      
      // リトライ回数を増やす
      pending.retryCount++;
      OptimisticUpdateManager.pendingUpdates.set(tempId, pending);
      
      if (isDebugEnabled()) {
        console.log('🔄 楽観的更新リトライ実行:', {
          tempId,
          retryCount: pending.retryCount,
          maxRetries
        });
      }
      
      // 指数バックオフでリトライ
      const delay = Math.pow(2, pending.retryCount) * 1000; // 2秒、4秒、8秒
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        const currentApiUrl = getApiUrl();
        let response;
        
        if (isUpdate) {
          response = await authenticatedFetch(`${currentApiUrl}/schedules/${originalPayload.id}`, {
            method: 'PATCH',
            body: JSON.stringify(originalPayload)
          });
        } else {
          response = await authenticatedFetch(`${currentApiUrl}/schedules`, {
            method: 'POST',
            body: JSON.stringify(originalPayload)
          });
        }
        
        if (response.ok) {
          const serverResult = await response.json();
          OptimisticUpdateManager.confirmUpdate(tempId, serverResult);
          
          if (isDebugEnabled()) {
            console.log('✅ リトライ成功:', {
              tempId,
              retryCount: pending.retryCount,
              serverResult: serverResult.id
            });
          }
          
          return true;
        } else {
          throw new Error(`Retry failed: ${response.status}`);
        }
      } catch (error) {
        if (isDebugEnabled()) {
          console.error('❌ リトライ失敗:', {
            tempId,
            retryCount: pending.retryCount,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
        // 次のリトライをスケジュール
        if (pending.retryCount < maxRetries) {
          setTimeout(() => {
            OptimisticUpdateManager.retryFailedUpdate(tempId, originalPayload, isUpdate);
          }, delay);
        } else {
          // 最終的にロールバック
          OptimisticUpdateManager.rollbackUpdate(tempId);
        }
        
        return false;
      }
    },
    
    // 自動復旧機能（定期的な整合性チェック）
    startHealthCheck: () => {
      const healthCheckInterval = setInterval(() => {
        const now = Date.now();
        const staleThreshold = 30000; // 30秒
        
        Array.from(OptimisticUpdateManager.pendingUpdates.entries()).forEach(([tempId, pending]) => {
          if (now - pending.timestamp > staleThreshold) {
            if (isDebugEnabled()) {
              console.warn('⚠️ 古い楽観的更新を検出:', {
                tempId,
                age: now - pending.timestamp,
                threshold: staleThreshold
              });
            }
            
            // 古い楽観的更新をロールバック
            OptimisticUpdateManager.rollbackUpdate(tempId);
          }
        });
        
        // バッチキューのクリーンアップ
        Array.from(OptimisticUpdateManager.batchQueue.entries()).forEach(([batchId, batch]) => {
          if (now - batch.timestamp > staleThreshold && batch.processed) {
            OptimisticUpdateManager.batchQueue.delete(batchId);
          }
        });
        
      }, 10000); // 10秒ごとにチェック
      
      // クリーンアップ関数を返す
      return () => clearInterval(healthCheckInterval);
    }
  };

  // 📝 Phase 1: 変更リスク分類システム
  const UPDATE_RISK_LEVELS = {
    LOW: ['memo', 'description'],                    // Phase 1: 楽観的更新
    MEDIUM: ['title', 'priority', 'tags', 'type'],  // Phase 2: 確認付き更新
    HIGH: ['start', 'end', 'status', 'staffId']     // Phase 3: 安全な全体更新
  };

  // 変更タイプを検出
  const detectChangeType = (newData: Schedule, originalData: Schedule | null): 'low' | 'medium' | 'high' => {
    if (!originalData) return 'low'; // 新規作成は低リスクとして扱う
    
    const changes: string[] = [];
    Object.keys(newData).forEach(key => {
      if (newData[key as keyof Schedule] !== originalData[key as keyof Schedule]) {
        changes.push(key);
      }
    });
    
    // 最もリスクの高い変更を返す
    if (changes.some(c => UPDATE_RISK_LEVELS.HIGH.includes(c))) return 'high';
    if (changes.some(c => UPDATE_RISK_LEVELS.MEDIUM.includes(c))) return 'medium';
    return 'low';
  };

  // 楽観的更新を使用するかの判定（シンプル化版）
  const shouldUseOptimisticUpdate = (changeType: 'low' | 'medium' | 'high', scheduleData: Schedule, isNewCreation: boolean = false): boolean => {
    // 🎯 新規作成は楽観的更新なしでシンプルに
    if (isNewCreation) {
      console.log('📝 新規作成: 楽観的更新なしでシンプル処理');
      return false;
    }
    
    // 更新・移動のみ楽観的更新を使用
    console.log('🔄 更新・移動: 楽観的更新システム使用');
    
    // 重要な業務予定は楽観的更新を避ける
    if (scheduleData.memo?.includes('重要') || 
        scheduleData.memo?.includes('会議') ||
        scheduleData.memo?.includes('顧客')) {
      console.log('❌ 楽観的更新スキップ: 重要業務予定');
      return false;
    }
    
    // 受付チームの予定は慎重に（業務継続性重視）
    const staff = staffList.find(s => s.id === scheduleData.staffId);
    const isReception = staff && isReceptionStaff(staff);
    
    if (isReception) {
      console.log('❌ 楽観的更新スキップ: 受付チーム（業務継続性重視）');
      return false;
    }
    
    // Phase 2: 中リスク変更の追加チェック
    if (changeType === 'medium') {
      // 中リスク変更の場合、追加の安全性チェック
      
      // 1. 営業時間外の変更は慎重に
      const currentHour = new Date().getHours();
      if (currentHour < 9 || currentHour > 18) {
        if (isDebugEnabled()) {
          console.log('📅 営業時間外の中リスク変更、楽観的更新をスキップ:', {
            currentHour,
            changeType
          });
        }
        return false;
      }
      
      // 2. 過去の予定は慎重に
      const scheduleDate = new Date();
      const today = new Date();
      if (scheduleDate < today) {
        if (isDebugEnabled()) {
          console.log('📅 過去の予定の中リスク変更、楽観的更新をスキップ:', {
            scheduleDate,
            today,
            changeType
          });
        }
        return false;
      }
      
      // 3. 複数人に影響する可能性のある変更は慎重に
      if (scheduleData.memo?.includes('チーム') || 
          scheduleData.memo?.includes('全員') ||
          scheduleData.memo?.includes('共有')) {
        return false;
      }
    }
    
    return true;
  };

  // Phase 2: 中リスク変更のバリデーション
  const validateMediumRiskChange = (scheduleData: Schedule, changeType: 'low' | 'medium' | 'high'): { isValid: boolean; reason?: string } => {
    if (changeType !== 'medium') return { isValid: true };
    
    // 1. タイトルの長さチェック
    if (scheduleData.memo && scheduleData.memo.length > 100) {
      return { isValid: false, reason: 'タイトルが長すぎます（100文字以内）' };
    }
    
    // 2. 禁止文字のチェック
    const forbiddenChars = ['<', '>', '&', '"', "'"];
    if (scheduleData.memo && forbiddenChars.some(char => scheduleData.memo!.includes(char))) {
      return { isValid: false, reason: '禁止文字が含まれています' };
    }
    
    // 3. ステータスの妥当性チェック
    const validStatuses = ['working', 'break', 'meeting', 'off', 'unplanned'];
    if (!validStatuses.includes(scheduleData.status)) {
      return { isValid: false, reason: '無効なステータスです' };
    }
    
    // 4. 時間の妥当性チェック
    if (scheduleData.start >= scheduleData.end) {
      return { isValid: false, reason: '開始時刻は終了時刻より前である必要があります' };
    }
    
    // 5. 勤務時間の妥当性チェック
    const workingHours = scheduleData.end - scheduleData.start;
    if (workingHours > 12) { // 12時間以上の連続勤務
      return { isValid: false, reason: '連続勤務時間が長すぎます（12時間以内）' };
    }
    
    return { isValid: true };
  };

  // 楽観的更新用スケジュールデータ作成（Phase 2対応）
  const createOptimisticSchedule = (formData: Schedule, existingSchedule: Schedule | null = null): Schedule => {
    // 新規作成の場合は一時IDを生成、更新の場合は既存IDを使用
    const isNewSchedule = !existingSchedule || !existingSchedule.id;
    const tempId = isNewSchedule ? OptimisticUpdateManager.generateTempId() : existingSchedule.id;
    
    // 深くコピーしてからオプショナルプロパティを設定
    const optimisticSchedule: Schedule = {
      ...JSON.parse(JSON.stringify(formData)),
      id: tempId,
      _isOptimistic: true,
      _originalId: isNewSchedule ? null : existingSchedule?.id, // 新規作成時はnull
      _timestamp: Date.now()
    };
    
    // 必須フィールドの検証
    if (!optimisticSchedule.staffId || !optimisticSchedule.status) {
      throw new Error('楽観的更新: 必須フィールドが不足しています');
    }
    
    if (isDebugEnabled()) {
      console.log('📋 楽観的スケジュール作成:', {
        isNewSchedule,
        tempId,
        originalId: existingSchedule?.id,
        optimisticSchedule
      });
    }
    
    return optimisticSchedule;
  };

  // 📝 Phase 1: 統合された部分更新システム
  const optimizedScheduleUpdateRef = useRef<{
    add: (newSchedule: ScheduleFromDB) => void;
    update: (updatedSchedule: ScheduleFromDB) => void;
    delete: (id: string | number) => void;
  } | null>(null);

  // 部分更新システムの初期化
  const initializeOptimizedScheduleUpdate = useCallback(() => {
    return {
      add: (newSchedule: ScheduleFromDB) => {
        const startTime = performance.now();
        try {
          if (isDebugEnabled()) console.log('🔄 部分更新: スケジュール追加:', newSchedule);
          
          // 既存の変換ロジック
          const convertedSchedule: Schedule = {
            id: newSchedule.id,
            staffId: newSchedule.staffId,
            status: newSchedule.status,
            start: typeof newSchedule.start === 'number' ? newSchedule.start : timeStringToHours(newSchedule.start),
            end: typeof newSchedule.end === 'number' ? newSchedule.end : timeStringToHours(newSchedule.end),
            memo: newSchedule.memo,
            layer: newSchedule.layer || 'adjustment',
            isHistorical: false
          };
          
          setSchedules(prevSchedules => {
            // 厳密な重複チェック
            const duplicateCheck = prevSchedules.filter(s => {
              const sId = String(s.id);
              const targetId = String(convertedSchedule.id);
              
              // 完全一致
              if (sId === targetId) return true;
              
              // 複合ID内の数値IDチェック
              if (sId.includes(`_${targetId}_`)) return true;
              
              // 楽観的更新の一時IDチェック（強化版）
              if (s._isOptimistic && s._originalId && String(s._originalId) === targetId) return true;
              if (s._isOptimistic && String(s.id) === targetId) return true; // 一時ID自体との照合
              if ((newSchedule as any)._isOptimistic && (newSchedule as any)._originalId && String((newSchedule as any)._originalId) === String(s.id)) return true; // 逆方向照合
              
              // 同じstaffIdと時間帯での重複チェック
              if (s.staffId === convertedSchedule.staffId && 
                  s.start === convertedSchedule.start && 
                  s.end === convertedSchedule.end && 
                  s.status === convertedSchedule.status) {
                return true;
              }
              
              return false;
            });
            
            if (duplicateCheck.length > 0) {
              console.warn('⚠️ 重複スケジュール検出:', {
                newSchedule: convertedSchedule.id,
                duplicates: duplicateCheck.map(s => ({ id: s.id, _isOptimistic: s._isOptimistic, _originalId: s._originalId }))
              });
              return prevSchedules;
            }
            
            const updatedSchedules = [...prevSchedules, convertedSchedule];
            if (isDebugEnabled()) console.log('✅ スケジュール追加成功:', convertedSchedule.id);
            
            // 視覚的フィードバック（楽観的更新対応）
            const isOptimistic = (newSchedule as any)._isOptimistic;
            setScheduleFeedback(convertedSchedule.id, 'added', isOptimistic ? 1000 : 2500);
            
            return updatedSchedules;
          });
          
          const duration = performance.now() - startTime;
          setOptimizationMetrics(prev => ({
            ...prev,
            successCount: prev.successCount + 1,
            averageUpdateTime: (prev.averageUpdateTime + duration) / 2
          }));
          
        } catch (error) {
          console.error('部分更新(追加)エラー:', error);
          setOptimizationMetrics(prev => ({
            ...prev,
            errorCount: prev.errorCount + 1,
            fallbackCount: prev.fallbackCount + 1
          }));
        }
      },
      
      update: (updatedSchedule: ScheduleFromDB) => {
        const startTime = performance.now();
        try {
          if (isDebugEnabled()) console.log('🔄 部分更新: スケジュール更新:', updatedSchedule);
          
          const convertedSchedule: Schedule = {
            id: updatedSchedule.id,
            staffId: updatedSchedule.staffId,
            status: updatedSchedule.status,
            start: typeof updatedSchedule.start === 'number' ? updatedSchedule.start : timeStringToHours(updatedSchedule.start),
            end: typeof updatedSchedule.end === 'number' ? updatedSchedule.end : timeStringToHours(updatedSchedule.end),
            memo: updatedSchedule.memo,
            layer: updatedSchedule.layer || 'adjustment',
            isHistorical: false
          };
          
          setSchedules(prevSchedules => {
            // 削除→作成方式（厳密なID照合）
            const withoutOld = prevSchedules.filter(s => {
              const sId = String(s.id);
              const targetId = String(updatedSchedule.id);
              
              // 完全一致チェック
              if (sId === targetId) return false;
              
              // 複合ID内の数値IDチェック（例: 'adjustment_adj_18_55' と 18）
              if (sId.includes(`_${targetId}_`)) return false;
              
              // 楽観的更新の一時IDチェック（強化版）
              if (s._isOptimistic && s._originalId && String(s._originalId) === targetId) return false;
              if (s._isOptimistic && String(s.id) === targetId) return false; // 一時ID自体との照合
              if ((updatedSchedule as any)._isOptimistic && (updatedSchedule as any)._originalId && String((updatedSchedule as any)._originalId) === String(s.id)) return false; // 逆方向照合
              
              // 同じstaffIdと時間帯での重複チェック
              if (s.staffId === convertedSchedule.staffId && 
                  s.start === convertedSchedule.start && 
                  s.end === convertedSchedule.end && 
                  s.status === convertedSchedule.status) {
                return false;
              }
              
              return true;
            });
            
            const updatedSchedules = [...withoutOld, convertedSchedule];
            if (isDebugEnabled()) console.log('✅ スケジュール更新成功:', convertedSchedule.id);
            
            // 視覚的フィードバック（楽観的更新対応）
            const isOptimistic = (updatedSchedule as any)._isOptimistic;
            setScheduleFeedback(convertedSchedule.id, 'updated', isOptimistic ? 1000 : 2500);
            
            return updatedSchedules;
          });
          
          const duration = performance.now() - startTime;
          setOptimizationMetrics(prev => ({
            ...prev,
            successCount: prev.successCount + 1,
            averageUpdateTime: (prev.averageUpdateTime + duration) / 2
          }));
          
        } catch (error) {
          console.error('部分更新(更新)エラー:', error);
          setOptimizationMetrics(prev => ({
            ...prev,
            errorCount: prev.errorCount + 1,
            fallbackCount: prev.fallbackCount + 1
          }));
        }
      },
      
      delete: (id: string | number) => {
        const startTime = performance.now();
        try {
          if (isDebugEnabled()) console.log('🔄 部分更新: スケジュール削除:', id);
          
          setSchedules(prevSchedules => {
            const withoutDeleted = prevSchedules.filter(s => {
              const sId = String(s.id);
              const targetId = String(id);
              if (sId === targetId) return false;
              if (sId.includes(`_${targetId}_`)) return false;
              return true;
            });
            
            if (isDebugEnabled()) console.log('✅ スケジュール削除成功:', id);
            
            return withoutDeleted;
          });
          
          const duration = performance.now() - startTime;
          setOptimizationMetrics(prev => ({
            ...prev,
            successCount: prev.successCount + 1,
            averageUpdateTime: (prev.averageUpdateTime + duration) / 2
          }));
          
        } catch (error) {
          console.error('部分更新(削除)エラー:', error);
          setOptimizationMetrics(prev => ({
            ...prev,
            errorCount: prev.errorCount + 1,
            fallbackCount: prev.fallbackCount + 1
          }));
        }
      }
    };
  }, [isDebugEnabled]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  
  // 🛡️ 開発者向けデバッグ・監視機能（グローバル公開）
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // Phase 1 監視・制御機能
      (window as any).optimizationControl = {
        // 状態確認
        getStatus: () => ({
          enabled: enableOptimizedUpdates,
          metrics: optimizationMetrics,
          safetyLog: optimizedScheduleUpdateLegacyRef.current,
          // Phase 1: 楽観的更新の状態
          optimisticUpdates: {
            pending: Array.from(OptimisticUpdateManager.pendingUpdates.entries()),
            pendingCount: OptimisticUpdateManager.pendingUpdates.size
          }
        }),
        
        // 手動制御
        enable: () => setEnableOptimizedUpdates(true),
        disable: () => setEnableOptimizedUpdates(false),
        toggle: () => setEnableOptimizedUpdates(prev => !prev),
        
        // メトリクスリセット
        resetMetrics: () => setOptimizationMetrics({
          successCount: 0, errorCount: 0, fallbackCount: 0, averageUpdateTime: 0
        }),
        
        // Phase 1: 楽観的更新制御
        optimistic: {
          // 楽観的更新のクリア
          clearPending: () => OptimisticUpdateManager.clearAllPending(),
          
          // 特定の楽観的更新をロールバック
          rollback: (tempId: string) => OptimisticUpdateManager.rollbackUpdate(tempId),
          
          // 楽観的更新の詳細確認
          inspect: (tempId: string) => OptimisticUpdateManager.pendingUpdates.get(tempId),
          
          // 更新リスクレベルの確認
          getRiskLevels: () => UPDATE_RISK_LEVELS,
          
          // 変更タイプテスト
          testChangeType: (newData: any, originalData: any) => detectChangeType(newData, originalData),
          
          // 楽観的更新判定テスト
          testOptimisticUpdate: (changeType: string, scheduleData: any, isNewCreation: boolean = false) => 
            shouldUseOptimisticUpdate(changeType as any, scheduleData, isNewCreation),
          
          // Phase 1 & 2: 実際の動作テスト機能
          testOptimisticFlow: (scheduleData: any) => {
            console.log('🧪 楽観的更新フローテスト開始');
            
            // 1. リスク判定テスト
            const changeType = detectChangeType(scheduleData, null);
            const shouldUse = shouldUseOptimisticUpdate(changeType, scheduleData, false);
            console.log('📊 リスク判定結果:', { changeType, shouldUse });
            
            // 2. 楽観的スケジュール作成テスト
            const optimisticSchedule = createOptimisticSchedule(scheduleData, null);
            console.log('📋 楽観的スケジュール作成:', optimisticSchedule);
            
            // 3. 一時ID生成テスト
            const tempId = OptimisticUpdateManager.generateTempId();
            console.log('🔢 一時ID生成:', tempId);
            
            // 4. 追跡開始テスト
            OptimisticUpdateManager.trackOptimisticUpdate(tempId, null, 'create', changeType);
            console.log('📍 追跡開始完了');
            
            // 5. 部分更新テスト
            const optimizedScheduleUpdate = optimizedScheduleUpdateRef.current;
            if (optimizedScheduleUpdate) {
              console.log('🔄 部分更新実行テスト');
              // 実際の部分更新をテスト
              const scheduleForUpdate: ScheduleFromDB = {
                id: typeof optimisticSchedule.id === 'string' ? 
                    parseInt(optimisticSchedule.id.replace(/[^0-9]/g, '')) || Date.now() : 
                    Number(optimisticSchedule.id),
                staffId: optimisticSchedule.staffId,
                status: optimisticSchedule.status,
                start: String(optimisticSchedule.start),
                end: String(optimisticSchedule.end),
                memo: optimisticSchedule.memo,
                layer: optimisticSchedule.layer === 'historical' ? 'adjustment' : 
                       (optimisticSchedule.layer || 'adjustment')
              };
              optimizedScheduleUpdate.add(scheduleForUpdate);
            }
            
            // 6. 状態確認
            console.log('📈 現在の状態:', (window as any).optimizationControl?.getStatus());
            
            // 7. 自動クリーンアップ（5秒後）
            setTimeout(() => {
              OptimisticUpdateManager.rollbackUpdate(tempId);
              console.log('🧹 テストデータクリーンアップ完了');
            }, 5000);
            
            return {
              changeType,
              shouldUse,
              optimisticSchedule,
              tempId,
              success: true
            };
          },
          
          // Phase 2: 中リスク変更のテスト機能
          testMediumRiskValidation: (scheduleData: any) => {
            console.log('🧪 中リスク変更バリデーションテスト開始');
            
            const changeType = detectChangeType(scheduleData, null);
            const validation = validateMediumRiskChange(scheduleData, changeType);
            
            console.log('📊 バリデーション結果:', {
              changeType,
              validation,
              scheduleData
            });
            
            return {
              changeType,
              validation,
              scheduleData,
              success: validation.isValid
            };
          },
          
          // Phase 2: 営業時間チェックテスト
          testBusinessHoursCheck: () => {
            const currentHour = new Date().getHours();
            const isBusinessHours = currentHour >= 9 && currentHour <= 18;
            
            console.log('🕐 営業時間チェック:', {
              currentHour,
              isBusinessHours,
              recommendation: isBusinessHours ? '中リスク楽観的更新OK' : '中リスク楽観的更新NG'
            });
            
            return {
              currentHour,
              isBusinessHours,
              success: true
            };
          }
        },
        
        // 強制フォールバック（緊急時）
        forceFullRefresh: () => {
          console.log('🚨 Manual full refresh triggered');
          setEnableOptimizedUpdates(false);
          fetchData(displayDate);
        },
        
        // 監視ログ表示
        showLog: () => {
          console.group('🛡️ 部分更新システム監視状況');
          console.log('有効状態:', enableOptimizedUpdates);
          console.log('成功:', optimizationMetrics.successCount);
          console.log('エラー:', optimizationMetrics.errorCount);
          console.log('フォールバック:', optimizationMetrics.fallbackCount);
          console.log('平均処理時間:', optimizationMetrics.averageUpdateTime.toFixed(2), 'ms');
          console.log('📊 Phase 2 完全部分更新:', optimizationMetrics.partialUpdateCount || 0);
          console.log('🕐 最終部分更新時刻:', optimizationMetrics.lastPartialUpdateTime || 'None');
          console.log('最終更新:', optimizedScheduleUpdateRef.current ? 'System Active' : 'System Inactive');
          console.groupEnd();
        },
        
        // Phase 1 テスト機能
        testPartialUpdate: () => {
          if (!enableOptimizedUpdates) {
            console.warn('⚠️ 部分更新が無効です。まず enable() を実行してください');
            return;
          }
          
          console.group('🧪 Phase 1 部分更新テスト開始');
          console.log('現在のスケジュール数:', schedules.length);
          console.log('テスト用の仮想WebSocket更新をシミュレート中...');
          
          // 仮想的な新規スケジュール
          const testSchedule = {
            id: Date.now(), // 一意なID
            staffId: staffList[0]?.id || 1,
            status: 'online',
            start: 9.0,
            end: 18.0,
            memo: 'Phase 1 テスト用スケジュール',
            layer: 'adjustment'
          };
          
          console.log('テスト用スケジュール:', testSchedule);
          // 安全性チェック関数は別途定義されているため、テスト時は省略
          console.groupEnd();
          
          return testSchedule;
        },
        
        // Phase 2 テスト機能
        testPhase2PartialUpdate: () => {
          if (!enableOptimizedUpdates) {
            console.warn('⚠️ 部分更新が無効です。まず enable() を実行してください');
            return;
          }
          
          console.group('🚀 Phase 2 完全部分更新テスト開始');
          console.log('現在のスケジュール数:', schedules.length);
          console.log('低リスク変更（メモのみ）の完全部分更新をテスト中...');
          
          // 既存のスケジュールを取得
          const existingSchedule = schedules.find(s => s.memo);
          if (!existingSchedule) {
            console.warn('⚠️ メモ付きスケジュールが見つかりません');
            console.groupEnd();
            return;
          }
          
          console.log('テスト対象スケジュール:', existingSchedule);
          
          // 低リスク変更の判定テスト
          const testData = {
            ...existingSchedule,
            memo: existingSchedule.memo + ' [Phase 2テスト]'
          };
          
          const changeType = detectChangeType(testData, existingSchedule);
          const shouldUse = shouldUseOptimisticUpdate(changeType, testData, false);
          
          console.log('📊 Phase 2 テスト結果:', {
            changeType,
            shouldUse,
            isLowRisk: changeType === 'low',
            willSkipFetchData: changeType === 'low' && shouldUse
          });
          
          console.groupEnd();
          return { testData, changeType, shouldUse };
        }
      };
      
      if (isDebugEnabled()) {
        console.log('🛡️ 並行実装制御システム初期化完了');
        console.log('💡 使用方法:');
        console.log('  window.optimizationControl.getStatus() - 状態確認');
        console.log('  window.optimizationControl.enable() - 部分更新有効化');
        console.log('  window.optimizationControl.disable() - 部分更新無効化');
        console.log('  window.optimizationControl.showLog() - 監視ログ表示');
        console.log('  window.optimizationControl.forceFullRefresh() - 緊急時全体更新');
        console.log('  window.optimizationControl.testPhase2PartialUpdate() - Phase 2テスト');
      }
    }
  }, [enableOptimizedUpdates, optimizationMetrics, displayDate]);

  // 折れ線グラフ表示設定をlocalStorageに保存
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('showLineChart', JSON.stringify(showLineChart));
    }
  }, [showLineChart]);

  // 祝日データを初期化
  useEffect(() => {
    fetchHolidays().then(setHolidays);
  }, []);

  // 部署・グループ設定を取得
  const fetchDepartmentSettings = useCallback(async () => {
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${currentApiUrl}/department-settings`);
      if (response.ok) {
        const data = await response.json();
        setDepartmentSettings(data);
      }
    } catch (error) {
      console.warn('Failed to fetch department settings:', error);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    fetchDepartmentSettings();
  }, [fetchDepartmentSettings]);

  // 支援先の短縮テキストを生成（グループのみ）
  const getSupportDestinationText = useCallback((staff: Staff): string => {
    if (!staff.isSupporting || !staff.currentGroup) {
      return '不明';
    }

    // グループの設定から短縮名を取得
    const groupSetting = departmentSettings.groups.find(g => g.name === staff.currentGroup);
    const shortGroup = groupSetting?.shortName || staff.currentGroup;

    return shortGroup;
  }, [departmentSettings]);

  // 16進数カラーをrgbaに変換する関数
  const hexToRgba = useCallback((hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }, []);

  // 支援先グループの枠線色を取得
  const getSupportBorderColor = useCallback((staff: Staff): string | null => {
    if (!staff.isSupporting || !staff.currentGroup) {
      return null;
    }

    // グループの設定から背景色を取得して枠線色として使用
    const groupSetting = departmentSettings.groups.find(g => g.name === staff.currentGroup);
    return groupSetting?.backgroundColor || null;
  }, [departmentSettings]);

  
  const fetchData = useCallback(async (date: Date) => {
    setIsLoading(true);
    // JST基準の日付文字列を生成（CLAUDE.md厳格ルール準拠）
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    const currentApiUrl = getApiUrl();
    try {
      if (isDebugEnabled()) {
        // console.log('=== fetchData START ===');
        // console.log('fetchData引数のDateオブジェクト:', date);
        // console.log('fetchData引数のISO文字列:', date.toISOString());
        // console.log('Fetching data for date:', dateString);
        // console.log('API URL:', currentApiUrl);
      }
      
      // スタッフとスケジュールデータを統合API（履歴対応）で取得
      // マスキング設定も含めて送信
      const maskingParam = maskingEnabled ? 'true' : 'false';
      const scheduleRes = await fetch(`${currentApiUrl}/schedules/unified?date=${dateString}&includeMasking=${maskingParam}`);
      
      if (!scheduleRes.ok) throw new Error(`Unified API response was not ok`);
      
      const scheduleData: { 
        staff: Staff[], 
        schedules: ScheduleFromDB[], 
        isHistorical?: boolean,
        snapshotDate?: string,
        recordCount?: number,
        message?: string
      } = await scheduleRes.json();
      
      if (isDebugEnabled()) {
        console.log('📊 API統計:', {
          isHistorical: scheduleData.isHistorical,
          snapshotDate: scheduleData.snapshotDate,
          recordCount: scheduleData.recordCount,
          schedulesCount: scheduleData.schedules?.length || 0,
          staffCount: scheduleData.staff?.length || 0
        });
      }
      // 支援データを取得
      let supportData = { assignments: [] };
      try {
        const supportRes = await fetch(`${getApiUrl()}/daily-assignments?date=${dateString}`);
        if (supportRes.ok) {
          supportData = await supportRes.json();
          // console.log('Support (daily-assignments) data fetched:', supportData);
        } else {
          console.warn('Support API failed:', supportRes.status);
        }
      } catch (error) {
        console.warn('Failed to fetch support data:', error);
      }
      
      // 統一担当設定データを読み込み（データを直接取得）
      const currentResponsibilityData = await loadSingleDateResponsibilities(date);
      
      // 部署設定データを取得
      try {
        const departmentRes = await authenticatedFetch(`${getApiUrl()}/department-settings`);
        if (departmentRes.ok) {
          const deptData = await departmentRes.json();
          setDepartmentSettings(deptData);
          // console.log('Department settings data fetched:', deptData);
        } else {
          console.warn('Department settings API failed:', departmentRes.status);
        }
      } catch (error) {
        console.warn('Failed to fetch department settings data:', error);
      }
      
      // console.log('Schedule data received:', scheduleData);
      // console.log('Support data received:', supportData);
      // console.log('Responsibility data received:', responsibilityData);
      
      // O(1)アクセス用のMapを作成
      const supportAssignmentMap = new Map<number, any>();
      supportData.assignments?.forEach((assignment: any) => {
        if (assignment.type === 'temporary') {
          supportAssignmentMap.set(assignment.staffId, assignment);
        }
      });
      
      
      // 支援状況と担当設定をスタッフデータにマージ（O(1)アクセス）
      const staffWithSupportAndResponsibility = scheduleData.staff.map(staff => {
        // O(1)でMap検索
        const tempAssignment = supportAssignmentMap.get(staff.id);
        
        let result = { ...staff };
        
        // 支援状況をマージ
        if (tempAssignment) {
          result = {
            ...result,
            isSupporting: true,
            originalDept: staff.department,
            originalGroup: staff.group,
            currentDept: tempAssignment.tempDept,
            currentGroup: tempAssignment.tempGroup,
            supportInfo: {
              startDate: tempAssignment.startDate,
              endDate: tempAssignment.endDate,
              reason: tempAssignment.reason
            }
          };
        } else {
          result.isSupporting = false;
        }
        
        // 担当設定データを統一システムから取得・統合（直接取得したデータを使用）
        const responsibilityKey = `${staff.id}-${format(date, 'yyyy-MM-dd')}`;
        const responsibilityData = currentResponsibilityData[responsibilityKey] || null;
        const hasResponsibilitiesResult = responsibilityData !== null && hasResponsibilityData(responsibilityData);
        
        result.hasResponsibilities = hasResponsibilitiesResult;
        result.responsibilities = responsibilityData as any; // 既存モーダル互換性のためデータを統合
        
        // 受付部署の判定
        result.isReception = staff.department.includes('受付') || staff.group.includes('受付');
        
        return result;
      });
      
      setStaffList(staffWithSupportAndResponsibility);
      
      
      // 履歴データ状態を更新
      setIsHistoricalMode(!!scheduleData.isHistorical);
      setHistoricalInfo({
        snapshotDate: scheduleData.snapshotDate,
        recordCount: scheduleData.recordCount,
        message: scheduleData.message
      });

      // バックエンドからJST小数点時刻で返されるスケジュールをそのまま使用
      // console.log('Raw schedules from backend:', scheduleData.schedules);
      const convertedSchedules: Schedule[] = scheduleData.schedules.map(s => ({
        id: s.id,
        staffId: s.staffId,
        status: s.status,
        start: typeof s.start === 'number' ? s.start : timeStringToHours(s.start),
        end: typeof s.end === 'number' ? s.end : timeStringToHours(s.end),
        memo: s.memo,
        layer: s.layer,  // layer情報を保持
        isHistorical: !!scheduleData.isHistorical  // 履歴フラグを設定
      }));
      // console.log('Converted schedules:', convertedSchedules);
      setSchedules(convertedSchedules);
      // console.log('=== fetchData SUCCESS ===');
    } catch (error) { 
      console.error('=== fetchData ERROR ===');
      console.error('データの取得に失敗しました', error); 
    } 
    finally { 
      setIsLoading(false);
      
      // リアルタイム更新時のスクロール位置復元
      if (realTimeUpdateEnabled && scrollPositionBeforeUpdate.current.y > 50) {
        setTimeout(() => {
          window.scrollTo(0, scrollPositionBeforeUpdate.current.y);
          if (scrollPositionBeforeUpdate.current.x > 0 && bottomScrollRef.current) {
            bottomScrollRef.current.scrollLeft = scrollPositionBeforeUpdate.current.x;
            if (topScrollRef.current) {
              topScrollRef.current.scrollLeft = scrollPositionBeforeUpdate.current.x;
            }
          }
        }, 50);
      }
    }
  }, [maskingEnabled, loadSingleDateResponsibilities, realTimeUpdateEnabled]);
  
  useEffect(() => {
    fetchData(displayDate);
  }, [displayDate, fetchData]);

  // ページフォーカス時に担当設定データを自動更新
  useEffect(() => {
    const handleFocus = () => {
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  useEffect(() => {
    // Phase 1: 部分更新システムの初期化
    optimizedScheduleUpdateRef.current = initializeOptimizedScheduleUpdate();
    
    // Phase 1: ヘルスチェック開始
    const cleanupHealthCheck = OptimisticUpdateManager.startHealthCheck();
    
    // WebSocket接続条件チェック
    const isWebSocketEnabled = (process.env.NEXT_PUBLIC_ENABLE_WEBSOCKET === 'true' || 
                               process.env.NEXT_PUBLIC_FORCE_WEBSOCKET === 'true' ||
                               window.location.hostname !== 'localhost') &&
                               realTimeUpdateEnabled; // リアルタイム更新が有効な場合のみ接続
    
    if (!isWebSocketEnabled) {
      // console.log('WebSocket接続が無効化されています (環境設定またはユーザー設定により)');
      return;
    }
    
    // console.log('🔌 WebSocket接続を開始します:', getApiUrl());
    
    const currentApiUrl = getApiUrl();
    
    // WebSocket接続URL生成（HTTPS環境対応）
    const getWebSocketUrl = (apiUrl: string): string => {
      // HTTPS環境では、APIのURLが「https://hostname/api」形式なので、
      // WebSocketは「https://hostname」をベースにする
      if (apiUrl.startsWith('https://')) {
        return apiUrl.replace('/api', '');
      }
      return apiUrl;
    };
    
    const wsUrl = getWebSocketUrl(currentApiUrl);
    const socket: Socket = io(wsUrl);
    
    // WebSocket重複処理防止用
    const processedScheduleIds = new Set<string>();
    
    // WebSocket接続イベントのログ
    socket.on('connect', () => {
      // console.log('✅ WebSocket接続成功:', currentApiUrl);
    });
    
    // 🔧 統一的な重複チェック関数（デバッグ強化版）
    const isScheduleDuplicate = (existingSchedules: Schedule[], newSchedule: ScheduleFromDB): boolean => {
      const duplicateResult = existingSchedules.some(existing => {
        const existingId = String(existing.id);
        const newId = String(newSchedule.id);
        
        // ID完全一致チェック（新規作成対応版）
        if (existingId === newId) {
          // 🎯 新規作成時の特別処理：楽観的更新なしスケジュールは重複扱いしない
          if (!existing._isOptimistic) {
            console.log('🆕 新規作成スケジュール検出: 重複チェックをスキップ（他ブラウザからの正当な追加）', {
              existingId,
              newId,
              existingIsOptimistic: existing._isOptimistic
            });
            return false; // 重複として扱わない
          }
          
          console.log('🚨 ID完全一致による重複検出:', {
            existingId,
            newId,
            existingSchedule: {
              id: existing.id,
              staffId: existing.staffId,
              start: existing.start,
              end: existing.end,
              status: existing.status,
              isOptimistic: existing._isOptimistic
            },
            newSchedule: {
              id: newSchedule.id,
              staffId: newSchedule.staffId,
              start: newSchedule.start,
              end: newSchedule.end,
              status: newSchedule.status
            }
          });
          return true;
        }
        
        // 楽観的更新の元IDチェック
        if (existing._originalId && String(existing._originalId) === newId) return true;
        
        // 🎯 同一内容チェック（楽観的更新があるときのみ）
        // 新規作成時（楽観的更新なし）は同一内容でも別々の予定として扱う
        if (existing._isOptimistic && 
            existing.staffId === newSchedule.staffId &&
            Math.abs(existing.start - (typeof newSchedule.start === 'number' ? newSchedule.start : timeStringToHours(newSchedule.start))) < 0.1 &&
            Math.abs(existing.end - (typeof newSchedule.end === 'number' ? newSchedule.end : timeStringToHours(newSchedule.end))) < 0.1 &&
            existing.status === newSchedule.status) {
          console.log('🔍 楽観的更新による同一内容重複検出:', { existing: existingId, new: newId });
          return true;
        }
        
        return false;
      });
      
      if (duplicateResult) {
        console.log('⚠️ 重複判定結果: TRUE - スケジュール追加をスキップ');
      } else {
        console.log('✅ 重複判定結果: FALSE - スケジュール追加を継続');
      }
      
      return duplicateResult;
    };
    
    socket.on('disconnect', (reason) => {
      // console.log('❌ WebSocket接続切断:', reason);
    });
    
    socket.on('connect_error', (error) => {
      console.error('🚨 WebSocket接続エラー:', error);
    });
    
    // 🛡️ 安全な並行実装ロジック（Phase 1）
    
    // 現行システムの安全なフォールバック（既存実装の完全保護）
    const safeFullRefresh = (reason: string) => {
      console.log(`🔄 Safe fallback triggered: ${reason}`);
      optimizedScheduleUpdateLegacyRef.current.fallbackCount++;
      
      // スクロール位置保存（既存ロジックと同じ）
      scrollPositionBeforeUpdate.current = {
        x: bottomScrollRef.current?.scrollLeft || 0,
        y: window.pageYOffset || window.scrollY || 0
      };
      
      // 既存の安全な全体更新
      fetchData(displayDate);
    };
    
    // 安全性チェック関数
    const isSafeForOptimizedUpdate = (schedule: ScheduleFromDB): boolean => {
      // 段階的にリスクを最小化した条件
      try {
        // 基本的なデータ整合性チェック
        if (!schedule || !schedule.staffId || !schedule.start) {
          return false;
        }
        
        // 複雑な機能との組み合わせは避ける（安全第一）
        if (schedule.memo?.includes('複合予定') || 
            schedule.memo?.includes('カスタム') ||
            schedule.memo?.includes('月次プランナー')) {
          return false;
        }
        
        // adjustment層のみ（日付制限を削除、未来のページでも部分更新を許可）
        const isAdjustmentLayer = !schedule.layer || schedule.layer === 'adjustment';
        
        if (isDebugEnabled()) {
          console.log('🔍 安全性チェック:', {
            scheduleId: schedule.id,
            layer: schedule.layer,
            isAdjustmentLayer,
            start: schedule.start,
            memo: schedule.memo
          });
        }
        
        return isAdjustmentLayer;
      } catch (error) {
        console.warn('Safety check failed:', error);
        return false;
      }
    };
    
    // 部分更新実装（非常に慎重なアプローチ）
    const optimizedScheduleUpdate = {
      add: (newSchedule: ScheduleFromDB) => {
        const startTime = performance.now();
        try {
          if (!isSafeForOptimizedUpdate(newSchedule)) {
            console.warn('⚠️ 安全性チェック失敗 - 手動部分更新で継続（追加）');
            // Phase 3: 安全性チェック失敗時も部分更新で処理
          }
          
          // 部分更新: 新規スケジュール追加
          if (isDebugEnabled()) console.log('部分更新: スケジュール追加開始:', newSchedule);
          
          // 既存の変換ロジックを安全に再利用
          const convertedSchedule: Schedule = {
            id: newSchedule.id,
            staffId: newSchedule.staffId,
            status: newSchedule.status,
            start: typeof newSchedule.start === 'number' ? newSchedule.start : timeStringToHours(newSchedule.start),
            end: typeof newSchedule.end === 'number' ? newSchedule.end : timeStringToHours(newSchedule.end),
            memo: newSchedule.memo,
            layer: newSchedule.layer || 'adjustment',
            isHistorical: false
          };
          
          // 既存のschedules状態を安全に更新
          setSchedules(prevSchedules => {
            // 重複チェック（安全性確保）
            const existingIndex = prevSchedules.findIndex(s => s.id === convertedSchedule.id);
            if (existingIndex >= 0) {
              console.warn('⚠️ 重複スケジュール検出 - 部分更新で処理:', convertedSchedule.id);
              // Phase 3: 重複時も部分更新で処理（既存を更新）
              return prevSchedules.map(s => 
                s.id === convertedSchedule.id ? convertedSchedule : s
              );
            }
            
            // 新しいスケジュールを安全に追加
            const updatedSchedules = [...prevSchedules, convertedSchedule];
            if (isDebugEnabled()) console.log('✅ スケジュール追加成功:', convertedSchedule.id);
            
            // === Phase 2a: 視覚的フィードバック適用 ===
            setScheduleFeedback(convertedSchedule.id, 'added', 2500);
            
            // 更新時刻を記録
            (optimizedScheduleUpdateRef.current as any).lastUpdate = new Date();
            
            return updatedSchedules;
          });
          
          const duration = performance.now() - startTime;
          setOptimizationMetrics(prev => ({
            ...prev,
            successCount: prev.successCount + 1,
            averageUpdateTime: (prev.averageUpdateTime + duration) / 2
          }));
        } catch (error) {
          console.error('Optimized add failed:', error);
          setOptimizationMetrics(prev => ({
            ...prev,
            errorCount: prev.errorCount + 1
          }));
          console.error('Phase 3: 部分更新でエラー処理（追加）', error);
        }
      },
      
      update: (updatedSchedule: ScheduleFromDB) => {
        const startTime = performance.now();
        try {
          if (!isSafeForOptimizedUpdate(updatedSchedule)) {
            console.warn('⚠️ 安全性チェック失敗 - 手動部分更新で継続（更新）');
            // Phase 3: 安全性チェック失敗時も部分更新で処理
          }
          
          // 部分更新: スケジュール更新（削除→新規作成方式）
          if (isDebugEnabled()) console.log('部分更新: スケジュール更新開始 (削除→新規作成):', updatedSchedule);
          
          // 既存の変換ロジックを安全に再利用
          const convertedSchedule: Schedule = {
            id: updatedSchedule.id,
            staffId: updatedSchedule.staffId,
            status: updatedSchedule.status,
            start: typeof updatedSchedule.start === 'number' ? updatedSchedule.start : timeStringToHours(updatedSchedule.start),
            end: typeof updatedSchedule.end === 'number' ? updatedSchedule.end : timeStringToHours(updatedSchedule.end),
            memo: updatedSchedule.memo,
            layer: updatedSchedule.layer || 'adjustment',
            isHistorical: false
          };
          
          // 削除→新規作成方式でスケジュールを更新
          setSchedules(prevSchedules => {
            // 1. 既存要素を削除（超厳密なID照合）
            const withoutOld = prevSchedules.filter(s => {
              const sId = String(s.id);
              const targetId = String(updatedSchedule.id);
              
              // 完全一致チェック
              if (sId === targetId) return false;
              
              // 文字列ID内の数値IDチェック（例: 'adjustment_adj_18_55' と 18）
              if (sId.includes(`_${targetId}_`)) return false;
              
              // 楽観的更新の元IDチェック
              if (s._originalId && String(s._originalId) === targetId) return false;
              
              // 同一内容チェック（最後の砦）
              if (s.staffId === convertedSchedule.staffId && 
                  Math.abs(s.start - convertedSchedule.start) < 0.1 && 
                  Math.abs(s.end - convertedSchedule.end) < 0.1 && 
                  s.status === convertedSchedule.status) {
                console.log('🔍 同一内容による削除:', { existing: s.id, target: targetId });
                return false;
              }
              
              return true;
            });
            
            if (isDebugEnabled()) {
              console.log('🔍 削除→新規作成 デバッグ情報:', {
                updatedScheduleId: updatedSchedule.id,
                updatedScheduleIdType: typeof updatedSchedule.id,
                convertedScheduleId: convertedSchedule.id,
                convertedScheduleIdType: typeof convertedSchedule.id,
                beforeCount: prevSchedules.length,
                afterDeleteCount: withoutOld.length,
                removedCount: prevSchedules.length - withoutOld.length,
                existingIds: prevSchedules.map(s => s.id),
                targetIdFound: prevSchedules.some(s => {
                  const sId = String(s.id);
                  const targetId = String(updatedSchedule.id);
                  return sId === targetId || sId.includes(`_${targetId}_`);
                })
              });
              console.log('📋 existingIds:', prevSchedules.map(s => s.id));
              console.log('🎯 targetIdFound:', prevSchedules.some(s => {
                const sId = String(s.id);
                const targetId = String(updatedSchedule.id);
                return sId === targetId || sId.includes(`_${targetId}_`);
              }));
            }
            
            // 2. 新しい要素を追加
            const updatedSchedules = [...withoutOld, convertedSchedule];
            
            if (isDebugEnabled()) console.log('✅ スケジュール更新成功 (削除→新規作成):', convertedSchedule.id);
            
            // 更新時刻を記録
            (optimizedScheduleUpdateRef.current as any).lastUpdate = new Date();
            
            return updatedSchedules;
          });
          
          // === Phase 2a: 視覚的フィードバック適用 ===
          setScheduleFeedback(convertedSchedule.id, 'updated', 2500);
          
          const duration = performance.now() - startTime;
          setOptimizationMetrics(prev => ({
            ...prev,
            successCount: prev.successCount + 1,
            averageUpdateTime: (prev.averageUpdateTime + duration) / 2
          }));
        } catch (error) {
          console.error('Optimized update failed:', error);
          setOptimizationMetrics(prev => ({
            ...prev,
            errorCount: prev.errorCount + 1
          }));
          console.error('Phase 3: 部分更新でエラー処理（更新）', error);
        }
      },
      
      delete: (deletedId: number) => {
        const startTime = performance.now();
        try {
          // 部分更新: スケジュール削除
          if (isDebugEnabled()) console.log('部分更新: スケジュール削除開始:', deletedId);
          
          // 削除は最も安全な操作（データ追加ではないため）
          setSchedules(prevSchedules => {
            // 削除対象スケジュールの検索（後勝ちシステム対応版）
            // WebSocketの削除IDは物理IDなので、数値抽出＋時間比較が必要
            const existingIndex = prevSchedules.findIndex(s => {
              // 1. ID完全一致チェック（従来）
              if (String(s.id) === String(deletedId)) return true;
              
              // 2. 数値ID抽出によるマッチング（後勝ちシステム主要パターン）
              const extractNumericId = (id: string): string[] => {
                const numbers = id.match(/\d+/g) || [];
                return numbers;
              };
              
              const sNumbers = extractNumericId(String(s.id));
              const dNumbers = extractNumericId(String(deletedId));
              
              // 最も大きな数値IDが一致するかチェック（通常はこれが物理ID）
              if (sNumbers.length > 0 && dNumbers.length > 0) {
                const maxSId = Math.max(...sNumbers.map(n => parseInt(n)));
                const maxDId = Math.max(...dNumbers.map(n => parseInt(n)));
                if (maxSId === maxDId) {
                  if (isDebugEnabled()) console.log('🎯 削除マッチング成功（数値ID）:', {
                    existingId: s.id,
                    deleteId: deletedId,
                    matchedNumericId: maxSId
                  });
                  return true;
                }
              }
              
              return false;
            });
            
            if (existingIndex < 0) {
              console.error('⚠️ 削除対象スケジュール未発見、フォールバック実行:', deletedId);
              if (isDebugEnabled()) {
                console.error('🐛 詳細デバッグ情報:');
                console.error('  - 探しているID:', deletedId, typeof deletedId);
                console.error('  - 既存スケジュール数:', prevSchedules.length);
                console.error('  - 既存ID一覧:', prevSchedules.map(s => `${s.id}(${typeof s.id})`));
                console.error('  - 数値ID抽出テスト:');
                console.error('    - WebSocketのID:', deletedId, '→', String(deletedId).match(/\d+/g));
                console.error('    - 既存ID例:', prevSchedules.slice(0, 3).map(s => `${s.id} → ${String(s.id).match(/\d+/g)}`));
              }
              console.warn('Phase 3: 削除対象が見つからない - 部分更新で処理');
              return prevSchedules; // 状態変更なし
            }
            
            // === Phase 2a: 削除前のフィードバック設定 ===
            // 削除アニメーション用の短時間フィードバック
            setScheduleFeedback(deletedId, 'deleted', 1500);
            
            // 安全にスケジュールを削除（後勝ちシステム対応版）
            const updatedSchedules = prevSchedules.filter(s => {
              // 1. 完全一致チェック
              if (String(s.id) === String(deletedId)) return false;
              
              // 2. 数値ID抽出による削除判定
              const extractNumericId = (id: string): string[] => {
                const numbers = id.match(/\d+/g) || [];
                return numbers;
              };
              
              const sNumbers = extractNumericId(String(s.id));
              const dNumbers = extractNumericId(String(deletedId));
              
              // 最も大きな数値IDが一致する場合は削除対象
              if (sNumbers.length > 0 && dNumbers.length > 0) {
                const maxSId = Math.max(...sNumbers.map(n => parseInt(n)));
                const maxDId = Math.max(...dNumbers.map(n => parseInt(n)));
                if (maxSId === maxDId) return false;
              }
              
              return true; // 削除対象でない場合は保持
            });
            if (isDebugEnabled()) console.log('✅ スケジュール削除成功:', deletedId);
            
            // 更新時刻を記録
            (optimizedScheduleUpdateRef.current as any).lastUpdate = new Date();
            
            return updatedSchedules;
          });
          
          const duration = performance.now() - startTime;
          setOptimizationMetrics(prev => ({
            ...prev,
            successCount: prev.successCount + 1,
            averageUpdateTime: (prev.averageUpdateTime + duration) / 2
          }));
        } catch (error) {
          console.error('Optimized delete failed:', error);
          setOptimizationMetrics(prev => ({
            ...prev,
            errorCount: prev.errorCount + 1
          }));
          console.error('Phase 3: 部分更新でエラー処理（削除）', error);
        }
      }
    };
    
    // 🔄 既存WebSocketハンドラー（重複処理防止版・詳細デバッグ）
    const handleNewSchedule = (newSchedule: ScheduleFromDB) => {
        const scheduleId = String(newSchedule.id);
        
        console.log('📥 WebSocket新規スケジュール受信:', {
            scheduleId,
            alreadyProcessed: processedScheduleIds.has(scheduleId),
            processedIdsCount: processedScheduleIds.size,
            recentProcessedIds: Array.from(processedScheduleIds).slice(-5)
        });
        
        // 🚫 重複処理防止チェック
        if (processedScheduleIds.has(scheduleId)) {
            console.log('🚫 WebSocket重複処理防止: 既に処理済みのスケジュール', scheduleId);
            return;
        }
        
        // 処理開始をマーク
        processedScheduleIds.add(scheduleId);
        console.log('✅ 新規スケジュール処理開始:', scheduleId);
        
        const scheduleDate = new Date(newSchedule.start);
        const scheduleDateStr = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}`;
        const displayDateStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(displayDate.getDate()).padStart(2, '0')}`;
        if(scheduleDateStr === displayDateStr) {
            // 🎯 新規作成シンプル処理：setSchedules内で重複チェック+部分更新実行
            const scheduleId = String(newSchedule.id);
            
            setSchedules(currentSchedules => {
                // 重複チェック
                if (isScheduleDuplicate(currentSchedules, newSchedule)) {
                    console.log('⚠️ 重複スケジュール検出、スキップ:', scheduleId);
                    return currentSchedules;
                }
                
                console.log('✅ 重複チェック通過、新規スケジュール追加開始:', scheduleId);
                console.log('🚀 新規作成シンプルモード: setSchedules内で部分更新実行');
                
                // 重複チェック通過後、即座に部分更新実行（非同期問題回避）
                if (enableOptimizedUpdates && isSafeForOptimizedUpdate(newSchedule)) {
                    const optimizedScheduleUpdate = optimizedScheduleUpdateRef.current;
                    if (optimizedScheduleUpdate) {
                        console.log('⚡ 部分更新実行:', scheduleId);
                        optimizedScheduleUpdate.add(newSchedule);
                    } else {
                        console.warn('⚠️ OptimizedScheduleUpdate未初期化 - 後で手動追加実行');
                        // フォールバック用フラグ設定（次のsetSchedulesで実行）
                        setTimeout(() => {
                            setSchedules(prev => [...prev, {
                                ...newSchedule,
                                start: Number(newSchedule.start),
                                end: Number(newSchedule.end)
                            }]);
                        }, 0);
                    }
                } else {
                    console.log('📝 安全性チェック失敗 - 後で手動追加実行');
                    // フォールバック: 非同期で手動追加
                    setTimeout(() => {
                        setSchedules(prev => [...prev, {
                            ...newSchedule,
                            start: Number(newSchedule.start),
                            end: Number(newSchedule.end)
                        }]);
                    }, 0);
                }
                
                return currentSchedules; // setSchedules自体は変更なし
            });
        }
    };
    const handleUpdatedSchedule = (updatedSchedule: ScheduleFromDB) => {
        const scheduleDate = new Date(updatedSchedule.start);
        const scheduleDateStr = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(2, '0')}-${String(scheduleDate.getDate()).padStart(2, '0')}`;
        const displayDateStr = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, '0')}-${String(displayDate.getDate()).padStart(2, '0')}`;
        if(scheduleDateStr === displayDateStr){
            // Phase 3: 楽観的更新との重複チェック（更新時・全リスクレベル対応）
            setSchedules(currentSchedules => {
                const optimisticDuplicate = currentSchedules.find(s => {
                    if (!s._isOptimistic) return false;
                    
                    // デバッグログ（更新時）
                    if (isDebugEnabled()) {
                        console.log('🔍 楽観的更新検出チェック（更新）:', {
                            optimisticId: s.id,
                            optimisticOriginalId: s._originalId,
                            updatedScheduleId: updatedSchedule.id,
                            optimistic_staffId: s.staffId,
                            updated_staffId: updatedSchedule.staffId,
                            optimistic_start: s.start,
                            updated_start: Number(updatedSchedule.start),
                            optimistic_end: s.end,
                            updated_end: Number(updatedSchedule.end),
                            optimistic_status: s.status,
                            updated_status: updatedSchedule.status
                        });
                    }
                    
                    // 1. 一時IDとサーバーIDのマッチング（新規作成→更新の場合）
                    if (s._originalId && String(s._originalId) === String(updatedSchedule.id)) {
                        if (isDebugEnabled()) console.log('✅ ID照合一致（新規→更新）:', s._originalId, '→', updatedSchedule.id);
                        return true;
                    }
                    
                    // 2. 一時IDと実IDの直接マッチング（編集更新の場合）
                    if (String(s.id) === String(updatedSchedule.id)) {
                        if (isDebugEnabled()) console.log('✅ ID直接一致（編集更新）:', s.id, '→', updatedSchedule.id);
                        return true;
                    }
                    
                    // 3. 予定内容マッチング（ID変更を伴わない場合）
                    if (s.staffId === updatedSchedule.staffId && 
                        s.start === Number(updatedSchedule.start) && 
                        s.end === Number(updatedSchedule.end)) {
                        if (isDebugEnabled()) console.log('✅ 内容照合一致（更新）:', s.id, '→', updatedSchedule.id);
                        return true;
                    }
                    
                    return false;
                });
                
                if (optimisticDuplicate) {
                    console.log('✅ 楽観的更新確認（更新）: 一時スケジュールを実スケジュールに置換', {
                        tempId: optimisticDuplicate.id,
                        serverId: updatedSchedule.id
                    });
                    // 楽観的更新の成功確認
                    if (optimisticDuplicate._isOptimistic && String(optimisticDuplicate.id).startsWith('temp_')) {
                        const serverSchedule: Schedule = {
                            ...updatedSchedule,
                            start: Number(updatedSchedule.start),
                            end: Number(updatedSchedule.end)
                        };
                        OptimisticUpdateManager.confirmUpdate(String(optimisticDuplicate.id), serverSchedule);
                    }
                    // 一時スケジュールを実スケジュールに置換（型変換対応）
                    const convertedSchedule: Schedule = {
                        ...updatedSchedule,
                        start: Number(updatedSchedule.start),
                        end: Number(updatedSchedule.end),
                        layer: optimisticDuplicate.layer
                    };
                    return currentSchedules.map(s => 
                        s.id === optimisticDuplicate.id ? convertedSchedule : s
                    );
                }
                
                // Phase 3: 楽観的更新がない場合も完全部分更新
                if (enableOptimizedUpdates && isSafeForOptimizedUpdate(updatedSchedule)) {
                    const optimizedScheduleUpdate = optimizedScheduleUpdateRef.current;
                    if (optimizedScheduleUpdate) {
                        optimizedScheduleUpdate.update(updatedSchedule);
                        return currentSchedules; // setSchedulesは呼ばれない
                    } else {
                        console.warn('⚠️ OptimizedScheduleUpdate未初期化 - 手動部分更新実行（更新）');
                        // フォールバックとして手動部分更新
                        return currentSchedules.map(s => 
                            s.id === Number(updatedSchedule.id) ? {
                                ...updatedSchedule,
                                start: Number(updatedSchedule.start),
                                end: Number(updatedSchedule.end),
                                layer: s.layer
                            } : s
                        );
                    }
                } else {
                    // Phase 3: 安全性チェック失敗時も部分更新で処理（更新）
                    console.log('🔄 Phase 3: 安全性チェック失敗 - 部分更新で処理（更新）');
                    return currentSchedules.map(s => 
                        s.id === Number(updatedSchedule.id) ? {
                            ...updatedSchedule,
                            start: Number(updatedSchedule.start),
                            end: Number(updatedSchedule.end),
                            layer: s.layer
                        } : s
                    );
                }
            });
        }
    }
    const handleDeletedSchedule = (id: number) => {
        // Phase 3: 削除操作の完全部分更新
        if (enableOptimizedUpdates) {
            const optimizedScheduleUpdate = optimizedScheduleUpdateRef.current;
            if (optimizedScheduleUpdate) {
                optimizedScheduleUpdate.delete(id);
            } else {
                console.warn('⚠️ OptimizedScheduleUpdate未初期化 - 手動部分更新実行（削除）');
                // フォールバックとして手動部分更新
                setSchedules(prevSchedules => 
                    prevSchedules.filter(s => Number(s.id) !== id)
                );
            }
        } else {
            // Phase 3: 部分更新無効時も手動部分更新で処理
            console.log('🔄 Phase 3: 部分更新無効 - 手動部分更新で処理（削除）');
            setSchedules(prevSchedules => 
                prevSchedules.filter(s => Number(s.id) !== id)
            );
        }
    };
    socket.on('schedule:new', handleNewSchedule);
    socket.on('schedule:updated', handleUpdatedSchedule);
    socket.on('schedule:deleted', handleDeletedSchedule);
    return () => { 
        socket.off('schedule:new', handleNewSchedule);
        socket.off('schedule:updated', handleUpdatedSchedule);
        socket.off('schedule:deleted', handleDeletedSchedule);
        socket.disconnect();
        cleanupHealthCheck(); // ヘルスチェックの停止
    };
  }, [displayDate, realTimeUpdateEnabled, enableOptimizedUpdates]);
  
  // 現在時刻を1分単位に調整する関数
  const roundToNearestMinute = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    // 1分単位なので丸める必要なし
    let finalHour = currentHour;
    let finalMinute = currentMinute;
    
    // 営業時間外の場合のデフォルト処理（8:00-21:00）
    if (finalHour < 8) {
      // 8時前の場合は8:00を設定
      finalHour = 8;
      finalMinute = 0;
    } else if (finalHour >= 20) {
      // 20時以降の場合は翌日9:00を設定（終了が21時を超えないよう）
      finalHour = 9;
      finalMinute = 0;
    }
    
    // 小数点形式に変換（例：9.25 = 9時15分）
    const startTime = finalHour + (finalMinute / 60);
    let endTime = startTime + 1; // 1時間後
    
    // 終了時刻が21時を超える場合は21時に調整
    if (endTime > 21) {
      endTime = 21;
    }
    
    return { startTime, endTime };
  };

  const handleOpenModal = (schedule: Schedule | null = null, initialData: Partial<Schedule> | null = null, isDragCreated: boolean = false) => {
    // console.log('=== handleOpenModal ===', { schedule, initialData, isDragCreated });
    
    // シンプルなスクロール位置保存
    setSavedScrollPosition({ 
      x: bottomScrollRef.current?.scrollLeft || 0, 
      y: window.scrollY || 0 
    });
    
    
    // 新規作成時（scheduleもinitialDataもない場合）は現在時刻を自動設定
    let finalInitialData = initialData;
    if (!schedule && !initialData) {
      const { startTime, endTime } = roundToNearestMinute();
      finalInitialData = {
        start: startTime,
        end: endTime,
        status: 'Online' // デフォルトステータス
      };
      
      // 権限別のstaffId設定：STAFFのみ自己制限、管理者は制限なし
      if (user?.role === 'STAFF' && user?.staffId) {
        finalInitialData.staffId = user.staffId;
        // console.log(`STAFFユーザー用に自分のstaffId自動設定:`, user.staffId);
      } else if (user?.role === 'ADMIN' || user?.role === 'SYSTEM_ADMIN') {
        // 管理者権限：staffIdを自動設定せず、モーダルで全スタッフから選択可能
        // console.log('管理者権限：全スタッフ選択可能');
      }
      
      // console.log('自動時刻設定:', { startTime, endTime });
    }
    
    // ドラッグ作成フラグを追加（モーダル内で自動調整を無効にするため）
    if (finalInitialData && isDragCreated) {
      finalInitialData.isDragCreated = true;
    }
    
    setEditingSchedule(schedule);
    setDraggedSchedule(finalInitialData);
    setIsModalOpen(true);
    // console.log('Modal opened, isModalOpen set to true');
  };
  
  // メイン画面では全て /api/schedules を使用（バックエンドで複合ID処理済み）
  // IDの変換は不要 - 複合IDをそのまま送信

  // === Phase 1: 楽観的更新対応版handleSaveSchedule ===
  const handleSaveSchedule = async (scheduleData: Schedule & { id?: number | string }) => {
    // JST基準で正しい日付文字列を生成
    const year = displayDate.getFullYear();
    const month = String(displayDate.getMonth() + 1).padStart(2, '0');
    const day = String(displayDate.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    
    // JST基準で今日の日付を生成
    const todayDate = new Date();
    const todayYear = todayDate.getFullYear();
    const todayMonth = String(todayDate.getMonth() + 1).padStart(2, '0');
    const todayDay = String(todayDate.getDate()).padStart(2, '0');
    const today = `${todayYear}-${todayMonth}-${todayDay}`;
    
    // Phase 1 & 2: 楽観的更新の判定
    const isUpdate = Boolean(scheduleData.id);
    const existingSchedule = isUpdate ? editingSchedule : null;
    const changeType = detectChangeType(scheduleData, existingSchedule);
    
    // Phase 2: 中リスク変更のバリデーション
    const validation = validateMediumRiskChange(scheduleData, changeType);
    if (!validation.isValid) {
      alert(`入力エラー: ${validation.reason}`);
      return;
    }
    
    const useOptimistic = shouldUseOptimisticUpdate(changeType, scheduleData, !isUpdate);
    
    if (isDebugEnabled()) {
      console.log('🚀 handleSaveSchedule Phase 2:', {
        isUpdate,
        changeType,
        useOptimistic,
        scheduleData: scheduleData.id,
        existingSchedule: existingSchedule?.id,
        validation: validation.isValid
      });
    }
    
    // 案1 + 案4のハイブリッド: 当日作成のOffを自動でUnplannedに変換
    let processedScheduleData = { ...scheduleData };
    
    // 新規作成 かつ 当日 かつ Offステータスの場合、自動でUnplannedに変換
    if (!scheduleData.id && date === today && scheduleData.status === 'off') {
      processedScheduleData.status = 'unplanned';
      if (isDebugEnabled()) console.log('当日作成のOffをUnplannedに自動変換しました');
    }
    
    const payload = { ...processedScheduleData, date };
    const currentApiUrl = getApiUrl();
    
    // Phase 1: 楽観的更新の実行
    let optimisticSchedule: Schedule | null = null;
    let tempId: string | null = null;
    
    if (useOptimistic) {
      optimisticSchedule = createOptimisticSchedule(processedScheduleData, existingSchedule);
      tempId = String(optimisticSchedule.id);
      
      // 楽観的更新の追跡開始
      OptimisticUpdateManager.trackOptimisticUpdate(
        tempId,
        existingSchedule,
        isUpdate ? 'update' : 'create',
        changeType
      );
      
      // Phase 3: 重複チェック強化（全リスクレベル対応）
      const isDuplicateOptimistic = optimisticSchedule ? Array.from(OptimisticUpdateManager.pendingUpdates.values()).some(pending => {
        if (isDebugEnabled()) {
          console.log('🔍 楽観的更新重複チェック:', {
            pendingStaffId: pending.originalData?.staffId,
            optimisticStaffId: optimisticSchedule!.staffId,
            pendingStart: pending.originalData?.start,
            optimisticStart: optimisticSchedule!.start,
            pendingEnd: pending.originalData?.end,
            optimisticEnd: optimisticSchedule!.end,
            pendingStatus: pending.originalData?.status,
            optimisticStatus: optimisticSchedule!.status,
            pendingOperation: pending.operation,
            currentOperation: isUpdate ? 'update' : 'create'
          });
        }
        
        // 完全一致チェック（全リスクレベル対応）
        return pending.originalData?.staffId === optimisticSchedule!.staffId &&
               pending.originalData?.start === optimisticSchedule!.start &&
               pending.originalData?.end === optimisticSchedule!.end &&
               pending.originalData?.status === optimisticSchedule!.status &&
               pending.operation === (isUpdate ? 'update' : 'create');
      }) : false;
      
      if (isDuplicateOptimistic && optimisticSchedule) {
        console.warn('⚠️ 重複する楽観的更新を検出、スキップ:', {
          staffId: optimisticSchedule.staffId,
          start: optimisticSchedule.start,
          end: optimisticSchedule.end,
          status: optimisticSchedule.status
        });
        // 通常のAPI呼び出しに進む（楽観的更新なしで）
      } else if (optimisticSchedule) {
        // 即座にUIを更新
        const optimizedScheduleUpdate = optimizedScheduleUpdateRef.current;
        if (optimizedScheduleUpdate) {
        // サーバーデータ形式に変換（型安全な変換）
        const scheduleForUpdate: ScheduleFromDB = {
          id: typeof optimisticSchedule.id === 'string' ? 
              parseInt(optimisticSchedule.id.replace(/[^0-9]/g, '')) || Date.now() : 
              Number(optimisticSchedule.id),
          staffId: optimisticSchedule.staffId,
          status: optimisticSchedule.status,
          start: String(optimisticSchedule.start),
          end: String(optimisticSchedule.end),
          memo: optimisticSchedule.memo,
          layer: optimisticSchedule.layer === 'historical' ? 'adjustment' : 
                 (optimisticSchedule.layer || 'adjustment')
        };
        
        // 楽観的更新プロパティを追加（部分更新システム用）
        (scheduleForUpdate as any)._isOptimistic = true;
        (scheduleForUpdate as any)._originalId = optimisticSchedule._originalId;
        (scheduleForUpdate as any)._timestamp = optimisticSchedule._timestamp;
        
        if (isUpdate) {
          optimizedScheduleUpdate.update(scheduleForUpdate);
        } else {
          optimizedScheduleUpdate.add(scheduleForUpdate);
        }
      }
      }
      
      // モーダルを即座に閉じる（楽観的更新の体験）
      setIsModalOpen(false);
      setEditingSchedule(null);
      setDraggedSchedule(null);
      
      if (isDebugEnabled()) {
        console.log('✨ 楽観的更新実行:', {
          tempId,
          operation: isUpdate ? 'update' : 'create',
          optimisticSchedule: optimisticSchedule.id
        });
      }
    }
    
    try {
      if (isDebugEnabled()) {
        console.log('🌐 サーバー通信開始:', {
          method: isUpdate ? 'PATCH' : 'POST',
          url: isUpdate ? `${getApiUrl()}/schedules/${scheduleData.id}` : `${getApiUrl()}/schedules`,
          payload
        });
      }
      
      let response;
      if (scheduleData.id) {
        response = await authenticatedFetch(`${getApiUrl()}/schedules/${scheduleData.id}`, { 
          method: 'PATCH',
          body: JSON.stringify(payload) 
        });
      } else {
        response = await authenticatedFetch(`${getApiUrl()}/schedules`, { 
          method: 'POST',
          body: JSON.stringify(payload) 
        });
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, response.statusText, errorText);
        throw new Error(`スケジュールの保存に失敗しました: ${response.status} ${response.statusText}`);
      }
      
      const serverResult = await response.json();
      if (isDebugEnabled()) {
        console.log('✅ サーバー通信成功:', {
          serverResult: serverResult.id,
          tempId,
          useOptimistic
        });
      }
      
      if (useOptimistic && tempId) {
        // Phase 1: 楽観的更新の成功処理
        OptimisticUpdateManager.confirmUpdate(tempId, serverResult);
        
        // 楽観的更新したデータを実際のサーバーデータで置換
        const optimizedScheduleUpdate = optimizedScheduleUpdateRef.current;
        if (optimizedScheduleUpdate) {
          // サーバーデータ形式に変換
          const serverScheduleData: ScheduleFromDB = {
            id: serverResult.id,
            staffId: serverResult.staffId,
            status: serverResult.status,
            start: serverResult.start,
            end: serverResult.end,
            memo: serverResult.memo,
            layer: serverResult.layer || 'adjustment'
          };
          
          if (isUpdate) {
            optimizedScheduleUpdate.update(serverScheduleData);
          } else {
            // 新規作成の場合：一時IDを削除し、実際のIDで追加
            if (isDebugEnabled()) {
              console.log('🔄 新規作成楽観的更新確認: 一時ID削除→実ID追加', {
                tempId,
                serverId: serverScheduleData.id
              });
            }
            
            // 一時IDのスケジュールを直接置換（削除→追加よりも確実）
            setSchedules(prev => prev.map(s => 
              s.id === tempId ? {
                ...serverScheduleData,
                start: Number(serverScheduleData.start),
                end: Number(serverScheduleData.end),
                layer: s.layer || 'adjustment'
              } : s
            ));
          }
        }
        
        if (isDebugEnabled()) {
          console.log('🎯 楽観的更新確認完了:', {
            tempId,
            serverResult: serverResult.id
          });
        }
        
        // Phase 3: 全リスクレベル変更の完全部分更新
        if (isDebugEnabled()) {
          console.log('🚀 Phase 3: 完全部分更新実行 - fetchDataスキップ', {
            changeType,
            riskLevel: changeType === 'low' ? '低リスク' : changeType === 'medium' ? '中リスク' : '高リスク'
          });
        }
        
        // Phase 3: 完全部分更新の成功ログ
        setOptimizationMetrics(prev => ({
          ...prev,
          partialUpdateCount: (prev.partialUpdateCount || 0) + 1,
          lastPartialUpdateTime: new Date().toISOString(),
          [`${changeType}RiskUpdateCount`]: ((prev as any)[`${changeType}RiskUpdateCount`] || 0) + 1
        }));
        
        // 楽観的更新のみで処理完了 - 全変更タイプでfetchDataを実行しない
        return;
      } else {
        // Phase 3: 楽観的更新なしでも操作元ブラウザでは即座に画面更新
        if (isDebugEnabled()) console.log('🔄 Phase 3: 楽観的更新なし - 操作元ブラウザで即座更新', {
          changeType,
          reason: '楽観的更新条件に該当しないが操作元ブラウザでは即座更新が必要'
        });
        
        // 操作元ブラウザでは即座に画面更新（WebSocketより確実）
        const optimizedScheduleUpdate = optimizedScheduleUpdateRef.current;
        if (optimizedScheduleUpdate && serverResult) {
          // サーバーデータ形式に変換
          const scheduleForUpdate: ScheduleFromDB = {
            id: serverResult.id,
            staffId: serverResult.staffId,
            status: serverResult.status,
            start: String(serverResult.start),
            end: String(serverResult.end),
            memo: serverResult.memo,
            layer: serverResult.layer || 'adjustment'
          };
          
          if (isUpdate) {
            optimizedScheduleUpdate.update(scheduleForUpdate);
          } else {
            optimizedScheduleUpdate.add(scheduleForUpdate);
          }
          
          if (isDebugEnabled()) {
            console.log('✅ 操作元ブラウザで即座更新完了:', {
              operation: isUpdate ? 'update' : 'create',
              scheduleId: serverResult.id
            });
          }
        }
        
        // モーダルを閉じる
        setIsModalOpen(false);
        setEditingSchedule(null);
        setDraggedSchedule(null);
        
        // 部分更新メトリクス更新
        setOptimizationMetrics(prev => ({
          ...prev,
          partialUpdateCount: (prev.partialUpdateCount || 0) + 1,
          lastPartialUpdateTime: new Date().toISOString(),
          nonOptimisticPartialUpdateCount: ((prev as any).nonOptimisticPartialUpdateCount || 0) + 1
        }));
        
        return;
      }
      
      
      // fetchData完了後、保存した位置に復元 - 縦・横両対応
      const restoreScroll = () => {
        if (topScrollRef.current && bottomScrollRef.current) {
          console.log('📍 スクロール復元実行:', savedScrollPosition, 'current横:', topScrollRef.current.scrollLeft, 'current縦:', window.scrollY);
          
          // 横スクロール復元
          if (savedScrollPosition.x > 0) {
            topScrollRef.current.scrollLeft = savedScrollPosition.x;
            bottomScrollRef.current.scrollLeft = savedScrollPosition.x;
          }
          
          // 縦スクロール復元
          if (savedScrollPosition.y >= 0) {
            window.scrollTo(savedScrollPosition.x || 0, savedScrollPosition.y);
          }
        } else {
          console.log('スクロール要素が見つかりません');
        }
      };
      // 複数回復元を試行（DOM更新タイミングの違いに対応）
      setTimeout(restoreScroll, 50);
      setTimeout(restoreScroll, 200);
      setTimeout(restoreScroll, 500);
      
      // データ更新・スクロール復元後にモーダルを閉じる
      setIsModalOpen(false);
      setEditingSchedule(null);
      setDraggedSchedule(null);
    } catch (error) {
      console.error('=== handleSaveSchedule ERROR ===');
      console.error('Error details:', error);
      
      if (useOptimistic && tempId) {
        // Phase 1: 楽観的更新のロールバック
        if (isDebugEnabled()) {
          console.log('🔙 楽観的更新ロールバック実行:', {
            tempId,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        
        // Phase 1: 自動リトライ機能
        const shouldRetry = error instanceof Error && 
                          (error.message.includes('Network') || 
                           error.message.includes('timeout') || 
                           error.message.includes('500') || 
                           error.message.includes('503'));
        
        if (shouldRetry) {
          if (isDebugEnabled()) {
            console.log('🔄 自動リトライを開始:', {
              tempId,
              error: error.message,
              shouldRetry
            });
          }
          
          // 自動リトライを開始
          OptimisticUpdateManager.retryFailedUpdate(tempId, payload, isUpdate);
        } else {
          // 楽観的更新をロールバック
          OptimisticUpdateManager.rollbackUpdate(tempId);
          
          // フォールバック：安全な全体更新
          await fetchData(displayDate);
          
          // エラー時にモーダルを再表示（楽観的更新の場合）
          setIsModalOpen(true);
          setEditingSchedule(existingSchedule);
          
          alert('更新に失敗しました。データを最新状態に復旧しました。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
        }
      } else {
        // 従来のエラー処理
        alert('スケジュールの保存に失敗しました。再度お試しください。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
      }
    }
  };
  
  const handleDeleteSchedule = async (id: number | string) => {
    const currentApiUrl = getApiUrl();
    try {
      // console.log('DELETE request to:', `${getApiUrl()}/schedules/${id}`);
      const response = await authenticatedFetch(`${getApiUrl()}/schedules/${id}`, { method: 'DELETE' });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`予定の削除に失敗しました: ${response.status} ${response.statusText} - ${errorData.message || 'Unknown error'}`);
      }
      
      const responseData = await response.json().catch(() => null);
      if (responseData?.message) {
        // console.log('Schedule deletion result:', responseData.message);
        alert(responseData.message); // 既に削除済みなどのメッセージを表示
      } else {
        // console.log('Schedule deleted successfully, fetching updated data...');
      }
      
      // Phase 3: 削除操作も部分更新 - fetchDataを実行しない
      // WebSocketで削除通知が送信されるため、fetchDataは不要
      if (isDebugEnabled()) {
        console.log('🚀 Phase 3: 削除操作完了 - 部分更新のみ（fetchDataスキップ）', {
          deletedId: id,
          apiResponse: responseData?.message || 'OK'
        });
      }
      
      // 削除操作メトリクス更新
      setOptimizationMetrics(prev => ({
        ...prev,
        partialUpdateCount: (prev.partialUpdateCount || 0) + 1,
        deletePartialUpdateCount: ((prev as any).deletePartialUpdateCount || 0) + 1,
        lastPartialUpdateTime: new Date().toISOString()
      }));
      
      // fetchData完了後、保存した位置に復元 - 縦・横両対応（追加処理と同じパターン）
      const restoreScroll = () => {
        if (topScrollRef.current && bottomScrollRef.current) {
          console.log('📍 削除後スクロール復元実行:', savedScrollPosition, 'current横:', topScrollRef.current.scrollLeft, 'current縦:', window.scrollY);
          
          // 横スクロール復元
          if (savedScrollPosition.x > 0) {
            topScrollRef.current.scrollLeft = savedScrollPosition.x;
            bottomScrollRef.current.scrollLeft = savedScrollPosition.x;
          }
          
          // 縦スクロール復元
          if (savedScrollPosition.y >= 0) {
            window.scrollTo(savedScrollPosition.x || 0, savedScrollPosition.y);
          }
        } else {
          console.log('削除後スクロール要素が見つかりません');
        }
      };
      // 複数回復元を試行（DOM更新タイミングの違いに対応）
      setTimeout(restoreScroll, 50);
      setTimeout(restoreScroll, 200);
      setTimeout(restoreScroll, 500);
    } catch (error) { 
      console.error('予定の削除に失敗しました', error);
      alert(`予定の削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
    setDeletingScheduleId(null);
  };

  const handleOpenAssignmentModal = (staff: Staff) => {
    // 履歴表示モードでは支援設定を無効化
    if (isHistoricalMode) {
      return;
    }
    
    // モーダル開く前にスクロール位置をキャプチャ（縦・横両対応）
    const horizontalScroll = bottomScrollRef.current?.scrollLeft || 0;
    const verticalScroll = window.scrollY || document.documentElement.scrollTop || 0;
    
    // console.log('支援設定モーダルオープン時のスクロール位置キャプチャ:');
    // console.log('- 横スクロール:', horizontalScroll);
    // console.log('- 縦スクロール:', verticalScroll);
    
    setSavedScrollPosition({ x: horizontalScroll, y: verticalScroll });
    setSelectedStaffForAssignment(staff);
    setIsAssignmentModalOpen(true);
  };

  const handleSaveAssignment = async (data: {
    staffId: number;
    startDate: string;
    endDate: string;
    department: string;
    group: string;
  }) => {
    const currentApiUrl = getApiUrl();
    try {
      // 送信前のデータをログ出力
      // console.log('=== 支援設定データ送信 ===');
      // console.log('原データ:', data);
      
      // バックエンドが期待するフィールド名に変換
      const backendData = {
        staffId: data.staffId,
        startDate: data.startDate,
        endDate: data.endDate,
        tempDept: data.department,   // department → tempDept
        tempGroup: data.group        // group → tempGroup
      };
      
      // console.log('送信データ:', backendData);
      // console.log('API URL:', `${getApiUrl()}/daily-assignments`);
      
      const response = await authenticatedFetch(`${getApiUrl()}/daily-assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backendData)
      });

      // console.log('レスポンス status:', response.status);
      // console.log('レスポンス ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('=== 支援設定エラー詳細 ===');
        console.error('Status:', response.status);
        console.error('StatusText:', response.statusText);
        console.error('ErrorText:', errorText);
        console.error('送信したデータ:', backendData);
        
        // より詳細なエラーメッセージを表示
        let errorMessage = `支援設定の保存に失敗しました (${response.status})`;
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage += `\nエラー: ${errorJson.message || errorText}`;
          } catch {
            errorMessage += `\nエラー: ${errorText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      // console.log('=== 支援設定成功 ===');
      // console.log('結果:', result);
      
      // データを再取得してUIを更新
      // console.log('復元予定のスクロール位置:', savedScrollPosition);
      await fetchData(displayDate);
      // データ更新完了後、保存した位置に復元 - 段階的試行
      const restoreScroll = (attempt = 1) => {
        if (topScrollRef.current && bottomScrollRef.current) {
          const currentPosX = topScrollRef.current.scrollLeft;
          const currentPosY = window.scrollY;
          // console.log(`スクロール復元試行${attempt}:`, savedScrollPosition, 'current横:', currentPosX, 'current縦:', currentPosY);
          if (savedScrollPosition.x > 0) {
            topScrollRef.current.scrollLeft = savedScrollPosition.x;
            bottomScrollRef.current.scrollLeft = savedScrollPosition.x;
            // 復元が成功したかチェック
            setTimeout(() => {
              const newPosX = topScrollRef.current?.scrollLeft || 0;
              const newPosY = window.scrollY;
              const xDiff = Math.abs(newPosX - (savedScrollPosition.x || 0));
              const yDiff = Math.abs(newPosY - (savedScrollPosition.y || 0));
              
              if ((xDiff > 10 || yDiff > 10) && attempt < 5) {
                // console.log(`復元失敗、再試行${attempt + 1}:`, { newPosX, newPosY }, 'target:', savedScrollPosition);
                restoreScroll(attempt + 1);
              } else {
                // console.log('スクロール復元完了:', { x: newPosX, y: newPosY });
              }
            }, 50);
          }
        } else {
          // console.log('スクロール要素未準備、再試行:', attempt);
          if (attempt < 5) {
            setTimeout(() => restoreScroll(attempt + 1), 100);
          }
        }
      };
      setTimeout(() => restoreScroll(1), 100);
      setIsAssignmentModalOpen(false);
      setSelectedStaffForAssignment(null);
    } catch (error) {
      console.error('=== 支援設定の保存に失敗 ===');
      console.error('エラー詳細:', error);
      alert('支援設定の保存に失敗しました。再度お試しください。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleDeleteAssignment = async (staffId: number) => {
    const currentApiUrl = getApiUrl();
    try {
      // console.log('=== 支援設定削除処理開始 ===');
      // console.log('削除対象スタッフID:', staffId);
      // console.log('API URL:', `${getApiUrl()}/daily-assignments/staff/${staffId}/current`);
      
      const response = await authenticatedFetch(`${getApiUrl()}/daily-assignments/staff/${staffId}/current`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      // console.log('削除レスポンス status:', response.status);
      // console.log('削除レスポンス ok:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('=== 支援設定削除エラー詳細 ===');
        console.error('Status:', response.status);
        console.error('StatusText:', response.statusText);
        console.error('ErrorText:', errorText);
        
        let errorMessage = `支援設定の削除に失敗しました (${response.status})`;
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage += `\nエラー: ${errorJson.message || errorText}`;
          } catch {
            errorMessage += `\nエラー: ${errorText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      // console.log('=== 支援設定削除成功 ===');
      // console.log('結果:', result);
      
      // データを再取得してUIを更新
      // console.log('復元予定のスクロール位置:', savedScrollPosition);
      await fetchData(displayDate);
      // データ更新完了後、保存した位置に復元 - 段階的試行
      const restoreScroll = (attempt = 1) => {
        if (topScrollRef.current && bottomScrollRef.current) {
          const currentPosX = topScrollRef.current.scrollLeft;
          const currentPosY = window.scrollY;
          // console.log(`スクロール復元試行${attempt}:`, savedScrollPosition, 'current横:', currentPosX, 'current縦:', currentPosY);
          if (savedScrollPosition.x > 0) {
            topScrollRef.current.scrollLeft = savedScrollPosition.x;
            bottomScrollRef.current.scrollLeft = savedScrollPosition.x;
            // 復元が成功したかチェック
            setTimeout(() => {
              const newPosX = topScrollRef.current?.scrollLeft || 0;
              const newPosY = window.scrollY;
              const xDiff = Math.abs(newPosX - (savedScrollPosition.x || 0));
              const yDiff = Math.abs(newPosY - (savedScrollPosition.y || 0));
              
              if ((xDiff > 10 || yDiff > 10) && attempt < 5) {
                // console.log(`復元失敗、再試行${attempt + 1}:`, { newPosX, newPosY }, 'target:', savedScrollPosition);
                restoreScroll(attempt + 1);
              } else {
                // console.log('スクロール復元完了:', { x: newPosX, y: newPosY });
              }
            }, 50);
          }
        } else {
          // console.log('スクロール要素未準備、再試行:', attempt);
          if (attempt < 5) {
            setTimeout(() => restoreScroll(attempt + 1), 100);
          }
        }
      };
      setTimeout(() => restoreScroll(1), 100);
      setIsAssignmentModalOpen(false);
      setSelectedStaffForAssignment(null);
    } catch (error) {
      console.error('=== 支援設定の削除に失敗 ===');
      console.error('エラー詳細:', error);
      alert('支援設定の削除に失敗しました。再度お試しください。\n詳細: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleOpenResponsibilityModal = (staff: Staff) => {
    // 履歴表示モードでは担当設定を無効化
    if (isHistoricalMode) {
      return;
    }
    
    // モーダル開く前にスクロール位置をキャプチャ（縦・横両対応）
    const horizontalScroll = bottomScrollRef.current?.scrollLeft || 0;
    const verticalScroll = window.scrollY || document.documentElement.scrollTop || 0;
    
    // console.log('担当設定モーダルオープン時のスクロール位置キャプチャ:');
    // console.log('- 横スクロール:', horizontalScroll);
    // console.log('- 縦スクロール:', verticalScroll);
    
    setSavedScrollPosition({ x: horizontalScroll, y: verticalScroll });
    setSelectedStaffForResponsibility(staff);
    setIsResponsibilityModalOpen(true);
  };


  // 統一担当設定保存処理
  const handleSaveResponsibility = async (data: {
    staffId: number;
    responsibilities: UnifiedResponsibilityData;
  }) => {
    try {
      const dateString = displayDate.toISOString().split('T')[0];
      const success = await saveResponsibility(data.staffId, dateString, data.responsibilities);
      
      if (success) {
        // データを再取得してUIを更新
        await fetchData(displayDate);
        // データ更新完了後、保存した位置に復元 - 段階的試行
        const restoreScroll = (attempt = 1) => {
          if (topScrollRef.current && bottomScrollRef.current) {
            const currentPosX = topScrollRef.current.scrollLeft;
            const currentPosY = window.scrollY;
            if (savedScrollPosition.x > 0) {
              topScrollRef.current.scrollLeft = savedScrollPosition.x;
              bottomScrollRef.current.scrollLeft = savedScrollPosition.x;
              // 復元が成功したかチェック
              setTimeout(() => {
                const newPosX = topScrollRef.current?.scrollLeft || 0;
                const newPosY = window.scrollY;
                const xDiff = Math.abs(newPosX - (savedScrollPosition.x || 0));
                const yDiff = Math.abs(newPosY - (savedScrollPosition.y || 0));
                
                if ((xDiff > 10 || yDiff > 10) && attempt < 5) {
                  restoreScroll(attempt + 1);
                } else {
                  // スクロール復元完了
                }
              }, 50);
          }
        } else {
          if (attempt < 5) {
            setTimeout(() => restoreScroll(attempt + 1), 100);
          }
        }
      };
      setTimeout(() => restoreScroll(1), 100);
      
      setIsResponsibilityModalOpen(false);
      setSelectedStaffForResponsibility(null);
      } else {
        alert('担当設定の保存に失敗しました');
      }
      
    } catch (error) {
      console.error('担当設定の保存に失敗しました:', error);
      alert('担当設定の保存に失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleJsonUpload = async (file: File) => {
    setIsImporting(true);
    try {
      // まずファイル内容を読み取って文字チェックを実行
      const fileContent = await file.text();
      const jsonData = JSON.parse(fileContent);
      
      if (!jsonData.employeeData || !Array.isArray(jsonData.employeeData)) {
        throw new Error('JSONファイルの形式が正しくありません。employeeDataプロパティが必要です。');
      }
      
      // 文字チェックを実行
      const characterCheck = checkSupportedCharacters(jsonData.employeeData);
      
      if (!characterCheck.isValid) {
        const errorMessage = characterCheck.errors.map(error => {
          const fieldName = error.field === 'name' ? '名前' : error.field === 'dept' ? '部署' : 'グループ';
          return `${error.position}行目の${fieldName}「${error.value}」に使用できない文字が含まれています: ${error.invalidChars.join(', ')}`;
        }).join('\n');
        
        alert(`文字チェックエラー:\n\n${errorMessage}\n\n使用可能な文字: ひらがな、カタカナ、漢字（JIS第1-2水準）、英数字、基本記号、全角英数字、反復記号「々」`);
        return;
      }
      
      // 文字チェックが通った場合のみAPIに送信
      const currentApiUrl = getApiUrl();
      
      // console.log(`JSONファイルサイズ: ${fileContent.length} 文字, 社員数: ${jsonData.employeeData?.length || 0}名`);
      
      const response = await authenticatedFetch(`${getApiUrl()}/staff/sync-from-json-body`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        
        // バックエンドからの文字チェックエラーを処理
        if (errorData.message === '文字チェックエラー' && errorData.details) {
          const errorMessage = errorData.details.join('\n');
          alert(`サーバー側文字チェックエラー:\n\n${errorMessage}\n\n${errorData.supportedChars}`);
          return;
        }
        
        throw new Error(errorData.message || 'JSONファイルの同期に失敗しました');
      }
      
      const result = await response.json();
      // console.log('同期結果:', result);
      
      const message = `同期完了:\n追加: ${result.added}名\n更新: ${result.updated}名\n削除: ${result.deleted}名`;
      alert(message);
      
      // データを再取得してUIを更新
      await fetchData(displayDate);
      setIsJsonUploadModalOpen(false);
    } catch (error) {
      console.error('JSONファイルの同期に失敗しました:', error);
      alert('JSONファイルの同期に失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsImporting(false);
    }
  };

  const handleCsvUpload = async (file: File) => {
    setIsImporting(true);
    try {
      // CSVファイルを読み込み
      const csvText = await file.text();
      const lines = csvText.trim().split('\n');
      
      if (lines.length < 2) {
        throw new Error('CSVファイルが空または不正です');
      }
      
      // ヘッダー行を確認（オプション）
      const hasHeader = lines[0].toLowerCase().includes('empno') || lines[0].toLowerCase().includes('date');
      const dataLines = hasHeader ? lines.slice(1) : lines;
      
      // データを解析
      const schedules = dataLines.map((line, index) => {
        const columns = line.split(',');
        if (columns.length < 5) {
          throw new Error(`${index + (hasHeader ? 2 : 1)}行目: 必要な列が不足しています`);
        }
        
        // フォーマット: date,empNo,name,status,time,memo,assignmentType,customLabel
        return {
          date: columns[0]?.trim(),
          empNo: columns[1]?.trim(),
          name: columns[2]?.trim(),
          status: columns[3]?.trim(),
          time: columns[4]?.trim(),
          memo: columns[5]?.trim() || undefined,
          assignmentType: columns[6]?.trim() || undefined,
          customLabel: columns[7]?.trim() || undefined
        };
      }).filter(s => s.empNo && s.date && (
        // スケジュール情報または担当設定のいずれかがあればOK
        (s.status && s.time) || s.assignmentType
      ));
      
      // console.log('Parsed CSV schedules:', schedules);
      const currentApiUrl = getApiUrl();

      const response = await authenticatedFetch(`${getApiUrl()}/csv-import/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ schedules })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'CSVファイルのインポートに失敗しました');
      }
      
      const result = await response.json();
      // console.log('CSVインポート結果:', result);
      
      const message = `インポート完了:\n投入: ${result.imported}件\n競合: ${result.conflicts?.length || 0}件\n\n${result.batchId ? `バッチID: ${result.batchId}\n※ 問題があればインポート履歴から取り消し可能です` : ''}`;
      alert(message);
      
      // データを再取得してUIを更新
      await fetchData(displayDate);
      setIsCsvUploadModalOpen(false);
    } catch (error) {
      console.error('CSVファイルのインポートに失敗しました:', error);
      alert('CSVファイルのインポートに失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setIsImporting(false);
    }
  };

  // インポート履歴取得
  const fetchImportHistory = async (): Promise<ImportHistory[]> => {
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${currentApiUrl}/csv-import/history`);
      
      if (!response.ok) {
        throw new Error('履歴の取得に失敗しました');
      }
      
      return await response.json();
    } catch (error) {
      console.error('インポート履歴の取得に失敗しました:', error);
      throw error;
    }
  };

  // ロールバック実行
  const handleRollback = async (batchId: string) => {
    try {
      const currentApiUrl = getApiUrl();
      const response = await authenticatedFetch(`${getApiUrl()}/csv-import/rollback`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batchId })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'ロールバックに失敗しました');
      }
      
      const result = await response.json();
      // console.log('ロールバック結果:', result);
      
      const message = `ロールバック完了:\n削除: ${result.deletedCount}件\n\n削除されたデータ:\n${result.details.map((d: any) => `・${d.staff} ${d.date} ${d.status} ${d.time}`).join('\n')}`;
      alert(message);
      
      // データを再取得してUIを更新
      // console.log('復元予定のスクロール位置:', savedScrollPosition);
      await fetchData(displayDate);
      // データ更新完了後、保存した位置に復元 - 段階的試行
      const restoreScroll = (attempt = 1) => {
        if (topScrollRef.current && bottomScrollRef.current) {
          const currentPosX = topScrollRef.current.scrollLeft;
          const currentPosY = window.scrollY;
          // console.log(`スクロール復元試行${attempt}:`, savedScrollPosition, 'current横:', currentPosX, 'current縦:', currentPosY);
          if (savedScrollPosition.x > 0) {
            topScrollRef.current.scrollLeft = savedScrollPosition.x;
            bottomScrollRef.current.scrollLeft = savedScrollPosition.x;
            // 復元が成功したかチェック
            setTimeout(() => {
              const newPosX = topScrollRef.current?.scrollLeft || 0;
              const newPosY = window.scrollY;
              const xDiff = Math.abs(newPosX - (savedScrollPosition.x || 0));
              const yDiff = Math.abs(newPosY - (savedScrollPosition.y || 0));
              
              if ((xDiff > 10 || yDiff > 10) && attempt < 5) {
                // console.log(`復元失敗、再試行${attempt + 1}:`, { newPosX, newPosY }, 'target:', savedScrollPosition);
                restoreScroll(attempt + 1);
              } else {
                // console.log('スクロール復元完了:', { x: newPosX, y: newPosY });
              }
            }, 50);
          }
        } else {
          // console.log('スクロール要素未準備、再試行:', attempt);
          if (attempt < 5) {
            setTimeout(() => restoreScroll(attempt + 1), 100);
          }
        }
      };
      setTimeout(() => restoreScroll(1), 100);
      setIsImportHistoryModalOpen(false);
    } catch (error) {
      console.error('ロールバックに失敗しました:', error);
      alert('ロールバックに失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleMoveSchedule = async (scheduleId: number | string, newStaffId: number, newStart: number, newEnd: number) => {
    // 権限チェック：移動先スタッフの編集権限があるかチェック
    if (!canEdit(newStaffId)) {
      alert('このスタッフのスケジュールを編集する権限がありません。');
      return;
    }
    
    // Phase 3: ドラッグ移動での楽観的更新（即座にUI反映）
    const existingSchedule = schedules.find(s => s.id === scheduleId);
    if (existingSchedule && isDebugEnabled()) {
      console.log('🚀 Phase 3: ドラッグ移動楽観的更新開始', {
        scheduleId,
        oldStaffId: existingSchedule.staffId,
        newStaffId,
        oldStart: existingSchedule.start,
        newStart,
        oldEnd: existingSchedule.end,
        newEnd
      });
      
      // 即座にUI更新（楽観的更新）
      setSchedules(prev => prev.map(s => 
        s.id === scheduleId ? {
          ...s,
          staffId: newStaffId,
          start: newStart,
          end: newEnd,
          _isOptimistic: true,
          _timestamp: Date.now()
        } : s
      ));
    }

    const currentApiUrl = getApiUrl();
    // JST基準で正しい日付文字列を生成
    const year = displayDate.getFullYear();
    const month = String(displayDate.getMonth() + 1).padStart(2, '0');
    const day = String(displayDate.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${day}`;
    
    try {
      // console.log('MOVE PATCH request to:', `${getApiUrl()}/schedules/${scheduleId}`);
      const response = await authenticatedFetch(`${getApiUrl()}/schedules/${scheduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staffId: newStaffId,
          start: newStart,
          end: newEnd,
          date
        })
      });
      
      if (!response.ok) {
        throw new Error('スケジュールの移動に失敗しました');
      }
      
      // Phase 3: ドラッグ移動も部分更新 - fetchDataを実行しない
      // WebSocketで更新通知が送信されるため、fetchDataは不要
      if (isDebugEnabled()) {
        console.log('🚀 Phase 3: ドラッグ移動完了 - 部分更新のみ（fetchDataスキップ）', {
          scheduleId,
          newStaffId,
          newStart,
          newEnd,
          date
        });
      }
      
      // ドラッグ移動メトリクス更新
      setOptimizationMetrics(prev => ({
        ...prev,
        partialUpdateCount: (prev.partialUpdateCount || 0) + 1,
        dragPartialUpdateCount: ((prev as any).dragPartialUpdateCount || 0) + 1,
        lastPartialUpdateTime: new Date().toISOString()
      }));
      // ドラッグ移動完了後、保存した位置に復元
      const restoreScroll = (attempt = 1) => {
        if (topScrollRef.current && bottomScrollRef.current) {
          const currentPosX = topScrollRef.current.scrollLeft;
          const currentPosY = window.scrollY;
          // console.log(`ドラッグ移動後スクロール復元試行${attempt}:`, savedScrollPosition, 'current横:', currentPosX, 'current縦:', currentPosY);
          
          // 横スクロール復元
          if (savedScrollPosition.x > 0) {
            topScrollRef.current.scrollLeft = savedScrollPosition.x;
            bottomScrollRef.current.scrollLeft = savedScrollPosition.x;
          }
          
          // 縦スクロール復元
          if (savedScrollPosition.y >= 0) {
            window.scrollTo(savedScrollPosition.x || 0, savedScrollPosition.y);
          }
          
          // 復元が成功したかチェック
          setTimeout(() => {
            const newPosX = topScrollRef.current?.scrollLeft || 0;
            const newPosY = window.scrollY;
            const xDiff = Math.abs(newPosX - (savedScrollPosition.x || 0));
            const yDiff = Math.abs(newPosY - (savedScrollPosition.y || 0));
            
            if ((xDiff > 10 || yDiff > 10) && attempt < 5) {
              // console.log(`ドラッグ移動復元失敗、再試行${attempt + 1}:`, { newPosX, newPosY }, 'target:', savedScrollPosition);
              restoreScroll(attempt + 1);
            } else {
              // console.log('ドラッグ移動スクロール復元完了:', { x: newPosX, y: newPosY });
            }
          }, 50);
        } else {
          // console.log('ドラッグ移動スクロール要素未準備、再試行:', attempt);
          if (attempt < 5) {
            setTimeout(() => restoreScroll(attempt + 1), 100);
          }
        }
      };
      setTimeout(() => restoreScroll(1), 100);
    } catch (error) {
      console.error('スケジュール移動エラー:', error);
      alert('スケジュールの移動に失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
  };
  
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>, staff: Staff) => {
    // 権限チェック：編集権限がない場合は操作を禁止
    if (!canEdit(staff.id)) {
      return;
    }

    const clickedElement = e.target as HTMLElement;
    const scheduleElement = clickedElement.closest('.absolute');
    
    // スケジュール要素をクリックした場合は、レイヤー2（調整層）の予定かチェック
    if (scheduleElement) {
      const title = scheduleElement.getAttribute('title') || '';
      if (title.includes('レイヤー2:調整')) {
        return; // レイヤー2の予定要素はドラッグ不可（既存の予定）
      }
      // レイヤー1（契約層）の上はドラッグ可能（背景扱い）
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    setDragInfo({ staff, startX, currentX: startX, rowRef: e.currentTarget });
  };
  
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!dragInfo) return;
        const rect = dragInfo.rowRef.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        setDragInfo(prev => prev ? { ...prev, currentX } : null);
    };
    const handleMouseUp = () => {
        if (!dragInfo || Math.abs(dragInfo.startX - dragInfo.currentX) < 10) { setDragInfo(null); return; }
        const rowWidth = dragInfo.rowRef.offsetWidth;
        const startPercent = (Math.min(dragInfo.startX, dragInfo.currentX) / rowWidth) * 100;
        const endPercent = (Math.max(dragInfo.startX, dragInfo.currentX) / rowWidth) * 100;
        const start = positionPercentToTime(startPercent);
        const end = positionPercentToTime(endPercent);
        const snappedStart = Math.round(start * 60) / 60;
        const snappedEnd = Math.round(end * 60) / 60;
        if (snappedStart < snappedEnd) {
            handleOpenModal(null, { staffId: dragInfo.staff.id, start: snappedStart, end: snappedEnd }, true);
        }
        setDragInfo(null);
    };
    if (dragInfo) {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp, { once: true });
    }
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragInfo]);

  // スタッフ別スケジュールMap（O(1)アクセス用）
  const schedulesByStaffMap = useMemo(() => {
    const map = new Map<number, any[]>();
    schedules.forEach(schedule => {
      if (!map.has(schedule.staffId)) {
        map.set(schedule.staffId, []);
      }
      map.get(schedule.staffId)!.push(schedule);
    });
    return map;
  }, [schedules]);

  const staffWithCurrentStatus = useMemo(() => {
    const currentDecimalHour = currentTime.getHours() + currentTime.getMinutes() / 60;
    return staffList.map(staff => {
      // O(1)でスタッフのスケジュールを取得
      const staffSchedules = schedulesByStaffMap.get(staff.id) || [];
      const applicableSchedules = staffSchedules.filter(s => currentDecimalHour >= s.start && currentDecimalHour < s.end);
      // レイヤー優先順位: adjustment > contract （折れ線グラフと同じロジック）
      const currentSchedule = applicableSchedules.length > 0 ? 
        applicableSchedules.reduce((best, current) => {
          const bestLayer = (best as any).layer || 'adjustment';
          const currentLayer = (current as any).layer || 'adjustment';
          
          // 調整レイヤーが契約レイヤーより優先
          if (currentLayer === 'adjustment' && bestLayer === 'contract') {
            return current;
          }
          if (bestLayer === 'adjustment' && currentLayer === 'contract') {
            return best;
          }
          
          // 同じレイヤーなら新しいIDを優先
          return current.id > best.id ? current : best;
        }) : null;
      return { ...staff, currentStatus: currentSchedule ? currentSchedule.status : 'off' };
    });
  }, [staffList, schedulesByStaffMap, currentTime]);
  
  const departmentGroupFilteredStaff = useMemo(() => {
    return staffWithCurrentStatus.filter(staff => {
        // 支援中の場合は現在の部署/グループでフィルタリング、そうでなければ元の部署/グループでフィルタリング
        const currentDepartment = staff.isSupporting ? (staff.currentDept || staff.department) : staff.department;
        const currentGroup = staff.isSupporting ? (staff.currentGroup || staff.group) : staff.group;
        const departmentMatch = selectedDepartment === 'all' || currentDepartment === selectedDepartment;
        const groupMatch = selectedGroup === 'all' || currentGroup === selectedGroup;
        return departmentMatch && groupMatch;
    });
  }, [staffWithCurrentStatus, selectedDepartment, selectedGroup]);

  const availableStaffCount = useMemo(() => departmentGroupFilteredStaff.filter(staff => AVAILABLE_STATUSES.includes(staff.currentStatus)).length, [departmentGroupFilteredStaff]);

  // フィルター用のソート済み部署リスト（最適化済み）
  const sortedDepartmentsForFilter = useMemo(() => {
    const perfStart = performance.now();
    const uniqueDepts = Array.from(new Set(staffList.map(s => s.isSupporting ? (s.currentDept || s.department) : s.department)));
    const sorted = uniqueDepts.sort((a, b) => {
      // 部署設定を取得（O(1)でマップから取得）
      const settingA = departmentMap.get(a);
      const settingB = departmentMap.get(b);
      const orderA = settingA?.displayOrder || 0;
      const orderB = settingB?.displayOrder || 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.localeCompare(b);
    });
    
    const perfEnd = performance.now();
    if (perfEnd - perfStart > 200) {
      console.warn('部署フィルター処理時間:', perfEnd - perfStart, 'ms');
    }
    
    return sorted;
  }, [staffList, departmentMap]);

  // フィルター用のソート済みグループリスト（部署順→グループ順・最適化済み）
  const sortedGroupsForFilter = useMemo(() => {
    const perfStart = performance.now();
    
    const filteredStaff = staffList.filter(s => {
      const currentDept = s.isSupporting ? (s.currentDept || s.department) : s.department;
      return selectedDepartment === 'all' || currentDept === selectedDepartment;
    });
    const uniqueGroups = Array.from(new Set(filteredStaff.map(s => s.isSupporting ? (s.currentGroup || s.group) : s.group)));
    
    // 最適化されたsortGroupsByDepartment関数を使用
    const sorted = sortGroupsByDepartment(uniqueGroups);

    const perfEnd = performance.now();
    if (perfEnd - perfStart > 300) {
      console.warn('グループフィルター処理時間:', perfEnd - perfStart, 'ms (グループ数:', uniqueGroups.length, ')');
    }
    
    return sorted;
  }, [staffList, selectedDepartment, sortGroupsByDepartment]);

  // 今日かどうかを判定
  const isToday = useMemo(() => {
    const now = new Date();
    return displayDate.getFullYear() === now.getFullYear() && 
           displayDate.getMonth() === now.getMonth() && 
           displayDate.getDate() === now.getDate();
  }, [displayDate]);

  // 今日以外の日付に変更された時、selectedStatusを「all」にリセット
  useEffect(() => {
    if (!isToday && (selectedStatus === 'available' || selectedStatus === 'unavailable')) {
      setSelectedStatus('all');
    }
  }, [isToday, selectedStatus]);


  const filteredStaffForDisplay = useMemo(() => {
      const statusFiltered = departmentGroupFilteredStaff.filter(staff => {
        if (selectedStatus === 'all') return true;
        if (selectedStatus === 'available') return AVAILABLE_STATUSES.includes(staff.currentStatus);
        if (selectedStatus === 'unavailable') return !AVAILABLE_STATUSES.includes(staff.currentStatus);
        return true;
      });
      
      return statusFiltered.filter(staff => {
        if (selectedSettingFilter === 'all') return true;
        if (selectedSettingFilter === 'responsibility') {
          return staff.hasResponsibilities;
        }
        if (selectedSettingFilter === 'support') return staff.isSupporting;
        return true;
      });
  }, [departmentGroupFilteredStaff, selectedStatus, selectedSettingFilter]);
  
  const chartData = useMemo(() => {
    const data: any[] = [];
    const staffToChart = staffList.filter(staff => {
        // 支援中の場合は現在の部署/グループでフィルタリング、そうでなければ元の部署/グループでフィルタリング
        const currentDepartment = staff.isSupporting ? (staff.currentDept || staff.department) : staff.department;
        const currentGroup = staff.isSupporting ? (staff.currentGroup || staff.group) : staff.group;
        const departmentMatch = selectedDepartment === 'all' || currentDepartment === selectedDepartment;
        const groupMatch = selectedGroup === 'all' || currentGroup === selectedGroup;
        return departmentMatch && groupMatch;
    });
    let statusesToDisplay: string[];
    if (selectedStatus === 'all') { statusesToDisplay = [...ALL_STATUSES]; } 
    else if (selectedStatus === 'available') { statusesToDisplay = [...AVAILABLE_STATUSES]; } 
    else { statusesToDisplay = ALL_STATUSES.filter(s => !AVAILABLE_STATUSES.includes(s as any)); }
    
    // 5分単位でのデータポイント生成（8:00開始）
    const timePoints = [];
    
    // 8:00から5分刻みで追加
    for (let hour = 8; hour <= 20; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        if (hour === 20 && minute > 55) break; // 20:55まで
        const time = hour + minute / 60;
        const label = `${hour}:${String(minute).padStart(2, '0')}`;
        const dataRange = [time, time + 5/60]; // 5分間の範囲
        timePoints.push({ hour: time, label, dataRange });
      }
    }
    
    timePoints.forEach(timePoint => {
      const { hour, label, dataRange } = timePoint;
      const counts: { [key: string]: any } = { time: label };
      statusesToDisplay?.forEach(status => { counts[status] = 0; });
      staffToChart.forEach(staff => {
        const [rangeStart, rangeEnd] = dataRange;
        
        // 15分間隔の中間点でのステータスを取得
        const checkTime = rangeStart + 0.125; // 15分間の中間点（7.5分後）
        
        // O(1)でスタッフのスケジュールを取得してから時間フィルタリング
        const staffSchedules = schedulesByStaffMap.get(staff.id) || [];
        const applicableSchedules = staffSchedules.filter(s => 
          checkTime >= s.start && 
          checkTime < s.end
        );
        
        // レイヤー優先順位: adjustment > contract
        // 同じレイヤー内では新しいIDを優先
        const topSchedule = applicableSchedules.length > 0 ? 
          applicableSchedules.reduce((best, current) => {
            const bestLayer = (best as any).layer || 'adjustment';
            const currentLayer = (current as any).layer || 'adjustment';
            
            // 調整レイヤーが契約レイヤーより優先
            if (currentLayer === 'adjustment' && bestLayer === 'contract') {
              return current;
            }
            if (bestLayer === 'adjustment' && currentLayer === 'contract') {
              return best;
            }
            
            // 同じレイヤーなら新しいIDを優先
            return current.id > best.id ? current : best;
          }) : null;
        const status = topSchedule ? topSchedule.status : 'off';
        if (statusesToDisplay.includes(status)) { counts[status]++; }
      });
      data.push(counts);
    });
    return data;
  }, [schedules, staffList, selectedDepartment, selectedGroup, selectedStatus]);

  const currentTimePosition = useMemo(() => {
    const now = new Date();
    const isToday = displayDate.getFullYear() === now.getFullYear() && displayDate.getMonth() === now.getMonth() && displayDate.getDate() === now.getDate();
    if (!isToday) return null;
    const currentDecimalHour = currentTime.getHours() + currentTime.getMinutes() / 60;
    if (currentDecimalHour < 8 || currentDecimalHour >= 21) { return null; }
    return timeToPositionPercent(currentDecimalHour);
  }, [currentTime, displayDate]);

  const groupedStaffForGantt = useMemo(() => {
    // 部署・グループごとに集約
    const grouped = filteredStaffForDisplay.reduce((acc, staff) => {
      // 支援中でも元の部署/グループの位置に表示（表示順序の混乱を防ぐため）
      const department = staff.department;
      const group = staff.group;
      if (!acc[department]) { acc[department] = {}; }
      if (!acc[department][group]) { acc[department][group] = []; }
      acc[department][group].push(staff);
      return acc;
    }, {} as Record<string, Record<string, Staff[]>>);

    // 各グループ内のスタッフをempNo順でソート
    Object.keys(grouped).forEach(department => {
      Object.keys(grouped[department]).forEach(group => {
        grouped[department][group].sort((a, b) => {
          // empNoがない場合は後ろに配置
          if (!a.empNo && !b.empNo) return a.id - b.id;
          if (!a.empNo) return 1;
          if (!b.empNo) return -1;
          return a.empNo.localeCompare(b.empNo);
        });
      });
    });

    return grouped;
  }, [filteredStaffForDisplay]);

  // 部署・グループの表示順序に基づいてソートする関数
  const sortByDisplayOrder = useCallback((entries: [string, any][], type: 'department' | 'group') => {
    return entries.sort((a, b) => {
      const aName = a[0];
      const bName = b[0];
      
      const aSettings = departmentSettings[type === 'department' ? 'departments' : 'groups'].find(s => s.name === aName);
      const bSettings = departmentSettings[type === 'department' ? 'departments' : 'groups'].find(s => s.name === bName);
      
      const aOrder = aSettings?.displayOrder || 0;
      const bOrder = bSettings?.displayOrder || 0;
      
      // displayOrderで比較、同じ場合は名前順
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return aName.localeCompare(bName);
    });
  }, [departmentSettings]);
  
  
  const handleDateChange = (days: number) => { 
    setDisplayDate(current => { 
      const newDate = new Date(current); 
      newDate.setDate(newDate.getDate() + days); 
      // console.log(`handleDateChange(${days}): ${current.toISOString()} -> ${newDate.toISOString()}`);
      return newDate; 
    }); 
  };
  const goToToday = () => {
    const today = new Date();
    // console.log('goToToday: 今日の日付 =', today.toISOString());
    setDisplayDate(today);
  };

  // スクロール同期ハンドラー
  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };
  
  const handleBottomScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const CustomDatePickerInput = forwardRef<HTMLButtonElement, { value?: string, onClick?: () => void }>(({ value, onClick }, ref) => {
    const colorClass = getDateColor(displayDate, holidays);
    const displayText = formatDateWithHoliday(displayDate, holidays);
    
    return (
      <button className={`text-lg font-semibold ${colorClass}`} onClick={onClick} ref={ref}>
        {displayText}
      </button>
    );
  });
  CustomDatePickerInput.displayName = 'CustomDatePickerInput';

  if (isLoading) return <div className="p-8 text-center">読み込み中...</div>;

  // 認証ヘッダーコンポーネント
  const AuthHeader = () => (
    <div className="bg-indigo-600 shadow-lg mb-1.5">
      <div className="px-6 py-3 flex justify-between items-center">
        <h1 className="text-lg font-semibold text-white">
          出社状況
        </h1>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-indigo-100">
            {user?.name || user?.email} ({user?.role === 'ADMIN' ? '管理者' : user?.role === 'SYSTEM_ADMIN' ? 'システム管理者' : '一般ユーザー'})
          </span>
          <a
            href="/personal"
            className={BUTTON_STYLES.headerSecondary}
          >
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
            </svg>
            個人ページ
          </a>
          <a
            href="/monthly-planner"
            className={BUTTON_STYLES.headerSecondary}
          >
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            月次計画
          </a>
          {user?.role === 'SYSTEM_ADMIN' && (
            <a
              href="/admin/staff-management"
              className="text-xs font-medium text-white bg-blue-600 px-3 py-1 rounded-md border border-white border-opacity-40 hover:bg-blue-700 transition-colors duration-150 h-7 flex items-center"
            >
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              管理者設定
            </a>
          )}
          <a
            href={typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:9000/' : 'https://layout.callstatus.online'}
            target="_blank"
            rel="noopener noreferrer"
            className={BUTTON_STYLES.headerSecondary}
          >
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 512 512">
              <path d="M426.104,277.148c-16.228-28.842-40.49-47.086-76.866-47.086H162.34c-36.376,0-60.638,18.244-76.866,47.086
              l-7.385,13.14c-6.316,11.201-5.614,24.499,1.806,35.147c7.439,10.649,20.552,17.122,34.675,17.122h282.437
              c14.122,0,27.236-6.473,34.674-17.122c7.42-10.648,8.114-23.946,1.806-35.147L426.104,277.148z" />
              <path d="M329.905,467.721h25.157v-14.07c0-18.903-15.324-34.228-34.226-34.228h-52.472v-62.374h-25.149v62.374h-52.471
              c-18.903,0-34.227,15.324-34.227,34.228v14.07h25.148v-9.386c0-6.306,5.114-11.412,11.412-11.412h50.138v20.798h25.149v-20.798
              h50.138c6.298,0,11.403,5.106,11.403,11.412V467.721z" />
              <path d="M255.785,477.773c-9.448,0-17.114,7.666-17.114,17.114c0,9.456,7.666,17.114,17.114,17.114
              c9.456,0,17.113-7.658,17.113-17.114C272.898,485.439,265.241,477.773,255.785,477.773z" />
              <path d="M167.253,477.773c-9.456,0-17.114,7.666-17.114,17.114c0,9.456,7.658,17.114,17.114,17.114
              c9.447,0,17.105-7.658,17.105-17.114C184.358,485.439,176.7,477.773,167.253,477.773z" />
              <path d="M344.335,477.773c-9.456,0-17.114,7.666-17.114,17.114c0,9.456,7.657,17.114,17.114,17.114
              c9.456,0,17.113-7.658,17.113-17.114C361.448,485.439,353.79,477.773,344.335,477.773z" />
              <path d="M359.334,35.63C357.983,15.579,341.326,0,321.23,0H191.892c-20.096,0-36.753,15.579-38.104,35.63
              l-12.429,184.432h230.404L359.334,35.63z" />
              <path d="M113.965,204.344c9.306,0,16.842-7.535,16.842-16.842c0-9.298-7.535-16.841-16.842-16.841H78.037
              c-9.298,0-16.842,7.543-16.842,16.841c0,9.306,7.543,16.842,16.842,16.842H113.965z" />
              <path d="M433.963,170.661h-35.929c-9.307,0-16.841,7.543-16.841,16.841c0,9.306,7.534,16.842,16.841,16.842h35.929
              c9.297,0,16.842-7.535,16.842-16.842C450.805,178.204,443.26,170.661,433.963,170.661z" />
            </svg>
            座席表
          </a>
          <button
            onClick={logout}
            className={BUTTON_STYLES.headerNeutral}
          >
            <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
            </svg>
            ログアウト
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <Fragment>
      <AuthHeader />
      <ScheduleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} staffList={staffList as Staff[]} onSave={handleSaveSchedule} scheduleToEdit={editingSchedule} initialData={draggedSchedule || undefined} />
      <ConfirmationModal isOpen={deletingScheduleId !== null} onClose={() => setDeletingScheduleId(null)} onConfirm={() => { if (deletingScheduleId) handleDeleteSchedule(deletingScheduleId); }} message="この予定を削除しますか？" />
      <JsonUploadModal isOpen={isJsonUploadModalOpen} onClose={() => setIsJsonUploadModalOpen(false)} onUpload={handleJsonUpload} />
      <CsvUploadModal isOpen={isCsvUploadModalOpen} onClose={() => setIsCsvUploadModalOpen(false)} onUpload={handleCsvUpload} />
      <AssignmentModal 
        isOpen={isAssignmentModalOpen} 
        onClose={() => {
          setIsAssignmentModalOpen(false);
          setSelectedStaffForAssignment(null);
        }} 
        staff={selectedStaffForAssignment} 
        staffList={staffList} 
        onSave={handleSaveAssignment}
        onDelete={handleDeleteAssignment}
      />
      <ResponsibilityModal 
        isOpen={isResponsibilityModalOpen}
        onClose={() => {
          setIsResponsibilityModalOpen(false);
          setSelectedStaffForResponsibility(null);
        }}
        staff={selectedStaffForResponsibility}
        onSave={handleSaveResponsibility}
      />
      <ImportHistoryModal 
        isOpen={isImportHistoryModalOpen}
        onClose={() => setIsImportHistoryModalOpen(false)}
        onRollback={handleRollback}
        authenticatedFetch={authenticatedFetch}
      />
      <UnifiedSettingsModal 
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        setIsCsvUploadModalOpen={setIsCsvUploadModalOpen}
        setIsJsonUploadModalOpen={setIsJsonUploadModalOpen}
        setIsImportHistoryModalOpen={setIsImportHistoryModalOpen}
        authenticatedFetch={authenticatedFetch}
        staffList={staffList}
        onSettingsChange={(settings) => {
          // グローバル設定を強制リフレッシュして即座反映
          refreshSettings();
          // 強制再レンダリングトリガー
          setSettingsUpdateTrigger(prev => prev + 1);
        }}
        onSave={async () => {
          // 設定保存後に現在の日付でデータを自動再読込
          console.log('🔄 設定保存完了 - 出社状況ページのデータを自動再読込中...');
          await fetchData(displayDate);
          console.log('✅ 出社状況ページのデータ再読込完了');
        }}
      />
      <RealSystemMonitoringModal 
        isOpen={isSystemMonitoringModalOpen}
        onClose={() => setIsSystemMonitoringModalOpen(false)}
      />
      
      <main className={`p-4 font-sans ${viewMode === 'compact' ? 'compact-mode' : ''}`}>
        <header className="mb-2 p-4 bg-white shadow-sm rounded-xl border border-gray-100 flex justify-between items-center">
            <div className="flex items-center space-x-3">
                <div className="inline-flex rounded-lg shadow-sm border border-gray-200 overflow-hidden" role="group">
                    <button type="button" onClick={() => handleDateChange(-1)} className="px-3 h-7 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-150 flex items-center">&lt;</button>
                    <button type="button" onClick={goToToday} className="px-4 h-7 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 border-l border-r border-gray-200 transition-colors duration-150 flex items-center">今日</button>
                    <button type="button" onClick={() => handleDateChange(1)} className="px-3 h-7 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-150 flex items-center">&gt;</button>
                </div>
                <DatePicker
                  selected={displayDate}
                  onChange={(date: Date | null) => {
                    if (date) {
                      // console.log('DatePicker変更: 新しい日付 =', date.toISOString());
                      setDisplayDate(date);
                    }
                  }}
                  customInput={<CustomDatePickerInput />}
                  locale="ja"
                  dateFormat="yyyy年M月d日(E)"
                  popperClassName="!z-[10000]"
                  popperPlacement="bottom-start"
                />
                
                {/* 履歴モード表示インジケーター */}
                {isHistoricalMode && (
                  <div className="flex items-center space-x-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg shadow-sm h-7">
                    <span className="text-amber-600 text-xs">📊</span>
                    <div className="flex items-center space-x-1 text-xs text-amber-700">
                      <span className="font-medium">履歴データ表示中</span>
                      {historicalInfo.snapshotDate && (
                        <>
                          <span className="text-amber-500">•</span>
                          <span className="text-amber-600">
                            {new Date(historicalInfo.snapshotDate).toLocaleDateString('ja-JP')}
                          </span>
                        </>
                      )}
                      {historicalInfo.recordCount && (
                        <>
                          <span className="text-amber-500">•</span>
                          <span className="text-amber-600">
                            {historicalInfo.recordCount}件
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
            </div>

            <div className="flex items-center space-x-2">
                <button 
                  onClick={() => {
                    console.log('予定追加ボタンクリック:', { 
                      isHistoricalMode, 
                      user: user ? {
                        role: user.role,
                        staffId: user.staffId
                      } : null
                    });
                    if (!isHistoricalMode) {
                      setSelectedSchedule(null);
                      // 権限別のinitialData設定
                      const initialData = (user?.role === 'STAFF' && user?.staffId) 
                        ? { staffId: user.staffId } 
                        : {}; // 管理者は空オブジェクト（全スタッフ選択可能）
                      handleOpenModal(null, initialData, false);
                    }
                  }} 
                  disabled={isHistoricalMode}
                  className={`px-4 h-7 text-xs font-medium border border-transparent rounded-lg shadow-sm transition-colors duration-150 flex items-center ${
                    isHistoricalMode 
                      ? 'text-gray-400 bg-gray-300 cursor-not-allowed' 
                      : 'text-white bg-indigo-600 hover:bg-indigo-700'
                  }`}
                  title={isHistoricalMode ? '履歴モードでは予定を追加できません' : ''}
                >
                    予定を追加
                </button>
                {canManage() && (
                  <button onClick={() => {
                    setSelectedSchedule(null);
                    setIsSettingsModalOpen(true);
                  }} className="flex items-center px-4 h-7 text-xs font-medium text-white bg-gray-600 border border-transparent rounded-lg shadow-sm hover:bg-gray-700 transition-colors duration-150 min-w-fit whitespace-nowrap">
                      <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
      </svg>
      設定
                  </button>
                )}
                {/* システム監視ボタン（SYSTEM_ADMIN専用） */}
                {user?.role === 'SYSTEM_ADMIN' && (
                  <button 
                    onClick={() => setIsSystemMonitoringModalOpen(true)}
                    className="flex items-center px-4 h-7 text-xs font-medium text-white bg-blue-600 border border-transparent rounded-lg shadow-sm hover:bg-blue-700 transition-colors duration-150 min-w-fit whitespace-nowrap"
                  >
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 512 512">
                      <path d="M500.656,488H35.344C29.078,488,24,482.922,24,476.656V11.344C24,5.078,18.922,0,12.656,0h-1.313
                      C5.078,0,0,5.078,0,11.344v489.313C0,506.922,5.078,512,11.344,512h489.313c6.266,0,11.344-5.078,11.344-11.344v-1.313
                      C512,493.078,506.922,488,500.656,488z" />
                      <path d="M86.094,352.063l118.016-77.078l36.359,49.203c5,6.75,14.313,8.5,21.406,4.016l202.672-128
                      c7.469-4.719,9.703-14.609,4.984-22.078s-14.594-9.703-22.078-4.984L257.375,293.203l-36.5-49.375
                      c-5.063-6.828-14.5-8.531-21.625-3.891L68.594,325.281c-7.406,4.828-9.484,14.75-4.656,22.141
                      C68.781,354.813,78.688,356.906,86.094,352.063z" />
                    </svg>
                    システム監視
                  </button>
                )}
                
                {/* 🛡️ 部分更新トグルスイッチ（システム監視ボタンの右側） */}
                {user?.role === 'SYSTEM_ADMIN' && (
                  <div className="flex items-center space-x-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-xs font-medium text-blue-700">部分更新:</span>
                    <button 
                      onClick={() => setEnableOptimizedUpdates(!enableOptimizedUpdates)}
                      className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${
                        enableOptimizedUpdates ? 'bg-blue-500' : 'bg-gray-300'
                      }`}
                      title={`部分更新: ${enableOptimizedUpdates ? 'ON' : 'OFF'} (システム管理者のみ制御可能)`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                        enableOptimizedUpdates ? 'translate-x-4' : 'translate-x-0'
                      }`}></div>
                    </button>
                    <span className="text-xs font-medium text-blue-600" title={`成功: ${optimizationMetrics.successCount}回, エラー: ${optimizationMetrics.errorCount}回, フォールバック: ${optimizationMetrics.fallbackCount}回`}>
                      {optimizationMetrics.successCount}ok/{optimizationMetrics.errorCount}err/{optimizationMetrics.fallbackCount}fb
                    </span>
                  </div>
                )}
                {/* 1px余白 */}
                <span className="w-px"></span>
                {/* 標準/コンパクト表示切替（ヘッダー右側に移動） */}
                <div className="flex items-center space-x-2">
                  <button 
                    onClick={toggleViewMode}
                    title={`表示密度: ${viewMode === 'normal' ? '標準' : 'コンパクト'}`}
                    className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${
                      viewMode === 'compact' ? 'bg-indigo-600' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${
                      viewMode === 'compact' ? 'translate-x-4' : 'translate-x-0'
                    }`}></div>
                  </button>
                  {/* フォントサイズ調整アイコン（大小のA） */}
                  <svg 
                    className={`w-4 h-4 ${viewMode === 'compact' ? 'text-indigo-600' : 'text-gray-600'}`}
                    viewBox="0 0 512 512" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <g>
                      <path d="M452.349,174.924c-2.95-11.607-13.402-19.726-25.377-19.726h-34.875c-11.326,0-21.369,7.27-24.892,18.034
                        l-45.107,137.825l21.184,83.224l19.365-59.17h72.836l18.873,74.142H512L452.349,174.924z M373.354,302.417l27.032-82.607h5.751
                        l21.028,82.607H373.354z" fill="currentColor"></path>
                      <path d="M205.804,65.185h-52.385c-17.012,0-32.097,10.933-37.392,27.108L0,446.815h72.74l36.447-111.374h109.41
                        l28.35,111.374h86.578L243.929,94.818C239.492,77.385,223.794,65.185,205.804,65.185z M125.257,286.338l40.61-124.094h8.641
                        l31.588,124.094H125.257z" fill="currentColor"></path>
                    </g>
                  </svg>
                </div>
            </div>
        </header>

        <div className="mb-2 p-4 bg-white shadow-sm rounded-xl border border-gray-100 flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <select onChange={(e) => setSelectedDepartment(e.target.value)} value={selectedDepartment} className="rounded-lg border-gray-200 shadow-sm text-xs px-3 h-7 font-medium text-gray-700 bg-white transition-colors duration-150 hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"><option value="all">すべての部署</option>{sortedDepartmentsForFilter.map(dep => <option key={dep} value={dep}>{dep}</option>)}</select>
                <select onChange={(e) => setSelectedGroup(e.target.value)} value={selectedGroup} className="rounded-lg border-gray-200 shadow-sm text-xs px-3 h-7 font-medium text-gray-700 bg-white transition-colors duration-150 hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"><option value="all">すべてのグループ</option>{sortedGroupsForFilter.map(grp => <option key={grp} value={grp}>{grp}</option>)}</select>
                <div className="inline-flex rounded-lg shadow-sm border border-gray-200 overflow-hidden" role="group">
                    <button type="button" onClick={() => setSelectedSettingFilter('all')} className={`${selectedSettingFilter === 'all' ? BUTTON_STYLES.primaryGroup.active : BUTTON_STYLES.primaryGroup.inactive} ${BUTTON_STYLES.primaryGroup.transition} px-3 h-7 text-xs flex items-center`}>すべて</button>
                    <button type="button" onClick={() => setSelectedSettingFilter('responsibility')} className={`${selectedSettingFilter === 'responsibility' ? BUTTON_STYLES.primaryGroup.active : BUTTON_STYLES.primaryGroup.inactive} ${BUTTON_STYLES.primaryGroup.transition} px-3 h-7 text-xs border-l border-gray-200 flex items-center`}>担当設定</button>
                    <button type="button" onClick={() => setSelectedSettingFilter('support')} className={`${selectedSettingFilter === 'support' ? BUTTON_STYLES.primaryGroup.active : BUTTON_STYLES.primaryGroup.inactive} ${BUTTON_STYLES.primaryGroup.transition} px-3 h-7 text-xs border-l border-gray-200 flex items-center`}>支援設定</button>
                </div>
                {isToday && (
                  <div className="inline-flex rounded-lg shadow-sm border border-gray-200 overflow-hidden" role="group">
                      <button type="button" onClick={() => setSelectedStatus('all')} className={`${selectedStatus === 'all' ? BUTTON_STYLES.secondaryGroup.active : BUTTON_STYLES.secondaryGroup.inactive} ${BUTTON_STYLES.secondaryGroup.transition} px-3 h-7 text-xs flex items-center`}>すべて</button>
                      <button type="button" onClick={() => setSelectedStatus('available')} className={`${selectedStatus === 'available' ? BUTTON_STYLES.secondaryGroup.active : BUTTON_STYLES.secondaryGroup.inactive} ${BUTTON_STYLES.secondaryGroup.transition} px-3 h-7 text-xs border-l border-gray-200 flex items-center`}>対応可能</button>
                      <button type="button" onClick={() => setSelectedStatus('unavailable')} className={`${selectedStatus === 'unavailable' ? BUTTON_STYLES.secondaryGroup.active : BUTTON_STYLES.secondaryGroup.inactive} ${BUTTON_STYLES.secondaryGroup.transition} px-3 h-7 text-xs border-l border-gray-200 flex items-center`}>対応不可</button>
                  </div>
                )}
            </div>
            {isToday && (
              <div className="flex items-center space-x-3">
                <div className="text-right bg-green-50 px-3 rounded-lg border border-green-200 h-7 flex items-center">
                    <span className="text-xs text-green-700 font-medium mr-2">現在の対応可能人数:</span>
                    <span className="text-base font-bold text-green-600">{availableStaffCount}人</span>
                </div>
                
                {/* リアルタイム更新オンオフ切替（対応可能人数の右側に移動） */}
                <div 
                  className="flex items-center space-x-2"
                  title={`リアルタイム更新: ${realTimeUpdateEnabled ? 'オン - 他の人の変更を即座に反映' : 'オフ - 手動更新のみ、性能向上'}`}
                >
                  
                
                </div>
                
                <div 
                  className="flex items-center space-x-2"
                >
                  {/* 左：状態インジケーター（大きな点滅ドット） */}
                  <div className={`w-3 h-3 rounded-full ${
                    realTimeUpdateEnabled ? 'bg-teal-500 animate-pulse' : 'bg-gray-400'
                  }`}></div>
                  
                  {/* 中央：トグルスイッチ */}
                  <button 
                    onClick={toggleRealTimeUpdate}
                    className={`relative w-8 h-4 rounded-full transition-colors duration-200 ${
                      realTimeUpdateEnabled ? 'bg-teal-500' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-200 ${
                      realTimeUpdateEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}></div>
                  </button>
                  
                  {/* 右：状態アイコン（モノクロSVG） */}
                  {realTimeUpdateEnabled ? (
                    // WiFi信号アイコン（通信中）
                    <svg className="w-4 h-4 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M17.778 8.222c-4.296-4.296-11.26-4.296-15.556 0A1 1 0 01.808 6.808c5.076-5.077 13.308-5.077 18.384 0a1 1 0 01-1.414 1.414zM14.95 11.05a7 7 0 00-9.9 0 1 1 0 01-1.414-1.414 9 9 0 0112.728 0 1 1 0 01-1.414 1.414zM12.12 13.88a3 3 0 00-4.24 0 1 1 0 01-1.415-1.414 5 5 0 017.07 0 1 1 0 01-1.415 1.414zM9 16a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd"/>
                    </svg>
                  ) : (
                    // 一時停止アイコン（停止中）
                    <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                  )}
                </div>
              </div>
            )}
        </div>

        <div className="mb-2 p-4 bg-white shadow-sm rounded-xl border border-gray-100">
          <StatusChart 
            data={chartData} 
            staffList={staffList} 
            selectedDepartment={selectedDepartment} 
            selectedGroup={selectedGroup}
            showChart={showLineChart}
            onToggleChart={() => setShowLineChart(!showLineChart)}
          />
        </div>
        
        <div className="bg-white shadow-lg rounded-xl border border-gray-100 relative min-w-[1360px]">
          {/* 統一ヘッダー行 */}
          <div className="sticky top-0 z-30 flex bg-gray-100 border-b shadow-sm">
            <div className="min-w-fit max-w-[240px] w-[240px] px-2 py-2 font-bold text-gray-600 text-sm text-center border-r whitespace-nowrap">
              部署 / グループ / スタッフ名
            </div>
            <div className="flex-1">
              <div className="overflow-x-auto" ref={topScrollRef} onScroll={handleTopScroll} data-scroll-ref="top">
                <div className="min-w-[1120px]">
                  <div className="flex font-bold text-sm">
                  {Array.from({ length: 13 }).map((_, i) => {
                    const hour = 8 + i;
                    const isEarlyOrNight = hour === 8 || hour >= 18;
                    const width = `${(4 / 52) * 100}%`;
                    return (
                      <div 
                        key={hour} 
                        className={`text-left pl-2 border-r py-2 whitespace-nowrap ${isEarlyOrNight ? 'bg-blue-50' : ''}`}
                        style={{ width }}
                      >
                        {hour}:00
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex">
            <div className="min-w-fit max-w-[240px] w-[240px] sticky left-0 z-20 bg-white border-r border-gray-200">
              {Object.keys(groupedStaffForGantt).length > 0 ? (
                sortByDisplayOrder(Object.entries(groupedStaffForGantt), 'department').map(([department, groups]) => (
                  <div key={department} className="department-group">
                    <h3 className="px-2 min-h-[33px] text-sm font-bold whitespace-nowrap flex items-center" style={getDepartmentGroupStyle(dynamicDepartmentColors[department] || departmentColors[department] || '#f5f5f5')}>{department}</h3>
                    {sortByDisplayOrder(Object.entries(groups), 'group').map(([group, staffInGroup]) => (
                      <div key={group}>
                        <h4 className="px-2 pl-6 min-h-[33px] text-xs font-semibold whitespace-nowrap flex items-center" style={getDepartmentGroupStyle(dynamicTeamColors[group] || teamColors[group] || '#f5f5f5')}>{group}</h4>
                        {staffInGroup.map((staff: any) => {
                          const supportBorderColor = getSupportBorderColor(staff);
                          return (
                          <div key={staff.id} 
                               className={`staff-timeline-row px-2 pl-12 text-sm font-medium whitespace-nowrap h-[45px] ${isHistoricalMode ? 'cursor-default' : 'hover:bg-gray-50 cursor-pointer'} flex items-center border-b border-gray-200`}
                               style={{
                                 border: supportBorderColor ? `2px solid ${supportBorderColor}` : undefined
                               }}
                               onClick={() => handleOpenResponsibilityModal(staff)}
                               onContextMenu={(e) => {
                                 e.preventDefault(); // デフォルトのコンテキストメニューを無効化
                                 if (!staff.department.includes('受付') && !staff.group.includes('受付')) {
                                   handleOpenAssignmentModal(staff);
                                 }
                               }}>
                            <span className={`staff-name ${staff.isSupporting ? 'text-amber-800' : ''}`}>
                              {staff.name}
                              {staff.isSupporting && (
                                <span className="support-info ml-1 text-xs text-amber-600 font-semibold">
                                  [支援:{getSupportDestinationText(staff)}]
                                </span>
                              )}
                              <ResponsibilityBadges 
                                responsibilities={getResponsibilityForDate(staff.id, displayDate)}
                                isReception={isReceptionStaff(staff)}
                              />
                            </span>
                          </div>
                        );
                        })}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500 whitespace-nowrap">表示対象のスタッフがいません。</div>
              )}
            </div>
            <div className="flex-1">
              {/* メインコンテンツ */}
              <div className="overflow-x-auto" ref={bottomScrollRef} onScroll={handleBottomScroll} data-scroll-ref="bottom">
                <div className="min-w-[1120px] relative">
                  {/* グリッド線はスタッフ行に個別配置（下記のスタッフループ内） */}
                  {currentTimePosition !== null && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30" 
                         style={{ left: `${currentTimePosition}%` }} 
                         title={`現在時刻: ${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`}>
                    </div>
                  )}
                  {Object.keys(groupedStaffForGantt).length > 0 ? (
                    sortByDisplayOrder(Object.entries(groupedStaffForGantt), 'department').map(([department, groups]) => (
                      <div key={department} className="department-group">
                        <div className="min-h-[33px]" style={getDepartmentGroupStyle(dynamicDepartmentColors[department] || departmentColors[department] || '#f5f5f5')}></div>
                        {sortByDisplayOrder(Object.entries(groups), 'group').map(([group, staffInGroup]) => (
                          <div key={group}>
                            <div className="min-h-[33px]" style={getDepartmentGroupStyle(dynamicTeamColors[group] || teamColors[group] || '#f5f5f5')}></div>
                            {staffInGroup.map((staff: any) => {
                              const supportBorderColor = getSupportBorderColor(staff);
                              return (
                              <div key={staff.id} 
                                   className="staff-timeline-row h-[45px] relative hover:bg-gray-50"
                                   style={{
                                     backgroundColor: supportBorderColor ? hexToRgba(supportBorderColor, 0.5) : undefined,
                                     borderBottom: '1px solid #d1d5db',
                                     zIndex: 1
                                   }}
                                   onMouseDown={(e) => handleTimelineMouseDown(e, staff)}
                                   onMouseLeave={() => {
                                     // マウスがスタッフ行から離れたら選択解除
                                     setSelectedSchedule(null);
                                   }}
                                   onDragOver={(e) => {
                                     e.preventDefault();
                                     e.dataTransfer.dropEffect = 'move';
                                   }}
                                   onDrop={(e) => {
                                     e.preventDefault();
                                     const scheduleData = e.dataTransfer.getData('application/json');
                                     if (scheduleData && draggedSchedule && draggedSchedule.start !== undefined && draggedSchedule.end !== undefined && draggedSchedule.id !== undefined) {
                                       const rect = e.currentTarget.getBoundingClientRect();
                                       
                                       // ゴーストエレメントの左端位置を計算（マウスポインタ位置からオフセットを引く）
                                       const ghostLeftX = e.clientX - rect.left - dragOffset;
                                       
                                       // 13時間分（8:00-21:00）を780分に分割
                                       const TIMELINE_HOURS = 13; // 21 - 8
                                       const MINUTES_PER_HOUR = 60;
                                       const TOTAL_MINUTES = TIMELINE_HOURS * MINUTES_PER_HOUR; // 780分
                                       
                                       // ゴースト左端位置を1分単位の分数に変換
                                       const minutePosition = (ghostLeftX / rect.width) * TOTAL_MINUTES;
                                       const snappedMinute = Math.round(minutePosition); // 最近傍の1分単位にスナップ
                                       
                                       // 分数を時刻に変換
                                       const newStartTime = 8 + (snappedMinute / MINUTES_PER_HOUR);
                                       const duration = draggedSchedule.end - draggedSchedule.start;
                                       const snappedEnd = newStartTime + duration;
                                       
                                       // console.log('=== ドラッグ移動デバッグ（ゴーストエレメント位置対応版） ===');
                                       // console.log('マウス位置:', e.clientX - rect.left, 'ドラッグオフセット:', dragOffset);
                                       // console.log('ゴースト左端位置:', ghostLeftX, 'タイムライン幅:', rect.width);
                                       // console.log('quarterPosition:', quarterPosition, 'snappedQuarter:', snappedQuarter);
                                       // console.log('newStartTime:', newStartTime, 'duration:', duration);
                                       // console.log('元の時刻:', draggedSchedule.start, '-', draggedSchedule.end);
                                       // console.log('新しい時刻:', newStartTime, '-', snappedEnd);
                                       
                                       if (newStartTime >= 8 && snappedEnd <= 21) {
                                         // スケジュール移動のAPI呼び出し
                                         handleMoveSchedule(draggedSchedule.id, staff.id, newStartTime, snappedEnd);
                                       }
                                     }
                                   }}>
                                {/* グリッド線（スタッフ行内のみ） */}
                                {(() => {
                                  const gridLines = [];
                                  for (let hour = 8; hour <= 21; hour++) {
                                    for (let minute = 0; minute < 60; minute += 5) {
                                      if (hour === 21 && minute > 0) break;
                                      const time = hour + minute / 60;
                                      const position = timeToPositionPercent(time);
                                      const timeString = `${hour}:${String(minute).padStart(2, '0')}`;
                                      
                                      const isHourMark = minute === 0;
                                      const lineClass = isHourMark 
                                        ? "absolute top-0 bottom-0 w-0.5 border-l border-gray-400 z-5 opacity-70"
                                        : "absolute top-0 bottom-0 w-0.5 border-l border-gray-300 z-5 opacity-50";
                                      
                                      gridLines.push(
                                        <div
                                          key={`grid-${staff.id}-${hour}-${minute}`}
                                          className={lineClass}
                                          style={{ left: `${position}%` }}
                                          title={timeString}
                                        />
                                      );
                                    }
                                  }
                                  return gridLines;
                                })()}
                                
                                {/* 早朝エリア（8:00-9:00）の背景強調 */}
                                <div className="absolute top-0 bottom-0 bg-blue-50 opacity-50 pointer-events-none" 
                                     style={{ left: `0%`, width: `${((9-8)*4)/52*100}%` }} 
                                     title="早朝時間帯（8:00-9:00）">
                                </div>
                                {/* 夜間エリア（18:00-21:00）の背景強調 */}
                                <div className="absolute top-0 bottom-0 bg-blue-50 opacity-50 pointer-events-none" 
                                     style={{ left: `${((18-8)*4)/52*100}%`, width: `${((21-18)*4)/52*100}%` }} 
                                     title="夜間時間帯（18:00-21:00）">
                                </div>
                                {schedules.filter(s => {
                                  if (s.staffId !== staff.id) return false;
                                  
                                  // 祝日判定：契約データは祝日に表示しない
                                  const scheduleLayer = s.layer || 'adjustment';
                                  if (scheduleLayer === 'contract') {
                                    const holiday = getHoliday(displayDate, holidays);
                                    if (holiday) return false; // 祝日なら契約データを非表示
                                  }
                                  
                                  return true;
                                }).sort((a, b) => {
                                  // レイヤー順: contract(1) < adjustment(2)
                                  const layerOrder: { [key: string]: number } = { contract: 1, adjustment: 2 };
                                  const aLayer = (a as any).layer || 'adjustment';
                                  const bLayer = (b as any).layer || 'adjustment';
                                  
                                  // 第1優先: レイヤー順序
                                  const layerDiff = layerOrder[aLayer] - layerOrder[bLayer];
                                  if (layerDiff !== 0) return layerDiff;
                                  
                                  // 第2優先: 同一調整レイヤー内では後勝ち（updatedAt時刻順）
                                  if (aLayer === 'adjustment' && bLayer === 'adjustment') {
                                    // updatedAtによる真の「後勝ち」ソート（最後に更新されたものが後に描画される）
                                    const aUpdated = new Date((a as any).updatedAt || 0);
                                    const bUpdated = new Date((b as any).updatedAt || 0);
                                    return aUpdated.getTime() - bUpdated.getTime(); // 古い更新から新しい更新へ
                                  }
                                  
                                  return 0;
                                }).map((schedule, index) => {
                                  const startPosition = timeToPositionPercent(schedule.start);
                                  const endPosition = timeToPositionPercent(schedule.end);
                                  const barWidth = endPosition - startPosition;
                                  const scheduleLayer = schedule.layer || 'adjustment';
                                  const isContract = scheduleLayer === 'contract';
                                  const isHistoricalData = schedule.isHistorical || scheduleLayer === 'historical';
                                  
                                  
                                  return (
                                    <div key={`${schedule.id}-${scheduleLayer}-${schedule.staffId}-${index}`} 
                                         draggable={!isContract && !isHistoricalData && canEdit(schedule.staffId)}
                                         className={`schedule-block absolute h-6 rounded text-white text-xs flex items-center justify-between px-2 ${
                                           isContract || isHistoricalData ? 'cursor-default' : 
                                           canEdit(schedule.staffId) ? `cursor-ew-resize hover:opacity-90 ${LIGHT_ANIMATIONS.schedule}` : 'cursor-not-allowed'
                                         } ${
                                           selectedSchedule && selectedSchedule.schedule.id === schedule.id && selectedSchedule.layer === scheduleLayer
                                             ? 'ring-2 ring-yellow-400 ring-offset-1'
                                             : ''
                                         } ${
                                           isHistoricalData ? 'border-2 border-dashed border-gray-400' : ''
                                         } ${
                                           getFeedbackClasses(schedule.id)
                                         }`}
                                         style={{ 
                                           left: `${startPosition}%`, 
                                           width: `${barWidth}%`, 
                                           top: '50%', 
                                           transform: 'translateY(-50%)', 
                                           backgroundColor: (() => {
                                             const color = getEffectiveStatusColor(schedule.status);
                                             if (schedule.layer === 'adjustment' && !statusColors[schedule.status]) {
                                               // console.log(`Status color debug: status="${schedule.status}", color="${color}", layer="${schedule.layer}"`);
                                             }
                                             return color;
                                           })(),
                                           opacity: isContract ? 0.5 : isHistoricalData ? 0.8 : canEdit(schedule.staffId) ? 1 : 0.7,
                                           backgroundImage: isContract ? 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)' : 
                                                          isHistoricalData ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.15) 10px, rgba(255,255,255,0.15) 20px)' : 'none',
                                           zIndex: isContract ? 10 : isHistoricalData ? 15 : (30 + index) // 調整レイヤーは後勝ち（後のindexほど高いz-index）
                                         }} 
                                         onClick={(e) => { 
                                           e.stopPropagation(); 
                                           if (!isContract && !isHistoricalData && canEdit(schedule.staffId)) {
                                             const currentSelection = selectedSchedule;
                                             if (currentSelection && 
                                                 currentSelection.schedule.id === schedule.id && 
                                                 currentSelection.layer === scheduleLayer) {
                                               // 同じ予定を再クリック → 編集モーダルを開く
                                               handleOpenModal(schedule);
                                               setSelectedSchedule(null);
                                             } else {
                                               // 異なる予定をクリック → 選択状態にする
                                               setSelectedSchedule({ schedule, layer: scheduleLayer });
                                             }
                                           }
                                         }}
                                         onDragStart={(e) => {
                                           if (isContract || !canEdit(schedule.staffId) || (schedule as any).isApprovedPending) {
                                             e.preventDefault();
                                             return;
                                           }
                                           
                                           // ドラッグ開始時に選択状態をクリア
                                           setSelectedSchedule(null);
                                           
                                           // ドラッグ開始時にスクロール位置をキャプチャ（メインコンテンツから）
                                           const horizontalScroll = bottomScrollRef.current?.scrollLeft || 0;
                           const verticalScroll = window.scrollY || document.documentElement.scrollTop || 0;
                                           // console.log('ドラッグ開始時のスクロール位置キャプチャ:');
                           // console.log('- 横スクロール:', horizontalScroll);
                           // console.log('- 縦スクロール:', verticalScroll);
                                           setSavedScrollPosition({ x: horizontalScroll, y: verticalScroll });
                                           
                                           setDraggedSchedule(schedule);
                                           
                                           // ゴーストエレメント位置調整用オフセットを計算
                                           const scheduleElement = e.currentTarget as HTMLElement;
                                           const scheduleRect = scheduleElement.getBoundingClientRect();
                                           const mouseOffsetX = e.clientX - scheduleRect.left;
                                           setDragOffset(mouseOffsetX);
                                           
                                           e.dataTransfer.setData('application/json', JSON.stringify(schedule));
                                           e.dataTransfer.effectAllowed = 'move';
                                         }}
                                         onDragEnd={() => {
                                           setDraggedSchedule(null);
                                           setDragOffset(0);
                                         }}
                                         title={`${getEffectiveDisplayName(schedule.status)}${schedule.memo ? ': ' + schedule.memo : ''} (${isContract ? 'レイヤー1:契約' : (schedule as any).isApprovedPending ? 'レイヤー2:承認済み' : 'レイヤー2:調整'})`}>
                                      <span className="truncate">
                                        {getEffectiveDisplayName(schedule.status)}
                                        {schedule.memo && (
                                          <span className="ml-1 text-yellow-200">📝</span>
                                        )}
                                      </span>
                                      {!isContract && !isHistoricalData && canEdit(schedule.staffId) && (
                                        <button onClick={(e) => { 
                                          e.stopPropagation(); 
                                          // 削除確認前にスクロール位置を保存
                                          setSavedScrollPosition({ 
                                            x: bottomScrollRef.current?.scrollLeft || 0, 
                                            y: window.scrollY || 0 
                                          });
                                          setDeletingScheduleId(schedule.id); 
                                        }} 
                                                className="text-white hover:text-red-200 ml-2">×</button>
                                      )}
                                    </div>
                                  );
                                })}
                                {dragInfo && dragInfo.staff.id === staff.id && (
                                  <div className="absolute bg-indigo-200 bg-opacity-50 border-2 border-dashed border-indigo-500 rounded pointer-events-none z-[999]"
                                       style={{ 
                                         left: `${Math.min(dragInfo.startX, dragInfo.currentX)}px`, 
                                         top: '25%', 
                                         width: `${Math.abs(dragInfo.currentX - dragInfo.startX)}px`, 
                                         height: '50%' 
                                       }} />
                                )}
                              </div>
                            );
                            })}
                          </div>
                        ))}
                      </div>
                    ))
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* インポート中ローディング表示 */}
      {isImporting && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[10001]">
          <div className="bg-white p-6 rounded-lg flex items-center space-x-3 shadow-xl border-2 border-blue-200">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="text-lg font-medium text-gray-700">インポート中...</span>
          </div>
        </div>
      )}

      {/* === Phase 2b: 楽観的更新通知システム === */}
      {operationNotifications.length > 0 && (
        <div className="fixed top-4 right-4 space-y-2 z-[10000]">
          {operationNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`
                flex items-center px-4 py-3 rounded-lg shadow-lg border max-w-sm
                ${notification.type === 'processing' ? 'bg-blue-50 border-blue-200 text-blue-800' : ''}
                ${notification.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : ''}
                ${notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-800' : ''}
                ${LIGHT_ANIMATIONS.feedbackFade}
              `}
            >
              {/* アイコン */}
              <div className="flex-shrink-0 mr-3">
                {notification.type === 'processing' && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                )}
                {notification.type === 'success' && (
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {notification.type === 'error' && (
                  <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* メッセージ */}
              <div className="flex-1">
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
              
              {/* 閉じるボタン（エラー通知のみ） */}
              {notification.type === 'error' && (
                <button
                  onClick={() => removeNotification(notification.id)}
                  className="flex-shrink-0 ml-2 text-red-400 hover:text-red-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Fragment>
  );
}
