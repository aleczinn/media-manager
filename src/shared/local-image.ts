/** Eigenes Protokoll, über das die Oberfläche Bilder neben den Videos anzeigt (nur beim Einlesen gefundene) */
export const LOCAL_IMAGE_SCHEME = 'local-image'

/** Adresse eines lokalen Bilds für `<img src>` */
export function localImageUrl(filePath: string): string {
    return `${LOCAL_IMAGE_SCHEME}://image/${encodeURIComponent(filePath)}`
}
