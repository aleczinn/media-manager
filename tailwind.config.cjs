const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{vue,js,ts,jsx,tsx}",],
    theme: {
        extend: {
            colors: {
                "transparent": "transparent",
                "background": "#faf7f7",
                "white": "#ffffff"
            },
            maxWidth: {
                "project": "100rem"
            },
            screens: {
                '3xl': '2000px'
            },
            fontFamily: {
                "project": ["Open Sans", ...defaultTheme.fontFamily.sans],
                "fredoka": ["Fredoka", ...defaultTheme.fontFamily.sans]
            },
            fontSize: {
                "4xs": "0.375rem",
                "3xs": "0.5rem",
                "2xs": "0.625rem"
            },
        },
    },
    plugins: [
        require("@tailwindcss/aspect-ratio"),
        require("@tailwindcss/typography"),
    ]
}
