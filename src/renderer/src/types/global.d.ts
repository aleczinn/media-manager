export {}

declare global {
    interface Window {
        electronAPI: {
            selectFolder: () => Promise<{
                folderPath: string
                files: { name: string; fullPath: string }[]
            } | null>
        }
    }
}
