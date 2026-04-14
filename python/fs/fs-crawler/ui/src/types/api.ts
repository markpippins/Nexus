// API response types
export interface SystemStatus {
  system_status: string
  version: string
  startup_time: string
  active_scans: number
  total_files_indexed: number
  total_directories: number
  uptime_seconds: number
}

export interface HealthStatus {
  status: string
  databases: {
    redis: string
    mongodb: string
    mysql: string
  }
}

export interface LibraryPath {
  id: number
  path: string
  name?: string
  scan_enabled: boolean
  deep_scan: boolean
  path_type: 'album' | 'compilation' | 'recent' | 'general'
  auto_delete_duplicates: boolean
  delete_lower_quality: boolean
  quality_threshold: number
  preferred_formats: string
  deletion_priority: number
  created_at: string
  updated_at: string
}

export interface ScanStatus {
  active_scans: number
  scans: ScanOperation[]
}

export interface ScanOperation {
  scan_id: string
  path: string
  started_at: string
  status: 'running' | 'completed' | 'failed'
  files_processed: number
  deep_scan: string
  current_directory?: string
  progress_percentage?: number
  is_active?: boolean
  last_checkpoint?: string
  error?: string
}

export interface FileStatistics {
  total_files: number
  total_directories: number
  by_category: CategoryStats[]
}

export interface CategoryStats {
  _id: string
  count: number
  total_size: number
}

export interface DuplicateStats {
  duplicate_groups: number
  duplicate_files: number
  deletion_candidates: number
  best_quality_files: number
}

export interface ApiError {
  detail: string
}

// Form types
export interface CreateLibraryPathForm {
  path: string
  name?: string
  scan_enabled?: boolean
  deep_scan?: boolean
  path_type?: 'album' | 'compilation' | 'recent' | 'general'
  auto_delete_duplicates?: boolean
  delete_lower_quality?: boolean
  quality_threshold?: number
  preferred_formats?: string
  deletion_priority?: number
}

export interface StartScanForm {
  path?: string
  deep_scan?: boolean
}