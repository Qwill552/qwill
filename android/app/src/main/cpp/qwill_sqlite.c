#include <jni.h>
#include <stdint.h>
#include <stdlib.h>
#include "sqlite/sqlite3.h"

#define JNI_NAME(name) Java_com_qwill_app_database_NativeSqlite_##name

static void throw_sql(JNIEnv *env, int code, const char *message) {
    jclass type = (*env)->FindClass(env, "com/qwill/app/database/SqlException");
    if (type == NULL) return;
    jmethodID constructor = (*env)->GetMethodID(env, type, "<init>", "(ILjava/lang/String;)V");
    if (constructor == NULL) return;
    jstring text = (*env)->NewStringUTF(env, message == NULL ? "" : message);
    jobject error = (*env)->NewObject(env, type, constructor, (jint) code, text);
    if (error != NULL) (*env)->Throw(env, (jthrowable) error);
}

static void throw_db(JNIEnv *env, sqlite3 *db, int code) {
    throw_sql(env, sqlite3_extended_errcode(db) != 0 ? sqlite3_extended_errcode(db) : code, sqlite3_errmsg(db));
}

JNIEXPORT jlong JNICALL JNI_NAME(open)(JNIEnv *env, jclass type, jstring path) {
    const char *file = (*env)->GetStringUTFChars(env, path, NULL);
    if (file == NULL) return 0;
    sqlite3 *db = NULL;
    int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_NOMUTEX;
    int code = sqlite3_open_v2(file, &db, flags, NULL);
    (*env)->ReleaseStringUTFChars(env, path, file);
    if (code != SQLITE_OK) {
        if (db != NULL) {
            throw_db(env, db, code);
            sqlite3_close_v2(db);
        } else {
            throw_sql(env, code, sqlite3_errstr(code));
        }
        return 0;
    }
    sqlite3_extended_result_codes(db, 1);
    return (jlong) (intptr_t) db;
}

JNIEXPORT void JNICALL JNI_NAME(close)(JNIEnv *env, jclass type, jlong handle) {
    sqlite3_close_v2((sqlite3 *) (intptr_t) handle);
}

JNIEXPORT jlong JNICALL JNI_NAME(prepare)(JNIEnv *env, jclass type, jlong handle, jbyteArray sql) {
    sqlite3 *db = (sqlite3 *) (intptr_t) handle;
    jsize length = (*env)->GetArrayLength(env, sql);
    jbyte *bytes = (*env)->GetByteArrayElements(env, sql, NULL);
    if (bytes == NULL) return 0;
    sqlite3_stmt *statement = NULL;
    int code = sqlite3_prepare_v2(db, (const char *) bytes, length, &statement, NULL);
    (*env)->ReleaseByteArrayElements(env, sql, bytes, JNI_ABORT);
    if (code != SQLITE_OK) {
        throw_db(env, db, code);
        return 0;
    }
    return (jlong) (intptr_t) statement;
}

JNIEXPORT void JNICALL JNI_NAME(bindLong)(JNIEnv *env, jclass type, jlong handle, jint index, jlong value) {
    sqlite3_stmt *statement = (sqlite3_stmt *) (intptr_t) handle;
    int code = sqlite3_bind_int64(statement, index, value);
    if (code != SQLITE_OK) throw_db(env, sqlite3_db_handle(statement), code);
}

JNIEXPORT void JNICALL JNI_NAME(bindDouble)(JNIEnv *env, jclass type, jlong handle, jint index, jdouble value) {
    sqlite3_stmt *statement = (sqlite3_stmt *) (intptr_t) handle;
    int code = sqlite3_bind_double(statement, index, value);
    if (code != SQLITE_OK) throw_db(env, sqlite3_db_handle(statement), code);
}

JNIEXPORT void JNICALL JNI_NAME(bindText)(JNIEnv *env, jclass type, jlong handle, jint index, jbyteArray value) {
    sqlite3_stmt *statement = (sqlite3_stmt *) (intptr_t) handle;
    jsize length = (*env)->GetArrayLength(env, value);
    jbyte *bytes = (*env)->GetByteArrayElements(env, value, NULL);
    if (bytes == NULL) return;
    int code = sqlite3_bind_text(statement, index, (const char *) bytes, length, SQLITE_TRANSIENT);
    (*env)->ReleaseByteArrayElements(env, value, bytes, JNI_ABORT);
    if (code != SQLITE_OK) throw_db(env, sqlite3_db_handle(statement), code);
}

JNIEXPORT void JNICALL JNI_NAME(bindNull)(JNIEnv *env, jclass type, jlong handle, jint index) {
    sqlite3_stmt *statement = (sqlite3_stmt *) (intptr_t) handle;
    int code = sqlite3_bind_null(statement, index);
    if (code != SQLITE_OK) throw_db(env, sqlite3_db_handle(statement), code);
}

JNIEXPORT jboolean JNICALL JNI_NAME(step)(JNIEnv *env, jclass type, jlong handle) {
    sqlite3_stmt *statement = (sqlite3_stmt *) (intptr_t) handle;
    int code = sqlite3_step(statement);
    if (code == SQLITE_ROW) return JNI_TRUE;
    if (code == SQLITE_DONE) return JNI_FALSE;
    throw_db(env, sqlite3_db_handle(statement), code);
    return JNI_FALSE;
}

JNIEXPORT jboolean JNICALL JNI_NAME(columnIsNull)(JNIEnv *env, jclass type, jlong handle, jint index) {
    return sqlite3_column_type((sqlite3_stmt *) (intptr_t) handle, index) == SQLITE_NULL ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jlong JNICALL JNI_NAME(columnLong)(JNIEnv *env, jclass type, jlong handle, jint index) {
    return sqlite3_column_int64((sqlite3_stmt *) (intptr_t) handle, index);
}

JNIEXPORT jdouble JNICALL JNI_NAME(columnDouble)(JNIEnv *env, jclass type, jlong handle, jint index) {
    return sqlite3_column_double((sqlite3_stmt *) (intptr_t) handle, index);
}

JNIEXPORT jbyteArray JNICALL JNI_NAME(columnText)(JNIEnv *env, jclass type, jlong handle, jint index) {
    sqlite3_stmt *statement = (sqlite3_stmt *) (intptr_t) handle;
    if (sqlite3_column_type(statement, index) == SQLITE_NULL) return NULL;
    const unsigned char *text = sqlite3_column_text(statement, index);
    int length = sqlite3_column_bytes(statement, index);
    jbyteArray result = (*env)->NewByteArray(env, length);
    if (result == NULL) return NULL;
    if (length > 0) (*env)->SetByteArrayRegion(env, result, 0, length, (const jbyte *) text);
    return result;
}

JNIEXPORT void JNICALL JNI_NAME(finalizeStatement)(JNIEnv *env, jclass type, jlong handle) {
    sqlite3_finalize((sqlite3_stmt *) (intptr_t) handle);
}

JNIEXPORT jint JNICALL JNI_NAME(changes)(JNIEnv *env, jclass type, jlong handle) {
    return sqlite3_changes((sqlite3 *) (intptr_t) handle);
}

JNIEXPORT jstring JNICALL JNI_NAME(version)(JNIEnv *env, jclass type) {
    return (*env)->NewStringUTF(env, sqlite3_libversion());
}
