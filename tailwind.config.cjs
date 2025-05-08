const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{vue,js,ts,jsx,tsx}",],
    theme: {
        extend: {
            colors: {
                "transparent": "transparent",
                "white": "#ffffff"
            },
            screens: {
                '3xl': '2000px'
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
