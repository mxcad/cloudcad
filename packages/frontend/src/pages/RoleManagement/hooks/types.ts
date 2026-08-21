export interface RoleFeedback {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

export interface LoadingControl {
  loading: boolean;
  setLoading: (value: boolean) => void;
}
