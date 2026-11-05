/** Короткая вибрация на Android (iOS Safari её не поддерживает — тихо пропускаем). */
export function haptic(ms = 10) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}
