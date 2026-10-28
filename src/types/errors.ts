// 에러 타입 정의

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: string
  ) {
    super(message)
    this.name = 'ApiError'
    Object.setPrototypeOf(this, ApiError.prototype)
  }
}

export class StorageError extends Error {
  constructor(
    message: string,
    public operation?: string,
    public key?: string
  ) {
    super(message)
    this.name = 'StorageError'
    Object.setPrototypeOf(this, StorageError.prototype)
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
    public value?: unknown
  ) {
    super(message)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public version?: string,
    public data?: unknown
  ) {
    super(message)
    this.name = 'MigrationError'
    Object.setPrototypeOf(this, MigrationError.prototype)
  }
}

