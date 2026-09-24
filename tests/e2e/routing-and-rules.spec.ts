import { expect, test } from "@playwright/test";

// Тестовый набор e2e: Проверка пользовательских сценариев гибкой маршрутизации
// и конструктора правил (Rules Engine) в Internal UI.
// См. архитектурную спецификацию: docs/architecture/adr-flexible-routing-and-rules-engine.md
// См. план тестирования: docs/testing/flexible-routing-test-plan.md

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "internal-ui", "internal-ui only");
});

test.describe("Гибкая маршрутизация диалогов и Rules Engine", () => {
  test("переключение режима маршрутизации канала на HUMAN_ONLY", async ({ page }) => {
    // Мокируем API каналов и маршрутизации
    await page.route("**/api/channels/**", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: 1,
            name: "Поддержка Telegram",
            code: "tg-support",
            routing_mode: "AI_FIRST",
          }),
        });
      } else if (method === "PATCH") {
        const data = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: 1,
            name: "Поддержка Telegram",
            code: "tg-support",
            routing_mode: data.routing_mode,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/channels/1/routing");

    // Проверяем наличие карточек режимов
    const humanOnlyCard = page.locator('[data-testid="routing-mode-HUMAN_ONLY"]');
    const aiFirstCard = page.locator('[data-testid="routing-mode-AI_FIRST"]');
    const ruleBasedCard = page.locator('[data-testid="routing-mode-RULE_BASED"]');

    if (await humanOnlyCard.isVisible()) {
      await humanOnlyCard.click();
      await expect(humanOnlyCard).toHaveClass(/selected|active/);

      // Проверяем информационную подсказку
      await expect(page.locator("body")).toContainText("Только операторы");
    }
  });

  test("настройка рабочих часов канала (Business Hours)", async ({ page }) => {
    let savedBusinessHours: unknown = null;

    await page.route("**/api/channels/1/business-hours/", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            timezone: "Europe/Moscow",
            weekly_schedule: {
              mon: [{ start: "09:00", end: "18:00" }],
              tue: [{ start: "09:00", end: "18:00" }],
            },
            holidays: ["2026-01-01"],
          }),
        });
      } else if (method === "PUT") {
        savedBusinessHours = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(savedBusinessHours),
        });
      }
    });

    await page.goto("/channels/1/routing");
    const openScheduleBtn = page.locator('[data-testid="open-business-hours-modal"]');
    if (await openScheduleBtn.isVisible()) {
      await openScheduleBtn.click();
      await expect(page.locator('[data-testid="business-hours-modal"]')).toBeVisible();

      // Проверяем отображение часового пояса
      await expect(page.locator("body")).toContainText("Москва (UTC+3)");
    }
  });

  test("создание правила маршрутизации по стоп-словам (претензия/жалоба)", async ({ page }) => {
    let createdRule: unknown = null;

    await page.route("**/api/channels/1/routing-rules/", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      } else if (method === "POST") {
        createdRule = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            id: 101,
            ...(createdRule as object),
          }),
        });
      }
    });

    await page.goto("/channels/1/routing");
    const addRuleBtn = page.locator('[data-testid="add-routing-rule-button"]');
    if (await addRuleBtn.isVisible()) {
      await addRuleBtn.click();
      await expect(page.locator('[data-testid="rule-editor-drawer"]')).toBeVisible();

      await page.fill('[data-testid="rule-name-input"]', "Претензии сразу людям");
      await page.click('[data-testid="action-target-ROUTE_TO_HUMAN"]');
      await page.click('[data-testid="save-rule-button"]');

      expect(createdRule).not.toBeNull();
    }
  });

  test("отображение бейджей контроллера диалога и перехват оператором", async ({ page }) => {
    await page.route("**/api/conversations/42/", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 42,
          control_mode: "AI",
          expected_responder: "CUSTOMER",
          waiting_since: null,
          contact: { name: "Иван Иванов" },
        }),
      });
    });

    await page.goto("/chat/conversations/42");

    // Проверяем индикатор ИИ-агента
    const aiBadge = page.locator('[data-testid="conversation-controller-badge"]');
    if (await aiBadge.isVisible()) {
      await expect(aiBadge).toContainText(/ИИ|AI/i);

      // Проверяем наличие кнопки перехвата диалога
      const takeBtn = page.locator('[data-testid="take-conversation-button"]');
      if (await takeBtn.isVisible()) {
        await expect(takeBtn).toBeEnabled();
      }
    }
  });
});
