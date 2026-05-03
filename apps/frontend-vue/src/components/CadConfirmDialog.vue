<template>
  <Teleport to="body">
    <v-dialog
      :model-value="modelValue"
      :max-width="maxWidth"
      persistent
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <v-card :rounded="rounded">
        <v-card-item>
          <template #title>
            <span class="text-h6">{{ title }}</span>
          </template>
          <template v-if="description" #subtitle>
            {{ description }}
          </template>
        </v-card-item>

        <v-card-text>
          <slot />
        </v-card-text>

        <v-card-actions class="px-4 pb-4">
          <v-spacer />
          <v-btn
            v-if="cancelText"
            variant="text"
            @click="$emit('cancel')"
          >
            {{ cancelText }}
          </v-btn>
          <v-btn
            v-if="confirmText"
            :color="confirmColor"
            variant="flat"
            :loading="loading"
            @click="$emit('confirm')"
          >
            {{ confirmText }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </Teleport>
</template>

<script setup lang="ts">
defineProps({
  modelValue: { type: Boolean, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  confirmText: { type: String, default: '' },
  cancelText: { type: String, default: '' },
  confirmColor: { type: String, default: 'primary' },
  loading: { type: Boolean, default: false },
  maxWidth: { type: [String, Number], default: 480 },
  rounded: { type: String, default: 'lg' },
});

defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
  cancel: [];
}>();
</script>
