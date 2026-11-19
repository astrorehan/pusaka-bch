export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const focus = document.activeElement;
    const container = focus?.closest('dialog[open]') ?? document.body;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    container.append(textarea);
    try {
      textarea.select();
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      textarea.remove();
      if (focus instanceof HTMLElement) focus.focus({ preventScroll: true });
    }
  }
}
