/** Bekannte Container-Tags mit deutscher Bezeichnung, in dieser Reihenfolge angezeigt */
const KNOWN: [key: string, label: string][] = [
    ['title', 'Titel'],
    ['show', 'Serie'],
    ['season_number', 'Staffel'],
    ['episode_sort', 'Folge'],
    ['episode_id', 'Episode'],
    ['artist', 'Künstler'],
    ['album', 'Album'],
    ['genre', 'Genre'],
    ['date', 'Datum'],
    ['date_released', 'Veröffentlicht'],
    ['description', 'Beschreibung'],
    ['synopsis', 'Inhalt'],
    ['comment', 'Kommentar'],
    ['copyright', 'Copyright'],
    ['encoded_by', 'Kodiert von'],
    ['encoder', 'Encoder'],
    ['creation_time', 'Erstellt']
]

/** Technische Angaben ohne Aussage für den Nutzer (MP4-Brands, Dauer-Statistik) */
const HIDDEN = new Set(['major_brand', 'minor_version', 'compatible_brands', 'duration'])

/** `2025-04-08T17:42:02.000000Z` → `08.04.2025, 19:42` (Ortszeit); Unlesbares bleibt, wie es ist */
function formatTimestamp(value: string): string {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export interface ContainerTag {
    key: string
    label: string
    value: string
}

/** Container-Tags zum Anzeigen: bekannte zuerst und auf Deutsch, danach die übrigen unter ihrem Schlüssel */
export function describeContainerTags(tags: Record<string, string> | undefined): ContainerTag[] {
    if (!tags) return []
    // Gleicher Text unter mehreren Schlüsseln (z. B. description, comment, synopsis) wird nur einmal gezeigt
    const seen = new Set<string>()
    const result: ContainerTag[] = []
    const add = (key: string, label: string) => {
        const value = tags[key]
        if (!value || seen.has(value)) return
        seen.add(value)
        result.push({ key, label, value: key === 'creation_time' ? formatTimestamp(value) : value })
    }
    for (const [key, label] of KNOWN) add(key, label)
    for (const key of Object.keys(tags).sort()) {
        if (!HIDDEN.has(key) && !KNOWN.some(([known]) => known === key)) add(key, key)
    }
    return result
}
