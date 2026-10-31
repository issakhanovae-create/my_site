import { Component } from "react";

/**
 * Без этого ошибка рендера в любом компоненте внутри роняет всё дерево React
 * в белый экран без единого объяснения — ни пользователю, ни админу в консоли.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary:", this.props.label || "", error, info && info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boundary-fallback" role="alert">
          <p className="boundary-title">Что-то пошло не так.</p>
          <p className="boundary-text">
            Страница столкнулась с ошибкой{this.props.label ? " (" + this.props.label + ")" : ""}.
            Попробуйте обновить страницу.
          </p>
          <button type="button" className="btn gold" onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
