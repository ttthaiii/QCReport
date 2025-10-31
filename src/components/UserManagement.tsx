// Filename: src/components/UserManagement.tsx
// (ฉบับสมบูรณ์ - REFACTORED for SVG Icons)

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, AdminUser } from '../utils/api';
import { auth } from '../firebase'; 
import styles from './UserManagement.module.css';

// ✅ [ใหม่] 1. Import ไอคอน SVG
import { FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';

interface UserManagementProps {
  currentUserRole: 'user' | 'admin' | 'god'; 
}

// (Types และ consts เหมือนเดิม)
type UserRole = 'user' | 'admin' | 'god';
const ALL_ROLES: UserRole[] = ['user', 'admin', 'god'];
type UserStatus = 'approved' | 'rejected' | 'pending' | 'unknown';
const translateStatus = (status: UserStatus) => {
  switch (status) {
    case 'approved': return 'อนุมัติแล้ว';
    case 'rejected': return 'ปฏิเสธแล้ว';
    case 'pending': return 'รออนุมัติ';
    default: return 'ไม่ทราบสถานะ';
  }
};
interface ConfirmModalState {
  isOpen: boolean;
  userToUpdate: AdminUser | null;
  action: 'approved' | 'rejected' | null;
}
interface BatchConfirmModalState {
  isOpen: boolean;
  action: 'approved' | 'rejected' | null;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUserRole }) => {
  // (States ทั้งหมดเหมือนเดิม)
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(''); 
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]); 
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    userToUpdate: null,
    action: null
  });
  const [batchConfirmModal, setBatchConfirmModal] = useState<BatchConfirmModalState>({
    isOpen: false,
    action: null
  });

  // (Functions ทั้งหมดเหมือนเดิม)
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setSelectedUsers([]); 
    const response = await api.getUsers();
    if (response.success && response.data) {
      response.data.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return 0;
      });
      setUsers(response.data);
    } else {
      setError(response.error || 'Failed to fetch users');
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const executeUpdateStatus = async () => {
    const { userToUpdate, action } = confirmModal;
    if (!userToUpdate || !action) return;
    const originalUsers = [...users];
    setUsers(users.map(u => u.uid === userToUpdate.uid ? { ...u, status: action } : u));
    closeConfirmModal(); 
    const response = await api.updateUserStatus(userToUpdate.uid, action);
    if (!response.success) {
      setError(`Failed to ${action} user ${userToUpdate.uid}: ${response.error}`);
      setUsers(originalUsers); 
    }
  };
  const handleUpdateStatus = (user: AdminUser, status: 'approved' | 'rejected') => {
    setConfirmModal({ isOpen: true, userToUpdate: user, action: status });
  };
  const closeConfirmModal = () => {
    setConfirmModal({ isOpen: false, userToUpdate: null, action: null });
  };
  
  const openBatchConfirmModal = (action: 'approved' | 'rejected') => {
    if (selectedUsers.length === 0) return;
    setBatchConfirmModal({ isOpen: true, action: action });
  };
  const closeBatchConfirmModal = () => {
    setBatchConfirmModal({ isOpen: false, action: null });
  };
  
  const executeBatchUpdate = async () => {
    const { action } = batchConfirmModal;
    if (!action || selectedUsers.length === 0) return;
    const uidsToUpdate = [...selectedUsers];
    const originalUsers = [...users];
    setUsers(users.map(u => uidsToUpdate.includes(u.uid) ? { ...u, status: action } : u));
    closeBatchConfirmModal();
    setSelectedUsers([]); 
    const updatePromises = uidsToUpdate.map(uid => api.updateUserStatus(uid, action));
    try {
      await Promise.all(updatePromises);
    } catch (batchError) {
      setError(`Failed during batch ${action}: ${(batchError as Error).message}`);
      setUsers(originalUsers); 
    }
  };

  const handleToggleSelect = (uid: string) => {
    setSelectedUsers(prevSelected => {
      if (prevSelected.includes(uid)) {
        return prevSelected.filter(id => id !== uid);
      } else {
        return [...prevSelected, uid];
      }
    });
  };

  const handleSelectAll = (usersToSelect: AdminUser[]) => {
    const allUIDs = usersToSelect.map(u => u.uid);
    if (selectedUsers.length === allUIDs.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(allUIDs);
    }
  };
  
  const handleSetRole = async (uid: string, e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as UserRole;
    if (currentUserRole !== 'god') return; 
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการเปลี่ยนสิทธิ์ผู้ใช้รายนี้เป็น ${newRole}?`)) {
        e.target.value = users.find(u => u.uid === uid)?.role || newRole; 
        return;
    }
    const originalUsers = [...users];
    setUsers(users.map(u => u.uid === uid ? { ...u, role: newRole } : u));
    const response = await api.setUserRole(uid, newRole);
    if (!response.success) {
      setError(`Failed to set role for user ${uid}: ${response.error}`);
      setUsers(originalUsers);
    }
  };

  const filteredUsers = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return users.filter(user => 
      (user.displayName?.toLowerCase().includes(lowerFilter) || '') ||
      (user.email?.toLowerCase().includes(lowerFilter) || '') ||
      (user.assignedProjectName?.toLowerCase().includes(lowerFilter) || '') 
    );
  }, [users, filter]);

  const pendingUsers = useMemo(() => filteredUsers.filter(u => u.status === 'pending'), [filteredUsers]);
  const otherUsers = useMemo(() => filteredUsers.filter(u => u.status !== 'pending'), [filteredUsers]);
  
  
  // ✅ [แก้ไข] 2. เปลี่ยน Emoji เป็น SVG Icon
  const renderConfirmModal = () => {
    if (!confirmModal.isOpen || !confirmModal.userToUpdate || !confirmModal.action) return null;

    const isRejecting = confirmModal.action === 'rejected';
    const actionText = isRejecting ? 'ปฏิเสธ' : 'อนุมัติ';
    const user = confirmModal.userToUpdate;

    return (
      <div className={styles.modalBackdrop} onClick={closeConfirmModal}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <h3 className={isRejecting ? styles.modalHeaderDanger : styles.modalHeader}>
            {isRejecting ? 
              <><FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: '8px' }} /> ยืนยันการปฏิเสธ</> : // <--- ⚠️
              <><FiCheckCircle style={{ verticalAlign: 'middle', marginRight: '8px' }} /> ยืนยันการอนุมัติ</> // <--- ✅
            }
          </h3>
          <div className={styles.modalBody}>
            <p>คุณแน่ใจหรือไม่ว่าต้องการ **{actionText}** ผู้ใช้รายนี้?</p>
            <ul>
              <li><strong>ชื่อ:</strong> {user.displayName}</li>
              <li><strong>อีเมล:</strong> {user.email}</li>
              <li><strong>โครงการ:</strong> {user.assignedProjectName}</li>
            </ul>
          </div>
          <div className={styles.modalActions}>
            <button className={`${styles.btn} ${styles.btnCancel}`} onClick={closeConfirmModal}>ยกเลิก</button>
            <button className={`${styles.btn} ${isRejecting ? styles.btnReject : styles.btnApprove}`} onClick={executeUpdateStatus}>ยืนยันการ{actionText}</button>
          </div>
        </div>
      </div>
    );
  };
  
  // ✅ [แก้ไข] 3. เปลี่ยน Emoji เป็น SVG Icon
  const renderBatchConfirmModal = () => {
    if (!batchConfirmModal.isOpen || !batchConfirmModal.action) return null;

    const isRejecting = batchConfirmModal.action === 'rejected';
    const actionText = isRejecting ? 'ปฏิเสธ' : 'อนุมัติ';
    const count = selectedUsers.length;

    return (
      <div className={styles.modalBackdrop} onClick={closeBatchConfirmModal}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <h3 className={isRejecting ? styles.modalHeaderDanger : styles.modalHeader}>
            {isRejecting ? 
              <><FiAlertTriangle style={{ verticalAlign: 'middle', marginRight: '8px' }} /> ยืนยันการปฏิเสธทั้งหมด</> : // <--- ⚠️
              <><FiCheckCircle style={{ verticalAlign: 'middle', marginRight: '8px' }} /> ยืนยันการอนุมัติทั้งหมด</> // <--- ✅
            }
          </h3>
          <div className={styles.modalBody}>
            <p>คุณแน่ใจหรือไม่ว่าต้องการ **{actionText}** ผู้ใช้ที่เลือกทั้งหมด **{count}** คน?</p>
          </div>
          <div className={styles.modalActions}>
            <button className={`${styles.btn} ${styles.btnCancel}`} onClick={closeBatchConfirmModal}>ยกเลิก</button>
            <button className={`${styles.btn} ${isRejecting ? styles.btnReject : styles.btnApprove}`} onClick={executeBatchUpdate}>ยืนยัน ({count})</button>
          </div>
        </div>
      </div>
    );
  };
  
  // (Render Functions ที่เหลือเหมือนเดิม)
  const renderBatchActionBar = () => {
    if (selectedUsers.length === 0) return null;
    const selectedAreAllPending = selectedUsers.every(uid => 
      pendingUsers.some(u => u.uid === uid)
    );
    return (
      <div className={styles.batchActionBar}>
        <div className={styles.batchInfo}>
          เลือกแล้ว {selectedUsers.length} รายการ
        </div>
        <div className={styles.batchActions}>
          {selectedAreAllPending ? (
            <>
              <button className={styles.batchBtnApprove} onClick={() => openBatchConfirmModal('approved')}>
                อนุมัติ
              </button>
              <button className={styles.batchBtnReject} onClick={() => openBatchConfirmModal('rejected')}>
                ปฏิเสธ
              </button>
            </>
          ) : (
            <span className={styles.batchInfoNote}>(เฉพาะ User ที่รออนุมัติเท่านั้น)</span>
          )}
          <button className={styles.batchBtnCancel} onClick={() => setSelectedUsers([])}>
            ยกเลิก
          </button>
        </div>
      </div>
    );
  };

  const renderPendingSection = () => {
    if (pendingUsers.length === 0) return null;
    const areAllPendingSelected = pendingUsers.length > 0 && pendingUsers.every(u => selectedUsers.includes(u.uid));
    return (
      <section className={styles.userSection}>
        <div className={styles.sectionHeader}>
          <h3>รอการอนุมัติ ({pendingUsers.length})</h3>
          <button className={styles.selectAllButton} onClick={() => handleSelectAll(pendingUsers)}>
            {areAllPendingSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
          </button>
        </div>
        <div className={styles.tableResponsiveContainer}>
          <table className={`${styles.userTable} ${styles.tableDesktop}`}>
            <thead>
              <tr>
                <th className={styles.checkboxColumn}>
                  <input type="checkbox" checked={areAllPendingSelected} onChange={() => handleSelectAll(pendingUsers)} />
                </th>
                <th>ชื่อที่แสดง</th>
                <th>อีเมล</th>
                <th>โครงการ</th>
                <th className={styles.actionsColumn}>ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map(user => (
                <tr key={user.uid} className={styles.pendingRow}>
                  <td className={styles.checkboxColumn}>
                    <input type="checkbox" checked={selectedUsers.includes(user.uid)} onChange={() => handleToggleSelect(user.uid)} />
                  </td>
                  <td>{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>{user.assignedProjectName}</td>
                  <td className={`${styles.actions} ${styles.actionsColumn}`}>
                    <button className={`${styles.btn} ${styles.btnApprove}`} onClick={() => handleUpdateStatus(user, 'approved')}>
                      อนุมัติ
                    </button>
                    <button className={`${styles.btn} ${styles.btnReject}`} onClick={() => handleUpdateStatus(user, 'rejected')}>
                      ปฏิเสธ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.cardListMobile}>
          {pendingUsers.map(user => (
            <div key={user.uid} className={`${styles.userCard} ${styles.pendingCard}`}>
              <div className={styles.cardHeader}>
                <input type="checkbox" checked={selectedUsers.includes(user.uid)} onChange={() => handleToggleSelect(user.uid)} />
                <div className={styles.cardHeaderText}>
                  <strong>{user.displayName}</strong>
                  <small>{user.email}</small>
                </div>
              </div>
              <div className={styles.cardBody}>
                <strong>โครงการ:</strong> {user.assignedProjectName}
              </div>
              <div className={styles.cardActions}>
                <button className={`${styles.btn} ${styles.btnReject}`} onClick={() => handleUpdateStatus(user, 'rejected')}>
                  ปฏิเสธ
                </button>
                <button className={`${styles.btn} ${styles.btnApprove}`} onClick={() => handleUpdateStatus(user, 'approved')}>
                  อนุมัติ
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };
  
  const renderOtherUsersSection = () => {
    return (
      <section className={styles.userSection}>
        {/* ✅ [แก้ไข] 4. หุ้ม h3 ด้วย div.sectionHeader */}
        <div className={styles.sectionHeader}>
          <h3>ผู้ใช้อื่นๆ ทั้งหมด ({otherUsers.length})</h3>
        </div>
        <div className={styles.tableResponsiveContainer}>
          <table className={`${styles.userTable} ${styles.tableDesktop}`}>
            <thead>
              <tr>
                <th>ชื่อที่แสดง</th>
                <th>อีเมล</th>
                <th>สถานะ</th>
                <th>สิทธิ์การเข้าถึง</th>
              </tr>
            </thead>
            <tbody>
              {otherUsers.length === 0 && (
                <tr><td colSpan={4}>ไม่พบผู้ใช้อื่น</td></tr>
              )}
              {otherUsers.map(user => (
                <tr key={user.uid} className={user.status === 'rejected' ? styles.rejectedRow : ''}>
                  <td>{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className={`${styles.status} ${styles[user.status]}`}>
                      {translateStatus(user.status as UserStatus)}
                    </span>
                  </td>
                  <td>
                    {currentUserRole === 'god' ? (
                      <select value={user.role} onChange={(e) => handleSetRole(user.uid, e)} disabled={user.uid === auth.currentUser?.uid}>
                        {ALL_ROLES.map(role => (<option key={role} value={role}>{role}</option>))}
                      </select>
                    ) : ( user.role )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.cardListMobile}>
          {otherUsers.length === 0 && <p className={styles.noUsersText}>ไม่พบผู้ใช้อื่น</p>}
          {otherUsers.map(user => (
            <div key={user.uid} className={`${styles.userCard} ${user.status === 'rejected' ? styles.rejectedCard : ''}`}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderText}>
                  <strong>{user.displayName}</strong>
                  <small>{user.email}</small>
                </div>
                <span className={`${styles.status} ${styles[user.status]}`}>
                  {translateStatus(user.status as UserStatus)}
                </span>
              </div>
              <div className={styles.cardBody}>
                <strong>โครงการ:</strong> {user.assignedProjectName}
                <br/>
                <strong>สิทธิ์:</strong> 
                {currentUserRole === 'god' ? (
                  <select value={user.role} onChange={(e) => handleSetRole(user.uid, e)} disabled={user.uid === auth.currentUser?.uid} onClick={(e) => e.stopPropagation()}>
                    {ALL_ROLES.map(role => (<option key={role} value={role}>{role}</option>))}
                  </select>
                ) : ( user.role )}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  // --- 8. Main Render ---
  if (isLoading) return <div>กำลังโหลดรายชื่อผู้ใช้...</div>;
  if (error) return <div className={styles.error}>{error}</div>; // [แก้ไข] ลบ Emoji ❌ ออก

  return (
    <div className={styles.userManagement}>
      {renderConfirmModal()}
      {renderBatchConfirmModal()}
      {renderBatchActionBar()}

      <h2>จัดการผู้ใช้ ({users.length})</h2>
      
      <input 
        type="text" 
        placeholder="ค้นหาด้วยชื่อ, อีเมล, โครงการ..." 
        className={styles.searchInput}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {renderPendingSection()}
      {renderOtherUsersSection()}
    </div>
  );
};

export default UserManagement;