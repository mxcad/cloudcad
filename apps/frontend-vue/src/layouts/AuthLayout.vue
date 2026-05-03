<template>
  <v-main>
    <v-container fluid fill-height>
      <v-row align="center" justify="center">
        <v-col cols="12" sm="10" md="8" lg="5" xl="4">
          <div class="text-center mb-8">
            <v-avatar size="56" color="primary" variant="flat" class="mb-4">
              <v-icon size="28" icon="mdi-vector-polygon" />
            </v-avatar>
            <div class="text-h5 font-weight-bold">CloudCAD</div>
            <div class="text-body-2 text-medium-emphasis">CAD 协同平台</div>
          </div>

          <v-card rounded="lg" elevation="2" class="pa-6 pa-md-8">
            <router-view />
          </v-card>
        </v-col>
      </v-row>
    </v-container>
  </v-main>
</template>

<script setup lang="ts">
// AuthLayout: 认证页面布局（登录、注册、找回密码等）
// 仅提供居中容器 + 品牌 Logo，页面内容由 router-view 渲染
</script>
