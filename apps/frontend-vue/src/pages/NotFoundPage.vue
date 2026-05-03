<template>
  <v-container fill-height fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5" lg="4" class="text-center">
        <v-icon size="80" icon="mdi-file-question-outline" color="medium-emphasis" class="mb-4" />
        <div class="text-h5 font-weight-bold mb-2">页面未找到</div>
        <div class="text-body-2 text-medium-emphasis mb-6">
          您访问的页面不存在或已被移除
        </div>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-home" to="/dashboard">
          返回首页
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
// NotFoundPage: 404 页面
</script>
