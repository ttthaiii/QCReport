// Filename: src/components/CustomModal.tsx
import React from 'react';
import styles from './CustomModal.module.css'; // เราจะสร้างไฟล์นี้ในขั้นตอนถัดไป
import cameraStyles from './Camera.module.css'; // ใช้สไตล์ปุ่มจาก Camera

interface CustomModalProps {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm?: () => void; // ถ้ามี Prop นี้ จะแสดงปุ่ม Confirm/Cancel
  confirmText?: string;
  cancelText?: string;
}

const CustomModal: React.FC<CustomModalProps> = ({
  title,
  message,
  onClose,
  onConfirm,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก"
}) => {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <p className={styles.modalMessage}>{message}</p>
        
        <div className={styles.modalActions}>
          {onConfirm ? (
            // นี่คือโหมด "Confirm" (มี 2 ปุ่ม)
            <>
              <button
                className={`${cameraStyles.wizardButton} ${cameraStyles.secondary}`}
                onClick={onClose}
              >
                {cancelText}
              </button>
              <button
                className={cameraStyles.wizardButton}
                onClick={onConfirm}
              >
                {confirmText}
              </button>
            </>
          ) : (
            // นี่คือโหมด "Alert" (มีปุ่มเดียว)
            <button
              className={cameraStyles.wizardButton}
              onClick={onClose}
            >
              ตกลง
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomModal;