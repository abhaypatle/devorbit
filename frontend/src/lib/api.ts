import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000,
});

export function setAuthToken(token: string): void {
  localStorage.setItem('devorbit_token', token);
  api.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export function clearAuthToken(): void {
  localStorage.removeItem('devorbit_token');
  delete api.defaults.headers.common.Authorization;
}

const storedToken = localStorage.getItem('devorbit_token');
if (storedToken) {
  api.defaults.headers.common.Authorization = `Bearer ${storedToken}`;
}
