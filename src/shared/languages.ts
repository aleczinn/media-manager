const ISO_639_2_TO_1: Record<string, string> = {
    ger: 'de',
    deu: 'de',
    eng: 'en',
    jpn: 'ja',
    spa: 'es',
    fre: 'fr',
    fra: 'fr',
    ita: 'it',
    rus: 'ru'
}

const LANGUAGE_NAMES: Record<string, string> = {
    de: 'Deutsch',
    en: 'English',
    ja: 'Japanese',
    fr: 'French',
    es: 'Spanish',
    it: 'Italian',
    ru: 'Russian',
    und: 'Unknown'
}

/**
 * Vereinheitlicht ein Sprach-Tag auf zweistellige Codes (ger/deu → de, de-DE → de).
 * Spuren ohne Tag bekommen die Fallback-Sprache.
 */
export function normalizeLanguage(raw: string | undefined | null, fallback: string): string {
    const language = (raw || '').trim().toLowerCase().split(/[-_]/)[0]
    if (language === '') return fallback.toLowerCase() || 'und'
    return ISO_639_2_TO_1[language] ?? language
}

export function getLanguageName(language: string): string {
    return LANGUAGE_NAMES[language.toLowerCase()] || language.toUpperCase()
}
