import { useReveal } from "../hooks/useReveal.js";

export default function Now() {
  const ref = useReveal();

  return (
    <section className="now reveal" id="now" ref={ref}>
      <p className="label">Сейчас</p>
      <div className="now-grid">
        <div>
          <h2>Из редакции в степь</h2>
          <p>
            Сегодняшняя редакция без стен. Это Осакаровский район: поля, умная молочная ферма, конезавод и
            лошади, которые веками рядом с казахской жизнью. Снимаю на телефон, монтирую, пишу тексты, веду
            страницы компании и собираю съёмку имиджевых роликов.
          </p>
          <p className="kaz">Ат баптау — атадан қалған асыл мұра.</p>
          <p className="count">
            <strong>5 100 000</strong> лошадей в Казахстане на 1 мая 2026 года, на 7,1% больше, чем годом
            ранее.
          </p>
        </div>
        <div className="shots">
          <img src="/img/horse.jpg" alt="Вороная лошадь в недоуздке" />
          <img src="/img/herd.jpg" alt="Табун лошадей в степи" />
          <img src="/img/steppe-wind.jpg" alt="Степь и ветряки с высоты" />
        </div>
      </div>
    </section>
  );
}
