# Offsetter.js — Полное руководство на русском

> **Версия:** 1.1.0 · **Зависимости:** нет · **Лицензия:** MIT

---

## Содержание

1. [Зачем нужен Offsetter](#1-зачем-нужен-offsetter)
2. [Как устроен стек слоёв](#2-как-устроен-стек-слоёв)
3. [Быстрый старт за 3 шага](#3-быстрый-старт-за-3-шага)
4. [Атрибуты разметки](#4-атрибуты-разметки)
5. [Генерируемые CSS-переменные](#5-генерируемые-css-переменные)
6. [CSS: как использовать переменные](#6-css-как-использовать-переменные)
7. [Медиа-запросы и адаптивность](#7-медиа-запросы-и-адаптивность)
8. [Фолбэк-значения в :root](#8-фолбэк-значения-в-root)
9. [JavaScript API](#9-javascript-api)
10. [Событие offsetter:change](#10-событие-offsetterchange)
11. [Опции инициализации](#11-опции-инициализации)
12. [Паттерн: нижняя кнопка / bottom-bar](#12-паттерн-нижняя-кнопка--bottom-bar)
13. [Паттерн: скрываемый промо-баннер](#13-паттерн-скрываемый-промо-баннер)
14. [Паттерн: scroll-spy навигация](#14-паттерн-scroll-spy-навигация)
15. [Паттерн: якорные ссылки](#15-паттерн-якорные-ссылки)
16. [Паттерн: sticky элементы внутри контента](#16-паттерн-sticky-элементы-внутри-контента)
17. [Работа с SPA (React, Vue)](#17-работа-с-spa-react-vue)
18. [Динамические слои (watchMutations)](#18-динамические-слои-watchmutations)
19. [Анимации и переходы высоты](#19-анимации-и-переходы-высоты)
20. [Отладка](#20-отладка)
21. [Чего Offsetter НЕ делает](#21-чего-offsetter-не-делает)
22. [Миграция с legacy-кода](#22-миграция-с-legacy-кода)
23. [Полный чеклист](#23-полный-чеклист)

---

## 1. Зачем нужен Offsetter

Когда на странице есть несколько sticky/fixed элементов — фиксированный хедер, промо-баннер, пил-нав — каждый следующий элемент должен знать суммарную высоту всего, что находится над ним. Это классическая проблема координации:

- Как `pill-nav` узнает, где заканчивается хедер?
- Как `scroll-margin-top` у секций узнает полную высоту стека?
- Что происходит, когда промо-баннер скрывается и высоты меняются?

**Наивный ответ** — захардкодить пиксели. Они сломаются при любом изменении дизайна.

**Правильный ответ** — Offsetter.js.

Offsetter измеряет каждый слой через `ResizeObserver`, вычисляет цепочку позиций (`top`, `bottom` для каждого слоя) и публикует результаты как CSS-переменные в `:root` через один тег `<style>`. CSS и JavaScript читают из этого единого контракта. Никаких захардкоженных пикселей, никакого поллинга, никаких циклических зависимостей.

---

## 2. Как устроен стек слоёв

Offsetter моделирует верхнюю часть вьюпорта как упорядоченный стек **слоёв**. Порядок в DOM определяет порядок в стеке — никакого ручного индекса не нужно.

```
┌──────────────────────────────┐ ← 0px
│  header          (56px)      │    --offsetter-header-top:      0px
│                              │    --offsetter-header-bottom:  56px
├──────────────────────────────┤ ← 56px
│  promo-banner    (36px)      │    --offsetter-promo-banner-top:    56px
│                              │    --offsetter-promo-banner-bottom: 92px
├──────────────────────────────┤ ← 92px
│  pill-nav        (46px)      │    --offsetter-pill-nav-top:    92px
│                              │    --offsetter-pill-nav-bottom: 138px
├──────────────────────────────┤ ← 138px
│  контент страницы            │
│  scroll-margin-top: 158px ←──┼── --offsetter-scroll-margin (138 + 20 буфер)
```

**Формула для каждого слоя:**

```
layer[i].top    = layer[i-1].bottom   (для layer[0].top = 0)
layer[i].bottom = layer[i].top + layer[i].height
```

Это устраняет циклические зависимости: `top` каждого слоя вычисляется только из слоя выше.

---

## 3. Быстрый старт за 3 шага

### Шаг 1 — Разметить HTML

Добавьте `data-offsetter-role` к каждому sticky/fixed элементу **в порядке DOM сверху вниз**:

```html
<header data-offsetter-role="header">...</header>
<div    data-offsetter-role="promo-banner">...</div>
<nav    data-offsetter-role="pill-nav">...</nav>
```

### Шаг 2 — Использовать переменные в CSS

```css
[data-offsetter-role="pill-nav"] {
    position: sticky;
    top: var(--offsetter-pill-nav-top, 0px);
}

[data-offsetter-anchor] {
    scroll-margin-top: var(--offsetter-scroll-margin, 80px);
}
```

### Шаг 3 — Подключить скрипт

```html
<script src="Offsetter.js" defer></script>
```

Всё. Автоинициализация сработает сама на `DOMContentLoaded`.

---

## 4. Атрибуты разметки

### `data-offsetter-role="<role>"`

Регистрирует элемент как слой стека. Имя роли становится частью CSS-переменных.

**Правила именования:**
- Только строчные буквы, цифры и дефис: `lowercase-kebab-case`
- Порядок в DOM = порядок в стеке, индекс указывать не нужно
- Любые недопустимые символы автоматически убираются из имён переменных

```html
<!-- ✅ Правильно -->
<header data-offsetter-role="header">...</header>
<div    data-offsetter-role="promo-banner">...</div>
<nav    data-offsetter-role="pill-nav">...</nav>

<!-- ❌ Неправильно — DOM-порядок не совпадает с визуальным -->
<nav    data-offsetter-role="pill-nav">...</nav>
<header data-offsetter-role="header">...</header>
```

---

### `data-offsetter-exclude`

Элемент **отслеживается** (его переменные пишутся), но его высота **не прибавляется** к `--offsetter-total` и не сдвигает слои ниже.

**Когда использовать:** для элементов вне верхнего стека — например, sticky-кнопка внизу экрана.

```html
<div data-offsetter-role="bottom-bar" data-offsetter-exclude>
    <button>Купить</button>
</div>
```

Offsetter создаст переменную `--offsetter-bottom-bar-height`, но не изменит `--offsetter-total` и `top` других слоёв.

---

### `data-offsetter-anchor`

**Семантический маркер для CSS** — Offsetter.js его не обрабатывает. Служит CSS-хуком для секций, которые являются якорными целями скролла.

```html
<section id="details" data-offsetter-anchor data-spy-section>...</section>
<section id="reviews" data-offsetter-anchor data-spy-section>...</section>
```

```css
[data-offsetter-anchor] {
    scroll-margin-top: var(--offsetter-scroll-margin, 80px);
}
```

---

## 5. Генерируемые CSS-переменные

### Переменные на каждый слой

Для каждого `data-offsetter-role="<role>"` генерируются три переменные:

| Переменная | Значение |
|---|---|
| `--offsetter-<role>-height` | Текущий `offsetHeight` элемента в px |
| `--offsetter-<role>-top` | Где этот слой прилипает (сумма высот слоёв выше) |
| `--offsetter-<role>-bottom` | Где начинается контент под этим слоем (`top + height`) |

### Глобальные переменные

| Переменная | Значение |
|---|---|
| `--offsetter-total` | Сумма высот всех невыключенных слоёв |
| `--offsetter-scroll-margin` | `total + spyBuffer` — для `scroll-margin-top` у якорных секций |

### Пример сгенерированных переменных

```css
/* Что Offsetter записывает в <style> при стеке header + promo + pill-nav */
:root {
    --offsetter-header-height:        56px;
    --offsetter-header-top:            0px;
    --offsetter-header-bottom:        56px;

    --offsetter-promo-banner-height:  36px;
    --offsetter-promo-banner-top:     56px;
    --offsetter-promo-banner-bottom:  92px;

    --offsetter-pill-nav-height:      46px;
    --offsetter-pill-nav-top:         92px;
    --offsetter-pill-nav-bottom:     138px;

    --offsetter-total:               138px;
    --offsetter-scroll-margin:       158px;  /* 138 + 20 буфер */

    /* excluded элементы */
    --offsetter-bottom-bar-height:    56px;  /* не влияет на total */
}
```

---

## 6. CSS: как использовать переменные

### Какую переменную выбрать

Не каждый элемент должен использовать `--offsetter-total`. Выбирайте переменную, которая соответствует вашей задаче:

| Задача | Переменная |
|---|---|
| Sticky прямо под хедером | `var(--offsetter-header-bottom)` |
| Sticky под хедером + промо | `var(--offsetter-promo-banner-bottom)` |
| Sticky под всем стеком | `var(--offsetter-pill-nav-bottom)` или `var(--offsetter-total)` |
| Отступ body под fixed хедером | `var(--offsetter-header-bottom)` |
| `scroll-margin-top` у якорей | `var(--offsetter-scroll-margin)` |
| Padding снизу под bottom-bar | `var(--offsetter-bottom-bar-height)` |

### Полный CSS-пример

```css
/* ── Fixed хедер ───────────────────────────────────────── */
[data-offsetter-role="header"] {
    position: fixed;
    inset: 0 0 auto 0;   /* top:0, right:0, left:0 — fixed по умолчанию */
    z-index: 300;
    /* top: не нужен — fixed всегда от 0 */
}

/* Компенсация контента под fixed хедером */
body {
    padding-top: var(--offsetter-header-bottom, 56px);
}

/* ── Sticky промо-баннер ────────────────────────────────── */
[data-offsetter-role="promo-banner"] {
    position: sticky;
    top: var(--offsetter-promo-banner-top, 56px);
    z-index: 200;
}

/* ── Sticky пил-нав ─────────────────────────────────────── */
[data-offsetter-role="pill-nav"] {
    position: sticky;
    top: var(--offsetter-pill-nav-top, 92px);
    z-index: 100;
}

/* ── Sticky галерея — только под хедером, не под пил-навом */
.product-gallery {
    position: sticky;
    top: var(--offsetter-header-bottom, 56px); /* намеренно не --total */
}

/* ── Sticky сайдбар — под всем стеком ──────────────────── */
.sticky-sidebar {
    position: sticky;
    top: var(--offsetter-pill-nav-bottom, 138px);
}

/* ── Якорные секции ─────────────────────────────────────── */
[data-offsetter-anchor] {
    scroll-margin-top: var(--offsetter-scroll-margin, 80px);
}

/* ── Bottom-bar отступ снизу ────────────────────────────── */
body.has-bottom-bar {
    padding-bottom: var(--offsetter-bottom-bar-height, 0px);
}
```

> **Важно:** Offsetter только **пишет переменные** в `:root`. Он не устанавливает `position`, `top` или любое другое CSS-свойство на наблюдаемых элементах. Это всегда на вашей стороне в CSS.

---

## 7. Медиа-запросы и адаптивность

Offsetter **не знает про медиа-запросы**. Он всегда измеряет высоту элементов и всегда пишет переменные — вне зависимости от брейкпоинта. Решение о том, применять переменную или нет, остаётся за вами в CSS.

### Хедер fixed только на десктопе

```css
/* Мобайл: хедер не fixed — отступ не нужен */
body {
    padding-top: 0;
}

/* Десктоп: хедер fixed — берём bottom из Offsetter */
@media (min-width: 992px) {
    body {
        padding-top: var(--offsetter-header-bottom, 0px);
    }
}
```

### Пил-нав sticky только на десктопе

```css
/* Мобайл: статичный */
[data-offsetter-role="pill-nav"] {
    position: static;
}

/* Десктоп: sticky с автоматическим top */
@media (min-width: 992px) {
    [data-offsetter-role="pill-nav"] {
        position: sticky;
        top: var(--offsetter-pill-nav-top, 0px);
    }
}
```

### Поведение при скрытых элементах

Если элемент скрыт через `display: none` — `offsetHeight` вернёт `0`. Offsetter запишет `0px` в переменную. Это корректное поведение: переменные есть, но содержат нулевые значения, что не сломает вёрстку.

| Ситуация | Что делает Offsetter | Что делает программист |
|---|---|---|
| Хедер fixed только на десктопе | Всегда пишет `--offsetter-header-bottom` | Применяет переменную только в `@media` |
| Элемент `display: none` | Измеряет `0px`, пишет `0px` | Ничего не нужно |
| Sticky только на десктопе | Всегда пишет переменную | `position: sticky` только в `@media` |

---

## 8. Фолбэк-значения в :root

До первого запуска Offsetter (первый кадр, отключённый JS) вёрстка должна работать на приближённых значениях. Объявите их в `:root` — Offsetter перезапишет их при инициализации.

```css
:root {
    /* Фолбэки — приближённые реальные высоты */
    --offsetter-header-height:        56px;
    --offsetter-header-top:            0px;
    --offsetter-header-bottom:        56px;

    --offsetter-promo-banner-height:  36px;
    --offsetter-promo-banner-top:     56px;
    --offsetter-promo-banner-bottom:  92px;

    --offsetter-pill-nav-height:      46px;
    --offsetter-pill-nav-top:         92px;
    --offsetter-pill-nav-bottom:     138px;

    --offsetter-total:               138px;
    --offsetter-scroll-margin:       158px;

    /* Excluded элементы */
    --offsetter-bottom-bar-height:     0px;
}
```

> Фолбэки существуют только для предотвращения вспышки вёрстки на первом рендере. Как только Offsetter загружается — он перезаписывает их реальными значениями.

Также всегда указывайте фолбэк внутри `var()` как страховку:

```css
/* ✅ — если переменная ещё не записана, используется 56px */
top: var(--offsetter-pill-nav-top, 56px);

/* ❌ — если переменная пустая, top: не определён */
top: var(--offsetter-pill-nav-top);
```

---

## 9. JavaScript API

| Метод | Возвращает | Описание |
|---|---|---|
| `Offsetter.init(options?)` | — | Инициализация. Вызывается автоматически. |
| `Offsetter.recalculate()` | — | Принудительный синхронный пересчёт. |
| `Offsetter.getLayer('role')` | `LayerEntry \| null` | Данные по конкретному слою. |
| `Offsetter.getTotal()` | `number` | Текущее значение `--offsetter-total` в px. |
| `Offsetter.getScrollMargin()` | `number` | Текущее значение `--offsetter-scroll-margin` в px. |
| `Offsetter.destroy()` | — | Отключить все наблюдатели, удалить `<style>`. |
| `Offsetter.debug()` | — | Таблица состояния в консоль. |

### LayerEntry — объект слоя

```js
const layer = Offsetter.getLayer('pill-nav');
// layer = {
//     element:  HTMLElement,
//     height:   46,
//     top:      92,
//     bottom:   138,
//     excluded: false
// }

if (layer) {
    console.log(`pill-nav прилипает на ${layer.top}px`);
    console.log(`контент начинается с ${layer.bottom}px`);
}
```

### Примеры использования API

```js
// Читать один раз при инициализации
const threshold = Offsetter.getScrollMargin(); // 158

// Получить высоту bottom-bar для JS-логики
const barH = Offsetter.getLayer('bottom-bar')?.height ?? 0;
document.querySelector('.last-section').style.paddingBottom = barH + 'px';

// Принудительный пересчёт после CSS-анимации (не transition)
header.addEventListener('animationend', () => Offsetter.recalculate());
```

---

## 10. Событие offsetter:change

После каждого пересчёта на `document` диспатчится событие `offsetter:change`.

```js
document.addEventListener('offsetter:change', ({ detail }) => {
    // detail.total        — number, текущий --offsetter-total
    // detail.scrollMargin — number, текущий --offsetter-scroll-margin
    // detail.layers       — Map<string, LayerEntry>

    console.log('Высота стека:', detail.total);
    console.log('scroll-margin:', detail.scrollMargin);

    // Пример: обновить порог scroll-spy при изменении стека
    spyThreshold = detail.scrollMargin;
});
```

**Когда это нужно:** синхронизация JS-виджетов (scroll-spy, анимации, слайдеры) без поллинга и жёсткой связанности. Событие гарантирует, что ваш код видит актуальные значения сразу после каждого пересчёта.

---

## 11. Опции инициализации

```js
Offsetter.init({
    spyBuffer:         20,              // px добавляется к --offsetter-scroll-margin
    styleId:           'offsetter-vars',// id генерируемого <style> тега
    watchMutations:    true,            // MutationObserver для динамических слоёв
    debug:             false,           // логировать пересчёты в консоль
    statePollInterval: 1000,            // мс — умный поллер (0 = выключен)
    pollingInterval:   0,               // мс — слепой пересчёт каждые N мс (0 = выкл)
});
```

### Описание опций

**`spyBuffer`** — дополнительный отступ сверх суммарной высоты стека. Нужен, чтобы якорные секции не приземлялись точно на границу sticky-нава, а с небольшим зазором. Значение по умолчанию 20px подходит для большинства дизайнов.

**`watchMutations`** — MutationObserver следит за DOM и автоматически регистрирует/снимает слои при динамическом добавлении/удалении элементов с `data-offsetter-role`.

**`statePollInterval`** — умный поллер, который сравнивает высоты слоёв с предыдущим состоянием и вызывает `recalculate()` только при реальных изменениях. Нужен как страховка от ситуаций, которые ResizeObserver не ловит (например, изменение контента без изменения DOM).

**`pollingInterval`** — слепой пересчёт каждые N мс вне зависимости от изменений. Не рекомендуется для production. Предпочитайте `statePollInterval`.

---

## 12. Паттерн: нижняя кнопка / bottom-bar

Нижняя фиксированная кнопка находится вне верхнего стека — её нужно отслеживать для получения высоты, но не включать в `--offsetter-total`.

### HTML

```html
<!-- В верхнем стеке — без exclude -->
<header data-offsetter-role="header">...</header>
<nav    data-offsetter-role="pill-nav">...</nav>

<!-- Нижняя кнопка — excluded -->
<div id="bottom-bar"
     data-offsetter-role="bottom-bar"
     data-offsetter-exclude>
    <button class="btn-buy">Купить — 2 990 ₽</button>
</div>
```

### CSS

```css
[data-offsetter-role="bottom-bar"] {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 500;
    /* visibility управляется JS-классом */
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;
}

[data-offsetter-role="bottom-bar"].is-visible {
    opacity: 1;
    pointer-events: auto;
}

/* Отступ снизу, чтобы контент не скрывался под кнопкой */
body.has-bottom-bar {
    padding-bottom: var(--offsetter-bottom-bar-height, 0px);
}
```

### JavaScript

```js
const bottomBar = document.getElementById('bottom-bar');
const gallery   = document.querySelector('.product-gallery');

function updateBottomBar() {
    // Показываем кнопку, когда галерея ушла выше вьюпорта
    const past = gallery.getBoundingClientRect().bottom < 0;
    bottomBar.classList.toggle('is-visible', past);
    document.body.classList.toggle('has-bottom-bar', past);
}

window.addEventListener('scroll', updateBottomBar, { passive: true });
```

> `data-offsetter-exclude` позволяет получить переменную `--offsetter-bottom-bar-height` в CSS, не затронув `--offsetter-total` и `top` всех слоёв верхнего стека.

---

## 13. Паттерн: скрываемый промо-баннер

Когда пользователь закрывает баннер, пил-нав должен автоматически подняться. Offsetter делает это через `ResizeObserver` (следит за изменением высоты в процессе анимации) и `transitionend` (финальный пересчёт).

### HTML

```html
<header data-offsetter-role="header">...</header>

<div class="promo-banner" data-offsetter-role="promo-banner">
    <p>Скидка 20% до конца недели 🎉</p>
    <button id="promo-dismiss">✕</button>
</div>

<nav data-offsetter-role="pill-nav">...</nav>
```

### CSS

```css
[data-offsetter-role="promo-banner"] {
    position: sticky;
    top: var(--offsetter-promo-banner-top, 56px);

    /* Анимация через max-height — меняет offsetHeight */
    max-height: 100px;
    overflow: hidden;
    transition: max-height 0.35s ease, padding 0.35s ease;
}

[data-offsetter-role="promo-banner"].is-dismissed {
    max-height: 0;
    padding-block: 0;
}
```

### JavaScript

```js
document.getElementById('promo-dismiss').addEventListener('click', () => {
    document.querySelector('[data-offsetter-role="promo-banner"]')
        .classList.add('is-dismissed');

    // ❌ НЕ нужно вызывать Offsetter.recalculate() вручную —
    // ResizeObserver ловит изменения во время анимации,
    // transitionend ловит финальное состояние.
});
```

> **Ключевое условие:** анимация должна изменять `offsetHeight` элемента. `max-height` — правильный выбор. `opacity` или `transform` — нет, они не меняют высоту.

**Когда всё же нужен ручной `Offsetter.recalculate()`:**

```js
// CSS animations (не transitions) не запускают transitionend
header.addEventListener('animationend', () => Offsetter.recalculate());

// Или если нужно обновить сразу после добавления класса без анимации
element.classList.add('collapsed');
Offsetter.recalculate();
```

---

## 14. Паттерн: scroll-spy навигация

Scroll-spy должен использовать живое значение из Offsetter, а не захардкоженный порог.

```js
// Читаем один раз при старте
let spyThreshold = (window.Offsetter?.getScrollMargin?.()) ?? 80;

// Обновляем реактивно при каждом изменении стека
// (промо закрыт, хедер схлопнулся, резайз)
document.addEventListener('offsetter:change', ({ detail }) => {
    spyThreshold = detail.scrollMargin;
});

// Scroll-spy с живым порогом
const sections = document.querySelectorAll('[data-spy-section]');

window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.getBoundingClientRect().top + window.scrollY;
        if (window.scrollY >= sectionTop - spyThreshold) {
            current = section.id;
        }
    });

    document.querySelectorAll('[data-pill]').forEach(pill => {
        pill.classList.toggle('is-active', pill.dataset.pillTarget === current);
    });
}, { passive: true });
```

---

## 15. Паттерн: якорные ссылки

Используйте нативный `scrollIntoView` — браузер сам применяет `scroll-margin-top`. Никакого ручного вычитания отступов не нужно.

### HTML

```html
<!-- Якорная секция -->
<section id="reviews" data-offsetter-anchor data-spy-section>
    <h2>Отзывы</h2>
    ...
</section>
```

### CSS

```css
/* Один раз — и всё работает для всех якорей */
[data-offsetter-anchor] {
    scroll-margin-top: var(--offsetter-scroll-margin, 80px);
}
```

### JavaScript

```js
// ✅ Правильно — браузер применяет scroll-margin-top автоматически
document.querySelectorAll('[data-pill]').forEach(pill => {
    pill.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById(pill.dataset.pillTarget)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// ❌ Неправильно — вручную вычитать отступ
window.scrollTo({
    top: section.offsetTop - 138, // устареет при первом изменении стека
    behavior: 'smooth'
});
```

---

## 16. Паттерн: sticky элементы внутри контента

Иногда элемент должен прилипать не к полному стеку, а только к части. Это **намеренный выбор** переменной, а не ошибка.

```css
/* Sticky галерея — только под хедером.
   Намеренно перекрывает pill-nav при скролле. */
.product-gallery {
    position: sticky;
    top: var(--offsetter-header-bottom, 56px); /* НЕ --offsetter-total */
}

/* Sticky сайдбар — под всем стеком */
.sticky-sidebar {
    position: sticky;
    top: var(--offsetter-pill-nav-bottom, 138px);
}

/* Sticky таблица заголовков — под хедером + промо */
.table-header {
    position: sticky;
    top: var(--offsetter-promo-banner-bottom, 92px);
}
```

---

## 17. Работа с SPA (React, Vue)

### React

```jsx
import { useEffect } from 'react';

function App() {
    useEffect(() => {
        // Инициализируем при монтировании компонента
        if (window.Offsetter) {
            window.Offsetter.init();
        }

        // Очищаем при размонтировании
        return () => {
            window.Offsetter?.destroy();
        };
    }, []);

    return (
        <>
            <header data-offsetter-role="header">...</header>
            <nav data-offsetter-role="pill-nav">...</nav>
            <main>...</main>
        </>
    );
}
```

### Vue (Composition API)

```js
import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
    window.Offsetter?.init();
});

onUnmounted(() => {
    window.Offsetter?.destroy();
});
```

### После `destroy()` можно снова вызвать `init()`

```js
// Переход на другой роут в SPA
router.afterEach(() => {
    window.Offsetter?.destroy();
    nextTick(() => window.Offsetter?.init());
});
```

---

## 18. Динамические слои (watchMutations)

При `watchMutations: true` (по умолчанию) MutationObserver автоматически регистрирует слои, добавленные в DOM после инициализации, и снимает удалённые.

```js
// Слой добавлен динамически → MutationObserver его обнаруживает
// → scanDOM() перезапускается → recalculate() вызывается автоматически
const banner = document.createElement('div');
banner.setAttribute('data-offsetter-role', 'sale-banner');
banner.textContent = 'Распродажа!';
document.querySelector('header').after(banner);
// Больше ничего не нужно — Offsetter сам перестроит стек
```

Если динамические слои не нужны — можно отключить для экономии ресурсов:

```js
Offsetter.init({ watchMutations: false });

// Тогда при ручных изменениях DOM — вызывать вручную
Offsetter.recalculate();
```

---

## 19. Анимации и переходы высоты

### Что Offsetter отслеживает автоматически

| Тип изменения | Как Offsetter узнаёт |
|---|---|
| Изменение высоты через `max-height` transition | ResizeObserver (во время анимации) + transitionend (финал) |
| Изменение контента (текст, изображения) | ResizeObserver |
| Добавление/удаление элементов внутри слоя | ResizeObserver |
| Изменение шрифтов (web fonts) | ResizeObserver |

### Когда нужен ручной `recalculate()`

```js
// CSS animations (не transitions) — transitionend не стреляет
element.addEventListener('animationend', () => Offsetter.recalculate());

// Если watchMutations: false и вы вручную добавили/убрали слой
banner.remove();
Offsetter.recalculate();

// После classList изменения, не затрагивающего offsetHeight
// (например, изменение только цвета, opacity)
// — recalculate() НЕ нужен, высота не изменилась
```

---

## 20. Отладка

### `Offsetter.debug()` в DevTools

Откройте DevTools Console и вызовите:

```js
Offsetter.debug()
```

Пример вывода:

```
┌──────────────────┬──────────┬────────┬──────────┬──────────┐
│ role             │ height   │ top    │ bottom   │ excluded │
├──────────────────┼──────────┼────────┼──────────┼──────────┤
│ header           │ 56px     │ 0px    │ 56px     │ false    │
│ promo-banner     │ 36px     │ 56px   │ 92px     │ false    │
│ pill-nav         │ 46px     │ 92px   │ 138px    │ false    │
│ bottom-bar       │ 56px     │ 0px    │ 56px     │ true     │
├──────────────────┴──────────┴────────┴──────────┴──────────┤
│ --offsetter-total:          138px                          │
│ --offsetter-scroll-margin:  158px                          │
└────────────────────────────────────────────────────────────┘
```

### Включить логирование пересчётов

```js
Offsetter.init({ debug: true });
// Теперь каждый recalculate() будет логироваться в консоль
```

### Проверить конкретный слой

```js
Offsetter.getLayer('pill-nav');
// → { element: nav, height: 46, top: 92, bottom: 138, excluded: false }

Offsetter.getTotal();        // → 138
Offsetter.getScrollMargin(); // → 158
```

### Проверить живое обновление

1. Откройте DevTools → вкладка Elements
2. Закройте промо-баннер
3. Следите за изменением `--offsetter-pill-nav-top` в `:root` — оно должно уменьшиться

---

## 21. Чего Offsetter НЕ делает

Offsetter **намеренно** не выполняет следующее — не пытайтесь использовать его для этих задач:

- **Не устанавливает** `position`, `top`, `z-index` или любое CSS-свойство на наблюдаемых элементах. Он только пишет кастомные свойства в `:root`.
- **Не управляет горизонтальными** отступами.
- **Не поддерживает** несколько независимых sticky-стеков на одной странице.
- **Не знает** ничего о структуре страницы, кроме высот элементов.
- **Не управляет** bottom-sticky барами напрямую — используйте `data-offsetter-exclude`.

---

## 22. Миграция с legacy-кода

### Каталог legacy-паттернов и их замена

#### ❌ Захардкоженные пиксели в CSS

```css
/* БЫЛО — ломается при любом изменении хедера */
.pill-nav { position: sticky; top: 56px; }
section   { scroll-margin-top: 110px; }
```

```css
/* СТАЛО */
.pill-nav { position: sticky; top: var(--offsetter-pill-nav-top, 56px); }
[data-offsetter-anchor] { scroll-margin-top: var(--offsetter-scroll-margin, 80px); }
```

---

#### ❌ JavaScript читает высоту и устанавливает top вручную

```js
// БЫЛО — читается один раз, устаревает при любом ресайзе
const headerH = document.querySelector('.header').offsetHeight;
document.querySelector('.pill-nav').style.top = headerH + 'px';
```

```js
// СТАЛО — удалите этот код полностью.
// CSS-переменные и Offsetter делают это лучше.
```

---

#### ❌ Захардкоженный порог в scroll-spy

```js
// БЫЛО — число 150 никак не связано с реальной высотой стека
if (window.scrollY >= section.offsetTop - 150) { ... }
```

```js
// СТАЛО
let spyThreshold = Offsetter.getScrollMargin();
document.addEventListener('offsetter:change', ({ detail }) => {
    spyThreshold = detail.scrollMargin;
});
if (window.scrollY >= section.offsetTop - spyThreshold) { ... }
```

---

#### ❌ setTimeout для чтения высоты

```js
// БЫЛО — гонка условий под маскировкой таймера
setTimeout(() => {
    const h = header.offsetHeight;
    document.body.style.paddingTop = h + 'px';
}, 300);
```

```js
// СТАЛО — удалите. Offsetter слушает window load сам.
```

---

#### ❌ setInterval поллер

```js
// БЫЛО — всегда пишет в DOM, даже если ничего не изменилось
setInterval(() => {
    nav.style.top = header.offsetHeight + 'px';
}, 500);
```

```js
// СТАЛО — удалите. ResizeObserver реагирует только на реальные изменения.
```

---

#### ❌ window.resize пересчёт

```js
// БЫЛО — стреляет при горизонтальном ресайзе тоже
window.addEventListener('resize', () => { updateAllTheOffsets(); });
```

```js
// СТАЛО — удалите. ResizeObserver следит за конкретными элементами,
// не за окном целиком.
```

---

#### ❌ Ручной setProperty одной переменной

```js
// БЫЛО — частичное решение без цепочки и без событий
function updateVars() {
    const h = header.offsetHeight;
    document.documentElement.style.setProperty('--header-height', h + 'px');
    // pill-nav.top никогда не обновляется
}
window.addEventListener('resize', updateVars);
```

```js
// СТАЛО — удалите. Это именно то, что Offsetter делает корректно и полно.
```

---

### Полный дифф миграции

**HTML — до и после**

```html
<!-- БЫЛО -->
<header class="site-header">...</header>
<div class="promo-banner" id="promo">...</div>
<nav class="pill-nav">...</nav>
<section id="details">...</section>

<!-- СТАЛО -->
<header class="site-header" data-offsetter-role="header">...</header>
<div class="promo-banner" data-offsetter-role="promo-banner">...</div>
<nav class="pill-nav" data-offsetter-role="pill-nav">...</nav>
<section id="details" data-offsetter-anchor data-spy-section>...</section>
```

**CSS — до и после**

```css
/* БЫЛО */
body          { padding-top: 56px; }
.promo-banner { position: sticky; top: 56px; }
.pill-nav     { position: sticky; top: 92px; }
section       { scroll-margin-top: 110px; }

/* СТАЛО */
body          { padding-top: var(--offsetter-header-bottom, 56px); }
.promo-banner { position: sticky; top: var(--offsetter-promo-banner-top, 56px); }
.pill-nav     { position: sticky; top: var(--offsetter-pill-nav-top, 92px); }
[data-offsetter-anchor] { scroll-margin-top: var(--offsetter-scroll-margin, 80px); }
```

**JavaScript — до и после**

```js
// БЫЛО
const headerH = document.querySelector('.site-header').offsetHeight;
document.querySelector('.pill-nav').style.top = headerH + 'px';

window.addEventListener('resize', () => {
    const h = document.querySelector('.site-header').offsetHeight;
    document.querySelector('.pill-nav').style.top = h + 'px';
});

window.addEventListener('scroll', () => {
    if (window.scrollY >= document.getElementById('details').offsetTop - 150) {
        // activate
    }
});

document.getElementById('promo-dismiss').addEventListener('click', () => {
    document.getElementById('promo').style.display = 'none';
    // pill-nav.top теперь неверный — никто его не обновляет
});
```

```js
// СТАЛО
let spyThreshold = Offsetter.getScrollMargin();

document.addEventListener('offsetter:change', ({ detail }) => {
    spyThreshold = detail.scrollMargin;
});

window.addEventListener('scroll', () => {
    if (window.scrollY >= document.getElementById('details').offsetTop - spyThreshold) {
        // activate — порог всегда актуален
    }
}, { passive: true });

document.getElementById('promo-dismiss').addEventListener('click', () => {
    document.querySelector('[data-offsetter-role="promo-banner"]')
        .classList.add('is-dismissed');
    // pill-nav автоматически сдвинется
});
```

**Скрипты**

```html
<!-- БЫЛО -->
<script src="app.js"></script>

<!-- СТАЛО — Offsetter должен идти первым -->
<script src="Offsetter.js" defer></script>
<script src="app.js" defer></script>
```

---

## 23. Полный чеклист

### HTML

- [ ] Каждый top-sticky/fixed элемент имеет `data-offsetter-role="<role>"`
- [ ] Порядок в DOM совпадает с визуальным порядком сверху вниз
- [ ] Нижняя кнопка / bottom-bar имеет `data-offsetter-exclude`
- [ ] Якорные секции помечены `data-offsetter-anchor`

### CSS

- [ ] Фолбэки объявлены в `:root` с приближёнными реальными значениями
- [ ] `body { padding-top: var(--offsetter-header-bottom) }` для fixed хедера
- [ ] Все sticky-слои используют `var(--offsetter-<role>-top)`, а не захардкоженные px
- [ ] `[data-offsetter-anchor] { scroll-margin-top: var(--offsetter-scroll-margin) }`
- [ ] Медиа-запросы оборачивают применение переменных там, где нужно
- [ ] Все `var()` имеют фолбэк-значение как второй аргумент

### JavaScript

- [ ] `Offsetter.js` подключён **до** любого скрипта, использующего `window.Offsetter`
- [ ] Порог scroll-spy читается из `Offsetter.getScrollMargin()`, а не захардкоден
- [ ] Обновление threshold подписано на `offsetter:change`
- [ ] Smooth scroll использует `scrollIntoView()` — без ручного вычитания offset
- [ ] Промо-баннер скрывается через CSS `max-height` transition, не `display: none` сразу

### Очистка legacy

- [ ] Удалены все `setTimeout`/`rAF` для чтения высот
- [ ] Удалены все `element.style.top = px` сеттеры
- [ ] Удалены все `setInterval` поллеры позиций
- [ ] Удалены все `window.resize` листенеры для пересчёта отступов
- [ ] Удалены все `document.documentElement.style.setProperty('--header-height', ...)`

### Финальная проверка

- [ ] `Offsetter.debug()` в DevTools показывает корректные высоты и цепочку
- [ ] Закрытие промо — pill-nav автоматически сдвигается вверх
- [ ] Ресайз окна — все значения актуальны без перезагрузки
- [ ] Якорные ссылки скроллятся ровно под стек, не прячутся за него
