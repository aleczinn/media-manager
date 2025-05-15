<template>
    <div class="flex flex-col h-screen">
        <header class="px-4 py-4 bg-primary-100 shadow-sm">
            <p class="font-semibold">MediaManager</p>
        </header>

        <main class="flex-1 py-8">
            <div class="mx-auto max-w-project px-4">
                <!-- Select folder bar -->
                <div class="flex flex-row gap-4 h-8 mb-8">
                    <div @click="selectFolder" class="flex-1 bg-primary-50 border-1 border-solid border-primary-600 h-full rounded flex flex-row items-center px-2 cursor-pointer">
                        <span v-if="folderPath" class="text-primary-500">{{ folderPath }}</span>
                        <span v-if="!folderPath" class="text-primary-400">Bitte Ordner auswählen...</span>
                    </div>
                    <MMButton @click="apply" :disabled="!folderPath">Ausführen</MMButton>
                </div>

                <!-- Features / Flags -->
                <div class="flex flex-row gap-4">
                    <MMCheckbox checked>Normalize</MMCheckbox>
                    <MMCheckbox checked>RenameFix</MMCheckbox>
                    <MMCheckbox>Save Poster</MMCheckbox>
                </div>

                <!-- View files -->
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
import { MMButton } from '../components/MMButton'
import { MMCheckbox } from '../components/MMCheckbox'
// import { AxiosInstance } from 'axios'

// const axios = inject<AxiosInstance>('axios')

const filesLoaded = ref<boolean>(false);
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
    filesLoaded.value = true;
}

const apply = () => {
    console.log("apply changes");
}

function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function sortStreams(streams: any) {
    const vStreams = 0;
    const aStreams = 0;
    const subtitle = 0;
    return {video: vStreams, audio: aStreams, subtitles: subtitle}
}
</script>

<style scoped lang="postcss"></style>
