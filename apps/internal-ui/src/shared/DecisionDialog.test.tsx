import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@consta/uikit/Modal", () => ({
  Modal: ({ children, isOpen, className, role, "aria-modal": ariaModal, "aria-labelledby": ariaLabelledby, style }: any) => {
    if (!isOpen) return null;
    return (
      <div
        className={`Modal ${className ?? ""}`}
        role={role}
        aria-modal={ariaModal}
        aria-labelledby={ariaLabelledby}
        style={style}
      >
        {children}
      </div>
    );
  },
}));

vi.mock("@consta/uikit/Card", () => ({
  Card: ({ children, className, status }: any) => (
    <div className={`Card ${className ?? ""}`} data-status={status}>
      {children}
    </div>
  ),
}));

import { DecisionDialog } from "./DecisionDialog";

describe("DecisionDialog", () => {
  it("не рендерит содержимое в закрытом состоянии", () => {
    const html = renderToStaticMarkup(
      <DecisionDialog
        open={false}
        title="Удалить диалог?"
        description="Действие необратимо"
        icon="trash"
        tone="danger"
        actions={<button type="button">Удалить</button>}
        onClose={() => undefined}
      />,
    );
    expect(html).toBe("");
  });

  it("рендерит диалог с тоном danger и статусом alert в открытом состоянии", () => {
    const html = renderToStaticMarkup(
      <DecisionDialog
        open={true}
        title="Удалить диалог?"
        description="Действие необратимо"
        icon="trash"
        tone="danger"
        actions={<button type="button">Удалить</button>}
        onClose={() => undefined}
      >
        <div>Дополнительный контекст</div>
      </DecisionDialog>,
    );

    expect(html).toContain("decision-dialog");
    expect(html).toContain("is-danger");
    expect(html).toContain('data-status="alert"');
    expect(html).toContain("Удалить диалог?");
    expect(html).toContain("Действие необратимо");
    expect(html).toContain("Дополнительный контекст");
    expect(html).toContain("Удалить");
  });

  it("рендерит предупреждающий статус warning при tone=warning", () => {
    const html = renderToStaticMarkup(
      <DecisionDialog
        open={true}
        title="Сбросить фильтры?"
        description="Все параметры сбросятся"
        icon="warning"
        tone="warning"
        actions={<button type="button">Сбросить</button>}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("is-warning");
    expect(html).toContain('data-status="warning"');
  });
});
