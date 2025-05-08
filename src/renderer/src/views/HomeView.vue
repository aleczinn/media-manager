<template>
    <div class="flex flex-col h-screen">
        <header class="px-4 py-4 bg-white shadow-sm">
            <p class="font-semibold">MediaManager</p>
        </header>

        <main class="flex-1 py-8">
            <div class="mx-auto max-w-project px-4">
                <!-- ADD CONTENT HERE -->
                <div @click="selectFolder" class="bg-blue-200 h-8 rounded flex flex-row items-center px-2 mb-8">
                    <span v-if="folderPath" class="select-none">{{ folderPath }}</span>
                    <span v-if="!folderPath" class="text-gray-600">Bitte Ordner auswählen...</span>
                </div>

                <div v-if="folderPath">
                    Datein:
                    <ul>
                        <li v-for="file in files" :key="file.fullPath">
                            {{ file.name }}
                        </li>
                    </ul>
                </div>
            </div>
        </main>

        <MMFooter></MMFooter>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { MMFooter } from "../components/MMFooter";
// import { AxiosInstance } from 'axios'

// const axios = inject<AxiosInstance>('axios')

const folderPath = ref<string | null>(null)
const files = ref<{ name: string; fullPath: string }[]>([])

const selectFolder = async () => {
    const result = await window.electronAPI.selectFolder()

    if (result) {
        folderPath.value = result.folderPath
        files.value = result.files
    }
}
</script>

<style scoped lang="postcss"></style>
