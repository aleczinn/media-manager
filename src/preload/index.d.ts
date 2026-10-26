import type { MediaManagerApi } from '../shared/types'

declare global {
    interface Window {
        api: MediaManagerApi
    }
}

export {}
