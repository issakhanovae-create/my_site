import { useRef } from "react";
import LiveClock from "./LiveClock.jsx";
import ContactsPopover, { useContactsOpen } from "./ContactsPopover.jsx";
import { useCart } from "../context/CartContext.jsx";

export default function Masthead() {
  const { count, setCartOpen, popCart } = useCart();
  const contacts = useContactsOpen();
  const contactsBtn = useRef(null);

  return (
    <>
      <div className="mast">
        <header className="top">
          <a className="brand" href="#top">
            Эльмира Исаханова
          </a>
          <nav aria-label="Разделы">
            <a href="#about">О себе</a>
            <a href="#resume">Резюме</a>
            <a href="#air">Эфир</a>
            <a href="#now">Сейчас</a>
            <a href="#shop">Магазин</a>
            <button
              type="button"
              ref={contactsBtn}
              aria-expanded={contacts.open}
              aria-controls="contacts"
              onClick={(event) => {
                event.stopPropagation();
                contacts.toggle();
              }}
            >
              Контакт
            </button>
          </nav>
          <button
            className={"cart-open" + (popCart ? " is-pop" : "")}
            type="button"
            aria-haspopup="dialog"
            aria-controls="cart"
            onClick={() => setCartOpen(true)}
          >
            Корзина <b>{count}</b>
          </button>
        </header>
        <LiveClock />
      </div>
      <ContactsPopover open={contacts.open} onClose={contacts.close} anchorRef={contactsBtn} />
    </>
  );
}
