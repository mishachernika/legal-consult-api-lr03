#!/usr/bin/env bash
# Демо curl-запитів до API (потрібен запущений сервер і виконаний `npm run db:seed`).
# Використовувався для скріншотів у reports/screenshots/.
set -u
BASE="http://localhost:${PORT:-3000}"

pp() {
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.stringify(JSON.parse(d),null,2))}catch(e){console.log(d)}})"
}
short_token() { # скорочує JWT для красивого виводу
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);if(j.tokens){j.tokens.accessToken=j.tokens.accessToken.slice(0,25)+'...';j.tokens.refreshToken=j.tokens.refreshToken.slice(0,25)+'...'}console.log(JSON.stringify(j,null,2))})"
}

echo "\$ curl -s $BASE/health"
curl -s "$BASE/health" | pp
echo
echo "# список юристів, сортування за ціною (перші 2 записи), пагінація"
echo "\$ curl -s '$BASE/api/lawyers?sortBy=pricePerHour&order=asc&limit=2'"
curl -s "$BASE/api/lawyers?sortBy=pricePerHour&order=asc&limit=2" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(JSON.stringify({data:j.data.slice(0,2),pagination:j.pagination},null,2))})"
echo
echo "# реєстрація нового клієнта → у відповіді пара JWT (access + refresh)"
echo "\$ curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d '{...}'"
curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d "{
  \"email\": \"demo.$RANDOM@example.com\", \"password\": \"demopassword123\", \"name\": \"Демо Клієнт\"
}" | short_token
echo
echo "# вхід демо-адміном із seed і створення консультації з Bearer-токеном"
echo "\$ TOKEN=\$(curl -s -X POST $BASE/api/auth/login -d '{\"email\":\"admin@legal.ua\",\"password\":\"password123\"}' | jq -r .tokens.accessToken)"
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@legal.ua","password":"password123"}')
TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).tokens.accessToken))")
echo "\$ curl -s $BASE/api/consultations -H \"Authorization: Bearer \$TOKEN\" | ..."
curl -s "$BASE/api/consultations?limit=2" -H "Authorization: Bearer $TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(JSON.stringify({data:j.data.slice(0,2),pagination:j.pagination},null,2))})"
echo
echo "# без токена захищений маршрут повертає 401"
echo "\$ curl -s -o /dev/null -w '%{http_code}' $BASE/api/users"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/users"
echo
echo "# помилка валідації → 400 з деталями по полях"
echo "\$ curl -s -X POST $BASE/api/auth/register -d '{\"email\":\"bad\",\"password\":\"short\",\"name\":\"A\"}'"
curl -s -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' -d '{"email":"bad","password":"short","name":"A"}' | pp
echo
echo "# невідомий маршрут → 404"
echo "\$ curl -s $BASE/api/nope"
curl -s "$BASE/api/nope" | pp
