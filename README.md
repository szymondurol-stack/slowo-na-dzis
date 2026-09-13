# Słowo na dziś — v6

Gotowy projekt do wdrożenia na Vercel.

## Co działa

- automatyczne czytania dla wybranej daty,
- `Wczoraj / Dziś / Jutro`,
- data w URL: `/?date=2026-09-13`,
- zmiana wielkości tekstu z zapisem w przeglądarce,
- tryb ciemny z zapisem w przeglądarce,
- responsywny layout,
- stopka Wrocław Wielbi,
- cache odpowiedzi po stronie platformy,
- awaryjny link do źródła, gdy pobieranie danych nie zadziała.

## Uruchomienie

1. Wrzuć cały katalog do repozytorium GitHub.
2. Zaimportuj repozytorium do Vercel.
3. Vercel automatycznie zainstaluje `cheerio` i uruchomi `/api/liturgia.js`.
4. Nie są wymagane zmienne środowiskowe.

Lokalnie z Vercel CLI:

```bash
npm install
npx vercel dev
```

## Źródło danych

Funkcja serwerowa pobiera stronę:

`https://opoka.org.pl/liturgia/YYYY-MM-DD`

i zamienia sekcje liturgiczne na JSON używany przez frontend.

Opoka oficjalnie publikuje również iframe do osadzania codziennych czytań. Przed publicznym uruchomieniem natywnego parsera warto potwierdzić z właścicielem treści, że taki sposób ponownego prezentowania pełnych tekstów jest akceptowany. Jeśli chcesz wariant najbardziej konserwatywny pod kątem praw do treści, można zastąpić parser oficjalnym iframe, kosztem pełnej kontroli nad typografią.

## Ważne

Parser jest celowo odseparowany od frontendu. Gdy zmieni się HTML źródła, poprawiasz tylko `api/liturgia.js`, bez ruszania całego wyglądu strony.
