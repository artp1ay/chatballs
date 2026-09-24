from django.apps import AppConfig


class TicketsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "chatballs.tickets"
    verbose_name = "Heldesk"

    def ready(self) -> None:
        from chatballs.tickets import event_handlers  # noqa: F401

