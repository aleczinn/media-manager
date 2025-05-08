import { createI18n } from 'vue-i18n'

export const DEFAULT_LOCALE = 'de-DE'
export const DEFAULT_LANGUAGE = 'de'

/**
 * Contains all loaded locales
 */
const loadedLocales: Array<unknown> = []

/**
 * Gets all supported locales.
 * Also make sure that you have created a message file with the locale in the directory ./locales
 *
 * IMPORTANT: If you add something new here make sure you update
 * - getDefaultLocaleByCountry
 * - getLanguageNameByLocale
 * @returns {Array} locales ['de_DE', 'de_AT', ...]
 */
export const getSupportedLocales = function (): string[] {
    return ['en-US', 'de-DE', 'de-AT']
}

/**
 * Returns the default locale for the param country
 * @param country - de => de_DE
 * @returns {String} locale
 */
export const getDefaultLocaleByCountry = function (country: string): string {
    switch (country) {
        case 'en':
            return 'en-US'
        case 'de':
            return 'de-DE'
        case 'at':
            return 'de-AT'
        default:
            return 'de-DE'
    }
}

export const getLanguageNameByLocale = function (locale: string): string {
    switch (locale) {
        case 'en-US':
            return 'english'
        case 'de-DE':
            return 'deutsch'
        case 'de-AT':
            return 'deutsch'
        default:
            return 'de-DE'
    }
}

/**
 * Returns all supported countries extracted from the supported locales
 * @returns {Array} countries ['de', 'it', ...]
 */
export const getSupportedCountries = function (): string[] {
    return getSupportedLocales()
        .map((locale) => locale.split('-')[1].toLowerCase())
        .filter((value, index, self) => self.indexOf(value) === index)
}

/**
 * Returns all available countries for the given parameter country
 * @param {String} country - be
 * @returns {Array} locales ['fr-BE', 'nl-BE']
 */
export const getAvailableLocalesByCountry = function (country: string): string[] {
    return getSupportedLocales().filter(
        (locale) => locale.indexOf(`-${country.toUpperCase()}`) !== -1
    )
}

/**
 * Returns the country from a given locale
 * @param {String} locale - de-DE/de_DE
 * @returns {String} the country DE
 */
export const getCountryFromLocale = function (locale: string): string {
    locale = locale.replace('_', '-')
    return locale.split('-')[1].toUpperCase()
}

/**
 * Returns the language from a given locale
 * @param {String} locale - de-DE/de_DE
 * @returns {String} the language de
 */
export const getLanguageFromLocale = function (locale: string): string {
    locale = locale.replace('_', '-')
    return locale.split('-')[0].toLowerCase()
}

/**
 * Returns the current country
 * @returns {String} the current country
 */
export const getCurrentCountry = function (): string {
    return i18n.global.locale.value.split('-')[1].toUpperCase()
}

/**
 * Returns the current language
 * @returns {String} the current language
 */
export const getCurrentLanguage = function (): string {
    return i18n.global.locale.value.split('-')[0].toLowerCase()
}

export const loadLocaleAsync = function loadLocaleAsync(locale: string): Promise<string | void> {
    locale = locale.replace('_', '-')

    // If the same locale then before and not the fallback locale
    if (i18n.global.locale.value === locale && i18n.global.fallbackLocale.value !== locale) {
        return Promise.resolve(setI18nLocale(locale))
    }

    // If the locale was already loaded
    if (loadedLocales.includes(locale)) {
        return Promise.resolve(setI18nLocale(locale))
    }

    // If the locale has not been loaded yet we import the messages from that locale
    return import(`./locales/${locale}.json`).then((messages) => {
        // and we set the messages for that locale in i18n
        i18n.global.setLocaleMessage(locale, messages.default)

        // also we push that locale to loadedLocales
        loadedLocales.push(locale)

        // then return and set switch the locale in i18n
        return setI18nLocale(locale)
    })
}

export const setI18nLocale = function (locale: string): string {
    i18n.global.locale.value = locale

    /**
     * NOTE:
     * If you need to specify the language setting for headers, such as the `fetch` API, set it here.
     * The following is an example for axios.
     *
     * axios.defaults.headers.common['Accept-Language'] = locale
     */

    const element = document.querySelector('html')
    if (element != null) {
        element.setAttribute('lang', locale)
    }
    return locale
}

const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: DEFAULT_LOCALE,
    fallbackLocale: DEFAULT_LOCALE
})

loadLocaleAsync(DEFAULT_LOCALE)

export default i18n
