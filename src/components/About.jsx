import { useReveal } from "../hooks/useReveal.js";

export default function About() {
  const ref = useReveal();

  return (
    <section className="about reveal" id="about" ref={ref}>
      <p className="label">О себе</p>
      <div className="about-grid">
        <h2>Три, два, один. Мы в эфире.</h2>
        <div>
          <p>
            Я Эльмира Манаповна. Родилась в Караганде, в 2003 году окончила филологический факультет КарГУ
            имени Е. А. Букетова по специальности «Журналистика». С 2004 года день начинался с обратного
            отсчёта: корреспондент, ведущая, выпускающий редактор, затем пресс-служба.
          </p>
          <p>
            Сейчас руковожу пресс-службой сельскохозяйственной компании. Истории пахнут сеном, а главные
            герои — лошади. Не меняется одно: всё решает то, как вы говорите с людьми.
          </p>
        </div>
      </div>
      <ul className="stats">
        <li>
          <strong data-count="21" data-suffix="+">
            21+
          </strong>
          <span>год в работе, большая часть — в прямом эфире</span>
        </li>
        <li>
          <strong data-count="9">9</strong>
          <span>редакций, студий и пресс-служб</span>
        </li>
        <li>
          <strong data-count="6">6</strong>
          <span>наград и официальных благодарностей</span>
        </li>
        <li>
          <strong data-count="8.5" data-suffix=" тыс.">
            8,5 тыс.
          </strong>
          <span>человек читают личный блог</span>
        </li>
      </ul>
    </section>
  );
}
