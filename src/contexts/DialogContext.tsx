import React, { createContext, useContext, useState, ReactNode } from 'react';

type DialogType = 'alert' | 'confirm';

interface DialogOptions {
    message: string;
    title?: string;
    type: DialogType;
    onConfirm: () => void;
    onCancel?: () => void;
}

interface DialogContextType {
    showAlert: (message: string, title?: string) => Promise<void>;
    showConfirm: (message: string, title?: string) => Promise<boolean>;
}

const DialogContext = createContext<DialogContextType | undefined>(undefined);

export const useDialog = () => {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error('useDialog must be used within a DialogProvider');
    }
    return context;
};

export const DialogProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [dialog, setDialog] = useState<DialogOptions | null>(null);

    const showAlert = (message: string, title?: string) => {
        return new Promise<void>((resolve) => {
            setDialog({
                message,
                title: title || 'แจ้งเตือน',
                type: 'alert',
                onConfirm: () => {
                    setDialog(null);
                    resolve();
                },
            });
        });
    };

    const showConfirm = (message: string, title?: string) => {
        return new Promise<boolean>((resolve) => {
            setDialog({
                message,
                title: title || 'ยืนยันการดำเนินการ',
                type: 'confirm',
                onConfirm: () => {
                    setDialog(null);
                    resolve(true);
                },
                onCancel: () => {
                    setDialog(null);
                    resolve(false);
                },
            });
        });
    };

    return (
        <DialogContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            {dialog && (
                <div style={overlayStyle}>
                    <div style={modalStyle}>
                        <h3 style={titleStyle}>{dialog.title}</h3>
                        <p style={messageStyle}>{dialog.message}</p>
                        <div style={buttonContainerStyle}>
                            {dialog.type === 'confirm' && (
                                <button
                                    style={{ ...buttonStyle, ...cancelButtonStyle }}
                                    onClick={dialog.onCancel}
                                >
                                    ยกเลิก
                                </button>
                            )}
                            <button
                                style={{ ...buttonStyle, ...confirmButtonStyle }}
                                onClick={dialog.onConfirm}
                            >
                                ตกลง
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
};

// --- Styles ---
const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999, // สูงกว่าทุก Element ในแอป
};

const modalStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '24px',
    width: '90%',
    maxWidth: '400px',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
    animation: 'dialogFadeIn 0.2s ease-out',
};

const titleStyle: React.CSSProperties = {
    marginTop: 0,
    marginBottom: '15px',
    fontSize: '1.25rem',
    color: '#2c3e50',
    fontWeight: 600,
};

const messageStyle: React.CSSProperties = {
    marginBottom: '25px',
    fontSize: '1rem',
    color: '#4a5568',
    lineHeight: 1.5,
    whiteSpace: 'pre-line', // Support line breaks \n
};

const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
};

const buttonStyle: React.CSSProperties = {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s, transform 0.1s',
};

const confirmButtonStyle: React.CSSProperties = {
    backgroundColor: '#d35400', // Primary color (Orange)
    color: '#ffffff',
};

const cancelButtonStyle: React.CSSProperties = {
    backgroundColor: '#e2e8f0',
    color: '#4a5568',
};

// Add a tiny bit of global CSS for the animation (could also be inline if React supported keyframes inline cleanly)
if (typeof document !== 'undefined') {
    const styleStr = `
    @keyframes dialogFadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
    const styleEl = document.createElement('style');
    styleEl.innerHTML = styleStr;
    document.head.appendChild(styleEl);
}
