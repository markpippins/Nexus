import axios from 'axios'
import type {
  SystemStatus,
  HealthStatus,
  LibraryPath,
  ScanStatus,
  FileStatistics,
  DuplicateStats,
  CreateLibraryPathForm,
  StartScanForm,
} from '@/types/api'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
})

// Request interceptor for logging
api.interceptors.request.use((config) => {
  console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`)
  return config
})

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// System endpoints
export const systemApi = {
  getStatus: (): Promise<SystemStatus> =>
    axios.get('/system/status').then(res => res.data),
  
  getHealth: (): Promise<HealthStatus> =>
    axios.get('/health').then(res => res.data),
}

// Library management endpoints
export const libraryApi = {
  getLibraries: (): Promise<LibraryPath[]> =>
    api.get('/libraries').then(res => res.data),
  
  createLibrary: (data: CreateLibraryPathForm): Promise<{ message: string }> =>
    api.post('/libraries', data).then(res => res.data),
  
  updateLibrary: (id: number, data: Partial<CreateLibraryPathForm>): Promise<{ message: string }> =>
    api.put(`/libraries/${id}`, data).then(res => res.data),
  
  deleteLibrary: (id: number): Promise<{ message: string }> =>
    api.delete(`/libraries/${id}`).then(res => res.data),
}

// Scanning endpoints
export const scanApi = {
  getStatus: (): Promise<ScanStatus> =>
    api.get('/scan/status').then(res => res.data),
  
  startScan: (data?: StartScanForm): Promise<{ message: string }> =>
    api.post('/scan/start', data).then(res => res.data),
  
  stopScan: (): Promise<{ message: string }> =>
    api.post('/scan/stop').then(res => res.data),
}

// Statistics endpoints
export const statsApi = {
  getFileStats: (): Promise<FileStatistics> =>
    api.get('/stats').then(res => res.data),
  
  getDuplicateStats: (): Promise<DuplicateStats> =>
    api.get('/duplicates/stats').then(res => res.data),
}

// Duplicate detection endpoints
export const duplicateApi = {
  detectDuplicates: (autoMark: boolean = false): Promise<{ message: string }> =>
    api.post(`/duplicates/detect?auto_mark=${autoMark}`).then(res => res.data),
  
  getCandidates: (limit: number = 100): Promise<{ deletion_candidates: any[], total_count: number }> =>
    api.get(`/duplicates/candidates?limit=${limit}`).then(res => res.data),
  
  getGroups: (method: 'fingerprint' | 'hash' = 'fingerprint', limit: number = 50) =>
    api.get(`/duplicates/groups?method=${method}&limit=${limit}`).then(res => res.data),
}