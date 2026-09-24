import { t } from "../../../i18n";
import { Button, IconButton } from "../../../shared/ui-controls";
import { conditionFieldTitle, conditionOperatorTitle, isEmptyConditionTree, isRuleCondition } from "./model";
import {
  CONDITION_FIELD_OPTIONS,
  CONDITION_OPERATOR_OPTIONS,
  conditionForField,
  defaultCondition,
  defaultConditionTree,
  isBooleanField,
  isChannelModeField,
  operatorsForField,
  updateConditionValue,
} from "./conditionTree";
import type {
  ChannelRoutingMode,
  ConditionFieldKey,
  RuleCondition,
  RuleConditionTree,
} from "./types";

type LogicKind = "all" | "any" | "not";

type Props = {
  value: RuleConditionTree;
  onChange: (value: RuleConditionTree) => void;
  onRemove?: () => void;
  depth?: number;
};

function groupKind(value: RuleConditionTree): LogicKind | null {
  if (isEmptyConditionTree(value) || isRuleCondition(value)) return null;
  if ("not" in value) return "not";
  if ("any" in value) return "any";
  return "all";
}

function groupChildren(value: RuleConditionTree, kind: LogicKind): RuleConditionTree[] {
  if (kind === "not") return "not" in value ? [value.not] : [];
  if (kind === "any" && "any" in value) return value.any;
  if (kind === "all" && "all" in value) return value.all;
  return [];
}

function changeGroupKind(value: RuleConditionTree, next: LogicKind): RuleConditionTree {
  const current = groupKind(value);
  if (current === next) return value;
  if (current === null) {
    if (next === "not") return { not: defaultCondition() };
    if (next === "any") return { any: [defaultCondition()] };
    return { all: [defaultCondition()] };
  }
  if (next === "not") return { not: value };
  if (current === "not") {
    const child = "not" in value ? value.not : defaultCondition();
    const childKind = groupKind(child);
    if (childKind === next) return child;
    if (next === "any") return { any: [child] };
    return { all: [child] };
  }
  const children = groupChildren(value, current);
  if (next === "any") return { any: children };
  return { all: children };
}

function replaceChild(
  value: RuleConditionTree,
  kind: LogicKind,
  index: number,
  child: RuleConditionTree,
): RuleConditionTree {
  if (kind === "not") return { not: child };
  const children = [...groupChildren(value, kind)];
  children[index] = child;
  return kind === "all" ? { all: children } : { any: children };
}

function LogicButtons({ kind, onChange }: { kind: LogicKind; onChange: (kind: LogicKind) => void }) {
  return (
    <div className="routing-logic-toggle" role="group" aria-label={t("routing.conditions_title")}>
      {(["all", "any", "not"] as const).map((item) => (
        <button
          key={item}
          type="button"
          className={`routing-logic-btn ${kind === item ? "is-active" : ""}`}
          aria-pressed={kind === item}
          onClick={() => onChange(item)}
        >
          {item === "all" ? t("routing.logic_all") : item === "any" ? t("routing.logic_any") : t("routing.logic_not")}
        </button>
      ))}
    </div>
  );
}

function ConditionValue({ condition, onChange }: {
  condition: RuleCondition;
  onChange: (value: unknown) => void;
}) {
  if (isBooleanField(condition.field)) {
    return (
      <select
        className="routing-select routing-select-val"
        data-testid="condition-value"
        aria-label={t("routing.value")}
        value={condition.value === true ? "true" : "false"}
        onChange={(event) => onChange(event.target.value === "true")}
      >
        <option value="true">{t("common.yes")}</option>
        <option value="false">{t("common.no")}</option>
      </select>
    );
  }

  if (isChannelModeField(condition.field)) {
    const value = typeof condition.value === "string" ? condition.value : "AI_FIRST";
    return (
      <select
        className="routing-select routing-select-val"
        data-testid="condition-value"
        aria-label={t("routing.value")}
        value={value}
        onChange={(event) => onChange(event.target.value as ChannelRoutingMode)}
      >
        {(["AI_FIRST", "HUMAN_ONLY", "RULE_BASED"] as const).map((mode) => (
          <option key={mode} value={mode}>{mode === "AI_FIRST" ? t("routing.mode_ai_first") : mode === "HUMAN_ONLY" ? t("routing.mode_human_only") : t("routing.mode_rule_based")}</option>
        ))}
      </select>
    );
  }

  const value = Array.isArray(condition.value) ? condition.value.join(", ") : String(condition.value ?? "");
  const listOperator = condition.op === "contains_any" || condition.op === "contains_all";
  return (
    <input
      className="routing-input-val"
      data-testid="condition-value"
      aria-label={t("routing.value")}
      value={value}
      placeholder={listOperator ? t("routing.comma_separated_phrases") : t("routing.value")}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function ConditionLeaf({ condition, onChange, onRemove }: {
  condition: RuleCondition;
  onChange: (condition: RuleCondition) => void;
  onRemove?: () => void;
}) {
  const operators = operatorsForField(condition.field);
  const field = condition.field as ConditionFieldKey;
  const operatorOptions = CONDITION_OPERATOR_OPTIONS.filter(([value]) => operators.includes(value));

  function changeField(nextField: ConditionFieldKey) {
    onChange(conditionForField(condition, nextField));
  }

  return (
    <div className="routing-condition-row">
      <select
        className="routing-select"
        data-testid="condition-field"
        aria-label={t("routing.conditions_title")}
        value={field}
        onChange={(event) => changeField(event.target.value as ConditionFieldKey)}
      >
        {CONDITION_FIELD_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>{conditionFieldTitle(value)}</option>
        ))}
      </select>
      <select
        className="routing-select routing-select-op"
        data-testid="condition-operator"
        aria-label={t("routing.value")}
        value={condition.op}
        onChange={(event) => onChange({ ...condition, op: event.target.value as RuleCondition["op"] })}
      >
        {operatorOptions.map(([value, label]) => (
          <option key={value} value={value}>{conditionOperatorTitle(value)}</option>
        ))}
      </select>
      <ConditionValue condition={condition} onChange={(value) => onChange(updateConditionValue(condition, value))} />
      {onRemove && (
        <IconButton
          icon="trash"
          label={t("routing.remove_condition")}
          onClick={onRemove}
          bare
        />
      )}
    </div>
  );
}

export function ConditionEditor({ value, onChange, onRemove, depth = 0 }: Props) {
  if (isRuleCondition(value)) {
    return <ConditionLeaf condition={value} onChange={onChange} onRemove={onRemove} />;
  }

  const kind = groupKind(value);
  if (kind === null) {
    return (
      <div className="routing-condition-empty">
        <span>{t("routing.no_conditions_always_matches")}</span>
        <Button variant="secondary" icon="plus" onClick={() => onChange(defaultConditionTree())}>
          {t("routing.add_condition")}
        </Button>
        {onRemove && (
          <IconButton icon="trash" label={t("routing.remove_condition")} onClick={onRemove} bare />
        )}
      </div>
    );
  }

  const children = groupChildren(value, kind);
  return (
    <div className={`routing-condition-node routing-condition-node-${kind}`} data-depth={depth}>
      <div className="routing-condition-node-head">
        <LogicButtons kind={kind} onChange={(next) => onChange(changeGroupKind(value, next))} />
        {onRemove && (
          <IconButton icon="trash" label={t("routing.remove_condition")} onClick={onRemove} bare />
        )}
      </div>
      {kind === "not" ? (
        <div className="routing-condition-not-child">
          <ConditionEditor
            value={"not" in value ? value.not : defaultCondition()}
            depth={depth + 1}
            onChange={(child) => onChange({ not: child })}
          />
        </div>
      ) : (
        <>
          <div className="routing-conditions-list">
            {children.map((child, index) => (
              <ConditionEditor
                key={index}
                value={child}
                depth={depth + 1}
                onChange={(next) => onChange(replaceChild(value, kind, index, next))}
                onRemove={() => {
                  const next = children.filter((_, childIndex) => childIndex !== index);
                  onChange(next.length > 0 ? (kind === "all" ? { all: next } : { any: next }) : {});
                }}
              />
            ))}
          </div>
          <div className="routing-condition-add-row">
            <Button variant="secondary" icon="plus" onClick={() => onChange(kind === "all" ? { all: [...children, defaultCondition()] } : { any: [...children, defaultCondition()] })}>
              {t("routing.add_condition")}
            </Button>
            <Button variant="secondary" onClick={() => onChange(kind === "all" ? { all: [...children, { not: defaultCondition() }] } : { any: [...children, { not: defaultCondition() }] })}>
              {t("routing.add_not_condition")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
