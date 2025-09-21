// web/src/api/axiosClient.js
import axios from 'axios';
import { API_BASE_URL } from '../config/endpoints';

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
});

// Add a request interceptor to include the token
axiosClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

export default axiosClient;