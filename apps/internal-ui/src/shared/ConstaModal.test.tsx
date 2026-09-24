import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const lastModalProps = vi.fn();

vi.mock("@consta/uikit/Modal", () => ({
  Modal: (props: any) => {
    lastModalProps(props);
    if (!props.isOpen) return null;
    return (
      <div
        className={props.className}
        style={props.style}
        role={props.role}
        tabIndex={props.tabIndex}
        aria-modal={props["aria-modal"]}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
      >
        {props.children}
      </div>
    );
  },
}));

vi.mock("@consta/uikit/Card", () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

import { ConstaModal } from "./ConstaModal";

describe("ConstaModal", () => {
  it("не выводится в закрытом состоянии", () => {
    const html = renderToStaticMarkup(
      <ConstaModal open={false} title="Настройки" onCancel={() => undefined}>
        <div>Форма</div>
      </ConstaModal>,
    );

    expect(html).toBe("");
  });

  it("не передаёт onClose в нативный Modal, исключая повторный вызов при lifecycle смены состояния", () => {
    const onCancel = vi.fn();
    renderToStaticMarkup(
      <ConstaModal open={false} title="Звонок" onCancel={onCancel}>
        <div>Содержимое</div>
      </ConstaModal>,
    );

    const props = lastModalProps.mock.calls.at(-1)?.[0];
    expect(props).toBeDefined();
    expect(props.isOpen).toBe(false);
    expect(props.onClose).toBeUndefined();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("передаёт onClickOutside и onEsc для закрытия по клику вне и по Esc", () => {
    const onCancel = vi.fn();
    renderToStaticMarkup(
      <ConstaModal open title="Диалог" onCancel={onCancel} maskClosable keyboard>
        <div>Содержимое</div>
      </ConstaModal>,
    );

    const props = lastModalProps.mock.calls.at(-1)?.[0];
    expect(props.onClickOutside).toBeTypeOf("function");
    expect(props.onEsc).toBeTypeOf("function");

    props.onClickOutside();
    expect(onCancel).toHaveBeenCalledTimes(1);

    props.onEsc();
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("отключает onClickOutside и onEsc при maskClosable=false и keyboard=false", () => {
    const onCancel = vi.fn();
    renderToStaticMarkup(
      <ConstaModal open title="Диалог" onCancel={onCancel} maskClosable={false} keyboard={false}>
        <div>Содержимое</div>
      </ConstaModal>,
    );

    const props = lastModalProps.mock.calls.at(-1)?.[0];
    expect(props.onClickOutside).toBeUndefined();
    expect(props.onEsc).toBeUndefined();
  });

  it("собирает карточку, заголовок, тело и действия в открытом состоянии", () => {
    const html = renderToStaticMarkup(
      <ConstaModal
        open
        title="Настройки"
        onCancel={() => undefined}
        onOk={() => undefined}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <div>Форма</div>
      </ConstaModal>,
    );

    expect(html).toContain("app-modal-window");
    expect(html).toContain("app-modal-card");
    expect(html).toContain("app-modal-header");
    expect(html).toContain("app-modal-body");
    expect(html).toContain("app-modal-footer");
    expect(html).toContain("Настройки");
    expect(html).toContain("Форма");
    expect(html).toContain("Сохранить");
    expect(html).toContain("Отмена");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('tabindex="-1"');
    expect(lastModalProps.mock.calls.at(-1)?.[0].hasOverlay).toBe(true);
    expect(html).toContain("width:520px");
  });

  it("задаёт доступное имя и бесшовный body для диалога без визуального заголовка", () => {
    const html = renderToStaticMarkup(
      <ConstaModal
        open
        title={null}
        ariaLabel="Аудиозвонок"
        bodyClassName="app-modal-body-flush"
        onCancel={() => undefined}
      >
        <div>Содержимое</div>
      </ConstaModal>,
    );

    expect(html).toContain('aria-label="Аудиозвонок"');
    expect(html).not.toContain("aria-labelledby");
    expect(html).toContain("app-modal-body app-modal-body-flush");
  });

  it("размонтирует содержимое закрытого окна при destroyOnHidden", () => {
    renderToStaticMarkup(
      <ConstaModal open={false} destroyOnHidden ariaLabel="Диалог" onCancel={() => undefined}>
        <div>Форма</div>
      </ConstaModal>,
    );

    expect(lastModalProps.mock.calls.at(-1)?.[0].children).toBe(false);
  });

  it("оставляет специализированный диалог без собственной кнопки закрытия при closable=false", () => {
    const html = renderToStaticMarkup(
      <ConstaModal open title={null} closable={false} onCancel={() => undefined} width={480}>
        <div>Собственный заголовок</div>
      </ConstaModal>,
    );

    expect(html).toContain("Собственный заголовок");
    expect(html).not.toContain("app-modal-close");
    expect(html).toContain("width:480px");
  });
});
