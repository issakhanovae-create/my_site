export const statusNames = {
  new: "Новый",
  work: "В работе",
  done: "Готово",
  cancel: "Отмена"
};

export function when(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function clientNote(order) {
  const goods = (order.items || []).map((line) => line.qty + " × " + line.name).join(", ");
  return "Здравствуйте, " + order.name + ". Вы хотели заказать у нас " + (goods || "позиции с витрины") + ".";
}

export function clientChat(order) {
  return "https://wa.me/" + order.phone + "?text=" + encodeURIComponent(clientNote(order));
}
