# Słowo na dziś — v8

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
- awaryjny link do źródła, gdy pobieranie danych nie zadziała,
- sekcja Liturgii Godzin: Jutrznia i Nieszpory dla wybranego dnia,
- automatyczne odnajdywanie właściwych odnośników w Brewiarz.pl.

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


## Jutrznia i Nieszpory

Endpoint `/api/brewiarz?date=YYYY-MM-DD` nie kopiuje pełnych tekstów Liturgii Godzin.
Odnajduje właściwą stronę dla dnia i zwraca bezpośrednie linki do Jutrzni i Nieszporów
w serwisie Brewiarz.pl.

To celowy wybór: serwis Brewiarz.pl podaje, że teksty Liturgii Godzin są chronione
prawami Konferencji Episkopatu Polski i Wydawnictwa Pallottinum, a opracowanie i edycja
są chronione prawami ILG. Dzięki temu projekt nie republikuje tych tekstów bez uzgodnienia licencji.

Jeśli Wrocław Wielbi uzyska zgodę na natywne publikowanie pełnego Brewiarza,
frontend jest gotowy do rozbudowy o czytnik wewnątrz strony.


## Poprawka v8 — pełne czytania

Parser liturgii nie zakłada już, że treść jest bezpośrednim rodzeństwem nagłówka.
Sekcje są odczytywane w kolejności dokumentu, dlatego poprawnie obsługiwane są:
Pierwsze czytanie, Psalm responsoryjny, Drugie czytanie, Werset przed Ewangelią i Ewangelia.

Przy duplikatach wersji mobilnej/desktopowej wybierana jest sekcja z największą ilością treści.
