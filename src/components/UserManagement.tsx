// Filename: src/components/UserManagement.tsx
// (ฉบับสมบูรณ์ - ภาษาไทย)

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, AdminUser } from '../utils/api';
import { auth } from '../firebase'; // Import auth เพื่อเช็ค UID ของตัวเอง
import styles from './UserManagement.module.css';

interface UserManagementProps {
  currentUserRole: 'user' | 'admin' | 'god'; // (แก้ไขให้รับ 'user' ได้)
}

type UserRole = 'user' | 'admin' | 'god';
const ALL_ROLES: UserRole[] = ['user', 'admin', 'god'];

// [ใหม่] ฟังก์ชันแปลสถานะ
type UserStatus = 'approved' | 'rejected' | 'pending' | 'unknown';
const translateStatus = (status: UserStatus) => {
  switch (status) {
    case 'approved': return 'อนุมัติแล้ว';
    case 'rejected': return 'ปฏิเสธแล้ว';
    case 'pending': return 'รออนุมัติ';
    default: return 'ไม่ทราบสถานะ';
  }
};


const UserManagement: React.FC<UserManagementProps> = ({ currentUserRole }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(''); // State สำหรับค้นหา

  // 1. ดึงข้อมูล User ทั้งหมด
  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await api.getUsers();
    if (response.success && response.data) {
      // เรียงลำดับ: pending มาก่อน
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

  // 2. จัดการการอนุมัติ/ปฏิเสธ
  const handleUpdateStatus = async (uid: string, status: 'approved' | 'rejected') => {
    const actionText = status === 'approved' ? 'อนุมัติ' : 'ปฏิเสธ';
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการ ${actionText} ผู้ใช้รายนี้?`)) {
        return;
    }
    const originalUsers = [...users];
    setUsers(users.map(u => u.uid === uid ? { ...u, status: status } : u)); // อัปเดต UI ทันที
    const response = await api.updateUserStatus(uid, status);
    if (!response.success) {
      setError(`Failed to ${status} user ${uid}: ${response.error}`);
      setUsers(originalUsers); // กู้คืนถ้า API พัง
    }
  };

  // 3. จัดการการเปลี่ยน Role (God Only)
  const handleSetRole = async (uid: string, e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as UserRole;
    if (currentUserRole !== 'god') return; 
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการเปลี่ยนสิทธิ์ผู้ใช้รายนี้เป็น ${newRole}?`)) {
        e.target.value = users.find(u => u.uid === uid)?.role || newRole; // Reset dropdown
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

  // 4. กรองรายชื่อ User
  const filteredUsers = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    return users.filter(user => 
      (user.displayName?.toLowerCase().includes(lowerFilter) || '') ||
      (user.email?.toLowerCase().includes(lowerFilter) || '') ||
      (user.assignedProjectId?.toLowerCase().includes(lowerFilter) || '')
    );
  }, [users, filter]);

  // แยก User ตามสถานะ
  const pendingUsers = useMemo(() => filteredUsers.filter(u => u.status === 'pending'), [filteredUsers]);
  const otherUsers = useMemo(() => filteredUsers.filter(u => u.status !== 'pending'), [filteredUsers]);

  if (isLoading) return <div>กำลังโหลดรายชื่อผู้ใช้...</div>;
  if (error) return <div className={styles.error}>เกิดข้อผิดพลาด: {error}</div>;

  return (
    <div className={styles.userManagement}>
      <h2>จัดการผู้ใช้ ({users.length})</h2>
      
      <input 
        type="text" 
        placeholder="ค้นหาด้วยชื่อ, อีเมล, โครงการ..." 
        className={styles.searchInput}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {/* 1. ส่วนผู้ใช้รออนุมัติ */}
      {pendingUsers.length > 0 && (
        <section className={styles.userSection}>
          <h3>รอการอนุมัติ ({pendingUsers.length})</h3>
          <table className={styles.userTable}>
            <thead>
              <tr>
                <th>ชื่อที่แสดง</th>
                <th>อีเมล</th>
                <th>โครงการ</th>
                <th>ดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {pendingUsers.map(user => (
                <tr key={user.uid} className={styles.pendingRow}>
                  <td>{user.displayName}</td>
                  <td>{user.email}</td>
                  <td>{user.assignedProjectId || 'N/A'}</td>
                  <td className={styles.actions}>
                    <button className={`${styles.btn} ${styles.btnApprove}`} onClick={() => handleUpdateStatus(user.uid, 'approved')}>
                      อนุมัติ
                    </button>
                    <button className={`${styles.btn} ${styles.btnReject}`} onClick={() => handleUpdateStatus(user.uid, 'rejected')}>
                      ปฏิเสธ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* 2. ส่วนผู้ใช้ทั้งหมด (Approved/Rejected/Unknown) */}
      <section className={styles.userSection}>
        <h3>ผู้ใช้อื่นๆ ทั้งหมด ({otherUsers.length})</h3>
        <table className={styles.userTable}>
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
                    <select 
                      value={user.role} 
                      onChange={(e) => handleSetRole(user.uid, e)}
                      disabled={user.uid === auth.currentUser?.uid} // ป้องกันเปลี่ยน Role ตัวเอง
                    >
                      {ALL_ROLES.map(role => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  ) : (
                    user.role // Admin ธรรมดาจะเห็น Role เฉยๆ
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

export default UserManagement;