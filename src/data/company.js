/** Реквизиты продавца для PDF счёта. Замените плейсхолдеры на реальные перед использованием. */
export const company = {
  name: "ЗАМЕНИТЬ: название ИП/ТОО",
  requisites: "ЗАМЕНИТЬ: БИН/ИНН, адрес",
  phone: "ЗАМЕНИТЬ: контактный телефон",
  bank: "ЗАМЕНИТЬ: банковские реквизиты (если нужно для счёта)"
};

/** true, пока в реквизитах остался хоть один незаполненный плейсхолдер. */
export function companyHasPlaceholders() {
  return Object.values(company).some((value) => String(value).startsWith("ЗАМЕНИТЬ:"));
}
