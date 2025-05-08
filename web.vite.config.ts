import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default ({ mode }: { mode: string }): ReturnType<typeof defineConfig> => {
    process.env = { ...process.env, ...loadEnv(mode, process.cwd()) }

    // https://vitejs.dev/config/
    return defineConfig({
        root: path.resolve(__dirname, './src/renderer'),
        server: {
            port: 8080
        },
        plugins: [vue()],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src/renderer/src')
            }
        },
        define: {
            __VUE_I18N_FULL_INSTALL__: true,
            __VUE_I18N_LEGACY_API__: false,
            __INTLIFY_PROD_DEVTOOLS__: false
        },
        optimizeDeps: {
            include: ['vue', 'vue-router']
        },
        build: {
            outDir: path.resolve(__dirname, './dist-web'),
            emptyOutDir: true
        }
    })
}
