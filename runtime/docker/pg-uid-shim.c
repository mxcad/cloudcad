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
 *   1) getuid/geteuid/getgid/getegid/getresuid/getresgid → 恒返回 999
 *      （绕过 postgres 的 root 检查；getresuid 必须一并伪装，见下方 busybox 说明）
 *   2) stat/fstat/lstat 的 st_uid/st_gid → 恒返回 999
 *      （postgres 启动时检查数据目录属主 statbuf.st_uid == getuid()，
 *        实际数据目录由宿主 euid（=容器 uid 0）拥有，st_uid 实为 0；
 *        若不把 st_uid 也改成 999，0 != 999 会触发 FATAL "invalid permissions"）
 *   3) setuid/seteuid/setreuid/setresuid/setgid/setegid/setregid/setresgid/
 *      setgroups → no-op（返回 0 但不改真实凭据）
 *
 * 实际文件读写仍由真实宿主 uid（容器 uid 0 = 宿主 euid）完成，
 * 数据目录本就归宿主 euid 所有，故读写正常；shim 只改"postgres 看到的 uid"。
 *
 * ⚠️ 真实 uid 必须恒为 0（rootless 单段映射下唯一可映射的 uid）。有两类代码
 * 会把它降掉，本 shim 必须同时堵住：
 *   (a) 本 shim 自身：严禁调用 setresuid/setuid 降低真实 uid（含 constructor）。
 *       旧版 .so 曾在加载时把真实 uid 降到 999 且 CapEff 清零，rootless 下真实
 *       uid 999 映射到 overflow 65534，数据目录（宿主 euid 所有 = 容器 uid 0）
 *       完全不可写（mx@ubuntu 首测 Permission denied 的根因）。
 *   (b) busybox：alpine 的 sh/grep/mkdir 等全是 busybox applet，其 main() 用
 *       getresuid()（返回真实 uid，shim 若不拦截则为 0）判断"我是 root"，是则
 *       调用 setgid(getgid()); setuid(getuid()) 降权——而这两个被本 shim 伪装成
 *       999，于是把真实 uid 从 0 降到 999（strace 实测：execve 后紧跟
 *       setgid(999)=0; setuid(999)=0）。故本 shim 必须：拦截 getresuid/getresgid
 *       返回 999（让 busybox 的 root 判断为假、根本不尝试降权），并把 set*uid/
 *       set*gid/setgroups 做成 no-op（双保险：无论 busybox 用什么判断，都堵死
 *       真实降权）。容器恒以真实 uid 0 运行，shim 使 postgres/busybox 以为自己是
 *       999，数据目录归 uid 0 所有，读写正常。/proc/self/status 的 Uid 行（内核
 *       真值，shim 无法伪造）恒为 0 可验证。
 *
 * 编译（在 postgres:15-alpine 镜像内，musl 工具链）：
 *   gcc -shared -fPIC -O2 -o /usr/local/lib/pg-uid-shim.so pg-uid-shim.c -ldl
 *
 * 使用：容器以 USER root 运行，ENV LD_PRELOAD=/usr/local/lib/pg-uid-shim.so
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define FAKE_UID 999
#define FAKE_GID 999

/* ---- uid/gid 拦截：postgres 的 root 检查 getuid()==0 / geteuid()==0 由此通过 ---- */
uid_t getuid(void) { return FAKE_UID; }
uid_t geteuid(void) { return FAKE_UID; }
gid_t getgid(void) { return FAKE_GID; }
gid_t getegid(void) { return FAKE_GID; }

/* getresuid/getresgid 必须一并伪装：busybox 的 root 判断走 getresuid()（返回
 * 真实 uid，若不拦截则为 0），判定为 root 后调用 setgid(getgid()); setuid(getuid())
 * 把真实 uid 降到被伪装成 999 的值。伪装后 busybox 判断为非 root、不尝试降权。 */
int getresuid(uid_t *ruid, uid_t *euid, uid_t *suid) {
    if (ruid) *ruid = FAKE_UID;
    if (euid) *euid = FAKE_UID;
    if (suid) *suid = FAKE_UID;
    return 0;
}
int getresgid(gid_t *rgid, gid_t *egid, gid_t *sgid) {
    if (rgid) *rgid = FAKE_GID;
    if (egid) *egid = FAKE_GID;
    if (sgid) *sgid = FAKE_GID;
    return 0;
}

/* ---- set*uid/set*gid/setgroups no-op：双保险堵死真实降权 ----
 * 容器恒以真实 uid 0 运行（rootless 唯一可映射 uid）。任何 set* 调用（无论来自
 * busybox 启动降权还是其他）都静默忽略、返回成功，真实凭据保持 0 不变。
 * 本镜像内无合法降权需求：postgres 不调 set*；入口脚本的 chown 修复走
 * `env -u LD_PRELOAD`（shim 未加载）以真实 root 执行；gosu 已在入口脚本 no-op。 */
int setuid(uid_t uid) { (void)uid; return 0; }
int seteuid(uid_t uid) { (void)uid; return 0; }
int setreuid(uid_t ruid, uid_t euid) { (void)ruid; (void)euid; return 0; }
int setresuid(uid_t ruid, uid_t euid, uid_t suid) { (void)ruid; (void)euid; (void)suid; return 0; }
int setgid(gid_t gid) { (void)gid; return 0; }
int setegid(gid_t gid) { (void)gid; return 0; }
int setregid(gid_t rgid, gid_t egid) { (void)rgid; (void)egid; return 0; }
int setresgid(gid_t rgid, gid_t egid, gid_t sgid) { (void)rgid; (void)egid; (void)sgid; return 0; }
int setgroups(size_t size, const gid_t *list) { (void)size; (void)list; return 0; }

/* ---- stat 族拦截：仅对 postgres 数据目录路径伪装 st_uid/st_gid ----
 * 只拦截路径含 "/var/lib/postgresql" 的 stat/lstat/fstatat 调用（postgres 的
 * 数据目录属主检查走这条路径）。fstat()（按 fd）不拦截——postgres 的属主检查
 * 用 stat(path) 而非 fstat(fd)，且 fstat 无法判断路径，全拦会干扰 entrypoint
 * 的 mkdir 等命令（DinD 断网验证曾因此 Permission denied）。
 * 这样既让 postgres 的 st_uid==getuid() 检查通过，又不影响其他文件的 stat 结果。 */
typedef int (*stat_fn)(const char *, struct stat *);
typedef int (*lstat_fn)(const char *, struct stat *);
typedef int (*fstatat_fn)(int, const char *, struct stat *, int);

static int is_pg_data_path(const char *path) {
    return path && strstr(path, "/var/lib/postgresql") != NULL;
}

int stat(const char *path, struct stat *buf) {
    static stat_fn real = NULL;
    if (!real) real = (stat_fn)dlsym(RTLD_NEXT, "stat");
    int ret = real ? real(path, buf) : -1;
    if (ret == 0 && buf && is_pg_data_path(path)) {
        buf->st_uid = FAKE_UID;
        buf->st_gid = FAKE_GID;
    }
    return ret;
}

int lstat(const char *path, struct stat *buf) {
    static lstat_fn real = NULL;
    if (!real) real = (lstat_fn)dlsym(RTLD_NEXT, "lstat");
    int ret = real ? real(path, buf) : -1;
    if (ret == 0 && buf && is_pg_data_path(path)) {
        buf->st_uid = FAKE_UID;
        buf->st_gid = FAKE_GID;
    }
    return ret;
}

int fstatat(int dirfd, const char *pathname, struct stat *buf, int flags) {
    static fstatat_fn real = NULL;
    if (!real) real = (fstatat_fn)dlsym(RTLD_NEXT, "fstatat");
    int ret = real ? real(dirfd, pathname, buf, flags) : -1;
    if (ret == 0 && buf && is_pg_data_path(pathname)) {
        buf->st_uid = FAKE_UID;
        buf->st_gid = FAKE_GID;
    }
    return ret;
}
