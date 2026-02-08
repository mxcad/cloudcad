#!/usr/bin/env python3
"""
Generate planning files for complex tasks using three-file mode.
Creates task_plan.md, notes.md, and [deliverable].md from templates.
"""

import os
import sys
from datetime import datetime
from pathlib import Path


def get_script_dir():
    """Get the directory where this script is located."""
    return Path(__file__).parent.parent


def load_template(template_name):
    """Load a template file."""
    template_path = get_script_dir() / "assets" / template_name
    with open(template_path, 'r', encoding='utf-8') as f:
        return f.read()


def replace_placeholders(template, replacements):
    """Replace placeholders in template with actual values."""
    for key, value in replacements.items():
        template = template.replace(f"[{key}]", value)
    return template


def generate_task_plan(objective, tasks, output_path):
    """Generate task_plan.md."""
    template = load_template("task_plan_template.md")

    # Build task list
    task_list = []
    for i, task in enumerate(tasks, 1):
        task_list.append(f"- [ ] Task {i}: {task}")

    # Replace placeholders
    replacements = {
        "Task Name": objective[:50] + "..." if len(objective) > 50 else objective,
        "Clear statement of what needs to be accomplished": objective,
        "Phase Name": "Initial Planning",
        "In Progress/Complete/Blocked": "In Progress",
        "0": "0",
        "Task 1: [Description]": tasks[0] if len(tasks) > 0 else "Define initial tasks",
        "Task 2: [Description]": tasks[1] if len(tasks) > 1 else "Execute research",
        "Task 3: [Description]": tasks[2] if len(tasks) > 2 else "Analyze findings",
        "Task 4: [Description]": tasks[3] if len(tasks) > 3 else "Create deliverable",
        "Task 5: [Description]": tasks[4] if len(tasks) > 4 else "Review and finalize",
        "Blocker description if any": "None",
        "Next immediate action": tasks[0] if len(tasks) > 0 else "Start task 1",
        "Following action": tasks[1] if len(tasks) > 1 else "Proceed to task 2",
        "Subsequent action": tasks[2] if len(tasks) > 2 else "Continue with task 3",
        "deliverable_name": "deliverable",
        "Description of final deliverable": "Final report with findings and recommendations",
        "Date": datetime.now().strftime("%Y-%m-%d"),
    }

    template = replace_placeholders(template, replacements)

    # Write to file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(template)

    print(f"✅ Generated {output_path}")


def generate_notes(objective, output_path):
    """Generate notes.md."""
    template = load_template("notes_template.md")

    replacements = {
        "Date": datetime.now().strftime("%Y-%m-%d"),
    }

    template = replace_placeholders(template, replacements)

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(template)

    print(f"✅ Generated {output_path}")


def generate_deliverable(objective, output_path, deliverable_name="deliverable"):
    """Generate [deliverable].md."""
    template = load_template("deliverable_template.md")

    replacements = {
        "Deliverable Title": f"Deliverable: {objective[:60]}",
        "High-level summary of what was delivered": f"This document presents the results and findings for: {objective}",
        "Brief summary for quick understanding - 2-3 sentences": "Analysis completed with key findings and actionable recommendations.",
        "Date": datetime.now().strftime("%Y-%m-%d"),
        "Complete/Ready for Review": "Ready for Review",
    }

    template = replace_placeholders(template, replacements)

    # Write to file
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(template)

    print(f"✅ Generated {output_path}")


def main():
    """Main function to generate planning files."""
    if len(sys.argv) < 2:
        print("Usage: python generate_planning_files.py <output_directory> [objective] [deliverable_name]")
        print("\nExamples:")
        print("  python generate_planning_files.py ./planning \"Investigate performance bottlenecks\"")
        print("  python generate_planning_files.py ./planning \"Refactor authentication\" auth_report")
        sys.exit(1)

    output_dir = Path(sys.argv[1])
    output_dir.mkdir(parents=True, exist_ok=True)

    objective = sys.argv[2] if len(sys.argv) > 2 else "Complex task execution"
    deliverable_name = sys.argv[3] if len(sys.argv) > 3 else "deliverable"

    # Default tasks
    default_tasks = [
        "Analyze current state and requirements",
        "Conduct research and data collection",
        "Analyze findings and identify patterns",
        "Create comprehensive deliverable",
        "Review and validate results"
    ]

    # Generate files
    generate_task_plan(objective, default_tasks, output_dir / "task_plan.md")
    generate_notes(objective, output_dir / "notes.md")
    generate_deliverable(objective, output_dir / f"{deliverable_name}.md", deliverable_name)

    print(f"\n📁 All planning files generated in: {output_dir}")
    print("\n📋 Files created:")
    print(f"  - task_plan.md (Goal & Progress Management)")
    print(f"  - notes.md (Intermediate Process Storage)")
    print(f"  - {deliverable_name}.md (Final Deliverable)")
    print("\n🔄 Next steps:")
    print("1. Review and customize task_plan.md")
    print("2. Start execution cycle: READ → DECIDE → ACT → UPDATE → REVIEW")
    print("3. Write intermediate results to notes.md")
    print("4. Update checkboxes in task_plan.md after each task")
    print("5. Create clean deliverable when complete")


if __name__ == "__main__":
    main()