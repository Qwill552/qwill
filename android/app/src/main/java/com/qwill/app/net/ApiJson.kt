package com.qwill.app.net

import kotlinx.serialization.json.Json

val ApiJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    explicitNulls = false
}
