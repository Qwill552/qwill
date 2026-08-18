# Qwill — сборка Android

Обёртка Capacitor вокруг веб-клиента `client/`. WebView грузит интерфейс не из собранного
`dist/` внутри APK, а с боевого или dev-сервера — адрес задаёт `server.url`, разный для
каждого flavor'а (см. «Два контура» ниже).

Следствие: правки клиента приезжают на телефон сами после деплоя, пересобирать и раздавать
APK заново нужно только при изменениях нативного слоя (`client/android/`, плагины, манифест).
Обоснование выбора — в журнале `calls.md` за 2026-08-16.

## Два контура: prod и dev

Проект собирается в двух product flavor'ах (`flavorDimensions "channel"` в
`app/build.gradle`):

| | `prod` | `dev` |
|---|---|---|
| `applicationId` | `com.qwill.app` | `com.qwill.app.dev` |
| Имя приложения | Qwill | Qwill Dev |
| `server.url` | `https://qwill.mooo.com` | `https://dev.qwill.mooo.com` |
| Иконка | штатная | тот же макет, другой оттенок |
| Задача Gradle (релиз) | `assembleProdRelease` | `assembleDevRelease` |
| npm-скрипт | `android:release` | `android:release:dev` |

Оба flavor'а ставятся на одно устройство одновременно и не мешают друг другу — это разные
Android-приложения с разными `applicationId`, у каждого свои чаты и свой аккаунт.

Ресурсы `dev` (имя, иконки, конфиг Capacitor) лежат в `client/android/app/src/dev/` —
Gradle накладывает их поверх `src/main/` только при сборке `dev`-flavor'а. Конфиг Capacitor
для dev (`src/dev/assets/capacitor.config.json`) не пишется руками: его генерирует
`scripts/make-dev-capacitor-config.mjs`, беря за основу `src/main/assets/capacitor.config.json`,
который кладёт туда `cap sync` (шаг `android:sync`), и подменяя в нём `appId`, `appName` и
`server.url` на dev-значения. Если формат конфига Capacitor когда-нибудь изменится, dev-версия
подхватит изменение автоматически — вместо того чтобы разъехаться с прод-версией, как было бы
при ручном файле.

Установить dev-сборку на подключённое устройство без Android Studio:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jbr-21.0.11"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
client\android\gradlew.bat -p client\android installDevDebug
```

или поставить уже собранный релизный APK явно через `adb`:

```powershell
adb install -r client\android\app\build\outputs\apk\dev\release\app-dev-release.apk
```

`-r` переустанавливает поверх уже стоящей версии того же `applicationId`, не трогая боевое
приложение рядом — у него другой `applicationId`, и `adb` их не путает.

**Dev-приложение не показывает баннер «Доступно обновление».** Каталог выпусков
(`APP_RELEASE_DIR`) на dev-контуре пуст — манифеста `android.json` там нет, поэтому
`getAndroidRelease()` (`server/src/services/appRelease.ts`) возвращает `null`, и код баннера
просто не срабатывает. Раздача APK через `/api/app/*` заведена только для прода.

## Уведомления в оболочке — через FCM (шаг 10А)

Веб-пуши, на которых держатся уведомления в PWA, в Android WebView недоступны: WebView не
предоставляет ни `Notification`, ни `PushManager`, и не имеет собственной регистрации в
push-сервисе — она есть у браузера Chrome, а не у встроенного WebView. `subscribeToPush`
(`client/src/realtime/push.ts`) это учитывает: в оболочке (`isNativePushAvailable()` из
`client/src/realtime/nativePush.ts`) подписка уходит по нативному каналу через
`@capacitor/push-notifications` и Firebase Cloud Messaging, а не через `PushManager`.

Без `google-services.json` (см. ниже) push-плагин на Android не инициализируется — сборка
пишет в лог `Push Notifications won't work`, приложение работает дальше как обычно, просто
без уведомлений. Разрешение `POST_NOTIFICATIONS` в манифесте — с Android 13 без него
уведомления блокируются в принципе, но само по себе оно ничего не включает.

### Откуда взять `google-services.json`

1. [Firebase Console](https://console.firebase.google.com/) → создать проект (или использовать
   существующий).
2. Добавить **два** Android-приложения в этом же проекте: `com.qwill.app` (прод) и
   `com.qwill.app.dev` (dev) — оба `applicationId` см. в `app/build.gradle`
   (`applicationIdSuffix ".dev"` у flavor'а `dev`). Без второго приложения FCM для dev-сборки
   не инициализируется тем же путём, что описан выше для прода.
3. Скачать `google-services.json` и положить в `client/android/app/google-services.json`.
   Один и тот же файл покрывает оба `applicationId` — Firebase кладёт в него записи всех
   приложений проекта, а плагин `google-services` на сборке выбирает нужную по
   `applicationId` собираемого flavor'а. Файл не коммитится (`client/android/.gitignore`) —
   при потере или на новой машине сборки повторить эти шаги заново, ключи и `project_id`
   возьмутся из того же проекта Firebase.
4. Серверу отдельно нужен ключ сервисного аккаунта того же проекта — Firebase Console →
   Project settings → Service accounts → Generate new private key, JSON целиком в
   `FCM_SERVICE_ACCOUNT_JSON` в `.env` на сервере (см. `.env.example`), в репозиторий не
   попадает.
5. Пересобрать: `npm run android:sync -w @messenger/client` подхватывает файл автоматически
   (блок в `app/build.gradle` применяет `com.google.gms.google-services`, только если файл
   существует).

## Отладочная сборка

```bash
npm run android:sync -w @messenger/client
npm run android:open -w @messenger/client
```

Откроется Android Studio с проектом `client/android`. Запустить на подключённом по USB
телефоне (отладка по USB включена) или на эмуляторе — кнопка Run.

`android:sync` пересобирает `client/dist`, копирует его в
`android/app/src/main/assets/public`, обновляет `capacitor.config.json` внутри APK и следом
запускает `make-dev-capacitor-config.mjs`, который тем же проходом обновляет
`src/dev/assets/capacitor.config.json` для dev-flavor'а (см. «Два контура» выше);
`android:open` открывает проект в Android Studio. Скопированный `dist` при заданном
`server.url` не используется — он остаётся в APK как побочный результат `cap sync`.
После правок в `client/src` пересобирать APK не нужно: телефон возьмёт новую версию с
боевого или dev-сервера (в зависимости от установленного flavor'а) после деплоя. Прогнать
`android:sync` нужно, только если менялся `capacitor.config.ts` или нативная часть.

В Android Studio выбор flavor'а для сборки/запуска — панель **Build Variants** (слева внизу):
`prodDebug`, `devDebug`, `prodRelease`, `devRelease`.

## Сборка и установка без Android Studio

Android Studio нужна только как источник JDK и как GUI. Тот же результат из терминала —
для прод-flavor'а:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jbr-21.0.11"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
client\android\gradlew.bat -p client\android installProdDebug
```

или `installDevDebug` для dev-flavor'а. Продукт с двумя flavor'ами не создаёт общей задачи
`installDebug` — нужно называть flavor явно, иначе Gradle откажет с ошибкой неоднозначности.

**JDK берётся не из каталога Android Studio.** Встроенная в Studio JBR (`D:\android\jbr` на
машине разработки) — Java 25, а Gradle 8.14.3 её не поддерживает и падает с
`Unsupported class file major version 69` ещё на разборе `settings.gradle`. Нужна Java 21 —
Studio держит её отдельно в `~/.jdks`, оттуда же берёт JDK для своего демона Gradle.
Сборка из терминала при открытой Studio может пройти и с неверным `JAVA_HOME`, переиспользовав
её демон, — это маскирует ошибку до момента, когда Studio закрыта.

`installProdDebug`/`installDevDebug` собирает отладочный APK нужного flavor'а и ставит его
на подключённое по USB устройство. Список устройств — `platform-tools\adb.exe devices`, лог
приложения — `adb logcat`. Строка `D Capacitor: Loading app at https://qwill.mooo.com` (для
`prod`) или `https://dev.qwill.mooo.com` (для `dev`) в логе подтверждает, откуда оболочка
взяла интерфейс.

## Релизная сборка

Требуется ключ подписи (см. ниже) — общий для обоих flavor'ов, отдельного ключа для `dev` не
заводится. Из терминала — одной командой из `client/`:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jbr-21.0.11"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run android:release -w @messenger/client
```

Собирает **только `prod`**: скрипт сам гоняет `android:sync` (веб-сборка + `cap sync`) и
затем `gradlew assembleProdRelease`. Результат —
`client/android/app/build/outputs/apk/prod/release/app-prod-release.apk`. Для dev-сборки —
`npm run android:release:dev -w @messenger/client`, результат в
`.../apk/dev/release/app-dev-release.apk`; на прод она не раздаётся (см. «Два контура»),
собирается только для локальной установки через `adb`. Без `keystore.properties` (см. ниже)
обе команды соберут **неподписанный** APK: сборка не падает, но такой файл нельзя установить
или раздать — `signingConfig` на `release` в этом случае просто не применяется.

В Android Studio тот же результат: `Build → Generate Signed Bundle / APK`, `APK`, путь к
keystore и пароли, тип сборки `release`.

## Ключ подписи

Ключ не хранится в репозитории — `.gitignore` исключает `*.jks`, `*.keystore` и
`keystore.properties` из всего проекта. Отсутствие ключа при релизной сборке означает
невозможность выпускать обновления для уже установивших приложение пользователей: Android
отклоняет APK с другой подписью как другое приложение.

Хранить ключ и пароли от него нужно отдельно от репозитория — на локальной машине или
в менеджере паролей, доступном тому, кто собирает релизы, и минимум в двух местах
(потеря ключа означает потерю возможности выпускать обновления навсегда).

### Создать ключ

```powershell
& "$env:USERPROFILE\.jdks\jbr-21.0.11\bin\keytool.exe" -genkeypair -v `
  -keystore qwill-release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias qwill
```

Команда спросит пароль хранилища, пароль ключа и данные владельца (можно оставить условные
значения). Файл `qwill-release.jks` и оба пароля — хранить вне репозитория.

Повторный запуск этой команды создаёт **новый, другой** ключ — делать это, только если
старый утерян и приложение ещё не побывало ни у одного живого пользователя (иначе новая
версия станет для всех отдельным приложением, ставящимся только поверх удаления старого).

### Подключить ключ к сборке

Скопировать `client/android/keystore.properties.example` в `client/android/keystore.properties`
(файл в `.gitignore`, в репозиторий не попадает) и заполнить:

```properties
storeFile=C:\\path\\to\\qwill-release.jks
storePassword=...
keyAlias=qwill
keyPassword=...
```

`storeFile` — абсолютный путь или путь относительно `client/android`. Обратные слэши в
Windows-путях нужно экранировать двойным слэшем, как в примере выше (формат `.properties`).

### Проверить подпись

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\<версия>\apksigner.bat" verify --print-certs `
  client\android\app\build\outputs\apk\prod\release\app-prod-release.apk
```

Отпечаток сертификата (`SHA-256`) текущего релизного ключа:

```
1D:D2:DD:42:EA:8C:81:7E:33:28:15:00:B0:72:28:B4:84:BF:0D:8F:C6:8F:19:B0:6C:B2:3E:69:86:52:78:0B
```

Совпадение отпечатка в выводе `apksigner` с этой строкой подтверждает, что выпуск подписан
тем самым ключом, а не новым.

## Версия

`versionCode` и `versionName` задаются в одном месте — `client/android/version.properties`,
который читает `app/build.gradle`. Перед каждым релизом: поднять `versionCode` на единицу
(Android отказывает в установке поверх, если номер не больше уже установленного) и обновить
`versionName` на человекочитаемую строку.

Приложение может прочитать свою версию из JS через `getNativeAppVersion()`
(`client/src/native/appVersion.ts`) — под капотом плагин `QwillAppInfo`
(`AppInfoPlugin.kt`, отдельно от `CallPlugin`, так как это не про звонки).

## Раздача APK

Файл раздаёт сам сервер Qwill: `GET /api/app/version` отдаёт сведения о выпуске,
`GET /api/app/apk` — сам файл (с `Accept-Ranges`, докачка возможна). Источник и того и
другого — каталог `APP_RELEASE_DIR` (по умолчанию `app-releases/` в корне репозитория) с
манифестом `android.json` и APK рядом с ним. Каталог в `.gitignore`: восьмимегабайтный
бинарник в истории репозитория не нужен.

**На проде каталог живёт в `shared/`, а не внутри выпуска:**
`/var/www/message/shared/app-releases/`. Внутри каталога выпуска APK стирался бы при каждом
деплое (`release.sh` делает `rm -rf` каталога выпуска, `activate.sh` подчищает старые) — та
же причина, по которой там же живут `.env` и `storage`. `activate.sh` заводит симлинк
`app-releases` в каждом выпуске, поэтому путь по умолчанию срабатывает сам.

Не путать с `/var/www/message/releases/` — это каталоги выпусков самого кода, к раздаче APK
они отношения не имеют.

Раздача идёт Express-маршрутом, а не статикой Caddy: файл лежит вне `client/dist`, поэтому
не попадает в прекэш service worker, а новый блок в общем Caddyfile потребовал бы
`systemctl restart caddy`, обрывающий на секунду **все** домены машины, не только Qwill.

**Раздача APK заведена только для прода.** На dev-контуре (`/var/www/message-dev`)
`app-releases/` не наполняется — там нет `android.json`, `getAndroidRelease()`
(`server/src/services/appRelease.ts`) отдаёт `null`, и «Qwill Dev» баннер обновления никогда
не показывает (см. «Два контура» выше). Устанавливать новую dev-сборку на устройство —
вручную через `adb install`, отдельного канала раздачи для неё не заводилось.

### Выпустить новую версию

Только для `prod` — у `dev` нет раздачи и, соответственно, этого протокола.

1. Поднять `versionCode` на единицу и `versionName` в `client/android/version.properties`.
2. Собрать: `npm run android:release -w @messenger/client` (именно этот скрипт, не
   `android:release:dev` — манифест собирается из прод-APK).
3. Собрать манифест и положить APK рядом с ним:

```powershell
npm run release:manifest -- "Первый пункт списка изменений" "Второй пункт"
```

   Скрипт сам считает `sha256`, берёт версию из `version.properties` и размер из файла.
   `minSupportedVersionCode` переносится из предыдущего манифеста; поднять его — только при
   реальной поломке совместимости с сервером, переменной `MIN_SUPPORTED_VERSION_CODE`.
4. Скопировать `app-releases/android.json` и `app-releases/qwill-<версия>.apk` в
   `/var/www/message/shared/app-releases/` на сервере. Перезапуск сервера не нужен: манифест
   перечитывается по `mtime`.

Приложение проверяет версию при запуске; человек видит строку «Доступно обновление» в
Настройках, скачивает файл по кнопке, приложение сверяет `sha256` и запускает системную
установку через FileProvider. Разрешение `REQUEST_INSTALL_PACKAGES` в манифесте позволяет
только *запросить* установку — тумблер «Установка неизвестных приложений» человек включает
сам, один раз, и приложение объясняет зачем, прежде чем увести его в системные настройки.

Для повторной установки поверх предыдущей версии `applicationId` и подпись должны совпадать
с уже установленной — иначе Android потребует сначала удалить старую версию, стерев её данные.
