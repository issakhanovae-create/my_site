import { useCart } from "../context/CartContext.jsx";

export default function Toast() {
  const { toast } = useCart();
  return (
    <p className={"toast" + (toast ? " is-on" : "")} role="status" aria-live="polite">
      {toast}
    </p>
  );
}
