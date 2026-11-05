/** Ключ выбранной темы в localStorage (общий для сайта и панели сотрудников). */
export const THEME_KEY = "bolakay-theme";

/**
 * Скрипт для <head>: ставит тему ДО первой отрисовки, чтобы не было «вспышки» белого.
 * Сохранённый выбор → иначе системная тема. Лежит в обычном модуле (не "use client"),
 * чтобы серверные layout-ы получали саму строку.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})();`;
