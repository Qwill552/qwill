# Qwill — сборка Android

Обёртка Capacitor вокруг веб-клиента `client/`. WebView грузит интерфейс с
`https://qwill.mooo.com` (`server.url` в `client/capacitor.config.ts`), а не из собранного
`dist/` внутри APK. `applicationId`: `com.qwill.app`.

Следствие: правки клиента приезжают на телефон сами после деплоя, пересобирать и раздавать
APK заново нужно только при изменениях нативного слоя (`client/android/`, плагины, манифест).
Обоснование выбора — в журнале `calls.md` за 2026-08-16.

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
2. Добавить Android-приложение с `applicationId` **`com.qwill.app`** (см. `app/build.gradle`).
3. Скачать `google-services.json` и положить в `client/android/app/google-services.json`.
   Файл не коммитится (`client/android/.gitignore`) — при потере или на новой машине сборки
   повторить эти шаги заново, ключи и `project_id` возьмутся из того же проекта Firebase.
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
`android/app/src/main/assets/public` и обновляет `capacitor.config.json` внутри APK;
`android:open` открывает проект в Android Studio. Скопированный `dist` при заданном
`server.url` не используется — он остаётся в APK как побочный результат `cap sync`.
После правок в `client/src` пересобирать APK не нужно: телефон возьмёт новую версию с
`qwill.mooo.com` после деплоя. Прогнать `android:sync` нужно, только если менялся
`capacitor.config.ts` или нативная часть.

## Сборка и установка без Android Studio

Android Studio нужна только как источник JDK и как GUI. Тот же результат из терминала:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jbr-21.0.11"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
client\android\gradlew.bat -p client\android installDebug
```

**JDK берётся не из каталога Android Studio.** Встроенная в Studio JBR (`D:\android\jbr` на
машине разработки) — Java 25, а Gradle 8.14.3 её не поддерживает и падает с
`Unsupported class file major version 69` ещё на разборе `settings.gradle`. Нужна Java 21 —
Studio держит её отдельно в `~/.jdks`, оттуда же берёт JDK для своего демона Gradle.
Сборка из терминала при открытой Studio может пройти и с неверным `JAVA_HOME`, переиспользовав
её демон, — это маскирует ошибку до момента, когда Studio закрыта.

`installDebug` собирает отладочный APK и ставит его на подключённое по USB устройство.
Список устройств — `platform-tools\adb.exe devices`, лог приложения — `adb logcat`.
Строка `D Capacitor: Loading app at https://qwill.mooo.com` в логе подтверждает, что
оболочка взяла интерфейс с прода.

## Релизная сборка

Требуется ключ подписи (см. ниже). Из терминала — одной командой из `client/`:

```powershell
$env:JAVA_HOME = "$env:USERPROFILE\.jdks\jbr-21.0.11"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run android:release -w @messenger/client
```

Скрипт сам гоняет `android:sync` (веб-сборка + `cap sync`) и затем `gradlew assembleRelease`.
Результат — `client/android/app/build/outputs/apk/release/app-release.apk`. Без
`keystore.properties` (см. ниже) та же команда соберёт **неподписанный** APK: сборка не
падает, но такой файл нельзя установить или раздать — `signingConfig` на `release` в этом
случае просто не применяется.

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
  client\android\app\build\outputs\apk\release\app-release.apk
```

Отпечаток сертификата (`SHA-256`) текущего релизного ключа:

```
<заполнить после первой подписанной сборки>
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

Готового автообновления через маркет пока нет — APK передаётся вручную (файлом, ссылкой на
файл в облаке и т.п.), устройство должно разрешить установку из неизвестных источников для
приложения, через которое передаётся файл (браузер, мессенджер, файловый менеджер).

Для повторной установки поверх предыдущей версии `applicationId` и подпись должны совпадать
с уже установленной — иначе Android потребует сначала удалить старую версию, стерев её данные.
