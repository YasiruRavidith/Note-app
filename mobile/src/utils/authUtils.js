// mobile/src/utils/authUtils.js
// Utility functions for authentication and token handling

import * as SecureStore from 'expo-secure-store';

/**
 * Parse JWT token to extract user information
 * Note: This is basic parsing - in production you'd want proper JWT verification
 */
export function parseJWT(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to parse JWT token:', error);
    return null;
  }
}

/**
 * Get the current user ID from the stored auth token
 */
export async function getCurrentUserId() {
  try {
    const token = await SecureStore.getItemAsync('authToken');
    if (!token) {
      console.warn('No auth token found');
      return null;
    }

    const payload = parseJWT(token);
    if (!payload) {
      console.warn('Could not parse auth token');
      return null;
    }

    // The backend stores user ID in different possible fields
    const userId = payload.userId || payload.sub || payload.id;
    
    console.log('🔑 Current user ID:', userId);
    return userId;
  } catch (error) {
    console.error('Failed to get current user ID:', error);
    return null;
  }
}

/**
 * Get user information from stored auth token
 */
export async function getCurrentUser() {
  try {
    const token = await SecureStore.getItemAsync('authToken');
    if (!token) return null;

    const payload = parseJWT(token);
    if (!payload) return null;

    return {
      id: payload.userId || payload.sub || payload.id,
      email: payload.email,
      name: payload.name,
      picture: payload.picture
    };
  } catch (error) {
    console.error('Failed to get current user:', error);
    return null;
  }
}