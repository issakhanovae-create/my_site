import { useEffect, useState } from "react";

const started = new Date(2004, 0, 1);

function pad(n, size) {
  return String(n).padStart(size, "0");
}

function formatClock(now) {
  let years = now.getFullYear() - started.getFullYear();
  const ann = new Date(now.getFullYear(), 0, 1);
  if (now < ann) years -= 1;
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - yearStart) / 86400000);
  return `${pad(years, 2)} г  ${pad(days, 3)} д  ${pad(now.getHours(), 2)}:${pad(now.getMinutes(), 2)}:${pad(now.getSeconds(), 2)}`;
}

export default function LiveClock() {
  const [text, setText] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const id = setInterval(() => setText(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <p className="live">
      <span className="lamp" aria-hidden="true" />
      В эфире <span>{text}</span>
    </p>
  );
}
