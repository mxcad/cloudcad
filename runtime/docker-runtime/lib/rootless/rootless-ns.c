/*
 * rootless-ns — rootless dockerd 命名空间启动器（ADR-0074 权限门禁第三级）
 *
 * 职责：创建 user+mount+ipc 命名空间，协调 newuidmap/newgidmap 写入完整
 * subuid/subgid 映射，然后 exec 传入的 setup 脚本（脚本内做 /run 影子、/etc
 * overlay、DNS 修复、slirp4netns 建 netns 并拉起 dockerd）。
 *
 * 为什么需要父子协调：内核限制（kernel/user_namespace.c new_idmap_permitted）——
 * 非特权进程只能写「单段 0→euid」映射；多段 subuid/subgid 映射必须由父命名空间
 * （init）的 CAP_SETUID 写入 = setuid-root 的 newuidmap/newgidmap（uidmap 包）或
 * root。纯 shell / 子进程自写多段映射一律 EPERM。故采用 rootlesskit/podman 同款
 * 模式：
 *   父进程（fork 后仍在 init ns，真实用户）：
 *     等子进程「userns 就绪」信号 → 跑 newuidmap/newgidmap 写多段映射 →
 *     向子进程发「go」→ 退出（子进程被 init 收养，继续运行）。
 *   子进程：
 *     unshare(CLONE_NEWUSER) → 发「就绪」→ 等父进程「go」→
 *       go=1（多段已由 newuidmap 写好）直接继续；
 *       go=2（无 newuidmap，降级）自写单段 0→uid/gid（仅能跑全 0:0 属主镜像）；
 *       go=0（失败）中止 →
 *     unshare(CLONE_NEWNS|CLONE_NEWIPC) → exec setup 脚本。
 *
 * 用法: rootless-ns <setup-script> [args...]
 * 环境变量：
 *   ROOTLESS_PIDFILE    子进程 pid 写入位置（父进程写，供启动器跟踪 / nsenter）
 *   ROOTLESS_SUBUID     "start count"（可选，否则读 /etc/subuid 当前用户首条）
 *   ROOTLESS_SUBGID     "start count"（可选，否则读 /etc/subgid 当前用户首条）
 *   ROOTLESS_NEWUIDMAP  newuidmap 路径（可选，否则用 PATH 中的 newuidmap）
 *   ROOTLESS_NEWGIDMAP  newgidmap 路径（可选，否则用 PATH 中的 newgidmap）
 *
 * 静态编译（x86_64/aarch64 各一份，随部署包分发）：
 *   gcc -O2 -static -o rootless-ns rootless-ns.c
 */
#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sched.h>
#include <errno.h>
#include <pwd.h>
#include <sys/types.h>
#include <fcntl.h>

/* 读 /etc/subuid 或 /etc/subgid 中 user 的第一条范围 */
static int parse_subid_file(const char *path, const char *user, long *start, long *count) {
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    char line[256];
    int found = 0;
    while (fgets(line, sizeof line, f)) {
        char *colon = strchr(line, ':');
        if (!colon) continue;
        *colon = '\0';
        if (strcmp(line, user) != 0) continue;
        char *p = colon + 1;
        char *c2 = strchr(p, ':');
        if (!c2) continue;
        *c2 = '\0';
        *start = strtol(p, NULL, 10);
        *count = strtol(c2 + 1, NULL, 10);
        if (*start > 0 && *count > 0) { found = 1; break; }
    }
    fclose(f);
    return found ? 0 : -1;
}

/* 解析 "start count" 环境变量 */
static int parse_env_range(const char *e, long *start, long *count) {
    if (!e) return -1;
    if (sscanf(e, "%ld %ld", start, count) != 2 || *count <= 0) return -1;
    return 0;
}

/* 裸 open+write 写 /proc 映射文件（fputs 的缓冲会吞掉 write 错误） */
static int write_map(const char *file, const char *content) {
    int fd = open(file, O_WRONLY);
    if (fd < 0) {
        fprintf(stderr, "rootless-ns: open %s: %s\n", file, strerror(errno));
        return -1;
    }
    ssize_t n = write(fd, content, strlen(content));
    close(fd);
    if (n < 0) {
        fprintf(stderr, "rootless-ns: write %s: %s\n", file, strerror(errno));
        return -1;
    }
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 2) {
        fprintf(stderr, "用法: rootless-ns <setup-script> [args...]\n");
        return 2;
    }

    /* 必须在 unshare 之前取真实 uid/gid/用户名（unshare 后 getuid()=0） */
    const long real_uid = (long)getuid();
    const long real_gid = (long)getgid();
    struct passwd *pw = getpwuid((uid_t)real_uid);
    const char *user = pw ? pw->pw_name : "unknown";

    long uid_start = 0, uid_count = 0, gid_start = 0, gid_count = 0;
    if (parse_env_range(getenv("ROOTLESS_SUBUID"), &uid_start, &uid_count) != 0) {
        if (parse_subid_file("/etc/subuid", user, &uid_start, &uid_count) != 0) {
            fprintf(stderr, "rootless-ns: 用户 %s 无 subuid 范围（/etc/subuid 无条目），rootless 无法运行。\n", user);
            fprintf(stderr, "  请管理员执行: sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 %s\n", user);
            return 1;
        }
    }
    if (parse_env_range(getenv("ROOTLESS_SUBGID"), &gid_start, &gid_count) != 0) {
        if (parse_subid_file("/etc/subgid", user, &gid_start, &gid_count) != 0) {
            fprintf(stderr, "rootless-ns: 用户 %s 无 subgid 范围（/etc/subgid 无条目），rootless 无法运行。\n", user);
            fprintf(stderr, "  请管理员执行: sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 %s\n", user);
            return 1;
        }
    }

    const char *pidfile = getenv("ROOTLESS_PIDFILE");
    const char *newuidmap = getenv("ROOTLESS_NEWUIDMAP");
    const char *newgidmap = getenv("ROOTLESS_NEWGIDMAP");

    /* pipe A: 子→父（userns 就绪）；pipe B: 父→子（映射完成，go） */
    int pa[2], pb[2];
    if (pipe(pa) != 0 || pipe(pb) != 0) {
        fprintf(stderr, "rootless-ns: pipe: %s\n", strerror(errno));
        return 1;
    }

    pid_t child = fork();
    if (child < 0) {
        fprintf(stderr, "rootless-ns: fork: %s\n", strerror(errno));
        return 1;
    }

    if (child == 0) {
        /* ===== 子进程：写 A（pa[1]）通知就绪，读 B（pb[0]）等 go ===== */
        close(pa[0]); /* 关 A 读端（子只写 A）*/
        close(pb[1]); /* 关 B 写端（子只读 B）*/
        /* 新会话：整棵进程树（setup→slirp4netns/unshare→dockerd→容器）归入
           pgid=子pid，stop 时 kill(-pid) 一次杀净 */
        (void)!setsid();
        if (unshare(CLONE_NEWUSER) != 0) {
            fprintf(stderr, "rootless-ns: unshare(CLONE_NEWUSER) 失败: %s（内核未启用 user namespace？）\n", strerror(errno));
            _exit(1);
        }
        /* 发「userns 就绪」给父进程 */
        char ready = 'r';
        if (write(pa[1], &ready, 1) != 1) {
            /* 父进程可能已退出 */
        }
        close(pa[1]);
        /* 等父进程「go」：'1'=多段已写，'2'=降级单段，'0'=失败 */
        char sig = 0;
        ssize_t r = read(pb[0], &sig, 1);
        close(pb[0]);
        if (r != 1) {
            fprintf(stderr, "rootless-ns: 等待父进程映射信号失败/超时\n");
            _exit(1);
        }
        if (sig == '0') {
            fprintf(stderr, "rootless-ns: 父进程报告 newuidmap/newgidmap 失败，中止\n");
            _exit(1);
        }
        if (sig == '2') {
            /* 降级：无 newuidmap，自写单段 0→uid/gid（仅能跑全 0:0 属主镜像） */
            char buf[160];
            snprintf(buf, sizeof buf, "0 %ld 1\n", real_uid);
            if (write_map("/proc/self/uid_map", buf) != 0) _exit(1);
            /* setgroups 必须先于 gid_map 写一次。新内核(≥5.14)认 "deny"，
               旧内核(CentOS7 3.10)认 "disabled"——两者择一（失败的 EINVAL 不消耗
               一次性写入，故可先试 deny 再试 disabled 覆盖全内核）。 */
            {
                int sfd = open("/proc/self/setgroups", O_WRONLY);
                if (sfd >= 0) {
                    if (write(sfd, "deny", 4) != 4)
                        (void)!write(sfd, "disabled", 8);
                    close(sfd);
                }
            }
            snprintf(buf, sizeof buf, "0 %ld 1\n", real_gid);
            if (write_map("/proc/self/gid_map", buf) != 0) _exit(1);
        }
        /* sig=='1'：多段映射已由父进程经 newuidmap 写好 */
        if (unshare(CLONE_NEWNS | CLONE_NEWIPC) != 0) {
            fprintf(stderr, "rootless-ns: unshare(CLONE_NEWNS|CLONE_NEWIPC) 失败: %s\n", strerror(errno));
            _exit(1);
        }
        execvp(argv[1], &argv[1]);
        fprintf(stderr, "rootless-ns: exec %s 失败: %s\n", argv[1], strerror(errno));
        _exit(1);
    }

    /* ===== 父进程（仍在 init ns，真实用户）：读 A（pa[0]）等就绪，写 B（pb[1]）发 go ===== */
    close(pa[1]); /* 关 A 写端（父只读 A）*/
    close(pb[0]); /* 关 B 读端（父只写 B）*/

    /* 写 pidfile（子进程 pid，供启动器跟踪 / nsenter）*/
    if (pidfile) {
        FILE *pf = fopen(pidfile, "w");
        if (pf) { fprintf(pf, "%ld\n", (long)child); fclose(pf); }
    }

    /* 等子进程「userns 就绪」，避免 newuidmap 早于子进程建好 userns 而失败 */
    char ready = 0;
    if (read(pa[0], &ready, 1) != 1 || ready != 'r') {
        fprintf(stderr, "rootless-ns: 未收到子进程 userns 就绪信号，中止\n");
        close(pa[0]);
        char fail = '0';
        (void)!write(pb[1], &fail, 1);
        close(pb[1]);
        return 1;
    }
    close(pa[0]);

    /* 用 newuidmap/newgidmap（setuid-root）写多段映射 */
    int have_newuidmap = 0;
    {
        const char *nu = newuidmap ? newuidmap : "newuidmap";
        const char *ng = newgidmap ? newgidmap : "newgidmap";
        char cmd[600];
        // newuidmap/newgidmap 的每个映射是「独立参数」(uid loweruid count)，不是带引号的整串——
        // 旧代码把 "0 uid 1" 当单个参数传，newuidmap 报 "Not enough arguments" 而静默失败 →
        // 永远降级单段映射（仅能跑全 0:0 镜像，拉不动含非 0 uid 的基础镜像层，lchown EINVAL）。
        snprintf(cmd, sizeof cmd, "%s %ld 0 %ld 1 1 %ld %ld >/dev/null 2>&1",
                 nu, (long)child, real_uid, uid_start, uid_count);
        if (system(cmd) == 0) {
            snprintf(cmd, sizeof cmd, "%s %ld 0 %ld 1 1 %ld %ld >/dev/null 2>&1",
                     ng, (long)child, real_gid, gid_start, gid_count);
            if (system(cmd) == 0) have_newuidmap = 1;
        }
    }

    char sig = have_newuidmap ? '1' : '2';
    if (!have_newuidmap) {
        fprintf(stderr, "rootless-ns: 未找到可用的 newuidmap/newgidmap，降级为单段映射"
                        "（仅能运行全 0:0 属主的镜像；真实镜像需安装 uidmap 包并配置 subuid/subgid）\n");
    }
    if (write(pb[1], &sig, 1) != 1) {
        /* 子进程可能已退出 */
    }
    close(pb[1]);
    return 0;
}
