import type { ITool, ToolExecutionContext } from "@aria/contracts";
import { BaseTool, throwToolError } from "@aria/tool-runtime";
import { plannedStubMeta } from "../../define-tool-meta.js";

class PlannedStubTool extends BaseTool {
  async execute(
    _args: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<unknown> {
    throwToolError(
      "PROVIDER",
      `Tool "${this.metadata.name}" is planned and not enabled yet`,
    );
  }
}

function stub(
  id: string,
  name: string,
  category: Parameters<typeof plannedStubMeta>[2],
  description: string,
  permissions: string[] = [],
  safety: Parameters<typeof plannedStubMeta>[5] = "SAFE",
): ITool {
  return new (class extends PlannedStubTool {
    constructor() {
      super(plannedStubMeta(id, name, category, description, permissions, safety));
    }
  })();
}

/** Registers planned catalog entries so discovery scales without adapters. */
export function createPlannedStubTools(): ITool[] {
  return [
    // Files
    stub("files.read", "read_file", "Files", "Read a file from the sandbox.", ["files.read"]),
    stub("files.write", "write_file", "Files", "Write a file in the sandbox.", ["files.write"], "CONFIRMATION_REQUIRED"),
    stub("files.append", "append_file", "Files", "Append to a file.", ["files.write"]),
    stub("files.delete", "delete_file", "Files", "Delete a file.", ["files.write"], "CONFIRMATION_REQUIRED"),
    stub("files.move", "move_file", "Files", "Move or rename a file.", ["files.write"], "CONFIRMATION_REQUIRED"),
    stub("files.copy", "copy_file", "Files", "Copy a file.", ["files.write"]),
    stub("files.list", "list_directory", "Files", "List a directory.", ["files.read"]),
    stub("files.search", "search_files", "Files", "Search files by name or content.", ["files.read"]),
    stub("files.create_note", "create_note", "Files", "Create a note file.", ["files.write"]),

    // Development / Git
    stub("dev.terminal", "run_terminal", "Development", "Run a shell command.", ["dev.terminal"], "DANGEROUS"),
    stub("git.status", "git_status", "Git", "Show git status.", ["git.read"]),
    stub("git.diff", "git_diff", "Git", "Show git diff.", ["git.read"]),
    stub("git.commit", "git_commit", "Git", "Create a git commit.", ["git.write"], "CONFIRMATION_REQUIRED"),
    stub("git.branch", "git_branch", "Git", "List or create branches.", ["git.write"]),
    stub("git.checkout", "git_checkout", "Git", "Checkout a branch.", ["git.write"], "CONFIRMATION_REQUIRED"),
    stub("dev.npm_install", "npm_install", "Development", "Install npm packages.", ["dev.terminal"], "CONFIRMATION_REQUIRED"),
    stub("dev.run_tests", "run_tests", "Development", "Run project tests.", ["dev.terminal"]),
    stub("dev.lint", "lint_project", "Development", "Lint the project.", ["dev.terminal"]),
    stub("dev.build", "build_project", "Development", "Build the project.", ["dev.terminal"]),
    stub("dev.docker_ps", "docker_ps", "Development", "List docker containers.", ["dev.docker"]),
    stub("dev.docker_logs", "docker_logs", "Development", "Read docker logs.", ["dev.docker"]),

    // System
    stub("system.info", "system_info", "System", "Report OS and host info.", ["system.read"]),
    stub("system.disk", "disk_usage", "System", "Report disk usage.", ["system.read"]),
    stub("system.cpu", "cpu_usage", "System", "Report CPU usage.", ["system.read"]),
    stub("system.gpu", "gpu_usage", "System", "Report GPU usage.", ["system.read"]),
    stub("system.battery", "battery_status", "System", "Report battery status.", ["system.read"]),
    stub("system.network", "network_status", "System", "Report network status.", ["system.read"]),
    stub("system.restart_service", "restart_service", "System", "Restart a named service.", ["system.admin"], "DANGEROUS"),

    // Desktop
    stub("desktop.open", "open_application", "Desktop", "Open an application.", ["desktop.control"], "CONFIRMATION_REQUIRED"),
    stub("desktop.close", "close_application", "Desktop", "Close an application.", ["desktop.control"], "CONFIRMATION_REQUIRED"),
    stub("desktop.screenshot", "take_screenshot", "Desktop", "Capture the screen.", ["desktop.screenshot"], "PRIVATE"),
    stub("desktop.type", "type_text", "Desktop", "Type text via OS automation.", ["desktop.control"], "CONFIRMATION_REQUIRED"),
    stub("desktop.key", "press_key", "Desktop", "Press a keyboard key.", ["desktop.control"], "CONFIRMATION_REQUIRED"),
    stub("desktop.clipboard_read", "clipboard_read", "Desktop", "Read clipboard text.", ["desktop.clipboard"], "PRIVATE"),
    stub("desktop.clipboard_write", "clipboard_write", "Desktop", "Write clipboard text.", ["desktop.clipboard"]),

    // Productivity
    stub("calendar.manage", "calendar", "Calendar", "Manage calendar events.", ["calendar"]),
    stub("productivity.reminders", "reminders", "Calendar", "Manage reminders.", ["calendar"]),
    stub("productivity.alarms", "alarms", "Calendar", "Manage alarms.", ["calendar"]),
    stub("productivity.timers", "timers", "Calendar", "Manage timers.", ["calendar"]),
    stub("productivity.todos", "todos", "Calendar", "Manage todos.", ["calendar"]),
    stub("productivity.notes", "notes", "Calendar", "Manage notes.", ["calendar"]),
    stub("shopping.list", "shopping_list", "Shopping", "Manage shopping list.", ["shopping"]),

    // Cooking
    stub("cooking.recipe", "search_recipe", "Cooking", "Search recipes.", ["cooking"]),
    stub("cooking.substitute", "ingredient_substitution", "Cooking", "Suggest ingredient substitutions.", ["cooking"]),
    stub("cooking.scale", "recipe_scaling", "Cooking", "Scale a recipe.", ["cooking"]),
    stub("cooking.timer", "kitchen_timer", "Cooking", "Set a kitchen timer.", ["cooking"]),
    stub("cooking.shopping_add", "shopping_list_add", "Cooking", "Add items to the shopping list.", ["shopping"]),

    // Weather / Location / Media
    stub("weather.current", "current_weather", "Weather", "Get current weather.", ["weather"]),
    stub("weather.forecast", "forecast", "Weather", "Get weather forecast.", ["weather"]),
    stub("location.current", "current_location", "Location", "Get current location.", ["location"], "PRIVATE"),
    stub("location.travel_time", "travel_time", "Location", "Estimate travel time.", ["location"]),
    stub("location.route", "route_planning", "Location", "Plan a route.", ["location"]),
    stub("media.play", "play_music", "Media", "Play music.", ["media"]),
    stub("media.pause", "pause_music", "Media", "Pause music.", ["media"]),
    stub("media.next", "next_track", "Media", "Skip to next track.", ["media"]),
    stub("media.volume", "volume", "Media", "Set media volume.", ["media"]),

    // Vision (OCR / barcode / faces stay planned — faces are PRIVATE opt-in)
    stub("vision.ocr", "ocr", "Ocr", "Run OCR on an image.", ["vision"]),
    stub("vision.barcode", "barcode_scan", "Vision", "Scan barcodes.", ["vision"]),
    stub("vision.faces", "recognize_faces", "Vision", "Recognize faces (opt-in PRIVATE only).", ["vision"], "PRIVATE"),

    // Robot (interfaces only — actuators require confirmation)
    stub("robot.move_arm", "move_arm", "Robot", "Move a robot arm.", ["robot.actuator"], "DANGEROUS"),
    stub("robot.move_head", "move_head", "Robot", "Move the robot head.", ["robot.actuator"], "CONFIRMATION_REQUIRED"),
    stub("robot.navigate", "navigate", "Robot", "Navigate to a pose or place.", ["robot.actuator"], "CONFIRMATION_REQUIRED"),
    stub("robot.pickup", "pickup_object", "Robot", "Pick up an object.", ["robot.actuator"], "DANGEROUS"),
    stub("robot.release", "release_object", "Robot", "Release a grasped object.", ["robot.actuator"], "CONFIRMATION_REQUIRED"),
    stub("robot.follow", "follow_person", "Robot", "Follow a person.", ["robot.actuator"], "CONFIRMATION_REQUIRED"),
    stub("robot.look_at", "look_at", "Robot", "Look at a target.", ["robot.actuator"], "CONFIRMATION_REQUIRED"),
  ];
}
