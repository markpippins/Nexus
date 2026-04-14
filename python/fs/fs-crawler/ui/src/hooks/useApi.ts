import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { systemApi, libraryApi, scanApi, statsApi, duplicateApi } from '@/services/api'
import type { CreateLibraryPathForm, StartScanForm } from '@/types/api'

// Query keys
export const queryKeys = {
  systemStatus: ['system', 'status'] as const,
  health: ['system', 'health'] as const,
  libraries: ['libraries'] as const,
  scanStatus: ['scan', 'status'] as const,
  fileStats: ['stats', 'files'] as const,
  duplicateStats: ['stats', 'duplicates'] as const,
}

// System hooks
export const useSystemStatus = () => {
  return useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: systemApi.getStatus,
    refetchInterval: 5000, // Refresh every 5 seconds
  })
}

export const useHealth = () => {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: systemApi.getHealth,
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

// Library hooks
export const useLibraries = () => {
  return useQuery({
    queryKey: queryKeys.libraries,
    queryFn: libraryApi.getLibraries,
  })
}

export const useCreateLibrary = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data: CreateLibraryPathForm) => libraryApi.createLibrary(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries })
      toast.success('Library path created successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create library path')
    },
  })
}

export const useUpdateLibrary = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateLibraryPathForm> }) =>
      libraryApi.updateLibrary(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries })
      toast.success('Library path updated successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update library path')
    },
  })
}

export const useDeleteLibrary = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: number) => libraryApi.deleteLibrary(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries })
      toast.success('Library path deleted successfully')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to delete library path')
    },
  })
}

// Scan hooks
export const useScanStatus = () => {
  return useQuery({
    queryKey: queryKeys.scanStatus,
    queryFn: scanApi.getStatus,
    refetchInterval: 2000, // Refresh every 2 seconds when scanning
  })
}

export const useStartScan = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (data?: StartScanForm) => scanApi.startScan(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
      queryClient.invalidateQueries({ queryKey: queryKeys.systemStatus })
      toast.success(response.message)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to start scan')
    },
  })
}

export const useStopScan = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: scanApi.stopScan,
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scanStatus })
      queryClient.invalidateQueries({ queryKey: queryKeys.systemStatus })
      toast.success(response.message)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to stop scan')
    },
  })
}

// Statistics hooks
export const useFileStats = () => {
  return useQuery({
    queryKey: queryKeys.fileStats,
    queryFn: statsApi.getFileStats,
    refetchInterval: 10000, // Refresh every 10 seconds
  })
}

export const useDuplicateStats = () => {
  return useQuery({
    queryKey: queryKeys.duplicateStats,
    queryFn: statsApi.getDuplicateStats,
    refetchInterval: 30000, // Refresh every 30 seconds
  })
}

// Duplicate detection hooks
export const useDetectDuplicates = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (autoMark: boolean = false) => duplicateApi.detectDuplicates(autoMark),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.duplicateStats })
      toast.success(response.message)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to start duplicate detection')
    },
  })
}