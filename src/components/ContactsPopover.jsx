import { useEffect, useRef, useState } from "react";
import { contacts, whatsappLabel, whatsappUrl } from "../data/contacts.js";

export default function ContactsPopover({ open, onClose, anchorRef }) {
  const popRef = useRef(null);
  const [phone, setPhone] = useState(contacts.whatsappPhone);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/site")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.whatsappPhone) return;
        setPhone(String(data.whatsappPhone));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open || !anchorRef?.current || !popRef.current) return;

    function place() {
      const button = anchorRef.current;
      const pop = popRef.current;
      if (!button || !pop) return;
      const rect = button.getBoundingClientRect();
      const width = pop.offsetWidth;
      const centered = rect.left + rect.width / 2 - width / 2;
      const left = Math.max(12, Math.min(centered, window.innerWidth - width - 12));
      pop.style.top = Math.round(rect.bottom + 14) + "px";
      pop.style.left = Math.round(left) + "px";
      const caret = Math.min(Math.max(rect.left + rect.width / 2 - left, 18), width - 18);
      pop.style.setProperty("--caret", caret + "px");
    }

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onDoc(event) {
      if (popRef.current?.contains(event.target)) return;
      if (anchorRef?.current?.contains(event.target)) return;
      onClose();
    }
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div className="contact-pop" id="contacts" ref={popRef}>
      <p className="contact-kicker">На связи</p>
      <ul className="contact-list">
        <li>
          <a href={"mailto:" + contacts.email}>
            Почта<span>{contacts.email}</span>
          </a>
        </li>
        <li>
          <a href={whatsappUrl(phone)} target="_blank" rel="noopener">
            WhatsApp<span>{whatsappLabel(phone)}</span>
          </a>
        </li>
        <li>
          <a href={contacts.instagramUrl} target="_blank" rel="noopener">
            Instagram<span>{contacts.instagramLabel}</span>
          </a>
        </li>
        <li>
          <a href={contacts.linkedinUrl} target="_blank" rel="noopener">
            LinkedIn<span>{contacts.linkedinLabel}</span>
          </a>
        </li>
      </ul>
    </div>
  );
}

export function useContactsOpen() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, toggle: () => setOpen((v) => !v), close: () => setOpen(false) };
}
