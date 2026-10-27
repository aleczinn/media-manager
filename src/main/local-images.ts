import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { LOCAL_IMAGE_SCHEME } from '../shared/local-image'

/** Nur Bilder, die der Scan neben einem Video gefunden hat, dürfen angezeigt werden */
const allowed = new Set<string>()

export function allowLocalImage(filePath: string): void {
    allowed.add(filePath.toLowerCase())
}

/** Muss vor `app.whenReady` laufen */
export function registerLocalImageScheme(): void {
    protocol.registerSchemesAsPrivileged([{ scheme: LOCAL_IMAGE_SCHEME, privileges: { standard: true, secure: true } }])
}

export function handleLocalImages(): void {
    protocol.handle(LOCAL_IMAGE_SCHEME, (request) => {
        const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1))
        if (!allowed.has(filePath.toLowerCase())) return new Response(null, { status: 404 })
        return net.fetch(pathToFileURL(filePath).toString())
    })
}
