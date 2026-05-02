## Plan Generated: docker-deploy-simple

## TL;DR

> Summary: Create a single, simple Docker deployment bundle that can be shipped to any online server with Docker. The bundle includes prebuilt images, docker-compose configuration, and a one-click deploy script. No on-server builds are required.
> Deliverables: tar.gz deployment package, one-click deploy script, env template, and minimal boot scripts.
> Effort: Short
> Parallel: YES
> Critical Path: Pack -> Ship -> Deploy

## Context

### Original Request

- Package a Docker-ready deployment bundle for online servers, with a focus on simplicity and zero-downtime updates where possible.

### Interview Summary

- The goal is to avoid on-server builds and complex onboarding. Provide a straightforward tarball that can be unpacked and started with a single command.

### Metis Review (gaps addressed)

- Gaps: none identified for this simplified approach; guardrails focus on ease of use and safety in deployment.

## Work Objectives

### Core Objective

- Provide a minimal, self-contained Docker deployment bundle that supports online servers with one-click deployment and safe updates.

### Deliverables

- deployment-pack: cloudcad-docker-simple.tar.gz containing:
  - docker-compose.yml
  - prebuilt image tarballs (cloudcad-app.tar, optional postgres.tar, redis.tar)
  - .env.example (template)
  - deploy.sh (one-click deploy script)
  - start.sh / stop.sh (optional lightweight controls)
  - data/ (skeleton data layout for volumes)
- plan notes and README in the bundle

### Definition of Done (verifiable)

- On target server:
  - tar -xzf cloudcad-docker-simple-\*.tar.gz
  - docker load -i images/cloudcad-app.tar
  - docker-compose up -d
  - health check endpoint responds successfully
  - deploy.sh runs without interactive prompts and starts services

### Must Have

- A single tar.gz deployment package
- One-click deploy script (deploy.sh)
- docker-compose.yml referencing image tags in the packaged artifacts
- Environment variable template (.env.example)
- Simple data directories mounted as volumes

### Must NOT Have

- On-server build requirements
- Any external dependencies beyond Docker on the target host

## Verification Strategy

- Pre-deploy: validate the bundle contents (ensure images exist, compose file is valid)
- Deploy: run the one-click script on a fresh server
- Post-deploy: verify containers are up via docker-compose ps and health endpoints
- Update: replace image tar with a new version and rerun deploy.sh update (rolling style)

## Execution Strategy

### Parallel Execution Waves

- Wave 1: Packaging tasks (image tar creation, compose file assembly, env templating)
- Wave 2 (optional): Create a lightweight canary check script within deploy.sh

### Dependency Matrix

- None external beyond standard Docker tooling on target host

## TODOs

- [ ] Create packaging script (pack-docker.js) that exports: image tarballs + compose + templates
- [ ] Create deploy.sh that:
  - loads images from package
  - starts services with docker-compose up -d
  - performs basic health checks
- [ ] Prepare docker-compose.yml for simple image-based deployment
- [ ] Include .env.example and README in bundle
- [ ] Provide a minimal data scaffolding directory in bundle

## Final Verification Wave (MANDATORY)

- F1 Plan Compliance Audit — oracle (OK)
- F2 Code Quality Review — none needed for plan
- F3 Real Manual QA — verify deploy.sh script works on a fresh VM
- F4 Scope Fidelity Check — ensure no extra components are required

## Commit Strategy

N/A for plan artifacts

## Success Criteria

- A single tar.gz bundle is produced and passes basic unpack/deploy tests on a clean server.

## Notes

- This plan intentionally avoids server-side builds and minimizes runtime complexity for online deployments.

Plan saved to: .sisyphus/plans/docker-deploy-simple.md
