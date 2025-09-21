// mobile/src/api/axiosClient.js
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const axiosClient = axios.create({
  baseURL: 'http://192.168.1.103:3001/api',
});

// Add a request interceptor to include the JWT auth token
axiosClient.interceptors.request.use(async (config) => {
  try {
    // Get the stored JWT token
    const token = await SecureStore.getItemAsync('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🔐 Added auth token to request');
    } else {
      console.warn('⚠️ No auth token found');
    }
  } catch (error) {
    console.error('❌ Failed to get auth token:', error);
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default axiosClient;