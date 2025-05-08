<template>
    <div class="flex flex-col h-screen">
        <header class="px-4 py-4 bg-amber-200">
            <p class="">Header</p>
        </header>

        <main class="flex-1 py-8">
            <div class="mx-auto max-w-[120rem]">
                <!-- ADD CONTENT HERE -->
                <p class="">content</p>
            </div>
        </main>

        <footer class="px-4 py-4 bg-amber-200">
            <p class="">Footer</p>
        </footer>
    </div>
</template>

<script setup lang="ts">
import { inject } from 'vue'
import { AxiosInstance } from 'axios'

const axios = inject<AxiosInstance>('axios')
</script>

<style scoped lang="postcss"></style>
