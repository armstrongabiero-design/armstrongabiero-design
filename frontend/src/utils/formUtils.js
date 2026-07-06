import { toast } from 'sonner';

/**
 * Run an async submit, then close dialog and reset form state on success.
 */
export async function completeDialogSubmit({
  submit,
  setDialogOpen,
  setFormData,
  initialFormData,
  onSuccess,
  successMessage = 'Saved successfully',
  errorMessage = 'Save failed',
}) {
  try {
    await submit();
    toast.success(successMessage);
    if (setDialogOpen) setDialogOpen(false);
    if (setFormData && initialFormData) {
      setFormData(
        typeof initialFormData === 'function' ? initialFormData() : { ...initialFormData }
      );
    }
    if (onSuccess) await onSuccess();
  } catch (error) {
    const detail = error.response?.data?.detail;
    if (Array.isArray(detail)) {
      toast.error(detail.map((d) => d.msg?.replace(/^Value error, /, '') || d.msg).join(' '));
    } else {
      toast.error(typeof detail === 'string' ? detail : errorMessage);
    }
    throw error;
  }
}
