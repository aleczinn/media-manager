const ISO_639_2_TO_1: Record<string, string> = {
    ger: 'de',
    deu: 'de',
    eng: 'en',
    jpn: 'ja',
    spa: 'es',
    fre: 'fr',
    fra: 'fr',
    ita: 'it',
    rus: 'ru',
    kor: 'ko',
    chi: 'zh',
    zho: 'zh',
    por: 'pt',
    dut: 'nl',
    nld: 'nl',
    pol: 'pl',
    tur: 'tr',
    swe: 'sv',
    dan: 'da',
    nor: 'no',
    fin: 'fi',
    cze: 'cs',
    ces: 'cs',
    hun: 'hu',
    ara: 'ar',
    gre: 'el',
    ell: 'el',
    heb: 'he',
    ind: 'id',
    may: 'ms',
    msa: 'ms',
    nob: 'nb',
    rum: 'ro',
    ron: 'ro',
    slo: 'sk',
    slk: 'sk',
    slv: 'sl',
    hrv: 'hr',
    srp: 'sr',
    bul: 'bg',
    ukr: 'uk',
    tha: 'th',
    vie: 'vi',
    hin: 'hi',
    est: 'et',
    lav: 'lv',
    lit: 'lt',
    ice: 'is',
    isl: 'is',
    cat: 'ca'
}

/** Anzeigenamen, werden auch als Untertitel-Titel verwendet */
const LANGUAGE_NAMES: Record<string, string> = {
    de: 'Deutsch',
    en: 'English',
    ja: 'Japanese',
    fr: 'French',
    es: 'Spanish',
    it: 'Italian',
    ru: 'Russian',
    ko: 'Korean',
    zh: 'Chinese',
    pt: 'Portuguese',
    nl: 'Dutch',
    pl: 'Polish',
    tr: 'Turkish',
    sv: 'Swedish',
    da: 'Danish',
    no: 'Norwegian',
    fi: 'Finnish',
    cs: 'Czech',
    hu: 'Hungarian',
    ar: 'Arabic',
    el: 'Greek',
    he: 'Hebrew',
    id: 'Indonesian',
    ms: 'Malay',
    fil: 'Filipino',
    nb: 'Norwegian Bokmål',
    ro: 'Romanian',
    sk: 'Slovak',
    sl: 'Slovenian',
    hr: 'Croatian',
    sr: 'Serbian',
    bg: 'Bulgarian',
    uk: 'Ukrainian',
    th: 'Thai',
    vi: 'Vietnamese',
    hi: 'Hindi',
    et: 'Estonian',
    lv: 'Latvian',
    lt: 'Lithuanian',
    is: 'Icelandic',
    ca: 'Catalan',
    und: 'Unknown'
}

/** Sprachen, die in den Einstellungen zur Auswahl stehen */
export const KNOWN_LANGUAGES: string[] = Object.keys(LANGUAGE_NAMES).filter((code) => code !== 'und')

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
