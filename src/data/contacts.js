/** Публичные контакты. WhatsApp-номер подтягивается с GET /api/site при наличии сервера. */
export const contacts = {
  email: "basta_26_82@mail.ru",
  instagramUrl: "https://www.instagram.com/elmira_issakhanova/",
  instagramLabel: "@elmira_issakhanova",
  linkedinUrl: "https://www.linkedin.com/in/elmira-issakhanova-07370697/",
  linkedinLabel: "elmira-issakhanova",
  /** fallback, если /api/site недоступен (только Vite без Node) */
  whatsappPhone: "77028711150"
};

export function whatsappUrl(phone = contacts.whatsappPhone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return "https://wa.me/" + (digits || contacts.whatsappPhone);
}

export function whatsappLabel(phone = contacts.whatsappPhone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!/^7\d{10}$/.test(digits)) return "+" + (digits || contacts.whatsappPhone);
  return "+7 " + digits.slice(1, 4) + " " + digits.slice(4, 7) + " " + digits.slice(7, 9) + " " + digits.slice(9);
}
