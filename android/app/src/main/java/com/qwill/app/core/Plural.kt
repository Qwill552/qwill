package com.qwill.app.core

fun plural(count: Int, one: String, few: String, many: String): String {
    val mod10 = count % 10
    val mod100 = count % 100
    if (mod10 == 1 && mod100 != 11) return one
    if (mod10 in 2..4 && (mod100 < 10 || mod100 >= 20)) return few
    return many
}
