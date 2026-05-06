import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { userFormSchema, type UserFormData, type UserFormContext } from './userFormSchema';
import type { UserResponseDto } from '@/api-sdk';
import { useEffect } from 'react';

interface UseUserFormOptions {
  mailEnabled: boolean;
  isEditing: boolean;
  editingUser?: UserResponseDto | null;
  onSubmit: (data: UserFormData) => Promise<void>;
}

export function useUserForm({ mailEnabled, isEditing, editingUser, onSubmit }: UseUserFormOptions) {
  const form = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema({ mailEnabled, isEditing })),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      roleId: '',
      nickname: '',
      status: 'ACTIVE',
    },
  });

  useEffect(() => {
    if (editingUser) {
      form.reset({
        username: editingUser.username,
        email: editingUser.email || '',
        password: '',
        roleId: editingUser.role?.id || '',
        nickname: editingUser.nickname || '',
        status: (editingUser.status as any) || 'ACTIVE',
      });
    } else {
      form.reset({
        username: '',
        email: '',
        password: '',
        roleId: '',
        nickname: '',
        status: 'ACTIVE',
      });
    }
  }, [editingUser?.id]);

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) return;
    await onSubmit(form.getValues());
  };

  return { form, handleSubmit };
}
