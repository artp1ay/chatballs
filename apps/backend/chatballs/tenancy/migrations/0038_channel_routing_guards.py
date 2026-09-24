"""RLS и cross-tenant guards для правил и расписания каналов."""

from django.db import migrations

TABLES = (
    "channels_channelroutingrule",
    "channels_channelbusinesshours",
)

FORWARD_RLS = """
ALTER TABLE {table} OWNER TO chatballs_schema;
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;
ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
REVOKE ALL ON {table} FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO chatballs_runtime_app;
GRANT ALL ON {table} TO chatballs_schema;
GRANT USAGE, SELECT ON SEQUENCE {table}_id_seq
    TO chatballs_runtime_app, chatballs_schema;
DROP POLICY IF EXISTS chatballs_tenant_isolation ON {table};
CREATE POLICY chatballs_tenant_isolation ON {table}
    FOR ALL TO chatballs_runtime_app
    USING (organization_id = chatballs.current_organization_id())
    WITH CHECK (organization_id = chatballs.current_organization_id());
DROP POLICY IF EXISTS chatballs_schema_access ON {table};
CREATE POLICY chatballs_schema_access ON {table}
    FOR ALL TO chatballs_schema USING (true) WITH CHECK (true);
"""

TRIGGERS = (
    (
        "c04_routing_rule_channel",
        "channels_channelroutingrule",
        "channels_channel",
        "channel_id",
    ),
    (
        "c04_routing_rule_group",
        "channels_channelroutingrule",
        "identity_employeegroup",
        "target_group_id",
    ),
    (
        "c04_business_hours_channel",
        "channels_channelbusinesshours",
        "channels_channel",
        "channel_id",
    ),
)


def _preflight_cross_tenant_rows(schema_editor) -> None:
    for name, child, parent, column in TRIGGERS:
        schema_editor.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM {child} AS child
                    JOIN {parent} AS parent ON parent.id = child.{column}
                    WHERE child.{column} IS NOT NULL
                      AND child.organization_id IS DISTINCT FROM parent.organization_id
                ) THEN
                    RAISE EXCEPTION 'cross-tenant rows in %.% (%)', '{child}', '{column}', '{name}';
                END IF;
            END $$;
            """
        )


def apply_guards(apps, schema_editor):
    _preflight_cross_tenant_rows(schema_editor)
    for table in TABLES:
        schema_editor.execute(FORWARD_RLS.format(table=table))
    for name, child, parent, column in TRIGGERS:
        schema_editor.execute(
            f"DROP TRIGGER IF EXISTS {name} ON {child}"
        )
        schema_editor.execute(
            f"CREATE CONSTRAINT TRIGGER {name} AFTER INSERT OR UPDATE ON {child} "
            "DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION "
            f"chatballs.enforce_tenant_fk('{parent}', '{column}')"
        )


def remove_guards(apps, schema_editor):
    for name, child, _parent, _column in TRIGGERS:
        schema_editor.execute(f"DROP TRIGGER IF EXISTS {name} ON {child}")
    for table in TABLES:
        schema_editor.execute(f"DROP POLICY IF EXISTS chatballs_tenant_isolation ON {table}")
        schema_editor.execute(f"DROP POLICY IF EXISTS chatballs_schema_access ON {table}")
        schema_editor.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        schema_editor.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
        schema_editor.execute(f"REVOKE ALL ON {table} FROM chatballs_runtime_app")
        schema_editor.execute(
            f"REVOKE ALL ON SEQUENCE {table}_id_seq FROM chatballs_runtime_app"
        )


class Migration(migrations.Migration):

    dependencies = [
        ("tenancy", "0037_queue_policy_guards"),
        ("channels", "0009_channel_routing"),
        ("conversations", "0027_contact_labels"),
    ]

    operations = [migrations.RunPython(apply_guards, remove_guards)]
