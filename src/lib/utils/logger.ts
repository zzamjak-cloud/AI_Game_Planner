// 개발 모드 전용 로거 유틸리티

/**
 * 개발 모드에서만 로그 출력
 */
const isDev = import.meta.env.DEV

export const devLog = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args)
    }
  },

  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args)
    }
  },

  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args)
    }
  },

  error: (...args: any[]) => {
    // 에러는 항상 출력 (프로덕션에서도 중요)
    console.error(...args)
  },

  debug: (...args: any[]) => {
    if (isDev) {
      console.debug(...args)
    }
  },
}

/**
 * 조건부 로그 (조건이 true일 때만 출력)
 */
export const conditionalLog = (condition: boolean, ...args: any[]) => {
  if (isDev && condition) {
    console.log(...args)
  }
}

/**
 * 성능 측정 로그
 */
export const perfLog = {
  start: (label: string): number => {
    if (isDev) {
      console.time(label)
      return performance.now()
    }
    return 0
  },

  end: (label: string, startTime?: number): void => {
    if (isDev) {
      if (startTime) {
        const elapsed = performance.now() - startTime
        console.log(`⏱️ ${label}: ${elapsed.toFixed(2)}ms`)
      } else {
        console.timeEnd(label)
      }
    }
  },
}
