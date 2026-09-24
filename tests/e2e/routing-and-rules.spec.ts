import { expect, test, type Page } from "@playwright/test";

const ORGANIZATION_PUBLIC_ID = "123e4567-e89b-12d3-a456-426614174000";
const CHANNEL_ID = 17;
const AGENT_ID = 17;
const CHANNEL_ROOT = `/api/v1/organizations/${ORGANIZATION_PUBLIC_ID}/channels/${CHANNEL_ID}/`;

const GROUPS = [
  { id: 1, name: "Операторы", color: "#1677ff", memberCount: 1, memberIds: [7], createdAt: "2026-02-02T10:00:00Z" },
];

const IDENTITY = {
  id: 1,
  email: "owner@example.com",
  fullName: "Елена Кузнецова",
  avatarUrl: null,
  mustChangePassword: false,
  totpEnabled: false,
  totpLastUsedAt: null,
  deliveryMode: "SELF_HOSTED",
  isInstanceAdmin: false,
  language: "ru",
  uiLanguage: "",
  uiTheme: "LIGHT",
  uiAccent: "#1677ff",
  memberships: [{
    id: 1,
    organizationPublicId: ORGANIZATION_PUBLIC_ID,
    organization: "demo",
    organizationName: "Демо-организация",
    organizationLogoUrl: null,
    role: "OWNER",
    positionTitle: "Владелец",
    totpRequired: false,
    capabilities: [
      "ai.manage",
      "channels.manage",
      "channels.view",
      "integrations.manage",
      "integrations.view",
    ],
    groups: [],
    joinedAt: "2026-01-01T00:00:00Z",
  }],
};

const AGENT = {
  id: AGENT_ID,
  aiAgentId: 17,
  code: "support",
  name: "Поддержка",
  isActive: true,
  groupId: 1,
  groupName: "Операторы",
  groupColor: "#1677ff",
  aiStatus: "ACTIVE",
  model: "gpt-4o-mini",
  transcriptionModel: "",
  providerModel: "gpt-4o-mini",
  transcriptionProviderModel: "",
  providerIntegrationId: 1,
  transcriptionIntegrationId: null,
  modelParams: {},
  answerLanguage: "ru",
  historyLimit: 20,
  persona: "",
  tone: "",
  instructions: "",
  knowledge: [],
  portalArticles: [],
  knowledgeTotal: 0,
  connections: [],
  counters: { openConversations: 0, connections: 0 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const EMPTY_COUNTERS = {
  all: 0,
  waiting: 0,
  queue: 0,
  waitingOnMe: 0,
  mine: 0,
  ungrouped: 0,
  groups: [],
  agents: [],
  assignees: [],
};

type RulePayload = {
  id: number;
  organization: number;
  channel: number;
  name: string;
  description: string;
  priority: number;
  is_active: boolean;
  trigger_event: string;
  conditions: Record<string, unknown>;
  action_target: string;
  target_group: number | null;
  target_group_id: number | null;
  target_group_name: string | null;
  created_at: string;
  updated_at: string;
};

type RoutingState = {
  authenticated: boolean;
  mode: "AI_FIRST" | "HUMAN_ONLY" | "RULE_BASED";
  hours: {
    timezone: string;
    weekly_schedule: Record<string, Array<{ start: string; end: string }>>;
    holidays: string[];
  } | null;
  rules: RulePayload[];
  requests: string[];
  modePatches: Array<Record<string, unknown>>;
  savedHours: Array<Record<string, unknown>>;
};

function initialState(overrides: Partial<RoutingState> = {}): RoutingState {
  return {
    authenticated: true,
    mode: "AI_FIRST",
    hours: null,
    rules: [],
    requests: [],
    modePatches: [],
    savedHours: [],
    ...overrides,
  };
}

function identityForOrg() {
  return JSON.parse(JSON.stringify(IDENTITY)) as typeof IDENTITY;
}

function ruleFromPayload(payload: Record<string, unknown>, id: number): RulePayload {
  return {
    id,
    organization: 1,
    channel: CHANNEL_ID,
    name: String(payload.name ?? ""),
    description: String(payload.description ?? ""),
    priority: Number(payload.priority ?? 100),
    is_active: Boolean(payload.is_active ?? true),
    trigger_event: String(payload.trigger_event ?? "CONVERSATION_CREATED"),
    conditions: (payload.conditions ?? {}) as Record<string, unknown>,
    action_target: String(payload.action_target ?? "ROUTE_TO_AI"),
    target_group: payload.target_group === null || payload.target_group === undefined
      ? null
      : Number(payload.target_group),
    target_group_id: payload.target_group_id === null || payload.target_group_id === undefined
      ? null
      : Number(payload.target_group_id),
    target_group_name: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

async function installMocks(page: Page, state: RoutingState): Promise<void> {
  page.on("request", (request) => state.requests.push(request.url()));

  await page.route("**/api/v1/auth/session/", (route) => route.fulfill({
    json: state.authenticated
      ? { authenticated: true, user: identityForOrg() }
      : { authenticated: false, language: "ru" },
  }));
  await page.route("**/api/v1/setup/", (route) => route.fulfill({ json: { needsSetup: false } }));
  await page.route(`**/api/v1/organizations/${ORGANIZATION_PUBLIC_ID}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const relative = path.slice(`/api/v1/organizations/${ORGANIZATION_PUBLIC_ID}/`.length);

    if (relative === `channels/${CHANNEL_ID}/`) {
      if (method === "GET") {
        return route.fulfill({ json: { id: CHANNEL_ID, name: "Поддержка", code: "support", routing_mode: state.mode } });
      }
      if (method === "PATCH") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        state.mode = (payload.routing_mode ?? payload.routingMode) as RoutingState["mode"];
        state.modePatches.push(payload);
        return route.fulfill({ json: { id: CHANNEL_ID, routing_mode: state.mode, routingMode: state.mode } });
      }
    }

    if (relative === `channels/${CHANNEL_ID}/business-hours/`) {
      if (method === "GET") {
        if (!state.hours) return route.fulfill({ status: 404, json: { detail: "Расписание канала не настроено" } });
        return route.fulfill({ json: state.hours });
      }
      if (method === "PUT") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        state.savedHours.push(payload);
        state.hours = {
          timezone: String(payload.timezone),
          weekly_schedule: payload.weekly_schedule as Record<string, Array<{ start: string; end: string }>>,
          holidays: payload.holidays as string[],
        };
        return route.fulfill({ json: state.hours });
      }
    }

    const rulesList = `channels/${CHANNEL_ID}/routing-rules/`;
    if (relative === rulesList) {
      if (method === "GET") return route.fulfill({ json: { items: state.rules } });
      if (method === "POST") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        const created = ruleFromPayload(payload, 101);
        state.rules.push(created);
        return route.fulfill({ status: 201, json: created });
      }
    }
    const ruleDetail = relative.match(new RegExp(`^channels/${CHANNEL_ID}/routing-rules/(\\d+)/$`));
    if (ruleDetail) {
      const ruleId = Number(ruleDetail[1]);
      const index = state.rules.findIndex((rule) => rule.id === ruleId);
      if (method === "DELETE") {
        if (index >= 0) state.rules.splice(index, 1);
        return route.fulfill({ status: 204 });
      }
      if (method === "PATCH" && index >= 0) {
        const payload = request.postDataJSON() as Record<string, unknown>;
        state.rules[index] = { ...state.rules[index], ...ruleFromPayload(payload, ruleId) };
        return route.fulfill({ json: state.rules[index] });
      }
    }

    if (relative === "company/groups/") return route.fulfill({ json: { items: GROUPS } });
    if (relative === "company/onboarding/") return route.fulfill({ json: {
      steps: {
        providerConnected: true,
        agentActive: true,
        knowledgeFilled: true,
        connectionBound: true,
        widgetPublished: true,
        employeeInvited: true,
        platformConfigured: true,
        firstConversation: true,
      },
      dismissedAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:00:00Z",
    } });
    if (relative === "agents/directory/") return route.fulfill({ json: { items: [], hasMore: false } });
    if (relative === `agents/${AGENT_ID}/`) return route.fulfill({ json: { agent: AGENT } });
    if (relative === "agents/") return route.fulfill({ json: { items: [AGENT], page: 1, pageSize: 20, total: 1, pageCount: 1 } });
    if (relative === "integrations/") return route.fulfill({ json: { items: [] } });
    if (relative === "conversations/counters/") return route.fulfill({ json: EMPTY_COUNTERS });
    if (relative === "conversations/directory/") return route.fulfill({ json: { groups: GROUPS, employees: [] } });
    if (relative === "conversations/stats/") return route.fulfill({ json: { waiting: 0 } });
    if (relative.startsWith("notifications/")) return route.fulfill({ json: { items: [], unreadCount: 0 } });

    // Остальные organization-scoped read-запросы не должны блокировать карточку.
    return route.fulfill({ json: { items: [] } });
  });
}

function assertRoutingRequestsScoped(state: RoutingState): void {
  const routingRequests = state.requests.filter((url) => url.includes("/channels/"));
  expect(routingRequests.length).toBeGreaterThan(0);
  expect(routingRequests.every((url) => url.includes(`/api/v1/organizations/${ORGANIZATION_PUBLIC_ID}/channels/`))).toBe(true);
  expect(routingRequests.some((url) => url.includes(`/api/${"channels"}/`))).toBe(false);
}

async function openRoutingCard(page: Page, state: RoutingState): Promise<void> {
  await page.goto(`/organizations/${ORGANIZATION_PUBLIC_ID}/agents/${AGENT_ID}`);
  await expect(page.getByTestId("routing-card")).toBeVisible();
  await expect.poll(() => state.requests.some((url) => url.includes(`${CHANNEL_ROOT}`))).toBe(true);
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "internal-ui", "internal-ui only");
});

test.describe("Гибкая маршрутизация канала", () => {
  test("карточка появляется только после авторизованной сессии и выбирает организацию из адреса", async ({ page }) => {
    const state = initialState({ authenticated: false });
    await installMocks(page, state);

    await page.goto(`/organizations/${ORGANIZATION_PUBLIC_ID}/agents/${AGENT_ID}`);
    await expect(page.getByPlaceholder("you@domain.ru")).toBeVisible();
    await expect(page.getByTestId("routing-card")).toHaveCount(0);
    expect(state.requests.filter((url) => url.includes("/channels/"))).toEqual([]);

    state.authenticated = true;
    await page.reload();

    await expect(page.getByTestId("routing-card")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/organizations/${ORGANIZATION_PUBLIC_ID}/agents/${AGENT_ID}`));
    assertRoutingRequestsScoped(state);
  });

  test("переключает режим канала и сохраняет organization-scoped PATCH", async ({ page }) => {
    const state = initialState();
    await installMocks(page, state);
    await openRoutingCard(page, state);

    const humanOnly = page.getByTestId("routing-mode-HUMAN_ONLY");
    const aiFirst = page.getByTestId("routing-mode-AI_FIRST");
    await expect(humanOnly).toBeVisible();
    await expect(aiFirst).toHaveClass(/is-selected/);
    await humanOnly.click();

    await expect(humanOnly).toHaveClass(/is-selected/);
    await expect(aiFirst).not.toHaveClass(/is-selected/);
    await expect.poll(() => state.mode).toBe("HUMAN_ONLY");
    expect(state.modePatches).toEqual([{ routing_mode: "HUMAN_ONLY" }]);
    assertRoutingRequestsScoped(state);
  });

  test("редактирует несколько интервалов Business Hours и не теряет массив", async ({ page }) => {
    const state = initialState({
      hours: {
        timezone: "Europe/Moscow",
        weekly_schedule: { mon: [{ start: "09:00", end: "13:00" }] },
        holidays: [],
      },
    });
    await installMocks(page, state);
    await openRoutingCard(page, state);

    await page.getByTestId("open-business-hours-modal").click();
    const modal = page.getByTestId("business-hours-modal");
    await expect(modal).toBeVisible();
    await expect(page.getByText("Москва (UTC+3)")).toBeVisible();

    const mondayIntervals = page.getByTestId("business-hours-intervals-mon");
    await expect(mondayIntervals.locator('input[type="time"]')).toHaveCount(2);
    await mondayIntervals.getByRole("button", { name: "Добавить интервал" }).click();
    await expect(mondayIntervals.locator('input[type="time"]')).toHaveCount(4);
    await mondayIntervals.locator('input[type="time"]').nth(2).fill("14:00");
    await mondayIntervals.locator('input[type="time"]').nth(3).fill("18:00");
    await page.getByTestId("save-business-hours-button").click();

    await expect.poll(() => state.savedHours.length).toBe(1);
    expect(state.savedHours[0]).toMatchObject({
      weekly_schedule: {
        mon: [
          { start: "09:00", end: "13:00" },
          { start: "14:00", end: "18:00" },
        ],
      },
    });
    await expect(page.getByTestId("business-hours-modal")).toHaveCount(0);
    assertRoutingRequestsScoped(state);
  });

  test("создаёт правило только через явное действие и проверяет запрос", async ({ page }) => {
    const state = initialState({ mode: "RULE_BASED" });
    await installMocks(page, state);
    await openRoutingCard(page, state);

    const addRule = page.getByTestId("add-routing-rule-button");
    await expect(addRule).toBeVisible();
    await expect(page.getByTestId("rule-editor-modal")).toHaveCount(0);
    await addRule.click();

    const modal = page.getByTestId("rule-editor-modal");
    await expect(modal).toBeVisible();
    await modal.getByLabel("Название правила").fill("Претензии сразу людям");
    const field = modal.getByTestId("condition-field");
    const operator = modal.getByTestId("condition-operator");
    await field.selectOption("contact.labels");
    await expect(operator.locator("option")).toHaveCount(4);
    await field.selectOption("message.text_contains");
    await operator.selectOption("contains_any");
    await expect(modal.getByRole("button", { name: "Добавить отрицание" })).toBeVisible();
    await modal.getByTestId("condition-value").fill("жалоба, претензия");
    await modal.getByRole("button", { name: "Куда направить" }).click();
    const actionMenu = page.locator(".app-dropdown").filter({ hasText: "Направить в очередь операторов" });
    await expect(actionMenu).toBeVisible();
    await actionMenu.getByRole("menuitem", { name: "Направить в очередь операторов" }).click();
    await modal.getByTestId("save-rule-button").click();

    await expect.poll(() => state.rules.length).toBe(1);
    expect(state.rules[0]).toMatchObject({
      name: "Претензии сразу людям",
      action_target: "ROUTE_TO_HUMAN",
      conditions: {
        all: [{
          field: "message.text_contains",
          op: "contains_any",
          value: ["жалоба", "претензия"],
        }],
      },
    });
    await expect(page.getByTestId("rule-editor-modal")).toHaveCount(0);
    assertRoutingRequestsScoped(state);
  });
});
