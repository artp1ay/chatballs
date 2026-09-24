# @chatballs/ui

Пакет `@chatballs/ui` представляет собой библиотеку переиспользуемых интерфейсных компонентов, хуков звонков/аудио и конфигураций темы платформы **Chatballs**, построенную на базе дизайн-системы **Consta UI** (`@consta/uikit`).

---

## Возможности пакета

- **Единая система темизации:** Поддержка светлой и тёмной тем через пресеты Consta UI (`presetGpnDefault`, `presetGpnDark`) с возможностью динамической инъекции брендовых CSS-переменных акцента.
- **Компоненты аудио- и видеосвязи:** Готовые экраны и контролы звонков (`CallView`, `AudioCallView`, `AudioCallWaveform`) с поддержкой WebRTC-сессий.
- **Аудио-эффекты и индикация:** Хуки воспроизведения системных звуков (`useAudioCue`, `useLoopingAudio`), расчёт формы звуковой волны (`VOICE_WAVE_BARS`, `voiceWaveHeights`).
- **Индикаторы состояния:** Анимированный компонент загрузки (`Loader`).
- **Локализация (i18n):** Встроенная поддержка русской и английской локализаций интерфейсных элементов звонков.

---

## Установка и подключение

Пакет входит в состав монорепозитория Chatballs (npm workspaces). Для использования в приложениях (`apps/internal-ui`, `apps/web-chat`):

```json
{
  "dependencies": {
    "@chatballs/ui": "*",
    "@consta/uikit": "^5.0.0"
  }
}
```

---

## Архитектура темы

Темизация в `@chatballs/ui` опирается на корневой провайдер `Theme` из `@consta/uikit/Theme` и семантические токены.

### Пример подключения темы

```tsx
import React, { useState } from 'react';
import { Theme, presetGpnDefault, presetGpnDark } from '@consta/uikit/Theme';

export const AppThemeWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark] = useState(false);
  const currentPreset = isDark ? presetGpnDark : presetGpnDefault;

  return (
    <Theme preset={currentPreset}>
      {children}
    </Theme>
  );
};
```

---

## Экспортируемые компоненты и примеры использования

### 1. Компонент аудио- и видеозвонка (`CallView`)

Полноэкранный или модальный компонент звонка, отображающий локальный и удаленный видеопотоки, статус соединения и элементы управления (микрофон, камера, завершение).

```tsx
import React from 'react';
import { CallView } from '@chatballs/ui';

export const ActiveCallModal: React.FC = () => {
  return (
    <CallView
      mode="operator"
      status="connected"
      clientName="Иван Смирнов"
      micEnabled={true}
      cameraEnabled={true}
      onToggleMic={() => console.log('Переключение микрофона')}
      onToggleCamera={() => console.log('Переключение камеры')}
      onHangup={() => console.log('Завершение звонка')}
    />
  );
};
```

### 2. Аудиовызов (`AudioCallView`)

Компактный компонент голосового звонка со встроенной визуализацией волны речи:

```tsx
import React from 'react';
import { AudioCallView } from '@chatballs/ui';

export const VoiceCallBar: React.FC = () => {
  return (
    <AudioCallView
      mode="operator"
      status="connected"
      clientName="Анна Васильева"
      micEnabled={true}
      durationSeconds={142}
      onToggleMic={() => {}}
      onHangup={() => {}}
    />
  );
};
```

### 3. Индикатор загрузки (`Loader`)

```tsx
import React from 'react';
import { Loader } from '@chatballs/ui';

export const LoadingState: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-l)' }}>
    <Loader />
  </div>
);
```

### 4. Хук WebRTC-сессии (`useCallRtcSession`)

Управляет жизненным циклом WebRTC-соединения, обменом SDP/ICE-кандидатами через WebSocket-сигналинг, трансляцией медиапотоков и детекцией сетевых проблем:

```tsx
import { useCallRtcSession } from '@chatballs/ui';

const {
  status,
  localStream,
  remoteStream,
  toggleMic,
  toggleCamera,
  hangup,
} = useCallRtcSession({
  callId: 'call-12345',
  signalUrl: '/api/v1/calls/signal',
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
});
```

---

## Правила композиции и чистоты стилей

- Все цвета должны использовать семантические токены Consta UI (`--color-bg-default`, `--color-typo-primary`, `--color-control-bg-primary` и др.).
- Отступы строго следуют шкале сетки 4px через CSS-переменные `--space-*` (`--space-xs`, `--space-s`, `--space-m`, `--space-l`).
- Запрещено использовать жестко закодированные размеры шрифтов; типографика формируется компонентом `Text` из `@consta/uikit/Text`.
- Запрещено использование библиотек и классов Ant Design (`antd`, `@ant-design/icons`, `.ant-*`).

---

## Скрипты разработки

- `npm run typecheck` — проверка типов TypeScript.
- `npm run test` — запуск модульных тестов Vitest.
