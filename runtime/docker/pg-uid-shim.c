/*
 * pg-uid-shim.c — LD_PRELOAD shim：让 postgres 以容器 uid 0 运行却"以为"自己是 uid 999。
 *
 * 背景：rootless（无 root/sudo）机器上，user namespace 只能做单段 uid 映射
 * （容器 uid 0 → 宿主 euid）。postgres 官方镜像以 USER postgres（uid 999）运行，
 * 而 uid 999 在单段映射下不可用（映射到宿主 nobody/65534，无法写数据目录）。
 * 因此必须让容器以 uid 0 运行（唯一可映射的 uid），但 postgres 拒绝以 root 运行
 * （getuid()==0 时 FATAL "cannot run as root"）。
 *
 * 本 shim 通过 LD_PRELOAD 拦截：
 *   1) getuid/geteuid/getgid/getegid → 恒返回 999（绕过 postgres 的 root 检查）
 *   2) stat/fstat/lstat 的 st_uid/st_gid → 恒返回 999
 *      （postgres 启动时检查数据目录属主 statbuf.st_uid == getuid()，
 *        实际数据目录由宿主 euid（=容器 uid 0）拥有，st_uid 实为 0；
 *        若不把 st_uid 也改成 999，0 != 999 会触发 FATAL "invalid permissions"）
 *
 * 实际文件读写仍由真实宿主 uid（容器 uid 0 = 宿主 euid）完成，
 * 数据目录本就归宿主 euid 所有，故读写正常；shim 只改"postgres 看到的 uid"。
 *
 * 编译（在 postgres:15-alpine 镜像内，musl 工具链）：
 *   gcc -shared -fPIC -O2 -o /usr/local/lib/pg-uid-shim.so pg-uid-shim.c -ldl
 *
 * 使用：容器以 USER root 运行，ENV LD_PRELOAD=/usr/local/lib/pg-uid-shim.so
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <sys/stat.h>
#include <unistd.h>

#define FAKE_UID 999
#define FAKE_GID 999

/* ---- uid/gid 拦截：postgres 的 root 检查 getuid()==0 / geteuid()==0 由此通过 ---- */
uid_t getuid(void) { return FAKE_UID; }
uid_t geteuid(void) { return FAKE_UID; }
gid_t getgid(void) { return FAKE_GID; }
gid_t getegid(void) { return FAKE_GID; }

/* ---- stat 族拦截：把 st_uid/st_gid 改成 999，使数据目录属主检查通过 ----
 * 覆盖 stat/fstat/lstat/fstatat 四个入口：
 *   - postgres（musl）走 stat() 检查数据目录属主
 *   - 动态链接器 / coreutils 等可能走 fstatat()（glibc 下 stat() 常是 fstatat 的包装）
 *   - fstat() 用于已打开 fd 的属主查询
 * 全部覆盖以杜绝"某条路径漏拦导致 st_uid 仍为真实 uid"的边界情况。 */
typedef int (*stat_fn)(const char *, struct stat *);
typedef int (*fstat_fn)(int, struct stat *);
typedef int (*lstat_fn)(const char *, struct stat *);
typedef int (*fstatat_fn)(int, const char *, struct stat *, int);

static void fake_stat_uid_gid(struct stat *buf) {
    if (buf) {
        buf->st_uid = FAKE_UID;
        buf->st_gid = FAKE_GID;
    }
}

int stat(const char *path, struct stat *buf) {
    static stat_fn real = NULL;
    if (!real) real = (stat_fn)dlsym(RTLD_NEXT, "stat");
    int ret = real ? real(path, buf) : -1;
    if (ret == 0) fake_stat_uid_gid(buf);
    return ret;
}

int fstat(int fd, struct stat *buf) {
    static fstat_fn real = NULL;
    if (!real) real = (fstat_fn)dlsym(RTLD_NEXT, "fstat");
    int ret = real ? real(fd, buf) : -1;
    if (ret == 0) fake_stat_uid_gid(buf);
    return ret;
}

int lstat(const char *path, struct stat *buf) {
    static lstat_fn real = NULL;
    if (!real) real = (lstat_fn)dlsym(RTLD_NEXT, "lstat");
    int ret = real ? real(path, buf) : -1;
    if (ret == 0) fake_stat_uid_gid(buf);
    return ret;
}

int fstatat(int dirfd, const char *pathname, struct stat *buf, int flags) {
    static fstatat_fn real = NULL;
    if (!real) real = (fstatat_fn)dlsym(RTLD_NEXT, "fstatat");
    int ret = real ? real(dirfd, pathname, buf, flags) : -1;
    if (ret == 0) fake_stat_uid_gid(buf);
    return ret;
}
