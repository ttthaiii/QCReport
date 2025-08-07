// src/context/LoadingContext.js
import React, { createContext, useContext, useState } from 'react';

const LoadingContext = createContext();

export const LoadingProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  const setLoadingWithMessage = (isLoading, message = '') => {
    setLoading(isLoading);
    setLoadingMessage(message);
  };

  return (
    <LoadingContext.Provider value={{
      loading,
      loadingMessage,
      setLoading,
      setLoadingMessage,
      setLoadingWithMessage
    }}>
      {children}
      {loading && (
        <div className="global-loading-overlay">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>{loadingMessage || 'กำลังโหลด...'}</p>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  );
};

export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within LoadingProvider');
  }
  return context;
};