<template>
    <div @click="handleClick" class="checkbox" :class="computedClass">
        <div class="box">
            <span class="symbol">✓</span>
        </div>
        <slot></slot>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
    checked: boolean
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    checked: false,
    disabled: false
});

const emit = defineEmits(['click']);

const computedClass = computed(() => ({
    '': !props.disabled,
    '': props.disabled
}))

const handleClick = () => {
    if (!props.disabled) emit('click')
    props.checked = !props.checked;
}
</script>

<style scoped lang="postcss">
.checkbox{
    @apply flex flex-row items-center gap-4 hover:cursor-pointer;
}

.checkbox .box {
    @apply w-6 h-6 bg-primary-50 border-1 border-solid border-primary-600 rounded;
    @apply flex items-center justify-center;
}

.checkbox .box .symbol {
    @apply text-primary-950;
}
</style>
