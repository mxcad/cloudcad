---
name: file-planner
description: Implements Manus-style persistent markdown planning using three-file mode (task_plan.md, notes.md, deliverable.md). Use for complex tasks requiring >5 tool calls, research projects, or long-running tasks. Core workflow: Read → Decide → Act → Update → Review cycle.
---

# File-Based Planner (Three-File Mode)

This skill implements Manus-style persistent markdown planning using external storage as AI's "working memory" on disk. Markdown files serve as scratchpads, progress checkpoints, and building blocks for final deliverables.

## Core Philosophy

**"Markdown is my working memory on disk. Because my active context is limited, Markdown files are not just scratchpads—they're progress checkpoints and building blocks for the final deliverable."**

The key insight: **External storage reliability exceeds model's internal memory**. This skill shifts from "how to make AI remember more" to "how to make AI manage information efficiently."

## Three-File Mode

### 1. task_plan.md (Goal & Progress Management)
**Purpose**: Track task objectives, current phase, completion progress (checkboxes), and blockers.

**Structure**:
```markdown
# Task Plan: [Task Name]

## Objective
[Clear statement of what needs to be accomplished]

## Current Phase
- **Phase**: [Phase Name]
- **Status**: [In Progress/Complete/Blocked]
- **Progress**: [X]%

## Task Breakdown
- [ ] Task 1: [Description]
- [ ] Task 2: [Description]
- [x] Task 3: [Description] (completed)

## Blockers
- [ ] [Blocker description]
- [x] [Resolved blocker] (resolved)

## Next Actions
1. [ ] [Next action]
2. [ ] [Following action]
```

### 2. notes.md (Intermediate Process Storage)
**Purpose**: Archive all "temporary information" - research results, thinking records, code snippets, discoveries.

**Structure**:
```markdown
# Notes

## Research & Discovery
### [Topic 1]
[Research findings, observations, data]

### [Topic 2]
[Research findings, observations, data]

## Code Snippets
```python
[Useful code snippets]
```

## Thoughts & Decisions
- [Decision 1]: [Rationale]
- [Decision 2]: [Rationale]

## Issues & Solutions
- **Issue**: [Description]
  - **Solution**: [How resolved]
```

### 3. [deliverable].md (Final Deliverable)
**Purpose**: Clean outcome document without redundant process information.

**Structure**:
```markdown
# [Deliverable Title]

## Overview
[High-level summary of what was delivered]

## Results
[Final results, not process]

## Recommendations
[Actionable recommendations]

## Appendix
[Supporting information if needed]
```

## Core Workflow: Read-Act-Record-Review Cycle

This skill enforces a strict execution loop:

### 1. READ (读取阶段)
**Before every operation**:
- Read `task_plan.md` to reload task objectives into "attention window"
- Understand current phase and progress
- Identify next actions

### 2. DECIDE (决策阶段)
- Analyze what needs to be done next
- Determine which tools to use
- Plan the specific action

### 3. ACT (行动阶段)
- Execute queries, coding, research, or other operations
- Perform the actual work

### 4. UPDATE (更新阶段)
- Write execution results to `notes.md` (intermediate results)
- Update checkboxes in `task_plan.md`
- Mark progress

### 5. REVIEW (复盘阶段)
- If errors occur, record error context and resolution attempts in `notes.md`
- Review progress against objectives
- Determine next iteration

## When to Use This Skill

Trigger this skill when:
- Task requires >5 tool calls
- Complex multi-step operations with dependencies
- Research projects requiring systematic investigation
- Development tasks with multiple phases
- Long-running tasks needing persistent memory
- Any task where "forgetting" would be catastrophic

**Key Benefit**: Even after 50+ tool calls, AI maintains clear task awareness and progress tracking.

## Implementation Steps

### Step 1: Initialize Planning
1. Read user's request carefully
2. Assess complexity (>5 tool calls threshold)
3. Create `task_plan.md` with initial breakdown
4. Create empty `notes.md` for intermediate storage
5. Identify deliverable format

### Step 2: Execute in Cycles
**Repeat until complete**:
1. **READ**: Read `task_plan.md` to reload context
2. **DECIDE**: Determine next action
3. **ACT**: Execute the action
4. **UPDATE**: Write results to `notes.md`, update `task_plan.md`
5. **REVIEW**: Check for errors, adjust if needed

### Step 3: Consolidate Deliverable
1. Review all information in `notes.md`
2. Extract key findings and results
3. Create clean `[deliverable].md` without process noise
4. Verify against success criteria

## Best Practices

### Planning
- Start with clear, measurable objectives in `task_plan.md`
- Use checkboxes for granular progress tracking
- Document blockers as they appear
- Keep next actions always visible

### Documentation
- Write everything to `notes.md` - nothing is too small
- Include code snippets, error messages, and observations
- Document decisions with rationale
- Record failed attempts and lessons learned

### Deliverable Creation
- Clean and concise - no process information
- Focus on results, not steps
- Make it standalone and actionable
- Reference `notes.md` for supporting details if needed

### Workflow Discipline
- **ALWAYS** read `task_plan.md` before acting
- **ALWAYS** update `task_plan.md` after completing tasks
- **ALWAYS** write intermediate results to `notes.md`
- **NEVER** rely on internal memory beyond current cycle

## File Templates

Use templates in `assets/` directory:
- `assets/task_plan_template.md` - Task planning template
- `assets/notes_template.md` - Notes template
- `assets/deliverable_template.md` - Deliverable template

## Integration with Workflow

This skill integrates with:
- **Todo lists**: Use `todo_write` for high-level tracking
- **Sequential thinking**: Use for complex decisions within cycles
- **Code review**: Validate against plan in `task_plan.md`
- **Testing**: Verify deliverable quality

## Example Usage

**User Request**: "Investigate performance bottlenecks in the dashboard and provide recommendations"

**Cycle 1: READ**
- Read `task_plan.md`: Objective is to identify bottlenecks
- Current phase: Data Collection
- Next action: Measure load times

**Cycle 1: ACT**
- Run performance profiling tools
- Collect metrics

**Cycle 1: UPDATE**
- Write metrics to `notes.md`
- Check off "Measure load times" in `task_plan.md`

**Cycle 2: READ**
- Read `task_plan.md`: Next action is "Analyze query patterns"
- Review collected metrics in `notes.md`

**Cycle 2: ACT**
- Analyze database queries
- Identify N+1 problem

**Cycle 2: UPDATE**
- Write analysis to `notes.md`
- Check off "Analyze query patterns"

**... continue cycles ...**

**Final: CREATE DELIVERABLE**
- Review all findings in `notes.md`
- Extract key bottlenecks and solutions
- Create clean `performance_report.md` with recommendations

## Quality Gates

Before marking task complete, ensure:
- [ ] All checkboxes in `task_plan.md` are checked
- [ ] All blockers are resolved
- [ ] `notes.md` contains comprehensive documentation
- [ ] Deliverable is clean and actionable
- [ ] Success criteria are met

## Exit Criteria

The skill is complete when:
- All tasks in `task_plan.md` are completed
- `notes.md` contains all intermediate work
- Clean deliverable is created
- Success criteria verified
- User is satisfied with results

## Key Principles

1. **External Storage First**: Files are more reliable than context
2. **Cycle Discipline**: Always READ before ACT, always UPDATE after ACT
3. **Progressive Disclosure**: Load only what's needed for current cycle
4. **Clean Deliverables**: Separate process from results
5. **Persistent Memory**: Never rely on context beyond current operation