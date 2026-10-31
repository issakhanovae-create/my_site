import { gallery } from "../data/career.js";
import { useReveal } from "../hooks/useReveal.js";

export default function Gallery() {
  const ref = useReveal();

  return (
    <section className="frames reveal" id="frames" ref={ref}>
      <p className="label">Кадры</p>
      <h2>С телефона и из архива</h2>
      <ul className="gallery">
        {gallery.map((shot) => (
          <li key={shot.src}>
            <img src={shot.src} alt={shot.alt} />
            <span>{shot.caption}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
