cmake_minimum_required(VERSION 3.22.1)
project(qwill_sqlite C)

add_library(qwill_sqlite SHARED qwill_sqlite.c sqlite/sqlite3.c)

target_compile_definitions(qwill_sqlite PRIVATE
    SQLITE_THREADSAFE=2
    SQLITE_DEFAULT_MEMSTATUS=0
    SQLITE_DEFAULT_WAL_SYNCHRONOUS=1
    SQLITE_DQS=0
    SQLITE_TEMP_STORE=3
    SQLITE_LIKE_DOESNT_MATCH_BLOBS
    SQLITE_MAX_EXPR_DEPTH=0
    SQLITE_OMIT_DEPRECATED
    SQLITE_OMIT_LOAD_EXTENSION
    SQLITE_OMIT_PROGRESS_CALLBACK
    SQLITE_OMIT_SHARED_CACHE
    SQLITE_USE_ALLOCA
    HAVE_USLEEP=1
)

target_compile_options(qwill_sqlite PRIVATE -O2 -ffunction-sections -fdata-sections -fvisibility=hidden)
target_link_options(qwill_sqlite PRIVATE -Wl,--gc-sections -Wl,-z,max-page-size=16384)
