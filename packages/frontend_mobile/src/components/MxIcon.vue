<script setup lang="ts">
const { isDefault = false, icon = "" } = defineProps<{
    icon: string,
    isDefault?: boolean
    color?: string
    fill?: string
}>()
const prefix = isDefault  ? 'mxicon' : 'mxicon-symbol'

</script>

<template>
    <van-icon :class-prefix="prefix" :name="isDefault ? icon :''" :color="isDefault ? color: void 0">
        <svg v-if="!isDefault" :class="prefix + '-svg'" aria-hidden="true" :style="{
            color,
            fill
        }">
            <use :xlink:href="'#'+ icon"></use>
        </svg>
    </van-icon>
</template>

<style lang='scss'>
.mxicon, .mxicon-symbol {
    font-size: var(--icon-size, 36px);
}

.mxicon-symbol, .mxicon-symbol-svg, .mxicon-svg {
    width: 1em; 
    height: 1em;
    vertical-align: -0.15em;
    fill: currentColor;
    overflow: hidden;
    color: #fff;
    fill: #00A99E;
}
</style>