<template>
  <!-- 来源：apps/frontend/src/pages/Profile.tsx -->
  <v-container class="profile-page" :class="{ 'theme-dark': isDark }">
    <!-- 返回按钮 — 对应 Profile.tsx 行876-879 -->
    <v-btn
      variant="outlined"
      class="back-btn"
      prepend-icon="mdi-arrow-left"
      size="small"
      @click="router.back()"
    >
      {{ t('profile.back') }}
    </v-btn>

    <div class="profile-container">
      <v-card rounded="xl" class="profile-card" :elevation="isDark ? 0 : 4">
        <!-- 头像区域 — 对应 Profile.tsx 行883-911 -->
        <div class="profile-header">
          <div class="avatar-section">
            <div class="avatar-wrapper">
              <v-avatar size="80" class="avatar-main">
                <v-img v-if="user?.avatar" :src="user.avatar" alt="Avatar" />
                <v-icon v-else size="40" icon="mdi-account" color="white" />
              </v-avatar>
              <v-avatar size="24" color="amber" class="avatar-badge">
                <v-icon size="12" icon="mdi-crown" />
              </v-avatar>
            </div>
            <div class="user-info">
              <h1 class="user-name">{{ user?.nickname || user?.username || t('profile.user') }}</h1>
              <p class="user-role">
                <v-icon size="14" icon="mdi-shield-outline" />
                {{ isAdminUser ? t('profile.systemAdmin') : t('profile.normalUser') }}
              </p>
            </div>
          </div>
        </div>

        <!-- 标签页 — 对应 Profile.tsx 行914-972 -->
        <v-tabs v-model="activeTab" class="profile-tabs" grow hide-slider>
          <v-tab value="info">
            <v-icon start size="16">mdi-account-outline</v-icon>
            {{ t('profile.personalInfo') }}
          </v-tab>
          <v-tab value="password">
            <v-icon start size="16">mdi-key-outline</v-icon>
            {{ user?.hasPassword === false ? t('profile.setPassword') : t('profile.changePassword') }}
          </v-tab>
          <v-tab v-if="mailEnabled" value="email">
            <v-icon start size="16">mdi-email-outline</v-icon>
            {{ t('profile.emailBinding') }}
          </v-tab>
          <v-tab v-if="smsEnabled" value="phone">
            <v-icon start size="16">mdi-phone-outline</v-icon>
            {{ t('profile.phoneBinding') }}
          </v-tab>
          <v-tab v-if="wechatEnabled" value="wechat">
            <v-icon start size="16">mdi-wechat</v-icon>
            {{ t('profile.wechatBinding') }}
          </v-tab>
          <v-tab value="deactivate">
            <v-icon start size="16">mdi-alert-outline</v-icon>
            {{ t('profile.deactivateAccount') }}
          </v-tab>
        </v-tabs>

        <!-- 成功/错误提示 — 对应 Profile.tsx 行974-985 -->
        <v-alert v-if="success" type="success" variant="tonal" class="mx-6 mt-4" closable @click:close="success = null">
          {{ success }}
        </v-alert>
        <v-alert v-if="error" type="error" variant="tonal" class="mx-6 mt-4" closable @click:close="error = null">
          {{ error }}
        </v-alert>

        <!-- 内容区 — 对应 Profile.tsx 行987-1122 -->
        <div class="content-area">
          <!-- ========== Info Tab ========== -->
          <!-- 来源：ProfileInfoTab.tsx -->
          <div v-if="activeTab === 'info'">
            <div v-if="!isEditingInfo" class="info-view">
              <div class="d-flex justify-space-between align-center mb-4">
                <h2 class="text-h6 font-weight-bold">{{ t('profile.personalInfo') }}</h2>
                <v-btn color="primary" size="small" @click="startEditInfo">
                  <v-icon start size="16">mdi-pencil</v-icon>
                  {{ t('profile.edit') }}
                </v-btn>
              </div>

              <v-row dense>
                <v-col cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="indigo" rounded="lg">
                        <v-icon icon="mdi-account" color="white" />
                      </v-avatar>
                      <div>
                        <div class="text-caption text-medium-emphasis">{{ t('profile.username') }}</div>
                        <div class="text-body-2 font-weight-medium">{{ user?.username || '-' }}</div>
                      </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="cyan" rounded="lg">
                        <v-icon icon="mdi-account-circle" color="white" />
                      </v-avatar>
                      <div>
                    <div class="text-caption text-medium-emphasis">{{ t('profile.nickname') }}</div>
                    <div class="text-body-2 font-weight-medium">{{ user?.nickname || '-' }}</div>
                  </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="blue" rounded="lg">
                        <v-icon icon="mdi-email" color="white" />
                      </v-avatar>
                      <div>
                    <div class="text-caption text-medium-emphasis">{{ t('profile.email') }}</div>
                    <div class="text-body-2 font-weight-medium d-flex align-center ga-1">
                      {{ user?.email || t('profile.unbound') }}
                      <v-icon v-if="user?.email" size="14" color="success" icon="mdi-check-circle" />
                    </div>
                  </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="green" rounded="lg">
                        <v-icon icon="mdi-phone" color="white" />
                      </v-avatar>
                      <div>
                    <div class="text-caption text-medium-emphasis">{{ t('profile.phone') }}</div>
                    <div class="text-body-2 font-weight-medium d-flex align-center ga-1">
                      {{ user?.phone || t('profile.unbound') }}
                      <v-icon v-if="user?.phone && user?.phoneVerified" size="14" color="success" icon="mdi-check-circle" />
                    </div>
                  </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="purple" rounded="lg">
                        <v-icon icon="mdi-wechat" color="white" />
                      </v-avatar>
                      <div>
                    <div class="text-caption text-medium-emphasis">{{ t('profile.wechat') }}</div>
                    <div class="text-body-2 font-weight-medium d-flex align-center ga-1">
                      {{ user?.wechatId ? t('profile.bound') : t('profile.unbound') }}
                      <v-icon v-if="user?.wechatId" size="14" color="success" icon="mdi-check-circle" />
                      <v-icon v-else size="14" color="grey" icon="mdi-close-circle" />
                    </div>
                  </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="green" rounded="lg">
                        <v-icon icon="mdi-shield" color="white" />
                      </v-avatar>
                      <div>
                    <div class="text-caption text-medium-emphasis">{{ t('profile.accountRole') }}</div>
                    <v-chip size="small" :color="isAdminUser ? 'primary' : 'default'" label>
                      {{ isAdminUser ? t('profile.systemAdmin') : t('profile.normalUser') }}
                    </v-chip>
                  </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="orange" rounded="lg">
                        <v-icon icon="mdi-activity" color="white" />
                      </v-avatar>
                      <div>
                    <div class="text-caption text-medium-emphasis">{{ t('profile.accountStatus') }}</div>
                    <v-chip
                      size="small"
                      :color="statusColor"
                      label
                    >
                      {{ statusLabel }}
                    </v-chip>
                  </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col v-if="user?.createdAt" cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="blue" rounded="lg">
                        <v-icon icon="mdi-calendar" color="white" />
                      </v-avatar>
                      <div>
                    <div class="text-caption text-medium-emphasis">{{ t('profile.createdAt') }}</div>
                    <div class="text-body-2 font-weight-medium">{{ formatDate(user.createdAt) }}</div>
                  </div>
                    </div>
                  </v-card>
                </v-col>

                <v-col v-if="user?.lastLoginAt" cols="12" sm="6">
                  <v-card variant="outlined" rounded="lg" class="info-card">
                    <div class="d-flex align-center ga-3">
                      <v-avatar size="44" color="purple" rounded="lg">
                        <v-icon icon="mdi-star-four-points" color="white" />
                      </v-avatar>
                      <div>
                    <div class="text-caption text-medium-emphasis">{{ t('profile.lastLoginAt') }}</div>
                    <div class="text-body-2 font-weight-medium">{{ formatDate(user.lastLoginAt) }}</div>
                  </div>
                    </div>
                  </v-card>
                </v-col>
              </v-row>
            </div>

            <!-- 编辑个人信息表单 — 来源：ProfileInfoTab.tsx 行245-320 -->
            <div v-else class="edit-profile-form">
              <div class="d-flex justify-space-between align-center mb-4">
                <h2 class="text-h6 font-weight-bold">{{ t('profile.editPersonalInfo') }}</h2>
                <v-btn variant="outlined" size="small" @click="cancelEditInfo">
                  <v-icon start size="16">mdi-close</v-icon>
                  {{ t('common.cancel') }}
                </v-btn>
              </div>
              <v-form @submit.prevent="handleUpdateProfile">
                <v-text-field
                  v-model="infoForm.username"
                  :label="t('profile.username')"
                  :placeholder="t('profile.enterUsername')"
                  :minlength="3"
                  :maxlength="20"
                  required
                  variant="outlined"
                  class="mb-2"
                />
                <div class="text-caption text-medium-emphasis mb-4">{{ t('profile.usernameLimit') }}</div>
                <v-text-field
                  v-model="infoForm.nickname"
                  :label="t('profile.nickname')"
                  :placeholder="t('profile.enterNickname')"
                  :maxlength="50"
                  variant="outlined"
                  class="mb-4"
                />
                <v-btn type="submit" color="primary" block :loading="infoLoading" size="large">
                  <v-icon start>mdi-content-save</v-icon>
                  {{ t('common.save') }}
                </v-btn>
              </v-form>
            </div>
          </div>

          <!-- ========== Password Tab ========== -->
          <!-- 来源：ProfilePasswordTab.tsx -->
          <div v-if="activeTab === 'password'">
            <v-form @submit.prevent="handlePasswordSubmit" class="password-form">
              <!-- hasPassword === false 时的提示 — ProfilePasswordTab.tsx 行87-100 -->
              <v-alert
                  v-if="user?.hasPassword === false"
                  type="info"
                  variant="tonal"
                  class="mb-6"
                >
                  <div class="d-flex align-start ga-3">
                    <v-icon icon="mdi-key" size="24" />
                    <div>
                      <div class="font-weight-bold">{{ t('profile.setPassword') }}</div>
                      <div class="text-body-2">
                        {{ t('profile.setPasswordTip') }}
                      </div>
                    </div>
                  </div>
                </v-alert>

              <!-- 当前密码 — ProfilePasswordTab.tsx 行47-85 -->
              <v-text-field
                v-if="user?.hasPassword !== false"
                v-model="passwordForm.oldPassword"
                :type="showPassword.old ? 'text' : 'password'"
                :label="t('profile.currentPassword')"
                :placeholder="t('profile.enterCurrentPassword')"
                :required="user?.hasPassword !== false"
                variant="outlined"
                class="mb-1"
                :append-inner-icon="showPassword.old ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPassword.old = !showPassword.old"
              />
              <div v-if="user?.hasPassword !== false" class="text-right mb-4">
                <v-btn variant="text" size="small" color="primary" @click="router.push('/forgot-password')">
                  {{ t('profile.forgotPassword') }}
                </v-btn>
              </div>

              <!-- 新密码 — ProfilePasswordTab.tsx 行102-148 -->
              <v-text-field
                v-model="passwordForm.newPassword"
                :type="showPassword.new ? 'text' : 'password'"
                :label="t('profile.newPassword')"
                :placeholder="t('profile.newPasswordPlaceholder')"
                required
                variant="outlined"
                class="mb-1"
                :append-inner-icon="showPassword.new ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPassword.new = !showPassword.new"
              />
              <!-- 密码强度条 — ProfilePasswordTab.tsx 行129-147 -->
              <div v-if="passwordForm.newPassword" class="password-strength mb-4">
                <v-progress-linear
                  :model-value="(passwordStrength.strength / 4) * 100"
                  :color="passwordStrength.color"
                  height="4"
                  rounded
                  class="flex-grow-1"
                />
                <span class="strength-label" :style="{ color: passwordStrength.color }">
                  {{ passwordStrength.label }}
                </span>
              </div>

              <!-- 确认新密码 — ProfilePasswordTab.tsx 行150-177 -->
              <v-text-field
                v-model="passwordForm.confirmPassword"
                :type="showPassword.confirm ? 'text' : 'password'"
                :label="t('profile.confirmNewPassword')"
                :placeholder="t('profile.confirmNewPasswordPlaceholder')"
                required
                variant="outlined"
                class="mb-4"
                :append-inner-icon="showPassword.confirm ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPassword.confirm = !showPassword.confirm"
              />

              <v-btn type="submit" color="primary" block :loading="loading" size="large">
                <v-icon start>mdi-check-circle</v-icon>
                {{ user?.hasPassword === false ? t('profile.setPassword') : t('profile.changePassword') }}
              </v-btn>

              <!-- 安全建议 — ProfilePasswordTab.tsx 行195-206 -->
              <v-card variant="outlined" class="mt-6 pa-4">
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="16" icon="mdi-shield-outline" />
                  <span class="text-body-2 font-weight-bold">{{ t('profile.securityTips') }}</span>
                </div>
                <ul class="security-tips">
                  <li>{{ t('profile.tip1') }}</li>
                  <li>{{ t('profile.tip2') }}</li>
                  <li>{{ t('profile.tip3') }}</li>
                  <li>{{ t('profile.tip4') }}</li>
                </ul>
              </v-card>
            </v-form>
          </div>

          <!-- ========== Email Tab ========== -->
          <!-- 来源：ProfileEmailTab.tsx -->
          <div v-if="activeTab === 'email' && mailEnabled">
            <!-- 已绑定且不在编辑模式 — ProfileEmailTab.tsx 行53-88 -->
            <div v-if="user?.email && !isEditingEmail" class="text-center pa-4">
              <v-icon size="64" color="success" icon="mdi-check-circle" class="mb-4" />
              <h3 class="text-h6 font-weight-bold mb-2">{{ t('profile.emailBound') }}</h3>
              <p class="text-body-1 text-primary font-weight-medium mb-4">{{ user.email }}</p>
              <v-card variant="outlined" rounded="lg" class="pa-4 mb-6 mx-auto" max-width="240">
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.resetPassword') }}</span>
                </div>
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.securityVerification') }}</span>
                </div>
                <div class="d-flex align-center ga-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.importantNotifications') }}</span>
                </div>
              </v-card>
              <v-btn color="primary" @click="startEditEmail">
                <v-icon start>mdi-email-outline</v-icon>
                {{ t('profile.changeEmail') }}
              </v-btn>
            </div>

            <!-- 换绑流程：验证原邮箱 — ProfileEmailTab.tsx 行94-167 -->
            <div v-else-if="isRebindEmail && emailStep === 'verifyOld'">
              <v-form @submit.prevent="handleVerifyOldEmail">
                <v-alert type="warning" variant="tonal" class="mb-4">
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16" icon="mdi-check-circle" />
                    <span>{{ t('profile.verifyOldEmailTip') }}</span>
                  </div>
                </v-alert>
                <v-text-field
                  v-model="emailForm.code"
                  :label="t('profile.oldEmailCode')"
                  :placeholder="t('profile.enterOldEmailCode')"
                  :maxlength="6"
                  required
                  variant="outlined"
                  class="mb-4"
                >
                  <template #append-inner>
                    <v-btn
                      size="small"
                      variant="outlined"
                      :disabled="countdown > 0 || sendingCode"
                      :loading="sendingCode"
                      @click="handleSendUnbindEmailCode"
                    >
                      {{ countdown > 0 ? `${countdown}s` : t('profile.getCode') }}
                    </v-btn>
                  </template>
                </v-text-field>
                <div class="d-flex ga-3">
                  <v-btn variant="outlined" class="flex-grow-1" @click="cancelEditEmail">{{ t('common.cancel') }}</v-btn>
                  <v-btn color="primary" class="flex-grow-1" :loading="loading" type="submit">
                    <v-icon start>mdi-check-circle</v-icon>
                    {{ t('profile.verify') }}
                  </v-btn>
                </div>
              </v-form>
            </div>

            <!-- 换绑流程：输入新邮箱 / 验证新邮箱 — ProfileEmailTab.tsx 行170-295 -->
            <div v-else-if="isRebindEmail && (emailStep === 'inputNew' || emailStep === 'verifyNew')">
              <v-form @submit.prevent="handleRebindEmail">
                <v-alert v-if="emailStep === 'inputNew'" type="success" variant="tonal" class="mb-4">
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16" icon="mdi-check-circle" />
                    <span>{{ t('profile.oldEmailVerified') }}</span>
                  </div>
                </v-alert>
                <v-text-field
                  v-model="emailForm.email"
                  :label="emailStep === 'verifyNew' ? t('profile.newEmail') : t('profile.email')"
                  :placeholder="t('profile.enterEmail')"
                  type="email"
                  required
                  variant="outlined"
                  class="mb-4"
                >
                  <template #append-inner>
                    <v-btn
                      size="small"
                      variant="outlined"
                      :disabled="countdown > 0 || sendingCode"
                      :loading="sendingCode"
                      @click="handleSendNewEmailCode"
                    >
                      {{ countdown > 0 ? `${countdown}s` : t('profile.getCode') }}
                    </v-btn>
                  </template>
                </v-text-field>
                <v-text-field
                  v-if="emailStep === 'verifyNew'"
                  v-model="emailForm.code"
                  :label="t('profile.verificationCode')"
                  :placeholder="t('profile.enter6DigitCode')"
                  :maxlength="6"
                  required
                  variant="outlined"
                  class="mb-4"
                />
                <div class="d-flex ga-3">
                  <v-btn variant="outlined" class="flex-grow-1" @click="cancelEditEmail">{{ t('common.cancel') }}</v-btn>
                  <v-btn
                    v-if="emailStep === 'inputNew'"
                    color="primary"
                    class="flex-grow-1"
                    :disabled="!emailForm.email || sendingCode"
                    :loading="sendingCode"
                    @click="handleSendNewEmailCode"
                  >
                    <v-icon start>mdi-email-outline</v-icon>
                    {{ t('profile.sendCode') }}
                  </v-btn>
                  <v-btn
                    v-if="emailStep === 'verifyNew'"
                    color="primary"
                    class="flex-grow-1"
                    :loading="loading"
                    type="submit"
                  >
                    <v-icon start>mdi-check-circle</v-icon>
                    {{ t('profile.confirmChange') }}
                  </v-btn>
                </div>
              </v-form>
            </div>

            <!-- 首次绑定流程 — ProfileEmailTab.tsx 行298-407 -->
            <div v-else>
              <!-- 步骤1：输入邮箱 — ProfileEmailTab.tsx 行303-344 -->
              <div v-if="emailStep === 'input'">
                <v-form @submit.prevent="handleSendBindCode">
                  <v-card variant="outlined" rounded="lg" class="pa-3 mb-4 text-center">
                    <span class="text-body-2 text-medium-emphasis">{{ t('profile.bindEmailTip') }}</span>
                  </v-card>
                  <v-text-field
                    v-model="emailForm.email"
                    :label="t('profile.email')"
                    :placeholder="t('profile.enterEmail')"
                    type="email"
                    required
                    variant="outlined"
                    class="mb-4"
                  />
                  <v-btn color="primary" block :loading="loading" type="submit">
                    <v-icon start>mdi-email-outline</v-icon>
                    {{ t('profile.sendCode') }}
                  </v-btn>
                </v-form>
              </div>

              <!-- 步骤2：输入验证码 — ProfileEmailTab.tsx 行346-405 -->
              <div v-else>
                <v-form @submit.prevent="handleVerifyBindEmail">
                  <v-card variant="outlined" rounded="lg" class="pa-3 mb-4 text-center">
                    <div class="d-flex align-center justify-center ga-2">
                      <v-icon icon="mdi-email-outline" />
                      <span class="font-weight-medium">{{ emailForm.email }}</span>
                    </div>
                  </v-card>
                  <v-text-field
                    v-model="emailForm.code"
                    :label="t('profile.verificationCode')"
                    :placeholder="t('profile.enter6DigitCode')"
                    :maxlength="6"
                    required
                    variant="outlined"
                    class="mb-4"
                  />
                  <div class="d-flex ga-3">
                    <v-btn variant="outlined" class="flex-grow-1" @click="emailStep = 'input'; emailForm.email = ''; emailForm.code = ''">
                      {{ t('profile.backAndEdit') }}
                    </v-btn>
                    <v-btn color="primary" class="flex-grow-1" :loading="loading" type="submit">
                      <v-icon start>mdi-check-circle</v-icon>
                      {{ t('profile.confirmBind') }}
                    </v-btn>
                  </div>
                </v-form>
              </div>
            </div>
          </div>

          <!-- ========== Phone Tab ========== -->
          <!-- 来源：ProfilePhoneTab.tsx -->
          <div v-if="activeTab === 'phone' && smsEnabled">
            <!-- 已绑定且不在编辑模式 — ProfilePhoneTab.tsx 行49-83 -->
            <div v-if="user?.phone && !isEditingPhone" class="text-center pa-4">
              <v-icon size="64" color="success" icon="mdi-check-circle" class="mb-4" />
              <h3 class="text-h6 font-weight-bold mb-2">{{ t('profile.phoneBound') }}</h3>
              <p class="text-body-1 text-primary font-weight-medium mb-4">{{ user.phone }}</p>
              <v-card variant="outlined" rounded="lg" class="pa-4 mb-6 mx-auto" max-width="240">
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.quickLogin') }}</span>
                </div>
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.securityVerification') }}</span>
                </div>
                <div class="d-flex align-center ga-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.resetPassword') }}</span>
                </div>
              </v-card>
              <v-btn color="primary" @click="startEditPhone">
                <v-icon start>mdi-phone-outline</v-icon>
                {{ t('profile.changePhone') }}
              </v-btn>
            </div>

            <!-- 换绑流程：验证原手机号 — ProfilePhoneTab.tsx 行90-163 -->
            <div v-else-if="isRebindPhone && phoneStep === 'verifyOld'">
              <v-form @submit.prevent="handleVerifyOldPhone">
                <v-alert type="warning" variant="tonal" class="mb-4">
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16" icon="mdi-alert-circle" />
                    <span>{{ t('profile.verifyOldPhoneTip') }}</span>
                  </div>
                </v-alert>
                <v-text-field
                  v-model="phoneForm.code"
                  :label="t('profile.verificationCode')"
                  :placeholder="t('profile.enter6DigitCode')"
                  :maxlength="6"
                  required
                  variant="outlined"
                  class="mb-4"
                >
                  <template #append-inner>
                    <v-btn
                      size="small"
                      variant="outlined"
                      :disabled="countdown > 0 || sendingCode"
                      :loading="sendingCode"
                      @click="handleSendUnbindPhoneCode"
                    >
                      {{ countdown > 0 ? `${countdown}s` : t('profile.getCode') }}
                    </v-btn>
                  </template>
                </v-text-field>
                <div class="d-flex ga-3">
                  <v-btn variant="outlined" class="flex-grow-1" @click="cancelEditPhone">{{ t('common.cancel') }}</v-btn>
                  <v-btn color="primary" class="flex-grow-1" :loading="loading" type="submit">
                    <v-icon start>mdi-check-circle</v-icon>
                    {{ t('profile.confirmVerify') }}
                  </v-btn>
                </div>
              </v-form>
            </div>

            <!-- 输入新手机号 / 验证新手机号 — ProfilePhoneTab.tsx 行164-285 -->
            <div v-else>
              <v-form
                @submit.prevent="phoneStep === 'verifyNew' ? (isRebindPhone ? handleRebindPhone() : handleBindPhone()) : undefined"
              >
                <!-- 首次绑定提示 — ProfilePhoneTab.tsx 行175-179 -->
                <v-card v-if="!isRebindPhone" variant="outlined" rounded="lg" class="pa-3 mb-4 text-center">
                  <span class="text-body-2 text-medium-emphasis">{{ t('profile.bindPhoneTip') }}</span>
                </v-card>

                <!-- 换绑提示 — ProfilePhoneTab.tsx 行181-186 -->
                <v-alert v-if="isRebindPhone && phoneStep === 'inputNew'" type="success" variant="tonal" class="mb-4">
                  <div class="d-flex align-center ga-2">
                    <v-icon size="16" icon="mdi-check-circle" />
                    <span>{{ t('profile.oldPhoneVerified') }}</span>
                  </div>
                </v-alert>

                <v-text-field
                  v-model="phoneForm.phone"
                  :label="isRebindPhone && phoneStep === 'verifyNew' ? t('profile.newPhone') : t('profile.phone')"
                  :placeholder="t('profile.enterPhone')"
                  :maxlength="11"
                  required
                  variant="outlined"
                  class="mb-4"
                  @update:model-value="onPhoneInput"
                >
                  <template #append-inner>
                    <v-btn
                      size="small"
                      variant="outlined"
                      :disabled="countdown > 0 || sendingCode"
                      :loading="sendingCode"
                      @click="isRebindPhone ? handleSendNewPhoneCode() : handleSendPhoneCode()"
                    >
                      {{ countdown > 0 ? `${countdown}s` : t('profile.getCode') }}
                    </v-btn>
                  </template>
                </v-text-field>

                <v-text-field
                  v-if="phoneStep === 'verifyNew'"
                  v-model="phoneForm.code"
                  :label="t('profile.verificationCode')"
                  :placeholder="t('profile.enter6DigitCode')"
                  :maxlength="6"
                  required
                  variant="outlined"
                  class="mb-4"
                  @update:model-value="onCodeInput"
                />

                <div class="d-flex ga-3">
                  <v-btn variant="outlined" class="flex-grow-1" @click="isRebindPhone ? cancelEditPhone() : undefined">
                    {{ isRebindPhone ? t('common.cancel') : t('profile.back') }}
                  </v-btn>
                  <v-btn
                    v-if="phoneStep === 'verifyNew'"
                    color="primary"
                    class="flex-grow-1"
                    :loading="loading"
                    type="submit"
                  >
                    <v-icon start>mdi-check-circle</v-icon>
                    {{ isRebindPhone ? t('profile.confirmChange') : t('profile.confirmBind') }}
                  </v-btn>
                </div>
              </v-form>
            </div>
          </div>

          <!-- ========== WeChat Tab ========== -->
          <!-- 来源：ProfileWechatTab.tsx -->
          <div v-if="activeTab === 'wechat' && wechatEnabled">
            <!-- 已绑定 — ProfileWechatTab.tsx 行17-52 -->
            <div v-if="user?.wechatId" class="text-center pa-4">
              <v-icon size="64" color="success" icon="mdi-check-circle" class="mb-4" />
              <h3 class="text-h6 font-weight-bold mb-2">{{ t('profile.wechatBound') }}</h3>
              <p class="text-body-2 text-medium-emphasis mb-4">{{ t('profile.wechatLoginTip') }}</p>
              <v-card variant="outlined" rounded="lg" class="pa-4 mb-6 mx-auto" max-width="240">
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.wechatQuickLogin') }}</span>
                </div>
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.noPasswordNeeded') }}</span>
                </div>
                <div class="d-flex align-center ga-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.enhancedSecurity') }}</span>
                </div>
              </v-card>
              <v-btn variant="outlined" color="error" :loading="loading" @click="handleUnbindWechat">
                {{ t('profile.unbindWechat') }}
              </v-btn>
            </div>

            <!-- 未绑定 — ProfileWechatTab.tsx 行55-91 -->
            <div v-else class="text-center pa-4">
              <v-icon size="64" color="grey" icon="mdi-wechat" class="mb-4" />
              <h3 class="text-h6 font-weight-bold mb-2">{{ t('profile.bindWechat') }}</h3>
              <p class="text-body-2 text-medium-emphasis mb-4">{{ t('profile.bindWechatTip') }}</p>
              <v-card variant="outlined" rounded="lg" class="pa-4 mb-6 mx-auto" max-width="240">
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.scanQuickLogin') }}</span>
                </div>
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.safeAndConvenient') }}</span>
                </div>
                <div class="d-flex align-center ga-2">
                  <v-icon size="14" color="success" icon="mdi-check-circle" />
                  <span class="text-body-2">{{ t('profile.realTimeNotifications') }}</span>
                </div>
              </v-card>
              <v-btn color="#07c160" :loading="loading" @click="handleBindWechat">
                <v-icon start>mdi-wechat</v-icon>
                {{ t('profile.bindWechat') }}
              </v-btn>
            </div>
          </div>

          <!-- ========== Deactivate Tab ========== -->
          <!-- 来源：ProfileDeactivateTab.tsx -->
          <div v-if="activeTab === 'deactivate'">
            <div class="text-center pa-4 deactivate-content">
              <v-icon size="64" color="error" icon="mdi-alert-outline" class="mb-4" />
              <h3 class="text-h5 font-weight-bold mb-2">{{ t('profile.deactivateAccount') }}</h3>
              <p class="text-body-2 text-medium-emphasis mb-4">
                {{ t('profile.deactivateWarning') }}
              </p>

              <v-card variant="outlined" rounded="lg" class="pa-4 mb-6 text-left">
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="error" icon="mdi-alert-outline" />
                  <span class="text-body-2">{{ t('profile.warning1') }}</span>
                </div>
                <div class="d-flex align-center ga-2 mb-2">
                  <v-icon size="14" color="error" icon="mdi-alert-outline" />
                  <span class="text-body-2">{{ t('profile.warning2') }}</span>
                </div>
                <div class="d-flex align-center ga-2">
                  <v-icon size="14" color="error" icon="mdi-alert-outline" />
                  <span class="text-body-2">{{ t('profile.warning3') }}</span>
                </div>
              </v-card>

              <!-- 验证方式选择 — ProfileDeactivateTab.tsx 行144-161 -->
              <v-select
                v-model="deactivateForm.verificationMethod"
                :items="deactivateVerificationOptions"
                item-title="title"
                item-value="value"
                :label="t('profile.selectVerification')"
                variant="outlined"
                class="mb-4"
              />

              <!-- 密码验证 — ProfileDeactivateTab.tsx 行164-191 -->
              <v-text-field
                v-if="deactivateForm.verificationMethod === 'password'"
                v-model="deactivateForm.password"
                :type="showPassword.confirm ? 'text' : 'password'"
                :label="t('profile.passwordVerification')"
                :placeholder="t('profile.enterPassword')"
                variant="outlined"
                class="mb-4"
                :append-inner-icon="showPassword.confirm ? 'mdi-eye-off' : 'mdi-eye'"
                @click:append-inner="showPassword.confirm = !showPassword.confirm"
              />

              <!-- 手机验证码 — ProfileDeactivateTab.tsx 行193-219 -->
              <v-text-field
                v-if="deactivateForm.verificationMethod === 'phone'"
                v-model="deactivateForm.phoneCode"
                :label="t('profile.phoneVerificationCode')"
                :placeholder="t('profile.enterPhoneCode')"
                variant="outlined"
                class="mb-4"
              >
                <template #append-inner>
                  <v-btn
                    size="small"
                    variant="outlined"
                    :disabled="deactivateCountdown > 0"
                    @click="handleSendDeactivatePhoneCode"
                  >
                    {{ deactivateCountdown > 0 ? `${deactivateCountdown}s` : t('profile.getCode') }}
                  </v-btn>
                </template>
              </v-text-field>

              <!-- 邮箱验证码 — ProfileDeactivateTab.tsx 行221-247 -->
              <v-text-field
                v-if="deactivateForm.verificationMethod === 'email'"
                v-model="deactivateForm.emailCode"
                :label="t('profile.emailVerificationCode')"
                :placeholder="t('profile.enterEmailCode')"
                variant="outlined"
                class="mb-4"
              >
                <template #append-inner>
                  <v-btn
                    size="small"
                    variant="outlined"
                    :disabled="deactivateCountdown > 0"
                    @click="handleSendDeactivateEmailCode"
                  >
                    {{ deactivateCountdown > 0 ? `${deactivateCountdown}s` : t('profile.getCode') }}
                  </v-btn>
                </template>
              </v-text-field>

              <!-- 微信验证 — ProfileDeactivateTab.tsx 行249-260 -->
              <div v-if="deactivateForm.verificationMethod === 'wechat'" class="mb-4">
                <v-alert v-if="deactivateForm.wechatConfirm === 'confirmed'" type="success" variant="tonal">
                  <div class="d-flex align-center ga-2">
                    <v-icon icon="mdi-check-circle" />
                    <span>{{ t('profile.wechatVerified') }}</span>
                  </div>
                </v-alert>
                <v-btn v-else color="#07c160" block @click="handleWechatDeactivateConfirm">
                  <v-icon start>mdi-wechat</v-icon>
                  {{ t('profile.wechatScanVerify') }}
                </v-btn>
              </div>

              <!-- 确认复选框 — ProfileDeactivateTab.tsx 行262-284 -->
              <v-checkbox
                v-model="deactivateForm.confirmed"
                :label="t('profile.confirmDeactivate')"
                color="error"
                hide-details
                class="mb-2"
              />
              <v-checkbox
                v-model="deactivateForm.immediate"
                :label="t('profile.immediateDeactivate')"
                color="error"
                hide-details
                class="mb-4"
              />

              <v-btn
                color="error"
                variant="outlined"
                block
                :loading="deactivateLoading"
                :disabled="!canDeactivate"
                @click="handleDeactivateConfirm"
              >
                <v-icon start>mdi-alert-outline</v-icon>
                {{ t('profile.confirmDeactivateBtn') }}
              </v-btn>
            </div>
          </div>
        </div>
      </v-card>
    </div>

    <!-- 解绑微信确认对话框 — Profile.tsx 行756-763 -->
    <v-dialog v-model="unbindWechatDialog" max-width="400">
      <v-card>
        <v-card-title>{{ t('profile.unbindWechatTitle') }}</v-card-title>
        <v-card-text>{{ t('profile.unbindWechatConfirm') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="unbindWechatDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="text" @click="confirmUnbindWechat">{{ t('profile.confirmUnbind') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- 注销确认对话框 — ProfileDeactivateTab.tsx 行106-117 -->
    <v-dialog v-model="deactivateDialog" max-width="400">
      <v-card>
        <v-card-title>{{ t('profile.confirmDeactivateTitle') }}</v-card-title>
        <v-card-text>{{ t('profile.confirmDeactivateText') }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deactivateDialog = false">{{ t('common.cancel') }}</v-btn>
          <v-btn color="error" variant="text" @click="handleDeactivate">{{ t('profile.confirmDeactivateBtn') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
/**
 * ProfilePage.vue — 个人资料页面
 *
 * 来源：apps/frontend/src/pages/Profile.tsx + 所有 Profile*Tab.tsx 子组件
 * 所有业务逻辑照搬 React 版，组件组织重构为单文件内联
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { useRuntimeConfig } from '@/composables/useRuntimeConfig';
import { useTheme } from '@/composables/useTheme';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useI18n } from '@/composables/useI18n';
import { useUIStore } from '@/stores/ui.store';
import { authApi } from '@/services/authApi';
import { usersApi } from '@/services/usersApi';
import { SystemPermission } from '@/constants/permissions';

const { t } = useI18n();

useDocumentTitle(() => t('profile.title'));
const router = useRouter();
const { user, login, logout, refreshUser } = useAuth();
const { config: runtimeConfig } = useRuntimeConfig();
const { isDark } = useTheme();
const uiStore = useUIStore();

// 来源：Profile.tsx 行57-59
const mailEnabled = computed(() => runtimeConfig.value.mailEnabled);
const smsEnabled = computed(() => runtimeConfig.value.smsEnabled ?? false);
const wechatEnabled = computed(() => runtimeConfig.value.wechatEnabled ?? false);

// 来源：Profile.tsx 行61
const activeTab = ref<'info' | 'password' | 'email' | 'deactivate' | 'phone' | 'wechat'>('info');

// 来源：usePermission hook — isAdmin() 检查 SYSTEM_ADMIN 权限
const isAdminUser = computed(() => {
  const perms = user.value?.role?.permissions?.map((p) => p.permission) ?? [];
  return perms.includes(SystemPermission.SYSTEM_ADMIN);
});

// ==================== 状态管理 ====================

// 来源：Profile.tsx 行94-103
const passwordForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });
const showPassword = ref({ old: false, new: false, confirm: false });

// 来源：Profile.tsx 行140-146
const emailForm = ref({ email: '', code: '' });
const emailStep = ref<'input' | 'verify' | 'verifyOld' | 'inputNew' | 'verifyNew'>('input');
const isEditingEmail = ref(false);
const emailVerifyToken = ref('');

// 来源：Profile.tsx 行147-155
const phoneForm = ref({ phone: '', code: '' });
const phoneStep = ref<'verifyOld' | 'inputNew' | 'verifyNew'>('verifyOld');
const isEditingPhone = ref(false);
const verifyToken = ref('');

// 来源：Profile.tsx 行153-154
const countdown = ref(0);
const sendingCode = ref(false);
let countdownTimer: ReturnType<typeof setInterval> | null = null;

// 来源：Profile.tsx 行105-123
const deactivateForm = ref({
  verificationMethod: '' as 'password' | 'phone' | 'email' | 'wechat' | '',
  password: '',
  phoneCode: '',
  emailCode: '',
  wechatConfirm: '',
  confirmed: false,
  immediate: false,
});
const deactivateLoading = ref(false);
const deactivateCountdown = ref(0);

// 来源：Profile.tsx 行157-160
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref<string | null>(null);

// Info tab editing state — ProfileInfoTab.tsx 行39-46
const isEditingInfo = ref(false);
const infoForm = ref({ username: '', nickname: '' });
const infoLoading = ref(false);

// Dialog states
const unbindWechatDialog = ref(false);
const deactivateDialog = ref(false);

// ==================== 计算属性 ====================

// 来源：ProfileInfoTab.tsx isRebind
const isRebindEmail = computed(() => !!user.value?.email);
const isRebindPhone = computed(() => !!user.value?.phone);

// 来源：Profile.tsx 行189-211 getPasswordStrength
const passwordStrength = computed(() => {
  const password = passwordForm.value.newPassword;
  if (!password) return { strength: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  const levels = [
    { label: t('profile.strengthWeak'), color: '#ef4444' },
    { label: t('profile.strengthFair'), color: '#f97316' },
    { label: t('profile.strengthMedium'), color: '#eab308' },
    { label: t('profile.strengthStrong'), color: '#22c55e' },
    { label: t('profile.strengthVeryStrong'), color: '#10b981' },
  ];
  return {
    strength: score,
    label: levels[score]?.label || levels[0]!.label,
    color: levels[score]?.color || levels[0]!.color,
  };
});

// 来源：ProfileInfoTab.tsx formatDate
const statusColor = computed(() => {
  const s = user.value?.status?.toLowerCase();
  if (s === 'active') return 'success';
  if (s === 'inactive') return 'warning';
  return 'error';
});

const statusLabel = computed(() => {
  if (user.value?.status === 'ACTIVE') return t('profile.statusActive');
  if (user.value?.status === 'INACTIVE') return t('profile.statusInactive');
  return t('profile.statusDisabled');
});

// 来源：ProfileDeactivateTab.tsx canSubmit 行80-104
const canDeactivate = computed(() => {
  if (!deactivateForm.value.confirmed || !deactivateForm.value.verificationMethod) return false;
  if (deactivateForm.value.verificationMethod === 'password' && !deactivateForm.value.password) return false;
  if (deactivateForm.value.verificationMethod === 'phone' && !deactivateForm.value.phoneCode) return false;
  if (deactivateForm.value.verificationMethod === 'email' && !deactivateForm.value.emailCode) return false;
  if (deactivateForm.value.verificationMethod === 'wechat' && !deactivateForm.value.wechatConfirm) return false;
  return true;
});

// 来源：ProfileDeactivateTab.tsx 行147-161
const deactivateVerificationOptions = computed(() => {
  const opts: { title: string; value: string }[] = [{ title: t('profile.pleaseSelectVerification'), value: '' }];
  if (user.value?.hasPassword) opts.push({ title: t('profile.passwordVerification'), value: 'password' });
  if (user.value?.phone && user.value.phoneVerified) opts.push({ title: t('profile.phoneVerificationCode'), value: 'phone' });
  if (user.value?.email) opts.push({ title: t('profile.emailVerificationCode'), value: 'email' });
  if (user.value?.wechatId) opts.push({ title: t('profile.wechatScanVerify'), value: 'wechat' });
  return opts;
});

// ==================== 工具函数 ====================

// 来源：ProfileInfoTab.tsx formatDate 行48-62
function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

// 提取错误信息 — 复用自 Profile.tsx 多处 catch 块
function extractError(err: unknown, fallback: string): string {
  const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
  return axiosErr?.response?.data?.message || axiosErr?.message || fallback;
}

// 来源：Profile.tsx 行749-753
function switchTab(tab: typeof activeTab.value): void {
  activeTab.value = tab;
  error.value = null;
  success.value = null;
}

// ==================== 倒计时 ====================

// 来源：Profile.tsx 行219-251
function startCountdown(): void {
  countdown.value = 60;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
}

// ==================== Info Tab 处理函数 ====================

// 来源：ProfileInfoTab.tsx 行71-95
async function handleUpdateProfile(): Promise<void> {
  infoLoading.value = true;
  error.value = null;
  success.value = null;
  try {
    await usersApi.updateProfile({
      username: infoForm.value.username,
      nickname: infoForm.value.nickname,
    });
    success.value = t('profile.profileUpdateSuccess');
    await refreshUser();
    isEditingInfo.value = false;
  } catch (err) {
    error.value = extractError(err, t('profile.updateFailed'));
  } finally {
    infoLoading.value = false;
  }
}

function startEditInfo(): void {
  infoForm.value = {
    username: user.value?.username || '',
    nickname: user.value?.nickname || '',
  };
  isEditingInfo.value = true;
}

function cancelEditInfo(): void {
  isEditingInfo.value = false;
  infoForm.value = {
    username: user.value?.username || '',
    nickname: user.value?.nickname || '',
  };
  error.value = null;
  success.value = null;
}

// ==================== Password Tab 处理函数 ====================

// 来源：Profile.tsx 行273-342
async function handlePasswordSubmit(): Promise<void> {
  loading.value = true;
  error.value = null;
  success.value = null;

  // 来源：Profile.tsx 行278-280
  if (passwordForm.value.newPassword !== passwordForm.value.confirmPassword) {
    error.value = t('profile.passwordsNotMatch');
    loading.value = false;
    return;
  }
  // 来源：Profile.tsx 行282-284
  if (passwordForm.value.newPassword.length < 6) {
    error.value = t('profile.passwordTooShort');
    loading.value = false;
    return;
  }
  // 来源：Profile.tsx 行286-289
  if (user.value?.hasPassword !== false && !passwordForm.value.oldPassword) {
    error.value = t('profile.enterCurrentPassword');
    loading.value = false;
    return;
  }

  try {
    await usersApi.changePassword({
      oldPassword: user.value?.hasPassword === false ? undefined : passwordForm.value.oldPassword,
      newPassword: passwordForm.value.newPassword,
    });

    const action = user.value?.hasPassword === false ? t('profile.set') : t('profile.change');
    const successMsg = user.value?.hasPassword === false ? t('profile.passwordSetSuccess') : t('profile.passwordChangeSuccess');
    const redirectMsg = user.value?.hasPassword === false ? t('profile.passwordSetRedirectMsg') : t('profile.passwordChangeRedirectMsg');

    // 来源：Profile.tsx 行300-331 — 使用新密码自动登录
    if (user.value?.username) {
      try {
        await login(user.value.username, passwordForm.value.newPassword);
        success.value = successMsg;
      } catch (loginErr) {
        console.error('Auto login error:', loginErr);
        // 自动登录失败时，强制退出登录 — Profile.tsx 行308-316
        try { await logout(); } catch (logoutErr) { console.error('Logout error:', logoutErr); }
        router.push({
          path: '/login',
          state: { message: redirectMsg },
        });
      }
    } else {
      // 没有用户名，强制退出登录 — Profile.tsx 行320-331
      try { await logout(); } catch (logoutErr) { console.error('Logout error:', logoutErr); }
      router.push({
        path: '/login',
        state: { message: redirectMsg },
      });
    }
  } catch (err) {
    error.value = extractError(err, t('profile.passwordChangeFailed'));
  } finally {
    loading.value = false;
  }
}

// ==================== Email Tab 处理函数 ====================

// 来源：Profile.tsx 行344-367
async function handleSendBindCode(): Promise<void> {
  loading.value = true;
  error.value = null;
  if (!emailForm.value.email) {
    error.value = t('profile.enterEmail');
    loading.value = false;
    return;
  }
  try {
    await authApi.sendBindEmailCode(emailForm.value.email);
    emailStep.value = 'verify';
    success.value = t('profile.codeSentToEmail');
  } catch (err) {
    error.value = extractError(err, t('profile.sendCodeFailed'));
  } finally {
    loading.value = false;
  }
}

// 来源：Profile.tsx 行369-389
async function handleVerifyBindEmail(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    await authApi.verifyBindEmail(emailForm.value.email, emailForm.value.code);
    success.value = t('profile.emailBindSuccess');
    emailStep.value = 'input';
    emailForm.value = { email: '', code: '' };
    await refreshUser();
  } catch (err) {
    error.value = extractError(err, t('profile.verifyFailed'));
  } finally {
    loading.value = false;
  }
}

// 来源：Profile.tsx 行392-413
async function handleSendUnbindEmailCode(): Promise<void> {
  sendingCode.value = true;
  error.value = null;
  try {
    const response = await authApi.sendUnbindEmailCode();
    if (response.data?.success) {
      success.value = t('profile.codeSentToOldEmail');
      startCountdown();
    } else {
      error.value = response.data?.message || t('profile.sendCodeFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.sendCodeFailed'));
  } finally {
    sendingCode.value = false;
  }
}

// 来源：Profile.tsx 行415-444
async function handleVerifyOldEmail(): Promise<void> {
  loading.value = true;
  error.value = null;
  // 来源：Profile.tsx 行419
  if (!emailForm.value.code || !/^\d{6}$/.test(emailForm.value.code)) {
    error.value = t('profile.enter6DigitCode');
    loading.value = false;
    return;
  }
  try {
    const response = await authApi.verifyUnbindEmailCode(emailForm.value.code);
    if (response.data?.success) {
      success.value = t('profile.oldEmailVerified');
      emailVerifyToken.value = response.data.token;
      emailStep.value = 'inputNew';
      emailForm.value = { email: '', code: '' };
    } else {
      error.value = response.data?.message || t('profile.verifyFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.verifyFailed'));
  } finally {
    loading.value = false;
  }
}

// 来源：Profile.tsx 行446-463
function startEditEmail(): void {
  isEditingEmail.value = true;
  emailStep.value = 'verifyOld';
  emailForm.value = { email: '', code: '' };
  error.value = null;
  success.value = null;
}

function cancelEditEmail(): void {
  isEditingEmail.value = false;
  emailStep.value = 'input';
  emailForm.value = { email: '', code: '' };
  emailVerifyToken.value = '';
  error.value = null;
  success.value = null;
}

// 来源：Profile.tsx 行465-490
async function handleSendNewEmailCode(): Promise<void> {
  if (!emailForm.value.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.value.email)) {
    error.value = t('profile.enterValidEmail');
    return;
  }
  sendingCode.value = true;
  error.value = null;
  try {
    await authApi.sendBindEmailCode(emailForm.value.email, true);
    success.value = t('profile.codeSent');
    startCountdown();
    emailStep.value = 'verifyNew';
  } catch (err) {
    error.value = extractError(err, t('profile.sendCodeFailed'));
  } finally {
    sendingCode.value = false;
  }
}

// 来源：Profile.tsx 行492-540
async function handleRebindEmail(): Promise<void> {
  loading.value = true;
  error.value = null;
  if (!emailForm.value.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailForm.value.email)) {
    error.value = t('profile.enterValidEmail');
    loading.value = false;
    return;
  }
  if (!emailForm.value.code || !/^\d{6}$/.test(emailForm.value.code)) {
    error.value = t('profile.enter6DigitCode');
    loading.value = false;
    return;
  }
  if (!emailVerifyToken.value) {
    error.value = t('profile.verifyOldEmailFirst');
    loading.value = false;
    return;
  }
  try {
    const response = await authApi.rebindEmail(emailForm.value.email, emailForm.value.code, emailVerifyToken.value);
    if (response.data?.success) {
      success.value = t('profile.emailRebindSuccess');
      emailStep.value = 'input';
      emailForm.value = { email: '', code: '' };
      emailVerifyToken.value = '';
      isEditingEmail.value = false;
      await refreshUser();
    } else {
      error.value = response.data?.message || t('profile.rebindFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.rebindFailed'));
  } finally {
    loading.value = false;
  }
}

// ==================== Phone Tab 处理函数 ====================

// 来源：Profile.tsx 行542-552 — 输入限制只允许数字
function onPhoneInput(val: string): void {
  if (val && !/^\d*$/.test(val)) return;
  phoneForm.value.phone = val;
  error.value = null;
  success.value = null;
}

function onCodeInput(val: string): void {
  if (val && !/^\d*$/.test(val)) return;
  phoneForm.value.code = val;
  error.value = null;
  success.value = null;
}

// 来源：Profile.tsx 行554-580
async function handleSendPhoneCode(): Promise<void> {
  if (!phoneForm.value.phone || !/^1[3-9]\d{9}$/.test(phoneForm.value.phone)) {
    error.value = t('profile.enterValidPhone');
    return;
  }
  sendingCode.value = true;
  error.value = null;
  try {
    const response = await authApi.sendSmsCode(phoneForm.value.phone);
    if (response.data?.success) {
      success.value = t('profile.codeSent');
      startCountdown();
      phoneStep.value = 'verifyNew';
    } else {
      error.value = response.data?.message || t('profile.sendCodeFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.sendCodeFailed'));
  } finally {
    sendingCode.value = false;
  }
}

// 来源：Profile.tsx 行582-603
async function handleSendUnbindPhoneCode(): Promise<void> {
  sendingCode.value = true;
  error.value = null;
  try {
    const response = await authApi.sendUnbindPhoneCode();
    if (response.data?.success) {
      success.value = t('profile.codeSentToOldPhone');
      startCountdown();
    } else {
      error.value = response.data?.message || t('profile.sendCodeFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.sendCodeFailed'));
  } finally {
    sendingCode.value = false;
  }
}

// 来源：Profile.tsx 行605-635
async function handleVerifyOldPhone(): Promise<void> {
  loading.value = true;
  error.value = null;
  if (!phoneForm.value.code || !/^\d{6}$/.test(phoneForm.value.code)) {
    error.value = t('profile.enter6DigitCode');
    loading.value = false;
    return;
  }
  try {
    const response = await authApi.verifyUnbindPhoneCode(phoneForm.value.code);
    if (response.data?.success) {
      success.value = t('profile.oldPhoneVerified');
      verifyToken.value = response.data.token;
      phoneStep.value = 'inputNew';
      phoneForm.value = { phone: '', code: '' };
      countdown.value = 0;
    } else {
      error.value = response.data?.message || t('profile.verifyFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.verifyFailed'));
  } finally {
    loading.value = false;
  }
}

// 来源：Profile.tsx 行637-663
async function handleSendNewPhoneCode(): Promise<void> {
  if (!phoneForm.value.phone || !/^1[3-9]\d{9}$/.test(phoneForm.value.phone)) {
    error.value = t('profile.enterValidPhone');
    return;
  }
  sendingCode.value = true;
  error.value = null;
  try {
    const response = await authApi.sendSmsCode(phoneForm.value.phone);
    if (response.data?.success) {
      success.value = t('profile.codeSent');
      startCountdown();
      phoneStep.value = 'verifyNew';
    } else {
      error.value = response.data?.message || t('profile.sendCodeFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.sendCodeFailed'));
  } finally {
    sendingCode.value = false;
  }
}

// 来源：Profile.tsx 行665-710
async function handleRebindPhone(): Promise<void> {
  loading.value = true;
  error.value = null;
  if (!phoneForm.value.phone || !/^1[3-9]\d{9}$/.test(phoneForm.value.phone)) {
    error.value = t('profile.enterValidPhone');
    loading.value = false;
    return;
  }
  if (!phoneForm.value.code || !/^\d{6}$/.test(phoneForm.value.code)) {
    error.value = t('profile.enter6DigitCode');
    loading.value = false;
    return;
  }
  if (!verifyToken.value) {
    error.value = t('profile.verifyOldPhoneFirst');
    loading.value = false;
    return;
  }
  try {
    const response = await authApi.rebindPhone(phoneForm.value.phone, phoneForm.value.code, verifyToken.value);
    if (response.data?.success) {
      success.value = t('profile.phoneRebindSuccess');
      phoneStep.value = 'verifyOld';
      phoneForm.value = { phone: '', code: '' };
      verifyToken.value = '';
      isEditingPhone.value = false;
      await refreshUser();
    } else {
      error.value = response.data?.message || t('profile.rebindFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.rebindFailed'));
  } finally {
    loading.value = false;
  }
}

// 来源：Profile.tsx 行712-747
async function handleBindPhone(): Promise<void> {
  loading.value = true;
  error.value = null;
  if (!phoneForm.value.phone || !/^1[3-9]\d{9}$/.test(phoneForm.value.phone)) {
    error.value = t('profile.enterValidPhone');
    loading.value = false;
    return;
  }
  if (!phoneForm.value.code || !/^\d{6}$/.test(phoneForm.value.code)) {
    error.value = t('profile.enter6DigitCode');
    loading.value = false;
    return;
  }
  try {
    const response = await authApi.bindPhone(phoneForm.value.phone, phoneForm.value.code);
    if (response.data?.success) {
      success.value = t('profile.phoneBindSuccess');
      phoneStep.value = 'verifyOld';
      phoneForm.value = { phone: '', code: '' };
      isEditingPhone.value = false;
      await refreshUser();
    } else {
      error.value = response.data?.message || t('profile.bindFailed');
    }
  } catch (err) {
    error.value = extractError(err, t('profile.bindFailed'));
  } finally {
    loading.value = false;
  }
}

function startEditPhone(): void {
  isEditingPhone.value = true;
  phoneStep.value = 'verifyOld';
  phoneForm.value = { phone: '', code: '' };
  error.value = null;
  success.value = null;
}

function cancelEditPhone(): void {
  isEditingPhone.value = false;
  phoneStep.value = 'verifyOld';
  phoneForm.value = { phone: '', code: '' };
  verifyToken.value = '';
  error.value = null;
  success.value = null;
}

// ==================== WeChat Tab 处理函数 ====================

// 来源：Profile.tsx 行162-187 wechatBindOpen
async function handleBindWechat(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const res = await authApi.getWechatAuthUrl({
      origin: window.location.origin,
      isPopup: 'true',
      purpose: 'bind',
    });
    const { authUrl } = res as unknown as { authUrl: string };
    const w = 600, h = 600;
    window.open(
      authUrl,
      'wechat-auth',
      `width=${w},height=${h},left=${(screen.width - w) / 2},top=${(screen.height - h) / 2},scrollbars=yes`,
    );
  } catch (err) {
    error.value = extractError(err, t('profile.getWechatAuthUrlFailed'));
  } finally {
    loading.value = false;
  }
}

// 来源：Profile.tsx 行755-788
function handleUnbindWechat(): void {
  unbindWechatDialog.value = true;
}

async function confirmUnbindWechat(): Promise<void> {
  unbindWechatDialog.value = false;
  try {
    loading.value = true;
    error.value = null;
    const response = await authApi.unbindWechat();
    if (response.data?.success) {
      uiStore.addToast(t('profile.wechatUnbindSuccess'), 'success');
      success.value = t('profile.wechatUnbindSuccess');
      await refreshUser();
    } else {
      error.value = response.data?.message || t('profile.unbindFailed');
      uiStore.addToast(response.data?.message || t('profile.unbindFailed'), 'error');
    }
  } catch (err) {
    const errorMsg = extractError(err, t('profile.unbindFailed'));
    error.value = errorMsg;
    uiStore.addToast(errorMsg, 'error');
  } finally {
    loading.value = false;
  }
}

// ==================== Deactivate Tab 处理函数 ====================

// 来源：Profile.tsx 行106-117 handleDeactivateConfirm
function handleDeactivateConfirm(): void {
  deactivateDialog.value = true;
}

// 来源：Profile.tsx 行790-818
async function handleDeactivate(): Promise<void> {
  deactivateDialog.value = false;
  try {
    deactivateLoading.value = true;
    error.value = null;

    await usersApi.deactivateAccount({
      password: deactivateForm.value.password || undefined,
      phoneCode: deactivateForm.value.phoneCode || undefined,
      emailCode: deactivateForm.value.emailCode || undefined,
      wechatConfirm: deactivateForm.value.wechatConfirm || undefined,
    });

    success.value = t('profile.accountDeactivated');

    setTimeout(() => {
      logout();
    }, 1500);
  } catch (err) {
    error.value = extractError(err, t('profile.deactivateFailed'));
  } finally {
    deactivateLoading.value = false;
  }
}

// 来源：Profile.tsx 行820-845
async function handleSendDeactivatePhoneCode(): Promise<void> {
  try {
    if (!user.value?.phone) {
      error.value = t('profile.phoneNotExist');
      return;
    }
    await authApi.sendSmsCode(user.value.phone);
    deactivateCountdown.value = 60;
    const timer = setInterval(() => {
      deactivateCountdown.value--;
      if (deactivateCountdown.value <= 1) {
        clearInterval(timer);
        deactivateCountdown.value = 0;
      }
    }, 1000);
  } catch (err) {
    error.value = extractError(err, t('profile.sendCodeFailed'));
  }
}

// 来源：Profile.tsx 行847-872
async function handleSendDeactivateEmailCode(): Promise<void> {
  try {
    if (!user.value?.email) {
      error.value = t('profile.emailNotExist');
      return;
    }
    await authApi.resendVerification(user.value.email);
    deactivateCountdown.value = 60;
    const timer = setInterval(() => {
      deactivateCountdown.value--;
      if (deactivateCountdown.value <= 1) {
        clearInterval(timer);
        deactivateCountdown.value = 0;
      }
    }, 1000);
  } catch (err) {
    error.value = extractError(err, t('profile.sendCodeFailed'));
  }
}

// 来源：ProfileDeactivateTab.tsx 行110-112 onWechatConfirm
function handleWechatDeactivateConfirm(): void {
  deactivateForm.value.wechatConfirm = 'confirmed';
  success.value = t('profile.wechatVerified');
}

// ==================== 生命周期 & Watchers ====================

// 来源：Profile.tsx 行127-138 — 自动选择默认验证方式
watch(() => [user.value, deactivateForm.value.verificationMethod], () => {
  if (!deactivateForm.value.verificationMethod && user.value) {
    if (user.value.hasPassword) deactivateForm.value.verificationMethod = 'password';
    else if (user.value.phone && user.value.phoneVerified) deactivateForm.value.verificationMethod = 'phone';
    else if (user.value.email) deactivateForm.value.verificationMethod = 'email';
    else if (user.value.wechatId) deactivateForm.value.verificationMethod = 'wechat';
  }
});

// 来源：Profile.tsx 行219-251 — 倒计时清理
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer);
});

// 来源：Profile.tsx 行219-232 — hash 中的微信结果
onMounted(() => {
  const hash = window.location.hash;
  if (hash.includes('wechat_result')) {
    try {
      const hashValue = hash.split('wechat_result=')[1];
      if (hashValue) {
        const result = JSON.parse(decodeURIComponent(hashValue));
        if (result.purpose === 'bind') activeTab.value = 'wechat';
        else if (result.purpose === 'deactivate') activeTab.value = 'deactivate';
      }
    } catch { /* ignore */ }
  }
});
</script>

<style scoped>
.profile-page {
  min-height: 100vh;
  padding: 2rem;
  position: relative;
}

.back-btn {
  position: fixed;
  top: 1.5rem;
  left: 1.5rem;
  z-index: 10;
}

.profile-container {
  max-width: 800px;
  margin: 0 auto;
  padding-top: 2rem;
}

.profile-card {
  overflow: hidden;
}

.profile-header {
  padding: 2.5rem 2rem 1.5rem;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%);
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.avatar-wrapper {
  position: relative;
}

.avatar-main {
  background: linear-gradient(135deg, #6366f1, #06b6d4);
}

.avatar-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  border: 2px solid rgb(var(--v-theme-surface));
}

.user-info {
  flex: 1;
}

.user-name {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.user-role {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  opacity: 0.6;
}

.profile-tabs {
  margin: 1rem 1.5rem 0;
}

.content-area {
  padding: 1.5rem 2rem 2rem;
}

/* Info cards */
.info-card {
  padding: 1rem;
  transition: transform 0.2s, box-shadow 0.2s;
}

.info-card:hover {
  transform: translateY(-2px);
}

/* Password form */
.password-form,
.edit-profile-form {
  max-width: 400px;
  margin: 0 auto;
}

.password-strength {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.strength-label {
  font-size: 0.75rem;
  font-weight: 500;
  white-space: nowrap;
}

/* Security tips */
.security-tips {
  list-style: none;
  padding: 0;
  margin: 0;
}

.security-tips li {
  position: relative;
  padding-left: 1rem;
  font-size: 0.8125rem;
  opacity: 0.7;
  margin-bottom: 0.375rem;
}

.security-tips li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.5rem;
  width: 4px;
  height: 4px;
  background: rgb(var(--v-theme-primary));
  border-radius: 50%;
}

/* Deactivate */
.deactivate-content {
  max-width: 500px;
  margin: 0 auto;
}

/* Responsive */
@media (max-width: 640px) {
  .profile-page {
    padding: 1rem;
  }

  .profile-container {
    padding-top: 3rem;
  }

  .profile-header {
    padding: 1.5rem 1.25rem 1rem;
  }

  .avatar-section {
    flex-direction: column;
    text-align: center;
  }

  .content-area {
    padding: 1.25rem;
  }

  .back-btn {
    top: 1rem;
    left: 1rem;
  }
}
</style>
