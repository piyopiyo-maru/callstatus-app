'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../components/AuthProvider';
import AuthGuard from '../../components/AuthGuard';
import { useRouter } from 'next/navigation';
import { getApiUrl } from '../../components/constants/MainAppConstants';
import { BUTTON_STYLES } from '../../components/timeline/TimelineUtils';

// 型定義
interface StaffMember {
  id: number;
  empNo?: string;
  name: string;
  department: string;
  group: string;
  isActive: boolean;
  isManager: boolean;
  managerDepartments: string[];
  managerPermissions: string[];
  managerActivatedAt?: Date;
  user_auth?: {
    email: string;
    userType: string;
    isActive: boolean;
    lastLoginAt?: Date;
  };
  Contract?: {
    email: string;
  }[];
}

interface ManagerPermissionEditProps {
  staff: StaffMember;
  onSave: (staffId: number, permissions: ManagerPermissionUpdate) => void;
  onCancel: () => void;
}

interface ManagerPermissionUpdate {
  isManager: boolean;
  managerDepartments: string[];
  managerPermissions: string[];
  isSystemAdmin?: boolean; // システム管理者権限フラグ
}

// 権限編集モーダルコンポーネント
const ManagerPermissionEditModal: React.FC<ManagerPermissionEditProps> = ({
  staff,
  onSave,
  onCancel
}) => {
  const [isManager, setIsManager] = useState(staff.isManager);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(staff.managerDepartments || []);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(staff.managerPermissions || []);
  const [isSystemAdmin, setIsSystemAdmin] = useState(staff.user_auth?.userType === 'ADMIN');
  const [availableDepartments] = useState(['コールセンター', 'システム開発部', '営業部', '総務部']); // TODO: APIから取得

  const permissionOptions = [
    { value: 'READ', label: '閲覧', description: 'スケジュールの閲覧が可能' },
    { value: 'WRITE', label: '編集', description: 'スケジュールの編集が可能' },
    { value: 'APPROVE', label: '承認', description: 'Pending予定の承認が可能' },
    { value: 'DELETE', label: '削除', description: 'スケジュールの削除が可能' }
  ];

  const handleDepartmentToggle = (dept: string) => {
    if (selectedDepartments.includes(dept)) {
      setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
    } else {
      setSelectedDepartments([...selectedDepartments, dept]);
    }
  };

  const handlePermissionToggle = (perm: string) => {
    if (selectedPermissions.includes(perm)) {
      setSelectedPermissions(selectedPermissions.filter(p => p !== perm));
    } else {
      setSelectedPermissions([...selectedPermissions, perm]);
    }
  };

  const handleSave = () => {
    onSave(staff.id, {
      isManager,
      managerDepartments: isManager ? selectedDepartments : [],
      managerPermissions: isManager ? selectedPermissions : [],
      isSystemAdmin
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            管理者権限編集: {staff.name}
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6">
          {/* 基本情報 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-medium text-gray-900 mb-2">スタッフ情報</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">社員番号:</span> {staff.empNo || 'なし'}
              </div>
              <div>
                <span className="text-gray-600">部署:</span> {staff.department}
              </div>
              <div>
                <span className="text-gray-600">グループ:</span> {staff.group}
              </div>
              <div>
                <span className="text-gray-600">メール:</span> {staff.user_auth?.email || 
                 staff.Contract?.[0]?.email || 
                 'なし'}
              </div>
            </div>
          </div>

          {/* システム管理者権限設定 */}
          <div>
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="isSystemAdmin"
                checked={isSystemAdmin}
                onChange={(e) => setIsSystemAdmin(e.target.checked)}
                className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
              />
              <label htmlFor="isSystemAdmin" className="ml-2 font-medium text-gray-900">
                システム管理者権限を付与する
              </label>
            </div>
            
            {isSystemAdmin && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">重要な権限です</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <ul className="list-disc list-inside space-y-1">
                        <li>システム全体の管理権限が付与されます</li>
                        <li>全スタッフの管理・権限変更が可能になります</li>
                        <li>認証アカウントが自動作成されます</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 部署管理者権限設定 */}
          <div>
            <div className="flex items-center mb-4">
              <input
                type="checkbox"
                id="isManager"
                checked={isManager}
                onChange={(e) => setIsManager(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="isManager" className="ml-2 font-medium text-gray-900">
                管理者権限を付与する
              </label>
            </div>

            {isManager && (
              <div className="space-y-4 pl-6 border-l-2 border-blue-200">
                {/* 管理対象部署 */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">管理対象部署</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {availableDepartments.map((dept) => (
                      <label key={dept} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedDepartments.includes(dept)}
                          onChange={() => handleDepartmentToggle(dept)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm">{dept}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 権限レベル */}
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">権限レベル</h4>
                  <div className="space-y-2">
                    {permissionOptions.map((option) => (
                      <label key={option.value} className="flex items-start">
                        <input
                          type="checkbox"
                          checked={selectedPermissions.includes(option.value)}
                          onChange={() => handlePermissionToggle(option.value)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-1"
                        />
                        <div className="ml-2">
                          <div className="text-sm font-medium">{option.label}</div>
                          <div className="text-xs text-gray-600">{option.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ボタン */}
        <div className="flex justify-end space-x-3 mt-6 pt-6 border-t">
          <button
            onClick={onCancel}
            className="px-4 h-7 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors duration-150 flex items-center"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            className="px-4 h-7 text-xs font-medium text-white bg-indigo-600 border border-transparent rounded-lg shadow-sm hover:bg-indigo-700 transition-colors duration-150 flex items-center"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};

// メインコンポーネント
export default function StaffManagementPage() {
  const router = useRouter();
  const { user, isSystemAdmin, loading: authLoading } = useAuth();
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterManagerOnly, setFilterManagerOnly] = useState(false);
  const [departmentSettings, setDepartmentSettings] = useState<{
    departments: Array<{name: string, displayOrder: number}>,
    groups: Array<{name: string, displayOrder: number}>
  }>({ departments: [], groups: [] });

  // システム管理者以外はアクセス拒否
  useEffect(() => {
    if (!authLoading && !isSystemAdmin()) {
      router.push('/');
      return;
    }
  }, [authLoading, isSystemAdmin, router]);

  // モックデータ（APIが動作しない場合の代替）
  const mockStaffData: StaffMember[] = [
    {
      id: 1,
      empNo: 'EMP001',
      name: 'テスト太郎',
      department: 'コールセンター',
      group: 'グループA',
      isActive: true,
      isManager: true,
      managerDepartments: ['コールセンター'],
      managerPermissions: ['READ', 'WRITE', 'APPROVE'],
      user_auth: {
        email: 'test.taro@example.com',
        userType: 'STAFF',
        isActive: true
      }
    },
    {
      id: 2,
      empNo: 'EMP002',
      name: 'テスト花子',
      department: 'システム開発部',
      group: 'グループB',
      isActive: true,
      isManager: false,
      managerDepartments: [],
      managerPermissions: [],
      user_auth: {
        email: 'test.hanako@example.com',
        userType: 'STAFF',
        isActive: true
      }
    }
  ];

  // 設定モーダルの表示順に従ったソート関数
  const sortStaffByDisplayOrder = useCallback((staff: StaffMember[]) => {
    return [...staff].sort((a, b) => {
      // 1. 部署の表示順で比較
      const deptA = departmentSettings.departments.find(d => d.name === a.department);
      const deptB = departmentSettings.departments.find(d => d.name === b.department);
      const deptOrderA = deptA?.displayOrder ?? 999;
      const deptOrderB = deptB?.displayOrder ?? 999;
      
      if (deptOrderA !== deptOrderB) {
        return deptOrderA - deptOrderB;
      }
      
      // 2. 部署名で比較（表示順が同じ場合）
      if (a.department !== b.department) {
        return a.department.localeCompare(b.department);
      }
      
      // 3. グループの表示順で比較
      const groupA = departmentSettings.groups.find(g => g.name === a.group);
      const groupB = departmentSettings.groups.find(g => g.name === b.group);
      const groupOrderA = groupA?.displayOrder ?? 999;
      const groupOrderB = groupB?.displayOrder ?? 999;
      
      if (groupOrderA !== groupOrderB) {
        return groupOrderA - groupOrderB;
      }
      
      // 4. グループ名で比較（表示順が同じ場合）
      if (a.group !== b.group) {
        return a.group.localeCompare(b.group);
      }
      
      // 5. 管理者権限で比較（システム管理者 > 管理者 > 一般ユーザー）
      const getRoleOrder = (staff: StaffMember): number => {
        if (staff.user_auth?.userType === 'ADMIN') return 0; // システム管理者
        if (staff.isManager) return 1; // 管理者
        return 2; // 一般ユーザー
      };
      
      const roleOrderA = getRoleOrder(a);
      const roleOrderB = getRoleOrder(b);
      
      if (roleOrderA !== roleOrderB) {
        return roleOrderA - roleOrderB;
      }
      
      // 6. 社員番号 → 名前の順でソート
      if (a.empNo !== b.empNo) return (a.empNo || '').localeCompare(b.empNo || '');
      return a.name.localeCompare(b.name);
    });
  }, [departmentSettings]);

  // 部署・グループ設定取得
  const fetchDepartmentSettings = useCallback(async () => {
    try {
      const response = await fetch(`${getApiUrl()}/api/department-settings`);
      if (response.ok) {
        const data = await response.json();
        setDepartmentSettings(data);
      }
    } catch (error) {
      console.warn('部署・グループ設定の取得に失敗:', error);
    }
  }, []);

  // スタッフ一覧取得
  const fetchStaffList = useCallback(async () => {
    setLoading(true);
    const apiUrl = getApiUrl();
    console.log('Staff Management - API URL:', apiUrl);
    console.log('Staff Management - Environment:', { 
      hostname: typeof window !== 'undefined' ? window.location.hostname : 'SSR',
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'SSR'
    });
    
    try {
      const fullUrl = `${apiUrl}/api/staff/management`;
      console.log('Staff Management - Fetching from:', fullUrl);
      
      const response = await fetch(fullUrl);
      console.log('Staff Management - Response status:', response.status);
      console.log('Staff Management - Response headers:', Array.from(response.headers.entries()));
      
      const data = await response.json();
      console.log('Staff Management - Response data keys:', Object.keys(data));
      
      if (data.success) {
        setStaffList(data.data);
        console.log('Staff Management - Loaded', data.data.length, 'staff members');
      } else {
        console.error('API応答エラー:', data.error);
        setError(`API応答エラー: ${data.error}`);
        // フォールバックとしてモックデータを使用
        setStaffList(mockStaffData);
      }
      setLoading(false);
    } catch (error) {
      console.error('スタッフ一覧取得エラー:', error);
      setError(`取得エラー: ${error instanceof Error ? error.message : '不明なエラー'}`);
      // フォールバックとしてモックデータを使用
      setStaffList(mockStaffData);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isSystemAdmin()) {
      fetchDepartmentSettings();
      fetchStaffList();
    }
  }, [authLoading, isSystemAdmin]);

  // 権限更新
  const handlePermissionUpdate = async (staffId: number, permissions: ManagerPermissionUpdate) => {
    try {
      // 部署管理者権限の更新
      if (permissions.isManager !== undefined) {
        const response = await fetch(`${getApiUrl()}/api/staff/${staffId}/manager-permissions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isManager: permissions.isManager,
            managerDepartments: permissions.managerDepartments,
            managerPermissions: permissions.managerPermissions,
            updatedBy: user?.name || 'システム'
          })
        });

        if (!response.ok) {
          throw new Error('部署管理者権限の更新に失敗しました');
        }
      }

      // システム管理者権限の更新
      if (permissions.isSystemAdmin !== undefined) {
        const response = await fetch(`${getApiUrl()}/api/staff/${staffId}/system-admin-permissions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isSystemAdmin: permissions.isSystemAdmin,
            updatedBy: user?.name || 'システム'
          })
        });

        if (!response.ok) {
          throw new Error('システム管理者権限の更新に失敗しました');
        }
      }

      // スタッフ一覧を再取得
      await fetchStaffList();
      
      setEditingStaff(null);
      alert('権限を更新しました');
    } catch (error) {
      console.error('権限更新エラー:', error);
      alert(`権限更新に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  };

  // フィルター適用とソート
  const filteredStaff = sortStaffByDisplayOrder(
    staffList.filter(staff => {
      // 論理削除されたスタッフを除外
      if (!staff.isActive) {
        return false;
      }
      if (filterDepartment !== 'all' && staff.department !== filterDepartment) {
        return false;
      }
      if (filterGroup !== 'all' && staff.group !== filterGroup) {
        return false;
      }
      if (filterManagerOnly && !staff.isManager) {
        return false;
      }
      return true;
    })
  );

  // 部署リストも表示順でソート（アクティブなスタッフのみ）
  const departments = Array.from(new Set(staffList.filter(s => s.isActive).map(s => s.department))).sort((a, b) => {
    const deptA = departmentSettings.departments.find(d => d.name === a);
    const deptB = departmentSettings.departments.find(d => d.name === b);
    const orderA = deptA?.displayOrder ?? 999;
    const orderB = deptB?.displayOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return a.localeCompare(b);
  });

  // グループリストも表示順でソート（部署フィルターに応じて絞り込み、アクティブなスタッフのみ）
  const groups = Array.from(new Set(
    staffList
      .filter(s => s.isActive && (filterDepartment === 'all' || s.department === filterDepartment))
      .map(s => s.group)
  )).sort((a, b) => {
    // 部署順 → グループ順でソート
    const staffA = staffList.find(s => s.group === a);
    const staffB = staffList.find(s => s.group === b);
    
    if (staffA && staffB) {
      const deptA = departmentSettings.departments.find(d => d.name === staffA.department);
      const deptB = departmentSettings.departments.find(d => d.name === staffB.department);
      const deptOrderA = deptA?.displayOrder ?? 999;
      const deptOrderB = deptB?.displayOrder ?? 999;
      
      if (deptOrderA !== deptOrderB) return deptOrderA - deptOrderB;
      if (staffA.department !== staffB.department) return staffA.department.localeCompare(staffB.department);
    }
    
    const groupA = departmentSettings.groups.find(g => g.name === a);
    const groupB = departmentSettings.groups.find(g => g.name === b);
    const groupOrderA = groupA?.displayOrder ?? 999;
    const groupOrderB = groupB?.displayOrder ?? 999;
    
    if (groupOrderA !== groupOrderB) return groupOrderA - groupOrderB;
    return a.localeCompare(b);
  });

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-screen">読み込み中...</div>;
  }

  if (!isSystemAdmin()) {
    return null; // リダイレクト処理中
  }

  return (
    <AuthGuard requiredRole="SYSTEM_ADMIN">
      <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* ヘッダー */}
        <div className="mb-4 p-4 bg-white shadow-sm rounded-xl border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                <h1 className="text-lg font-semibold text-gray-900">管理者権限管理</h1>
              </div>
              <div className="text-sm text-gray-600">スタッフの管理者権限を設定・管理</div>
            </div>
            <div className="flex items-center space-x-2">
              <a
                href="/"
                className={BUTTON_STYLES.headerSecondary}
              >
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                </svg>
                出社状況
              </a>
              <a
                href="/admin/pending-approval"
                className={BUTTON_STYLES.headerPrimary}
              >
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" clipRule="evenodd" />
                </svg>
                申請承認管理
              </a>
              <button
                onClick={() => router.back()}
                className={BUTTON_STYLES.headerNeutral}
              >
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                戻る
              </button>
            </div>
          </div>
        </div>

        {/* フィルター */}
        <div className="mb-4 p-4 bg-white shadow-sm rounded-xl border border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <select
                value={filterDepartment}
                onChange={(e) => setFilterDepartment(e.target.value)}
                className="rounded-lg border-gray-200 shadow-sm text-xs px-3 h-7 font-medium text-gray-700 bg-white transition-colors duration-150 hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">すべての部署</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="rounded-lg border-gray-200 shadow-sm text-xs px-3 h-7 font-medium text-gray-700 bg-white transition-colors duration-150 hover:border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                <option value="all">すべてのグループ</option>
                {groups.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={filterManagerOnly}
                  onChange={(e) => setFilterManagerOnly(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="ml-2 text-xs font-medium text-gray-700">管理者のみ</span>
              </label>
            </div>
            <div className="text-right bg-green-50 px-3 rounded-lg border border-green-200 h-7 flex items-center">
              <span className="text-xs text-green-700 font-medium mr-2">表示中:</span>
              <span className="text-sm font-bold text-green-600">{filteredStaff.length}</span>
              <span className="text-xs text-green-700 ml-1">/ {staffList.filter(s => s.isActive).length}件</span>
            </div>
          </div>
        </div>

        {/* スタッフ一覧 */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-600 mt-2">読み込み中...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchStaffList}
              className="mt-4 px-4 h-7 text-xs font-medium text-white bg-indigo-600 border border-transparent rounded-lg shadow-sm hover:bg-indigo-700 transition-colors duration-150 flex items-center mx-auto"
            >
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              再試行
            </button>
          </div>
        ) : (
          <div className="bg-white shadow-sm rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    社員番号
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    スタッフ情報
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    部署
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    グループ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    管理者権限
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    管理対象部署
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredStaff.map((staff) => (
                  <tr key={staff.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-mono text-gray-900">
                        {staff.empNo || 'なし'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{staff.name}</div>
                        <div className="text-sm text-gray-500">
                          {staff.user_auth?.email || 
                           staff.Contract?.[0]?.email || 
                           'メールなし'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {staff.department}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {staff.group}
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {staff.user_auth?.userType === 'ADMIN' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            システム管理者
                          </span>
                        )}
                        {staff.isManager && (
                          <div>
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              部署管理者
                            </span>
                            <div className="text-xs text-gray-500 mt-1">
                              {staff.managerPermissions.join(', ')}
                            </div>
                          </div>
                        )}
                        {!staff.isManager && staff.user_auth?.userType !== 'ADMIN' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            一般ユーザー
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {staff.managerDepartments.length > 0 ? staff.managerDepartments.join(', ') : 'なし'}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setEditingStaff(staff)}
                        className="px-3 h-7 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors duration-150 flex items-center"
                      >
                        <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        編集
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 権限編集モーダル */}
        {editingStaff && (
          <ManagerPermissionEditModal
            staff={editingStaff}
            onSave={handlePermissionUpdate}
            onCancel={() => setEditingStaff(null)}
          />
        )}
        </div>
      </div>
    </AuthGuard>
  );
}