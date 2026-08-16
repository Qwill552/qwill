# Qwill — сборка Android

Обёртка Capacitor вокруг веб-клиента `client/`. WebView грузит интерфейс с
`https://qwill.mooo.com` (`server.url` в `client/capacitor.config.ts`), а не из собранного
`dist/` внутри APK. `applicationId`: `com.qwill.app`.

Следствие: правки клиента приезжают на телефон сами после деплоя, пересобирать и раздавать
APK заново нужно только при изменениях нативного слоя (`client/android/`, плагины, манифест).
Обоснование выбора — в журнале `calls.md` за 2026-08-16.

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

Android Studio нужна только как источник JDK и как GUI. Тот же результат из терминала
(проверено на Windows, Studio установлена в `D:\android`):

```powershell
$env:JAVA_HOME = "D:\android\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
client\android\gradlew.bat -p client\android installDebug
```

`installDebug` собирает отладочный APK и ставит его на подключённое по USB устройство.
Список устройств — `platform-tools\adb.exe devices`, лог приложения — `adb logcat`.
Строка `D Capacitor: Loading app at https://qwill.mooo.com` в логе подтверждает, что
оболочка взяла интерфейс с прода.

## Релизная сборка

Требуется ключ подписи (см. ниже). В Android Studio: `Build → Generate Signed Bundle / APK`,
выбрать `APK`, указать путь к keystore и пароли, тип сборки `release`. Получившийся файл —
в `client/android/app/release/app-release.apk`.

Перед сборкой обязательно `npm run android:sync -w @messenger/client`, чтобы в `assets/public`
попал актуальный `dist`.

## Ключ подписи

Ключ не хранится в репозитории — `.gitignore` исключает `*.keystore` и `*.jks` из всего
проекта. Отсутствие ключа при релизной сборке означает невозможность выпускать обновления
для уже установивших приложение пользователей: Android отклоняет APK с другой подписью как
другое приложение.

Хранить ключ и пароли от него нужно отдельно от репозитория — на локальной машине или
в менеджере паролей, доступном тому, кто собирает релизы.

### Создать ключ заново

Только если ключ утерян и приложение ещё не публиковалось нигде, где важна непрерывность
обновлений (иначе новые версии станут для пользователей отдельным приложением):

```bash
keytool -genkeypair -v -keystore qwill-release.keystore -alias qwill -keyalg RSA -keysize 2048 -validity 10000
```

Команда спросит пароль хранилища, пароль ключа и данные владельца (можно оставить условные
значения). Файл `qwill-release.keystore` и оба пароля — хранить вне репозитория.

## Раздача APK

Готового автообновления через маркет пока нет — APK передаётся вручную (файлом, ссылкой на
файл в облаке и т.п.), устройство должно разрешить установку из неизвестных источников для
приложения, через которое передаётся файл (браузер, мессенджер, файловый менеджер).

Для повторной установки поверх предыдущей версии `applicationId` и подпись должны совпадать
с уже установленной — иначе Android потребует сначала удалить старую версию, стерев её данные.
