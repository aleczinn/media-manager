import { PRESET_DEBUG_LEVEL } from '../index'

export const RESET = '\u001b[0m'
export const BLACK = '\u001b[30m'
export const RED = '\u001b[31m'
export const GREEN = '\u001b[32m'
export const YELLOW = '\u001b[33m'
export const BLUE = '\u001b[34m'
export const PURPLE = '\u001b[35m'
export const CYAN = '\u001b[36m'
export const WHITE = '\u001b[37m'

export function separationLine() {
    console.log(`\n\n${RESET}> = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = =`)
}

export function error(error: string) {
    console.log(`${RESET}>${RED}> ${error}`)
}

export function debug(message: string) {
    if (PRESET_DEBUG_LEVEL == 'LOW') {
        console.log(`${WHITE}[${CYAN}DEBUG${WHITE}] ${WHITE}> ${RESET}${message}`)
    }
}
