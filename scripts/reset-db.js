const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'db', 'tornado-center.sqlite');
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Usunięto bazę danych:', dbPath);
} else {
  console.log('Brak pliku bazy do usunięcia.');
}
console.log('Uruchom ponownie `npm start`, aby odtworzyć bazę i dane demo.');
