<template>
    <div class="flex flex-col h-screen">
        <header class="px-4 py-4 bg-white shadow-sm">
            <p class="font-semibold">MediaManager</p>
        </header>

        <main class="flex-1 py-8">
            <div class="mx-auto max-w-project px-4">
                <!-- ADD CONTENT HERE -->
                <div @click="selectFolder" class="bg-blue-200 h-8 rounded flex flex-row items-center px-2 mb-8 cursor-pointer">
                    <span v-if="folderPath" class="select-none">{{ folderPath }}</span>
                    <span v-if="!folderPath" class="text-gray-600">Bitte Ordner auswählen...</span>
                </div>

                <div v-if="folderPath">
                    Datein:
                    <ul>
                        <li v-for="file in files" :key="file.name" class="flex flex-row gap-4">
                            <span>{{ file.name }}</span>
                            <span>{{ formatDuration(file.data.format.duration) }}</span>
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
import { MMFooter } from '../components/MMFooter'
// import { AxiosInstance } from 'axios'

// const axios = inject<AxiosInstance>('axios')

const folderPath = ref<string | null>(null)
const files = ref<Array<{
    name: string,
    path: string,
    data: any
}>>([])

const selectFolder = async () => {
    const folder = await window.electronAPI.selectFolder()
    if (!folder) return

    folderPath.value = folder
    files.value = await window.electronAPI.analyzeFolder(folder)

    console.log(files.value);
}

function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function sortStreams(streams: any) {

    return {}
}
</script>

<style scoped lang="postcss"></style>
