package com.qwill.app.files

import android.content.SharedPreferences

enum class NetworkKind { WIFI, CELLULAR }

enum class AutoDownloadKind { PHOTO, VIDEO, GIF, FILE }

data class AutoDownloadRule(
    val photo: Boolean,
    val video: Boolean,
    val gif: Boolean,
    val file: Boolean,
    val maxBytes: Long?,
) {
    fun allows(kind: AutoDownloadKind): Boolean = when (kind) {
        AutoDownloadKind.PHOTO -> photo
        AutoDownloadKind.VIDEO -> video
        AutoDownloadKind.GIF -> gif
        AutoDownloadKind.FILE -> file
    }
}

data class AutoDownloadSettings(val cellular: AutoDownloadRule, val wifi: AutoDownloadRule) {
    fun rule(network: NetworkKind): AutoDownloadRule = if (network == NetworkKind.WIFI) wifi else cellular

    companion object {
        private const val MEGABYTE = 1024L * 1024

        val SIZE_STEPS_MB = listOf(1, 5, 10, 50, 100, 500)

        val DEFAULT = AutoDownloadSettings(
            cellular = AutoDownloadRule(photo = true, video = false, gif = false, file = false, maxBytes = 10 * MEGABYTE),
            wifi = AutoDownloadRule(photo = true, video = true, gif = true, file = true, maxBytes = 100 * MEGABYTE),
        )
    }
}

object AutoDownload {
    fun kindOf(category: AttachmentCategory): AutoDownloadKind? = when (category) {
        AttachmentCategory.PHOTO -> AutoDownloadKind.PHOTO
        AttachmentCategory.VIDEO -> AutoDownloadKind.VIDEO
        AttachmentCategory.GIF -> AutoDownloadKind.GIF
        AttachmentCategory.FILE -> AutoDownloadKind.FILE
        AttachmentCategory.VOICE, AttachmentCategory.AUDIO -> null
    }

    fun shouldAutoDownload(
        kind: AutoDownloadKind,
        network: NetworkKind,
        sizeBytes: Long,
        cached: Boolean,
        saveData: Boolean,
        settings: AutoDownloadSettings,
    ): Boolean {
        if (cached) return true
        if (saveData) return false
        val rule = settings.rule(network)
        if (!rule.allows(kind)) return false
        val max = rule.maxBytes
        return max == null || sizeBytes <= max
    }
}

class DevicePreferences(private val prefs: SharedPreferences) {
    fun autoDownload(): AutoDownloadSettings {
        val defaults = AutoDownloadSettings.DEFAULT
        return AutoDownloadSettings(readRule("cellular", defaults.cellular), readRule("wifi", defaults.wifi))
    }

    fun writeAutoDownload(settings: AutoDownloadSettings) {
        prefs.edit().apply {
            writeRule(this, "cellular", settings.cellular)
            writeRule(this, "wifi", settings.wifi)
        }.apply()
    }

    fun retention(): RetentionSettings {
        val defaults = RetentionSettings.DEFAULT
        val exceptions = HashMap<String, RetentionPeriod>()
        for (entry in prefs.getStringSet(KEY_EXCEPTIONS, emptySet()).orEmpty()) {
            val chatId = entry.substringBeforeLast('=', "")
            val period = RetentionPeriod.of(entry.substringAfterLast('=', "")) ?: continue
            if (chatId.isNotEmpty()) exceptions[chatId] = period
        }
        return RetentionSettings(
            keepPrivate = RetentionPeriod.of(prefs.getString(KEY_PRIVATE, null)) ?: defaults.keepPrivate,
            keepGroups = RetentionPeriod.of(prefs.getString(KEY_GROUPS, null)) ?: defaults.keepGroups,
            exceptions = exceptions,
            budgetBytes = prefs.getLong(KEY_BUDGET, NO_BUDGET).takeIf { it != NO_BUDGET },
        )
    }

    fun writeRetention(settings: RetentionSettings) {
        prefs.edit()
            .putString(KEY_PRIVATE, settings.keepPrivate.key)
            .putString(KEY_GROUPS, settings.keepGroups.key)
            .putStringSet(KEY_EXCEPTIONS, settings.exceptions.map { "${it.key}=${it.value.key}" }.toSet())
            .putLong(KEY_BUDGET, settings.budgetBytes ?: NO_BUDGET)
            .apply()
    }

    fun skipsRiskyWarning(): Boolean = prefs.getBoolean(KEY_RISKY_SKIP, false)

    fun setSkipsRiskyWarning(skip: Boolean) {
        prefs.edit().putBoolean(KEY_RISKY_SKIP, skip).apply()
    }

    fun treatAsCellular(): Boolean = prefs.getBoolean(KEY_FORCE_CELLULAR, false)

    fun folderTabsEnabled(): Boolean = prefs.getBoolean(KEY_FOLDER_TABS, false)

    fun setFolderTabsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_FOLDER_TABS, enabled).apply()
    }

    fun setTreatAsCellular(value: Boolean) {
        prefs.edit().putBoolean(KEY_FORCE_CELLULAR, value).apply()
    }

    private fun readRule(prefix: String, fallback: AutoDownloadRule): AutoDownloadRule = AutoDownloadRule(
        photo = prefs.getBoolean("$prefix.photo", fallback.photo),
        video = prefs.getBoolean("$prefix.video", fallback.video),
        gif = prefs.getBoolean("$prefix.gif", fallback.gif),
        file = prefs.getBoolean("$prefix.file", fallback.file),
        maxBytes = if (prefs.contains("$prefix.maxBytes")) prefs.getLong("$prefix.maxBytes", NO_BUDGET).takeIf { it != NO_BUDGET } else fallback.maxBytes,
    )

    private fun writeRule(editor: SharedPreferences.Editor, prefix: String, rule: AutoDownloadRule) {
        editor.putBoolean("$prefix.photo", rule.photo)
            .putBoolean("$prefix.video", rule.video)
            .putBoolean("$prefix.gif", rule.gif)
            .putBoolean("$prefix.file", rule.file)
            .putLong("$prefix.maxBytes", rule.maxBytes ?: NO_BUDGET)
    }

    companion object {
        const val FILE_NAME = "device"
        private const val NO_BUDGET = -1L
        private const val KEY_PRIVATE = "retention.private"
        private const val KEY_GROUPS = "retention.groups"
        private const val KEY_EXCEPTIONS = "retention.exceptions"
        private const val KEY_BUDGET = "retention.budget"
        private const val KEY_RISKY_SKIP = "risky.skipWarning"
        private const val KEY_FORCE_CELLULAR = "stand.forceCellular"
        private const val KEY_FOLDER_TABS = "chats.folderTabs"
    }
}
