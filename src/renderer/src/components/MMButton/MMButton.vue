<template>
    <button
        :class="computedClass"
        :disabled="disabled"
        @click="handleClick"
    >
        <slot></slot>
    </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    disabled: false
})

const emit = defineEmits(['click'])

const computedClass = computed(() => ({
    'bg-primary-200 text-primary-950 rounded transition-colors duration-200 hover:bg-primary-300 hover:cursor-pointer': !props.disabled,
    'bg-primary-100 text-primary-400 rounded cursor-not-allowed': props.disabled
}))

const handleClick = () => {
    if (!props.disabled) emit('click')
}
</script>

<style scoped lang="postcss">
button {
    @apply flex items-center px-4 py-2 text-center outline-none;
}
</style>
