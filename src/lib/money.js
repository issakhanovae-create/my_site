const marks = { KZT: "₸", RUB: "₽", USD: "$" };

export function money(value, currency) {
  const code = marks[currency] ? currency : "KZT";
  const amount = new Intl.NumberFormat("ru-RU").format(value);
  return code === "USD" ? "$" + amount : amount + " " + marks[code];
}

export { marks };
