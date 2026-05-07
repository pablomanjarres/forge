/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    keychain: {
      save: (key: string, value: string) => Promise<boolean>
      get: (key: string) => Promise<string | null>
      delete: (key: string) => Promise<boolean>
    }
  }
}
