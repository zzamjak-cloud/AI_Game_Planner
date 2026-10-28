// 유틸리티 모듈 재export

export * from './markdown'
export * from './session'
export * from './template'
export * from './validation'

// 공통 유틸리티
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

