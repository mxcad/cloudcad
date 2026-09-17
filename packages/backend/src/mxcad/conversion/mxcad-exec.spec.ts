/////////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd.
/////////////////////////////////////////////////////////////////////////////////

import { spawn } from "child_process";
import { EventEmitter } from "events";

jest.mock("child_process", () => {
	const actual = jest.requireActual("child_process");
	return {
		...actual,
		spawn: jest.fn(),
	};
});

import { runMxcadAssembly } from "./mxcad-exec";

const mockSpawn = spawn as unknown as jest.Mock;

interface FakeChild {
	child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; pid: number };
	fireClose: (code: number | null, signal: NodeJS.Signals | null) => void;
	fireError: (err: Error) => void;
	emitStdout: (data: string) => void;
	emitStderr: (data: string) => void;
}

/**
 * 构造可控的假 ChildProcess：用真实 EventEmitter 驱动 close/error/data 事件，
 * 由测试显式触发，避免依赖真实子进程与计时器。
 */
function makeFakeChild(pid = 12345): FakeChild {
	const child = new EventEmitter() as EventEmitter & {
		stdout: EventEmitter;
		stderr: EventEmitter;
		pid: number;
	};
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.pid = pid;

	return {
		child,
		fireClose: (code, signal) => child.emit("close", code, signal),
		fireError: (err) => child.emit("error", err),
		emitStdout: (data) => child.stdout.emit("data", Buffer.from(data, "utf8")),
		emitStderr: (data) => child.stderr.emit("data", Buffer.from(data, "utf8")),
	};
}

describe("runMxcadAssembly", () => {
	const originalPlatform = process.platform;
	let killSpy: jest.SpyInstance;

	beforeEach(() => {
		// 强制走 Linux 进程组杀除路径（事故平台）
		Object.defineProperty(process, "platform", {
			value: "linux",
			configurable: true,
		});
		killSpy = jest
			.spyOn(process, "kill")
			.mockImplementation(() => true);
	});

	afterEach(() => {
		Object.defineProperty(process, "platform", {
			value: originalPlatform,
			configurable: true,
		});
		killSpy.mockRestore();
	});

	it("正常退出：捕获 stdout/stderr，exitCode=0，timedOut=false", async () => {
		const fake = makeFakeChild(22222);
		mockSpawn.mockReturnValue(fake.child);

		const p = runMxcadAssembly("/bin/mxcadassembly", "arg", {
			timeoutMs: 60000,
		});
		fake.emitStdout('{"code":0}');
		fake.fireClose(0, null);

		const r = await p;
		expect(r.stdout).toBe('{"code":0}');
		expect(r.stderr).toBe("");
		expect(r.exitCode).toBe(0);
		expect(r.signal).toBeNull();
		expect(r.timedOut).toBe(false);
		// 正常退出不应杀进程组
		expect(killSpy).not.toHaveBeenCalled();
		// Linux 下以 detached 方式 spawn（新进程组）
		expect(mockSpawn).toHaveBeenCalledWith(
			"/bin/mxcadassembly",
			["arg"],
			expect.objectContaining({ detached: true }),
		);
	});

	it("超时：杀进程组（负 pid SIGTERM→SIGKILL），timedOut=true", async () => {
		const fake = makeFakeChild(33333);
		mockSpawn.mockReturnValue(fake.child);

		const p = runMxcadAssembly("/bin/mxcadassembly", "arg", {
			timeoutMs: 30,
			killEscalationMs: 20,
		});

		// 等待超时 + 升级 SIGKILL 完成
		await new Promise((resolve) => setTimeout(resolve, 80));
		// 超时后进程组应被 SIGTERM + SIGKILL 杀掉（负 pid）
		expect(killSpy).toHaveBeenCalledWith(-33333, "SIGTERM");
		expect(killSpy).toHaveBeenCalledWith(-33333, "SIGKILL");

		// 超时后进程被杀 → close 事件带 SIGKILL 信号
		fake.fireClose(null, "SIGKILL");
		const r = await p;
		expect(r.timedOut).toBe(true);
		expect(r.signal).toBe("SIGKILL");
	});

	it("spawn 失败（ENOENT）：error 事件记入 stderr，exitCode=null", async () => {
		const fake = makeFakeChild(44444);
		mockSpawn.mockReturnValue(fake.child);

		const p = runMxcadAssembly("/nonexistent/mxcadassembly", "arg", {
			timeoutMs: 60000,
		});
		fake.fireError(new Error("spawn /nonexistent ENOENT"));

		const r = await p;
		expect(r.exitCode).toBeNull();
		expect(r.timedOut).toBe(false);
		expect(r.stderr).toContain("ENOENT");
	});

	it("非零退出码但输出含成功标记：保留 stdout 供调用方解析", async () => {
		const fake = makeFakeChild(55555);
		mockSpawn.mockReturnValue(fake.child);

		const p = runMxcadAssembly("/bin/mxcadassembly", "arg", {
			timeoutMs: 60000,
		});
		fake.emitStdout('{"code":0}');
		fake.fireClose(1, null);

		const r = await p;
		expect(r.exitCode).toBe(1);
		expect(r.timedOut).toBe(false);
		expect(r.stdout).toBe('{"code":0}');
	});
});
