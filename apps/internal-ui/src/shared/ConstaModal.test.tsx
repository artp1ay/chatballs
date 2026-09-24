import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@consta/uikit/Modal", () => ({
  Modal: ({ children, isOpen, className, style, role, "aria-modal": ariaModal, "aria-labelledby": ariaLabelledby }: any) => {
    if (!isOpen) return null;
    return (
      <div
        className={className}
        style={style}
        role={role}
        aria-modal={ariaModal}
        aria-labelledby={ariaLabelledby}
      >
        {children}
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
    expect(html).toContain("width:520px");
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
