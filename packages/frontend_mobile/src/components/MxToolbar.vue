<script setup lang="ts">
import { onMounted, ref } from 'vue';
import BScroll from '@better-scroll/core'
import { t } from '@/languages'
import MxIcon from '@/components/MxIcon.vue'
const { items, isHideItemName = false, isClickToEnlarge = false, isNoScroll = false } = defineProps<{
    items: MxToolbarItem[]
    isHideItemName?: boolean
    isClickToEnlarge?: boolean
    isNoScroll?: boolean
}>()
const emit = defineEmits<{
    (event: "tap", e: MouseEvent, item: MxToolbarItem, index: number): void
}>()

const toolbar = ref()
onMounted(() => {
    if(!isNoScroll) {
        new BScroll(toolbar.value, {
            scrollX: true,
            probeType: 3,
            bounceTime: 600,
            tap: "tap",
            click: true,
            outOfBoundaryDampingFactor: 0.6,
            observeImage: true,
            observeDOM: true,
            snap: true,
            preventDefaultException: {
                tagName: /^(INPUT|TEXTAREA|BUTTON|SELECT)$/,
                className: /(^|\s)(name|icon|mxicon)(\s|$)/
            }
        })
    }
})


const tap = (e: MouseEvent, item: MxToolbarItem, index: number) => {
    emit("tap", e, item, index)
}
</script>

<template>
    <div class="mx-toolbar" ref="toolbar">
        <div class="items">
            <template v-for="(item, index) in items">
                <button class="item" @tap="tap($event, item, index)">
                        <MxIcon :icon="item.icon || ''" :isDefault="item.isIconDefault" :class="{
                            'zoomed': isClickToEnlarge
                        }" class="icon"></MxIcon>
                        <span v-if="!isHideItemName" class="name">{{ t(item.name || "") }}</span>
                </button>
            </template>
        </div>
    </div>
</template>

<style scoped lang='scss'>
.mx-toolbar {
    --toolbar-padding: 0 var(--van-padding-xs);
    --toolbar-title-font-size: var(--van-font-size-sm);
    --toolbar-name-font-size: var(--van-font-size-xs);
    --toolbar-name-min-height: var(--van-line-height-xs);
    --toolbar-name-min-width: 84px;
    --toolbar-zoomed-icon-size: 2;
    --toolbar-item-padding: 10px 5px;

    background-color: var(--bg-color);
    color: var(--van-white);
    padding: var(--toolbar-padding);
    position: relative;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    .zoomed:active {
        /*  ‍ 放大状态的样式 */
/* ‍ Enlarge the style of the state*/

        transform: scale(var(--toolbar-zoomed-icon-size));
    }

    .items {
        display: inline-flex;

        .item {
            display: inline-flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: var(--toolbar-item-padding);

            &:active {
                background-color: var(--active-color)
            }

            .icon {
                font-size: var(--icon-size);
                /*  ‍ 初始状态样式 */
/* ‍ Initial state style*/

                transition: transform 0.3s ease;
                transform-origin: center;
                /*  ‍ 动画从元素中心开始 */
/* ‍ Animation starts from the center of the element*/

            }

            .name {
                display: flex;
                justify-content: center;
                white-space: nowrap;
                margin-top: 5px;
                font-size: var(--toolbar-name-font-size);
                min-height: var(--toolbar-name-min-height);
                min-width: var(--toolbar-name-min-width);
            }
        }
    }
}
</style>