# Tornado Center — fullstack demo z bazą danych

To jest rozbudowana wersja projektu Tornado Center z **backendem, bazą SQLite, systemem ról, panelem klienta, panelem admina, panelem super admina, portfelami i systemem planów**.

## Co zostało dodane

- **SQLite database** z pełnym schematem tabel
- **backend Express**
- **sesje logowania**
- **role**: klient / admin / superadmin
- **panel zamówień** tylko po zalogowaniu
- **portfel klienta**
- **portfel firmowy / super admina**
- **przedłużanie planu z portfela**
- **statusy planu i alerty o płatności / wezwaniu do zapłaty**
- **super admin może usuwać plany**
- **kody bonusowe**, które dają dodatkowe środki do portfela
- **forum / community board**
- **FAQ, formularz kontaktowy, wiadomości do obsługi**
- **logi aktywności**

## Stack

- Node.js
- Express
- better-sqlite3
- express-session
- bcryptjs
- HTML / CSS / JS

## Jak uruchomić

```bash
npm install
npm start
```

Aplikacja uruchomi się domyślnie pod:

```bash
http://localhost:3000
```

## Dane demo

### Klient
- e-mail: `client@tornado.test`
- hasło: `demo123`

### Admin
- e-mail: `admin@tornado.test`
- hasło: `demo123`

### Super admin
- e-mail: `superadmin@tornado.test`
- hasło: `demo123`

## Struktura projektu

- `server.js` — backend i API
- `db/schema.sql` — pełen schemat bazy danych
- `db/tornado-center.sqlite` — plik bazy danych tworzony automatycznie przy starcie
- `public/index.html` — frontend
- `public/styles.css` — styling
- `public/app.js` — logika frontendu
- `scripts/reset-db.js` — reset bazy

## Najważniejsze moduły bazy danych

- `users`
- `plans`
- `client_plans`
- `orders`
- `order_notes`
- `messages`
- `transactions`
- `company_wallet`
- `discount_codes`
- `faqs`
- `forum_posts`
- `activity_logs`

## Jak działa portfel

### Portfel klienta
Klient może:
- doładować środki
- użyć kodu bonusowego
- przedłużyć plan jednym kliknięciem

### Portfel firmowy
- środki z przedłużenia planów trafiają do `company_wallet`
- super admin może wypłacać środki

## Uprawnienia

### Klient
- edycja swojego profilu
- składanie zamówień
- podgląd historii zamówień
- wysyłanie wiadomości do obsługi
- korzystanie z forum
- przedłużanie planu z portfela

### Admin
- widzi zamówienia i wiadomości klientów
- może odpowiadać i dodawać notatki
- **nie widzi e-maili klientów**
- **nie zarządza płatnościami, pakietami i uprawnieniami**

### Super admin
- pełna kontrola nad systemem
- zarządza użytkownikami, planami, płatnościami i statusami
- widzi pełne dane klientów
- może usuwać plany
- może zasilać portfele klientów
- może wypłacać środki z portfela firmowego
- ma logi aktywności

## Ważne

To jest **porządna lokalna baza i działający fullstack demo**, ale do wdrożenia produkcyjnego nadal polecam dodać:

- walidację po stronie serwera przez bibliotekę typu Zod
- CSRF protection
- rate limiting
- bezpieczne cookies i HTTPS
- reset hasła i potwierdzanie e-mail
- integrację z prawdziwą bramką płatności
- backup bazy danych
- audyt logów i uprawnień
- osobny panel API / worker do powiadomień

## Reset bazy

```bash
npm run reset-db
npm start
```

To usunie bazę i odtworzy dane demo przy kolejnym uruchomieniu.
