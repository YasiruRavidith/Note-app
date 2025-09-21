// Check if we're accessing from a network IP
const isNetworkAccess = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

// Use localhost for OAuth (required by Google) but network IP for regular API calls
export const API_BASE_URL = isNetworkAccess ? 'http://192.168.1.103:3001/api' : 'http://localhost:3001/api';
export const OAUTH_BASE_URL = 'http://localhost:3001/api';
export const SOCKET_URL = isNetworkAccess ? 'http://192.168.1.103:3001' : 'http://localhost:3001';