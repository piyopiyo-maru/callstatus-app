/**
 * タイムライン関連のユーティリティ関数とタイプ定義
 * メイン画面と個人ページで共通利用
 */

import { getCachedStatusColor, getCachedStatusDisplayName, isCacheEmpty, initializeCacheFromLocalStorage } from '../../utils/globalDisplaySettingsCache';

// デバッグログ制御（開発環境 + timeline-debug フラグ時のみ）
const isTimelineDebugEnabled = () => typeof window !== 'undefined' && 
  process.env.NODE_ENV === 'development' && 
  window.localStorage?.getItem('timeline-debug') === 'true';

// === タイムライン設定定数 ===
export const TIMELINE_CONFIG = {
  START_HOUR: 8,        // 8:00
  END_HOUR: 21,         // 21:00
  MINUTES_STEP: 1,      // 1分間隔
  get TOTAL_MINUTES() {
    return (this.END_HOUR - this.START_HOUR) * 60; // 13時間 × 60 = 780分
  },
  get TOTAL_QUARTERS() {
    return (this.END_HOUR - this.START_HOUR) * 4; // 13時間 × 4 = 52マス（表示用）
  },
  get TOTAL_HOURS() {
    return this.END_HOUR - this.START_HOUR; // 13時間
  }
} as const;

// === スケジュール関連タイプ ===
export interface Schedule {
  id: number | string;
  status: string;
  start: Date | number;
  end: Date | number;
  memo?: string;
  layer?: 'contract' | 'adjustment' | 'historical';
  staffId: number;
  staffName?: string;
  staffDepartment?: string;
  staffGroup?: string;
  empNo?: string;
  date?: string;
  isHistorical?: boolean;
  _fetchDate?: string; // どの日付から取得されたかを記録
}

export interface Staff {
  id: number;
  empNo?: string;
  name: string;
  department: string;
  group: string;
  isActive?: boolean;
}

// === ステータス色定義 ===
export const STATUS_COLORS: { [key: string]: string } = {
  'online': '#22c55e',
  'remote': '#10b981', 
  'meeting': '#f59e0b',
  'training': '#3b82f6',
  'break': '#f97316',
  'off': '#ef4444', 
  'unplanned': '#dc2626',
  'night duty': '#4f46e5',
  'trip': '#ec4899',
  // 日本語ステータス名
  '出社': '#22c55e',      // online (緑)
  'リモート': '#10b981',   // remote (青緑)
  '会議': '#f59e0b',      // meeting (オレンジ)
  '研修': '#3b82f6',      // training (青)
  '休憩': '#f97316',      // break (オレンジ)
  '休暇': '#ef4444',      // off (赤)
  '夜間勤務': '#4f46e5',  // night duty (紫)
  '遅刻': '#dc2626',      // unplanned (濃い赤)
};

// === 時間変換ユーティリティ関数 ===

/**
 * 時間（小数点）を位置パーセンテージに変換
 * @param time 時間（例: 9.5 = 9:30）
 * @returns 位置パーセンテージ（0-100）
 */
export const timeToPositionPercent = (time: number): number => {
  const minutesFromStart = (time - TIMELINE_CONFIG.START_HOUR) * 60;
  return Math.max(0, Math.min(100, (minutesFromStart / TIMELINE_CONFIG.TOTAL_MINUTES) * 100));
};

/**
 * 位置パーセンテージを時間（小数点）に変換（1分単位精度）
 * @param percent 位置パーセンテージ（0-100）
 * @returns 時間（例: 9.5 = 9:30）
 */
export const positionPercentToTime = (percent: number): number => {
  const minutesFromStart = (percent / 100) * TIMELINE_CONFIG.TOTAL_MINUTES;
  const totalMinutes = TIMELINE_CONFIG.START_HOUR * 60 + minutesFromStart;
  
  // 1分単位にスナップ
  const snappedMinutes = Math.round(totalMinutes / TIMELINE_CONFIG.MINUTES_STEP) * TIMELINE_CONFIG.MINUTES_STEP;
  
  return snappedMinutes / 60;
};

/**
 * 時間選択肢を生成（ドロップダウン用）
 * @param startHour 開始時間
 * @param endHour 終了時間
 * @returns {value: number, label: string}[] の配列
 */
export const generateTimeOptions = (
  startHour: number = TIMELINE_CONFIG.START_HOUR, 
  endHour: number = TIMELINE_CONFIG.END_HOUR
) => {
  const options = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += TIMELINE_CONFIG.MINUTES_STEP) {
      const timeValue = h + m / 60;
      const timeLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      options.push({ value: timeValue, label: timeLabel });
    }
  }
  // 終了時刻も追加
  options.push({ value: endHour, label: `${String(endHour).padStart(2, '0')}:00`});
  return options;
};

/**
 * 小数点時間を時:分形式に変換
 * @param time 小数点時間（例: 9.5）
 * @returns 時:分形式の文字列（例: "09:30"）
 */
export const formatDecimalTime = (time: number): string => {
  const hours = Math.floor(time);
  const minutes = Math.round((time - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * 時:分形式を小数点時間に変換
 * @param timeString 時:分形式の文字列（例: "9:30"）
 * @returns 小数点時間（例: 9.5）
 */
export const parseTimeString = (timeString: string): number => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours + minutes / 60;
};

/**
 * 現在時刻の位置パーセンテージを計算
 * @param currentTime 現在時刻のDateオブジェクト
 * @returns 位置パーセンテージ（null = 表示範囲外）
 */
export const getCurrentTimePosition = (currentTime: Date): number | null => {
  const currentHour = currentTime.getHours() + currentTime.getMinutes() / 60;
  
  // 表示範囲外の場合はnullを返す
  if (currentHour < TIMELINE_CONFIG.START_HOUR || currentHour > TIMELINE_CONFIG.END_HOUR) {
    return null;
  }
  
  return timeToPositionPercent(currentHour);
};

/**
 * ステータス文字列を表示用に整形（日本語対応）
 * @param status ステータス文字列
 * @param useJapanese 日本語表示を使用するか（デフォルト: true）
 * @returns 表示用のステータス文字列
 */
export const capitalizeStatus = (status: string, useJapanese: boolean = true): string => {
  if (useJapanese) {
    return getEffectiveDisplayName(status);
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
};

/**
 * 現在有効なステータス色を取得（カスタム設定を含む）
 * @param status ステータス文字列
 * @returns 色のHEXコード
 */
export const getEffectiveStatusColor = (status: string): string => {
  // キャッシュが空の場合は初期化を試行
  if (typeof window !== 'undefined' && isCacheEmpty()) {
    if (isTimelineDebugEnabled()) console.log(`[Timeline] Cache is empty, initializing from localStorage`);
    initializeCacheFromLocalStorage();
  }

  // グローバルキャッシュから取得を試行
  const cachedColor = getCachedStatusColor(status);
  if (cachedColor) {
    if (isTimelineDebugEnabled()) console.log(`[Timeline] Using cached color for "${status}": ${cachedColor}`);
    return cachedColor;
  }

  // キャッシュにない場合はローカルストレージから取得（フォールバック）
  if (typeof window !== 'undefined') {
    try {
      const savedColors = localStorage.getItem('callstatus-statusColors');
      if (savedColors) {
        const customColors = JSON.parse(savedColors);
        if (customColors[status]) {
          if (isTimelineDebugEnabled()) console.log(`[Timeline] Using localStorage color for "${status}": ${customColors[status]}`);
          return customColors[status];
        }
      }
    } catch (error) {
      console.error('Failed to parse custom status colors:', error);
    }
  }
  
  const defaultColor = STATUS_COLORS[status] || '#9ca3af';
  if (isTimelineDebugEnabled()) console.log(`[Timeline] Using default color for "${status}": ${defaultColor}`);
  return defaultColor;
};

/**
 * 現在有効なステータス表示名を取得（カスタム設定を含む）
 * @param status ステータス文字列
 * @returns 表示用のステータス文字列
 */
export const getEffectiveDisplayName = (status: string): string => {
  // キャッシュが空の場合は初期化を試行
  if (typeof window !== 'undefined' && isCacheEmpty()) {
    if (isTimelineDebugEnabled()) console.log(`[Timeline] Cache is empty, initializing from localStorage for display name`);
    initializeCacheFromLocalStorage();
  }

  // グローバルキャッシュから取得を試行
  const cachedDisplayName = getCachedStatusDisplayName(status);
  if (cachedDisplayName) {
    if (isTimelineDebugEnabled()) console.log(`[Timeline] Using cached display name for "${status}": ${cachedDisplayName}`);
    return cachedDisplayName;
  }

  // キャッシュにない場合はローカルストレージから取得（フォールバック）
  if (typeof window !== 'undefined') {
    try {
      const savedDisplayNames = localStorage.getItem('callstatus-statusDisplayNames');
      if (savedDisplayNames) {
        const customDisplayNames = JSON.parse(savedDisplayNames);
        if (customDisplayNames[status]) {
          if (isTimelineDebugEnabled()) console.log(`[Timeline] Using localStorage display name for "${status}": ${customDisplayNames[status]}`);
          return customDisplayNames[status];
        }
      }
    } catch (error) {
      console.error('Failed to parse custom status display names:', error);
    }
  }
  
  // デフォルトの日本語表示名を返す
  if (STATUS_DISPLAY_NAMES[status]) {
    if (isTimelineDebugEnabled()) console.log(`[Timeline] Using default display name for "${status}": ${STATUS_DISPLAY_NAMES[status]}`);
    return STATUS_DISPLAY_NAMES[status];
  }
  
  // フォールバック: 英語の先頭大文字
  const fallbackName = status.charAt(0).toUpperCase() + status.slice(1);
  if (isTimelineDebugEnabled()) console.log(`[Timeline] Using fallback display name for "${status}": ${fallbackName}`);
  return fallbackName;
};

/**
 * スケジュールの表示順序を決定（レイヤー順）
 * @param schedules スケジュールの配列
 * @returns ソートされたスケジュール配列
 */
export const sortSchedulesByLayer = (schedules: Schedule[]): Schedule[] => {
  return schedules.sort((a, b) => {
    // レイヤー順: contract(1) < adjustment(2) < historical(3)
    const layerOrder: { [key: string]: number } = { 
      contract: 1, 
      adjustment: 2,
      historical: 3
    };
    const aLayer = a.layer || 'adjustment';
    const bLayer = b.layer || 'adjustment';
    return layerOrder[aLayer] - layerOrder[bLayer];
  });
};

/**
 * スケジュールバーのスタイル情報を計算
 * @param schedule スケジュールオブジェクト
 * @returns スタイル情報
 */
export const calculateScheduleBarStyle = (schedule: Schedule) => {
  const startPosition = timeToPositionPercent(typeof schedule.start === 'number' ? schedule.start : 0);
  const endPosition = timeToPositionPercent(typeof schedule.end === 'number' ? schedule.end : 0);
  const barWidth = endPosition - startPosition;
  const scheduleLayer = schedule.layer || 'adjustment';
  const isContract = scheduleLayer === 'contract';
  const isHistoricalData = schedule.isHistorical || scheduleLayer === 'historical';
  
  return {
    left: `${startPosition}%`,
    width: `${barWidth}%`,
    backgroundColor: getEffectiveStatusColor(schedule.status),
    opacity: isContract ? 0.5 : isHistoricalData ? 0.8 : 1,
    zIndex: isContract ? 10 : isHistoricalData ? 15 : 30,
    startPosition,
    endPosition,
    barWidth,
    isContract,
    isHistoricalData
  };
};

// === 利用可能なステータス一覧 ===
// 対応可能人数としてカウントするステータス（Online、Remote、Night Duty のみ）
export const AVAILABLE_STATUSES = [
  'online', 
  'remote', 
  'night duty'
] as const;

// === 全ステータス一覧（ステータス選択用） ===
export const ALL_STATUSES = [
  'online', 
  'remote', 
  'night duty', 
  'break', 
  'off', 
  'unplanned', 
  'meeting', 
  'training',
  'trip'
] as const;

// === ステータス日本語表示名マッピング ===
export const STATUS_DISPLAY_NAMES: { [key: string]: string } = {
  'online': '出社',
  'remote': 'リモート',
  'meeting': '会議',
  'training': '研修',
  'break': '休憩',
  'off': '休み',
  'unplanned': '急用',
  'night duty': '夜間対応',
  'trip': '出張'
};

// === 時間軸の特別エリア定義 ===
export const SPECIAL_TIME_AREAS = {
  EARLY_MORNING: {
    start: TIMELINE_CONFIG.START_HOUR,     // 8:00
    end: TIMELINE_CONFIG.START_HOUR + 1,   // 9:00
    className: 'bg-blue-50 opacity-30',
    title: '早朝時間帯（8:00-9:00）'
  },
  NIGHT_TIME: {
    start: 18,                             // 18:00
    end: TIMELINE_CONFIG.END_HOUR,         // 21:00
    className: 'bg-blue-50 opacity-30',
    title: '夜間時間帯（18:00-21:00）'
  }
} as const;

// === 色彩アクセシビリティ関数 (WCAG 2.1準拠) ===

/**
 * HEX色をRGB値に変換
 * @param hex HEX色コード（#を含む/含まない両対応）
 * @returns RGB値のオブジェクト、無効な場合はnull
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // #を除去し、3桁の場合は6桁に拡張
  const cleanHex = hex.replace('#', '');
  const expandedHex = cleanHex.length === 3 
    ? cleanHex.split('').map(char => char + char).join('')
    : cleanHex;
  
  // 有効性チェック
  if (!/^[0-9A-Fa-f]{6}$/.test(expandedHex)) {
    return null;
  }
  
  const r = parseInt(expandedHex.slice(0, 2), 16);
  const g = parseInt(expandedHex.slice(2, 4), 16);
  const b = parseInt(expandedHex.slice(4, 6), 16);
  
  return { r, g, b };
}

/**
 * RGB値から相対輝度を計算（WCAG 2.1準拠）
 * @param r 赤成分 (0-255)
 * @param g 緑成分 (0-255)  
 * @param b 青成分 (0-255)
 * @returns 相対輝度 (0-1)
 */
export function getRelativeLuminance(r: number, g: number, b: number): number {
  // RGB値を0-1の範囲に正規化
  const [rs, gs, bs] = [r, g, b].map(c => c / 255);
  
  // ガンマ補正を適用（WCAG 2.1の公式）
  const linearize = (colorComponent: number): number => {
    return colorComponent <= 0.03928
      ? colorComponent / 12.92
      : Math.pow((colorComponent + 0.055) / 1.055, 2.4);
  };
  
  const rLinear = linearize(rs);
  const gLinear = linearize(gs);
  const bLinear = linearize(bs);
  
  // 相対輝度を計算（人間の視覚特性を考慮した重み付け）
  return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
}

/**
 * HEX色をHSL色空間に変換
 * @param hex HEX色コード
 * @returns HSL値のオブジェクト、無効な場合はnull
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h: number, s: number;
  const l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // 無彩色
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
      default: h = 0;
    }
    h /= 6;
  }
  
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * HSL色をHEX色に変換
 * @param h 色相 (0-360)
 * @param s 彩度 (0-100)
 * @param l 明度 (0-100)
 * @returns HEX色コード
 */
export function hslToHex(h: number, s: number, l: number): string {
  h = h / 360;
  s = s / 100;
  l = l / 100;
  
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let r: number, g: number, b: number;
  
  if (s === 0) {
    r = g = b = l; // 無彩色
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  
  const toHex = (c: number): string => {
    const hex = Math.round(c * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 背景色に対してデザイン重視の見やすいテキスト色を計算（類似色+明度差アプローチ）
 * @param backgroundColor HEX色コード
 * @returns 美しく見やすいテキスト色
 */
export function getDesignTextColor(backgroundColor: string): string {
  const hsl = hexToHsl(backgroundColor);
  
  // 無効な色の場合はフォールバック
  if (!hsl) {
    return '#2d3748'; // 濃いグレー
  }
  
  const { h, s, l } = hsl;
  
  // 同系色相を保ちつつ明度を大幅に変更
  let targetLightness: number;
  let targetSaturation: number;
  
  if (l > 70) {
    // 明るい背景 → 濃い同系色テキスト
    targetLightness = Math.max(15, l - 60); // 大幅に暗く
    targetSaturation = Math.min(80, s + 20); // 少し鮮やかに
  } else if (l > 40) {
    // 中程度の背景 → より濃い同系色テキスト
    targetLightness = Math.max(10, l - 35);
    targetSaturation = Math.min(70, s + 15);
  } else {
    // 暗い背景 → 明るい同系色テキスト
    targetLightness = Math.min(85, l + 50); // 大幅に明るく
    targetSaturation = Math.max(20, s - 10); // 少し落ち着かせる
  }
  
  return hslToHex(h, targetSaturation, targetLightness);
}

/**
 * 背景色に対して最適なテキスト色を計算（レガシー・フォールバック用）
 * @param backgroundColor HEX色コード
 * @param lightTextColor 明るいテキスト色（デフォルト: 白）
 * @param darkTextColor 暗いテキスト色（デフォルト: 黒）
 * @returns 最適なテキスト色
 */
export function getContrastTextColor(
  backgroundColor: string,
  lightTextColor: string = '#ffffff',
  darkTextColor: string = '#000000'
): string {
  // 新しいデザイン重視の関数を使用
  return getDesignTextColor(backgroundColor);
}

/**
 * 背景色に対するテキスト色のコントラスト比を計算
 * @param backgroundColor 背景色のHEX色コード
 * @param textColor テキスト色のHEX色コード
 * @returns コントラスト比（1-21の範囲）
 */
export function getContrastRatio(backgroundColor: string, textColor: string): number {
  const bgRgb = hexToRgb(backgroundColor);
  const textRgb = hexToRgb(textColor);
  
  if (!bgRgb || !textRgb) {
    return 1; // 無効な色の場合は最低コントラスト比を返す
  }
  
  const bgLuminance = getRelativeLuminance(bgRgb.r, bgRgb.g, bgRgb.b);
  const textLuminance = getRelativeLuminance(textRgb.r, textRgb.g, textRgb.b);
  
  // より明るい色を分子、暗い色を分母にしてコントラスト比を計算
  const lighter = Math.max(bgLuminance, textLuminance);
  const darker = Math.min(bgLuminance, textLuminance);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 部署・グループ用のスタイルオブジェクトを生成
 * @param backgroundColor 背景色のHEX色コード
 * @returns React.CSSPropertiesオブジェクト（backgroundColor + color）
 */
export function getDepartmentGroupStyle(backgroundColor: string): React.CSSProperties {
  return {
    backgroundColor,
    color: getContrastTextColor(backgroundColor)
  };
}

// === 統一カラーシステム（Airシフト風プロフェッショナルデザイン） ===
export const BRAND_COLORS = {
  // プライマリ（青系）- メイン機能・設定系
  primary: {
    50: 'bg-indigo-50',
    100: 'bg-indigo-100', 
    500: 'bg-indigo-500',
    600: 'bg-indigo-600',
    700: 'bg-indigo-700',
    text: 'text-indigo-600',
    textWhite: 'text-white',
    border: 'border-indigo-600',
    hover: 'hover:bg-indigo-700',
    ring: 'focus:ring-indigo-500'
  },
  
  // セカンダリ（緑系）- ステータス・状態系 
  secondary: {
    50: 'bg-teal-50',
    100: 'bg-teal-100',
    500: 'bg-teal-500', 
    600: 'bg-teal-600',
    700: 'bg-teal-700',
    text: 'text-teal-600',
    textWhite: 'text-white',
    border: 'border-teal-500',
    hover: 'hover:bg-teal-600',
    ring: 'focus:ring-teal-500'
  },
  
  // ニュートラル（グレー系）- 非選択・背景
  neutral: {
    50: 'bg-gray-50',
    100: 'bg-gray-100',
    200: 'bg-gray-200',
    300: 'bg-gray-300',
    400: 'bg-gray-400',
    500: 'bg-gray-500',
    600: 'bg-gray-600',
    700: 'bg-gray-700',
    800: 'bg-gray-800',
    text: 'text-gray-700',
    textLight: 'text-gray-500',
    textDark: 'text-gray-800',
    textWhite: 'text-white',
    border: 'border-gray-300',
    borderLight: 'border-gray-200',
    hover: 'hover:bg-gray-50',
    ring: 'focus:ring-gray-500'
  }
} as const;

// === 統一ボタンスタイル（商用製品クオリティ） ===
export const BUTTON_STYLES = {
  // プライマリボタングループ（設定系：すべて|担当設定|支援設定）
  primaryGroup: {
    active: `px-3 py-1 text-xs font-medium ${BRAND_COLORS.primary[600]} ${BRAND_COLORS.primary.textWhite} ${BRAND_COLORS.primary.border}`,
    inactive: `px-3 py-1 text-xs font-medium bg-white ${BRAND_COLORS.neutral.text} ${BRAND_COLORS.neutral.border} ${BRAND_COLORS.neutral.hover}`,
    transition: "transition-colors duration-150 ease-out"
  },
  
  // セカンダリボタングループ（ステータス系：すべて|対応可能|対応不可）
  secondaryGroup: {
    active: `px-3 py-1 text-xs font-medium ${BRAND_COLORS.secondary[500]} ${BRAND_COLORS.secondary.textWhite} ${BRAND_COLORS.secondary.border}`,
    inactive: `px-3 py-1 text-xs font-medium bg-white ${BRAND_COLORS.neutral.text} ${BRAND_COLORS.neutral.border} ${BRAND_COLORS.neutral.hover}`,
    transition: "transition-colors duration-150 ease-out"
  },
  
  // 単体ボタン
  primary: `px-4 py-2 text-sm font-medium ${BRAND_COLORS.primary[600]} ${BRAND_COLORS.primary.textWhite} border-transparent rounded-md ${BRAND_COLORS.primary.hover}`,
  secondary: `px-4 py-2 text-sm font-medium ${BRAND_COLORS.secondary[500]} ${BRAND_COLORS.secondary.textWhite} border-transparent rounded-md ${BRAND_COLORS.secondary.hover}`,
  neutral: `px-4 py-2 text-sm font-medium ${BRAND_COLORS.neutral.text} bg-white ${BRAND_COLORS.neutral.border} rounded-md ${BRAND_COLORS.neutral.hover}`,
  
  // ナビゲーションボタン（ヘッダー右上用・白テキスト + 濃い背景）
  navPrimary: `text-xs font-medium ${BRAND_COLORS.primary[600]} ${BRAND_COLORS.primary.textWhite} px-3 py-1 rounded-md border-transparent ${BRAND_COLORS.primary.hover} transition-colors duration-150 h-7 flex items-center`,
  navSecondary: `text-xs font-medium ${BRAND_COLORS.secondary[500]} ${BRAND_COLORS.secondary.textWhite} px-3 py-1 rounded-md border-transparent ${BRAND_COLORS.secondary.hover} transition-colors duration-150 h-7 flex items-center`,
  navNeutral: `text-xs font-medium ${BRAND_COLORS.neutral[600]} ${BRAND_COLORS.neutral.textWhite} px-3 py-1 rounded-md border-transparent hover:bg-gray-700 transition-colors duration-150 h-7 flex items-center`,
  
  // 青いヘッダー用ボタン（色を保持 + 白境界線で統一）
  headerPrimary: `text-xs font-medium text-white bg-indigo-700 px-3 py-1 rounded-md border border-white border-opacity-40 hover:bg-indigo-800 transition-colors duration-150 h-7 flex items-center`,
  headerSecondary: `text-xs font-medium text-gray-100 bg-teal-600 px-3 py-1 rounded-md border border-white border-opacity-40 hover:bg-teal-700 transition-colors duration-150 h-7 flex items-center`,
  headerNeutral: `text-xs font-medium text-white bg-gray-600 px-3 py-1 rounded-md border border-white border-opacity-40 hover:bg-gray-700 transition-colors duration-150 h-7 flex items-center`
} as const;

// === 軽量アニメーション効果クラス（パフォーマンス優先） ===
// 軽快さを保ちながら操作感を向上させる軽量なCSS効果
export const LIGHT_ANIMATIONS = {
  // ボタン用：色変化のみ（軽量）
  button: "transition-colors duration-150 ease-out",
  
  // ホバー用：透明度変化（軽量）
  hover: "transition-opacity duration-150 ease-out",
  
  // インタラクティブ要素用：色変化（軽量）
  interactive: "transition-colors duration-150 ease-out",
  
  // フォーカス用：高速色変化（軽量）
  focus: "transition-colors duration-100 ease-out",
  
  // スケジュール要素用：軽量な明度変化
  schedule: "transition-all duration-150 ease-out",
  
  // 入力フィールド用：軽量な色・リング変化
  input: "transition-colors duration-150 ease-out",
  
  // === Phase 2a: 視覚的フィードバック専用アニメーション ===
  // リアルタイム更新時の視覚的フィードバック用
  feedbackPulse: "transition-all duration-300 ease-out",
  feedbackFade: "transition-opacity duration-600 ease-out"
} as const;

// === Phase 2a: 視覚的フィードバックカラーシステム ===
export const FEEDBACK_COLORS = {
  // 新規追加時 - 成功を表す緑系
  added: {
    background: "bg-emerald-100",
    border: "border-emerald-300", 
    shadow: "shadow-emerald-200/50",
    pulse: "bg-emerald-50"
  },
  
  // 編集・更新時 - 変更を表す青系
  updated: {
    background: "bg-blue-100",
    border: "border-blue-300",
    shadow: "shadow-blue-200/50", 
    pulse: "bg-blue-50"
  },
  
  // 削除時 - 注意を表す赤系
  deleted: {
    background: "bg-red-100",
    border: "border-red-300",
    shadow: "shadow-red-200/50",
    pulse: "bg-red-50"
  },
  
  // エラー・フォールバック時 - 警告を表すオレンジ系
  error: {
    background: "bg-amber-100", 
    border: "border-amber-300",
    shadow: "shadow-amber-200/50",
    pulse: "bg-amber-50"
  }
} as const;