"""Добавление типов уведомлений для модуля заявок (Helpdesk)."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0014_new_dialog_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='type',
            field=models.CharField(
                choices=[
                    ('NEW_DIALOG', 'Новый диалог'),
                    ('OPERATOR_REQUESTED', 'Клиент запросил оператора'),
                    ('DIALOG_NEW_MESSAGE', 'Новое сообщение в моём диалоге'),
                    ('DIALOG_ASSIGNED', 'Диалог назначили на меня'),
                    ('DIALOG_WAITING_LONG', 'Диалог долго ждёт человека'),
                    ('AI_STOPPED', 'AI остановлен ошибкой или лимитом'),
                    ('TICKET_NEW', 'Новая заявка'),
                    ('TICKET_ASSIGNED', 'Заявка назначена на меня'),
                    ('TICKET_STATUS_CHANGED', 'Изменился статус заявки'),
                    ('TICKET_CUSTOMER_REPLIED', 'Клиент ответил по заявке'),
                ],
                max_length=32,
            ),
        ),
    ]
