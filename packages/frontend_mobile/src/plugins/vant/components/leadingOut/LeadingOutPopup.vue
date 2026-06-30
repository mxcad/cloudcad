<script setup lang="ts">
import { t } from "@/languages";
import type { FromType } from "./showPopup"

const { title = t("导出"), from } = defineProps<{
    title: string,
    from: FromType
}>()

</script>

<template>
    <div class="LeadingOutPopup">
        <div class="header">{{ title }}</div>
        <div class="from-box">
            <van-field :label="t('文件名')" v-mode="from.fileName" disabled></van-field>
            <van-field v-for="(item, index) in from.list" :label="item.label" :key="index" v-mode="item.input.value" right-icon="arrow-down"></van-field>
        </div>
    </div>
</template>

<style scoped lang='scss'>
.LeadingOutPopup {
    display: flex;
    flex-direction: column;
    background-color: #fff;
    width: 80vw;
    height: 80vh;
    --leading-out-popup-padding: 0 40px;
    .header {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 68px;
        font-weight: var(--van-font-bold);
        background-color: #F3F3F3;
        font-size: var(--van-font-size-md)
    }

    .from-box {
        --van-cell-font-size: var(--van-font-size-sm);
        --van-field-disabled-text-color: #646464;
        padding: var(--leading-out-popup-padding);
    }

}
</style>