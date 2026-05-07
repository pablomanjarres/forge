import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  keychain: {
    save: (service: string, value: string) => ipcRenderer.invoke('keychain:save', service, value),
    get: (service: string) => ipcRenderer.invoke('keychain:get', service),
    delete: (service: string) => ipcRenderer.invoke('keychain:delete', service),
    has: (service: string) => ipcRenderer.invoke('keychain:has', service),
    list: () => ipcRenderer.invoke('keychain:list'),
  },
})

declare global {
  interface Window {
    electronAPI?: {
      platform: string
      keychain: {
        save: (service: string, value: string) => Promise<boolean>
        get: (service: string) => Promise<string | null>
        delete: (service: string) => Promise<boolean>
        has: (service: string) => Promise<boolean>
        list: () => Promise<string[]>
      }
    }
  }
}
