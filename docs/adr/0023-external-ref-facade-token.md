# 0023 — External-ref module uses module-local facade token
**Status**: accepted

The `MxcadExternalRefModule` exposes a single `IExternalRefFacade` DI token (module-local, not in `@cloudcad/contracts`). Consumers inject the token instead of direct class imports. Four internal services (`ExternalRefService`, `ExternalReferenceUpdateService`, `ExtRefPreloadingService`, `ExtRefValidatorService`) are not exported.

Previous attempt (commit `fa83407d`) created two facade interfaces but they were deleted in the next commit (`8c2981e8`), likely because the two-interface split didn't reduce consumer complexity enough. A single consolidated interface avoids that problem.

Token stays module-local because there is no known Pro/Enterprise variation for external reference logic. If one emerges, promote token to `@cloudcad/contracts` per ADR-0020.
