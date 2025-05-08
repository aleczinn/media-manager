import './css/global.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import i18n from './i18n'
import axios from './axios'
import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
import { far } from '@fortawesome/free-regular-svg-icons'
import { fab } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

const BASE_URL_DEV = ''
const BASE_URL_PROD = ''

library.add(fas, far, fab)

const app = createApp(App)
app.use(router)
app.use(i18n)
app.use(axios, {
    baseUrl: process.env.NODE_ENV === 'production' ? BASE_URL_PROD : BASE_URL_DEV,
    token: ''
})
app.provide('axios', app.config.globalProperties.axios)
app.component('FontAwesomeIcon', FontAwesomeIcon)
app.mount('#app')
