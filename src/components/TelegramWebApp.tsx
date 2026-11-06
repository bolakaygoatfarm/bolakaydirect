"use client";

import { useEffect } from "react";
import { initTelegramWebApp } from "@/lib/telegram-webapp";

/** Сайт открыт кнопкой Web App в Telegram: разворачиваем его на весь экран и запоминаем подпись для привязки заказа */
export function TelegramWebApp() {
  useEffect(() => {
    initTelegramWebApp();
  }, []);
  return null;
}
