#define _GNU_SOURCE
#include <dlfcn.h>
#include <string.h>
#include <stdlib.h>
#include <dirent.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>
#include <stdio.h>
#include <fcntl.h>
#include <stdarg.h>

static const char PREFIX[] = "/usr/share/postgresql/15";
static const size_t PREFIX_LEN = sizeof(PREFIX) - 1;
static char *target_prefix = NULL;
static size_t target_prefix_len = 0;
static int initialized = 0;

static void ensure_init(void) {
    if (initialized) return;
    initialized = 1;
    const char *env = getenv("PG_REDIRECT_SHARE_DIR");
    if (env && env[0]) {
        target_prefix = strdup(env);
        target_prefix_len = strlen(target_prefix);
    } else {
        target_prefix = strdup(PREFIX);
        target_prefix_len = PREFIX_LEN;
    }
}

static char *redirect_path(const char *path) {
    if (!path) return NULL;
    if (strncmp(path, PREFIX, PREFIX_LEN) != 0) return NULL;
    if (path[PREFIX_LEN] != '/' && path[PREFIX_LEN] != '\0') return NULL;
    size_t suffix_len = strlen(path) - PREFIX_LEN;
    char *new_path = malloc(target_prefix_len + suffix_len + 1);
    if (!new_path) return NULL;
    memcpy(new_path, target_prefix, target_prefix_len);
    memcpy(new_path + target_prefix_len, path + PREFIX_LEN, suffix_len + 1);
    return new_path;
}

DIR *opendir(const char *path) {
    static DIR *(*real_opendir)(const char *) = NULL;
    if (!real_opendir) real_opendir = dlsym(RTLD_NEXT, "opendir");
    ensure_init();
    char *r = redirect_path(path);
    DIR *res = real_opendir(r ? r : path);
    free(r);
    return res;
}

int open(const char *path, int flags, ...) {
    static int (*real_open)(const char *, int, ...) = NULL;
    if (!real_open) real_open = dlsym(RTLD_NEXT, "open");
    ensure_init();
    char *r = redirect_path(path);
    va_list ap;
    va_start(ap, flags);
    mode_t mode = (flags & O_CREAT) ? va_arg(ap, mode_t) : 0;
    va_end(ap);
    int res = (mode)
        ? real_open(r ? r : path, flags, mode)
        : real_open(r ? r : path, flags);
    free(r);
    return res;
}

int open64(const char *path, int flags, ...) {
    static int (*real_open64)(const char *, int, ...) = NULL;
    if (!real_open64) real_open64 = dlsym(RTLD_NEXT, "open64");
    ensure_init();
    char *r = redirect_path(path);
    va_list ap;
    va_start(ap, flags);
    mode_t mode = (flags & O_CREAT) ? va_arg(ap, mode_t) : 0;
    va_end(ap);
    int res = (mode)
        ? real_open64(r ? r : path, flags, mode)
        : real_open64(r ? r : path, flags);
    free(r);
    return res;
}

int stat(const char *path, struct stat *buf) {
    static int (*real_stat)(const char *, struct stat *) = NULL;
    if (!real_stat) real_stat = dlsym(RTLD_NEXT, "stat");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_stat(r ? r : path, buf);
    free(r);
    return res;
}

int lstat(const char *path, struct stat *buf) {
    static int (*real_lstat)(const char *, struct stat *) = NULL;
    if (!real_lstat) real_lstat = dlsym(RTLD_NEXT, "lstat");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_lstat(r ? r : path, buf);
    free(r);
    return res;
}

int stat64(const char *path, struct stat64 *buf) {
    static int (*real_stat64)(const char *, struct stat64 *) = NULL;
    if (!real_stat64) real_stat64 = dlsym(RTLD_NEXT, "stat64");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_stat64(r ? r : path, buf);
    free(r);
    return res;
}

int lstat64(const char *path, struct stat64 *buf) {
    static int (*real_lstat64)(const char *, struct stat64 *) = NULL;
    if (!real_lstat64) real_lstat64 = dlsym(RTLD_NEXT, "lstat64");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_lstat64(r ? r : path, buf);
    free(r);
    return res;
}

int access(const char *path, int mode) {
    static int (*real_access)(const char *, int) = NULL;
    if (!real_access) real_access = dlsym(RTLD_NEXT, "access");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_access(r ? r : path, mode);
    free(r);
    return res;
}

int __xstat(int ver, const char *path, struct stat *buf) {
    static int (*real_xstat)(int, const char *, struct stat *) = NULL;
    if (!real_xstat) real_xstat = dlsym(RTLD_NEXT, "__xstat");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_xstat(ver, r ? r : path, buf);
    free(r);
    return res;
}

int __lxstat(int ver, const char *path, struct stat *buf) {
    static int (*real_lxstat)(int, const char *, struct stat *) = NULL;
    if (!real_lxstat) real_lxstat = dlsym(RTLD_NEXT, "__lxstat");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_lxstat(ver, r ? r : path, buf);
    free(r);
    return res;
}

int __xstat64(int ver, const char *path, struct stat64 *buf) {
    static int (*real_xstat64)(int, const char *, struct stat64 *) = NULL;
    if (!real_xstat64) real_xstat64 = dlsym(RTLD_NEXT, "__xstat64");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_xstat64(ver, r ? r : path, buf);
    free(r);
    return res;
}

int __lxstat64(int ver, const char *path, struct stat64 *buf) {
    static int (*real_lxstat64)(int, const char *, struct stat64 *) = NULL;
    if (!real_lxstat64) real_lxstat64 = dlsym(RTLD_NEXT, "__lxstat64");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_lxstat64(ver, r ? r : path, buf);
    free(r);
    return res;
}

int faccessat(int dirfd, const char *path, int mode, int flags) {
    static int (*real_faccessat)(int, const char *, int, int) = NULL;
    if (!real_faccessat) real_faccessat = dlsym(RTLD_NEXT, "faccessat");
    ensure_init();
    char *r = redirect_path(path);
    int res = real_faccessat(dirfd, r ? r : path, mode, flags);
    free(r);
    return res;
}

FILE *fopen(const char *path, const char *mode) {
    static FILE *(*real_fopen)(const char *, const char *) = NULL;
    if (!real_fopen) real_fopen = dlsym(RTLD_NEXT, "fopen");
    ensure_init();
    char *r = redirect_path(path);
    FILE *res = real_fopen(r ? r : path, mode);
    free(r);
    return res;
}

FILE *fopen64(const char *path, const char *mode) {
    static FILE *(*real_fopen64)(const char *, const char *) = NULL;
    if (!real_fopen64) real_fopen64 = dlsym(RTLD_NEXT, "fopen64");
    ensure_init();
    char *r = redirect_path(path);
    FILE *res = real_fopen64(r ? r : path, mode);
    free(r);
    return res;
}
