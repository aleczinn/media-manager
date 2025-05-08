import { FFProbeMetaData } from '../../../shared/types/FFProbeMetaData'

export {}

declare global {
    interface Window {
        electronAPI: {
            selectFolder: () => Promise<string>
            analyzeFolder: (filePath: string) => Promise<Array<{
                name: string
                path: string
                data: any
            }>>
        }
    }
}
