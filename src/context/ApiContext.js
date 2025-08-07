// src/context/ApiContext.js - Final Production Ready Version
import React, { createContext, useContext } from 'react';

const ApiContext = createContext();

class ApiService {
  constructor() {
    // Production URL first, then development URLs
    this.baseURLs = [
      // Production Firebase Functions (ใช้อันนี้เป็นหลัก)
      'https://asia-southeast1-qcreport-54164.cloudfunctions.net/api',
      
      // Development URLs (สำหรับพัฒนา)
      'http://localhost:5001/qcreport-54164/asia-southeast1/api',
      'http://127.0.0.1:5001/qcreport-54164/asia-southeast1/api'
    ];
    
    this.activeURL = null;
  }

  async findWorkingURL() {
    if (this.activeURL) return this.activeURL;

    for (const baseURL of this.baseURLs) {
      try {
        console.log(`🔍 Trying API URL: ${baseURL}/health`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(`${baseURL}/health`, { 
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.status === 'OK') {
            console.log(`✅ Working API URL found:`, data);
            this.activeURL = baseURL;
            return baseURL;
          }
        }
      } catch (error) {
        console.log(`❌ Failed: ${baseURL} - ${error.message}`);
        continue;
      }
    }
    
    throw new Error(`❌ No working API endpoint found! Please check your internet connection.`);
  }

  async request(endpoint, options = {}) {
    try {
      const baseURL = await this.findWorkingURL();
      const url = `${baseURL}${endpoint}`;
      
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      };

      console.log(`🌐 API Request: ${config.method || 'GET'} ${url}`);
      
      const response = await fetch(url, config);
      
      // Handle different response types
      const contentType = response.headers.get('content-type');
      let data;
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { 
          success: response.ok,
          message: text || 'No response data',
          status: response.status 
        };
      }
      
      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP error! status: ${response.status}`);
      }
      
      console.log(`✅ API Success:`, data);
      return data;
      
    } catch (error) {
      // Reset active URL on persistent errors
      if (error.name === 'TypeError' || error.message.includes('fetch')) {
        console.log('🔄 Resetting API URL due to connection error');
        this.activeURL = null;
      }
      
      console.error(`❌ API Error (${endpoint}):`, error.message);
      throw error;
    }
  }

  async get(endpoint, params = {}) {
    const searchParams = new URLSearchParams(params);
    const queryString = searchParams.toString();
    const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;
    
    return this.request(fullEndpoint, { method: 'GET' });
  }

  async post(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  async put(endpoint, data = {}) {
    return this.request(endpoint, {
      method: 'PUT', 
      body: JSON.stringify(data)
    });
  }

  async delete(endpoint) {
    return this.request(endpoint, {
      method: 'DELETE'
    });
  }
}

export const ApiProvider = ({ children }) => {
  const apiService = new ApiService();

  const api = {
    get: (endpoint, params) => apiService.get(endpoint, params),
    post: (endpoint, data) => apiService.post(endpoint, data),
    put: (endpoint, data) => apiService.put(endpoint, data),
    delete: (endpoint) => apiService.delete(endpoint)
  };

  // Test API connection on mount
  React.useEffect(() => {
    const testConnection = async () => {
      try {
        await api.get('/health');
        console.log('✅ API Connection established successfully');
      } catch (error) {
        console.error('🚨 API Connection Test Failed:', error.message);
      }
    };
    
    testConnection();
  }, []);

  return (
    <ApiContext.Provider value={{ api }}>
      {children}
    </ApiContext.Provider>
  );
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return context;
};