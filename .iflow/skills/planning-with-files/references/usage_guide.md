# File-Based Planner Usage Guide

## Quick Start

### Automatic File Generation

Use the Python script to generate initial planning files:

```bash
python .iflow/skills/file-planner/scripts/generate_planning_files.py ./planning "Your task objective"
```

This creates:
- `planning/task_plan.md` - Goal & Progress Management
- `planning/notes.md` - Intermediate Process Storage
- `planning/deliverable.md` - Final Deliverable

You can also specify a custom deliverable name:

```bash
python .iflow/skills/file-planner/scripts/generate_planning_files.py ./planning "Investigate performance" performance_report
```

### Manual File Creation

Copy templates from `assets/` directory:
```bash
cp .iflow/skills/file-planner/assets/task_plan_template.md ./task_plan.md
cp .iflow/skills/file-planner/assets/notes_template.md ./notes.md
cp .iflow/skills/file-planner/assets/deliverable_template.md ./deliverable.md
```

## Core Workflow: Read-Act-Record-Review Cycle

This skill enforces a strict execution loop to maintain context across many operations:

### 1. READ (读取阶段)
**Before every operation**:
```markdown
# Always start by reading task_plan.md
- Read current objectives
- Understand current phase and progress
- Identify next actions
```

### 2. DECIDE (决策阶段)
```markdown
# Analyze what needs to be done
- Determine which tools to use
- Plan the specific action
- Consider dependencies
```

### 3. ACT (行动阶段)
```markdown
# Execute the action
- Run queries, coding, research
- Perform the actual work
- Collect results
```

### 4. UPDATE (更新阶段)
```markdown
# Write to notes.md
[Record findings, code snippets, observations]

# Update task_plan.md
- [x] Check off completed tasks
- Update progress percentage
- Document blockers if any
```

### 5. REVIEW (复盘阶段)
```markdown
# Check for errors
- If errors occur, record in notes.md
- Document resolution attempts
- Adjust plan if needed
```

**Repeat until all tasks are complete.**

## Workflow Examples

### Example 1: Performance Investigation

**User Request**: "Investigate performance bottlenecks in the dashboard"

**Cycle 1: READ**
```
Read task_plan.md:
- Objective: Identify performance bottlenecks
- Current Phase: Data Collection
- Next Action: Measure load times
```

**Cycle 1: ACT**
```
- Run performance profiling tools
- Collect metrics: load times, query times, render times
```

**Cycle 1: UPDATE**
```markdown
# notes.md
## Research & Discovery

### Performance Metrics
- Initial load time: 3.2s
- Database query time: 2.1s
- JavaScript render time: 1.1s

### Observations
- Database queries are taking 65% of load time
- Multiple queries executed sequentially
```

```markdown
# task_plan.md
- [x] Task 1: Measure load times
- [ ] Task 2: Analyze query patterns
- [ ] Task 3: Identify bottlenecks
```

**Cycle 2: READ**
```
Read task_plan.md:
- Next Action: Analyze query patterns
- Review collected metrics in notes.md
```

**Cycle 2: ACT**
```
- Analyze database queries
- Identify N+1 problem
- Review query execution plans
```

**Cycle 2: UPDATE**
```markdown
# notes.md
## Analysis Results

### Database Performance
- **Finding**: N+1 query problem detected
- **Evidence**: 15 queries executed for 5 items
- **Impact**: 2.1s additional load time

### Code Snippet
```python
# Problem: Separate queries for each item
for item in items:
    details = get_details(item.id)  # N+1 problem
```
```

```markdown
# task_plan.md
- [x] Task 1: Measure load times
- [x] Task 2: Analyze query patterns
- [ ] Task 3: Identify bottlenecks
```

**... continue cycles ...**

**Final: CREATE DELIVERABLE**
```markdown
# performance_report.md

## Overview
Investigation of dashboard performance bottlenecks revealed critical issues in database query patterns.

## Results

### Key Findings
1. N+1 query problem causing 2.1s delay
2. Lack of query optimization
3. Missing database indexes

### Metrics
- Current load time: 3.2s
- Projected after fix: 0.8s
- Improvement: 75% faster

## Recommendations

### High Priority
1. Implement eager loading to fix N+1 problem
2. Add database indexes on frequently queried fields
3. Use query batching for bulk operations
```

### Example 2: Code Refactoring

**User Request**: "Refactor authentication to use JWT tokens"

**Cycle 1: READ → ACT → UPDATE**
```markdown
# task_plan.md
- [x] Task 1: Review current auth implementation
- [ ] Task 2: Design JWT architecture
- [ ] Task 3: Implement token generation
```

```markdown
# notes.md
## Research & Discovery

### Current Implementation
- Session-based authentication
- Auth logic in `app/admin/controller/Auth.php`
- No token refresh mechanism

### JWT Library Research
- firebase/php-jwt recommended
- Compatible with framework
- Supports token refresh
```

**Cycle 2: READ → ACT → UPDATE**
```markdown
# task_plan.md
- [x] Task 1: Review current auth implementation
- [x] Task 2: Design JWT architecture
- [ ] Task 3: Implement token generation
```

```markdown
# notes.md
## Code Snippets

```php
// JWT token generation
function generateToken($user) {
    $payload = [
        'user_id' => $user->id,
        'exp' => time() + 3600
    ];
    return JWT::encode($payload, $secret);
}
```

## Decisions

- **Decision**: Use HS256 algorithm
  - **Rationale**: Simpler than RS256, sufficient for this use case
```

**Final: CREATE DELIVERABLE**
```markdown
# jwt_authentication_refactor.md

## Overview
Successfully refactored authentication system from session-based to JWT tokens, enabling stateless authentication and improved scalability.

## Results

### Implementation
- JWT token generation and validation
- Token refresh mechanism
- Protected route middleware
- Migration guide provided

### Benefits
- Stateless authentication
- Better horizontal scalability
- Improved security
- Reduced server memory usage

## Implementation Guide

### Step 1: Install Dependencies
```bash
composer require firebase/php-jwt
```

### Step 2: Update Authentication
[Detailed implementation steps]
```

## Best Practices

### Planning (task_plan.md)
1. **Clear Objectives**: Write specific, measurable objectives
2. **Checkbox Progress**: Use checkboxes for granular tracking
3. **Document Blockers**: Record blockers as they appear
4. **Always Visible**: Keep next actions at the top

### Documentation (notes.md)
1. **Write Everything**: Nothing is too small to record
2. **Code Snippets**: Include useful code snippets
3. **Document Decisions**: Record why decisions were made
4. **Record Failures**: Document failed attempts and lessons

### Deliverable Creation ([deliverable].md)
1. **Clean & Concise**: No process information
2. **Focus on Results**: What was delivered, not how
3. **Standalone**: Make it actionable without context
4. **Reference Notes**: Point to notes.md for details if needed

### Workflow Discipline
- **ALWAYS** read `task_plan.md` before acting
- **ALWAYS** update `task_plan.md` after completing tasks
- **ALWAYS** write intermediate results to `notes.md`
- **NEVER** rely on internal memory beyond current cycle

## Integration with Other Tools

### Todo Lists
Use `todo_write` for high-level tracking alongside file-based planning:

```python
todo_write([
    {"id": "1", "task": "Complete task 1-3 in task_plan.md", "status": "in_progress"},
    {"id": "2", "task": "Create deliverable from notes.md", "status": "pending"}
])
```

### Sequential Thinking
Use for complex decisions within cycles:

```
Use sequential thinking to:
- Analyze architectural trade-offs
- Evaluate solution options
- Debug complex issues
- Plan refactoring strategies

Always record the decision process in notes.md!
```

## Common Patterns

### Task Breakdown Pattern
```
task_plan.md:
├── Objective (what)
├── Current Phase (where we are)
├── Task Breakdown (checkboxes)
└── Next Actions (what to do next)
```

### Documentation Pattern
```
notes.md:
├── Research & Discovery (what we found)
├── Code Snippets (useful code)
├── Thoughts & Decisions (why we chose this)
└── Issues & Solutions (what went wrong)
```

### Deliverable Pattern
```
[deliverable].md:
├── Overview (high-level summary)
├── Results (what was delivered)
├── Recommendations (what to do)
└── Implementation Guide (how to use)
```

## Troubleshooting

### Problem: Forgetting what to do next
**Solution**: Always READ `task_plan.md` before every action. This reloads objectives into attention window.

### Problem: Losing track of discoveries
**Solution**: Write everything to `notes.md` immediately. Nothing is too small to record.

### Problem: Deliverable is too verbose
**Solution**: Extract only key findings from `notes.md`. Keep deliverable clean and actionable.

### Problem: Too many checkboxes in task_plan.md
**Solution**: Group related tasks. Keep task list manageable (5-10 items).

### Problem: Context keeps getting lost
**Solution**: You're not following the READ-DECIDE-ACT-UPDATE-REVIEW cycle. Always read before acting.

## Exit Criteria

The skill is complete when:
- ✅ All checkboxes in `task_plan.md` are checked
- ✅ All blockers in `task_plan.md` are resolved
- ✅ `notes.md` contains comprehensive documentation
- ✅ Clean `[deliverable].md` is created
- ✅ Deliverable is actionable and standalone
- ✅ Success criteria from `task_plan.md` are met

## Key Principles

1. **External Storage First**: Files are more reliable than context
2. **Cycle Discipline**: Always READ before ACT, always UPDATE after ACT
3. **Progressive Disclosure**: Load only what's needed for current cycle
4. **Clean Deliverables**: Separate process from results
5. **Persistent Memory**: Never rely on context beyond current operation

## Why This Works

**Traditional AI Agent Problem**:
- Context window fills up after 10-20 operations
- AI forgets objectives and loses track
- No way to recover lost information

**Three-File Mode Solution**:
- External storage (files) is unlimited
- Each cycle reloads context from files
- Progress is persistent and trackable
- Can handle 50+ operations without confusion

**The Secret**: External storage reliability exceeds model's internal memory.