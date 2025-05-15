const defaultTheme = require("tailwindcss/defaultTheme");

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./src/**/*.{vue,js,ts,jsx,tsx}",],
    theme: {
        extend: {
            colors: {
                "transparent": "transparent",
                "primary": {
                    50: "#f8fafa",
                    100: "#f1f5f6",
                    200: "#e6eeee",
                    300: "#d1dfe1",
                    400: "#b6cbcf",
                    500: "#98b3ba",
                    600: "#849faa",
                    700: "#6d8894",
                    800: "#5b727c",
                    900: "#4c5e66",
                    950: "#313f44"
                },
                "black": "#000000",
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
            borderWidth: {
                "1": "1px"
            }
        },
    },
    plugins: [
        require("@tailwindcss/aspect-ratio"),
        require("@tailwindcss/typography"),
    ]
}
